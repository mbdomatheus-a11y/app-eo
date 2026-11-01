import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { backendConfigured, rpc, supabase } from "../services/supabase";
import type { AdminTab, AuditRow, ChecklistDetail, ChecklistRun, LiveAlert, LiveNotice, LivePerson, Store, Workspace } from "../types";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

type Result = { ok: boolean };
type ContextValue = {
  configured: boolean; session: Session | null; initializing: boolean; loading: boolean; busy: boolean;
  passwordMode: boolean; workspace: Workspace | null; notices: LiveNotice[]; more: boolean;
  alerts: LiveAlert[]; checklists: ChecklistRun[]; checklistDetail: ChecklistDetail | null; soundEnabled: boolean;
  pushGranted: boolean;
  audit: AuditRow[]; members: LivePerson[]; temporaryPassword: string; error: string; message: string;
  clearFeedback: () => void; login: (chapa: string, password: string) => Promise<Result>;
  changeTemporaryPassword: (password: string, confirmation: string) => Promise<Result>;
  signout: () => Promise<void>; refresh: () => Promise<void>; acknowledge: (notice: LiveNotice) => Promise<Result>;
  loadMore: () => Promise<Result>; loadAdmin: (tab: AdminTab) => Promise<Result>;
  addStore: (data: { code: string; name: string; region: string }) => Promise<Result>;
  inviteMember: (data: { chapa: string; email: string; name: string; role: string; stores: string[] }) => Promise<Result>;
  toggleMember: (member: LivePerson) => Promise<Result>;
  saveMember: (member: LivePerson, data: { chapa: string; name: string; role: string; stores: string[] }) => Promise<Result>;
  publish: (data: { title: string; body: string; stores: string[]; urgent: boolean }) => Promise<Result>;
  issueTemporaryPassword: () => Promise<Result>; copyPassword: () => void;
  refreshOperational: () => Promise<void>; markAlert: (alert: LiveAlert, action: "view" | "dismiss") => Promise<Result>;
  setSoundEnabled: (enabled: boolean) => Promise<Result>; openChecklist: (id: string) => Promise<Result>;
  saveChecklistAnswer: (run: string, item: string, answer: Record<string, unknown>) => Promise<Result>;
  publishAlert: (data: { title: string; body: string; stores: string[]; urgent: boolean }) => Promise<Result>;
  publishChecklist: (data: { title: string; description: string; items: { prompt: string; type: "acceptance" | "photo" | "text" | "yes_no"; required: boolean }[]; stores: string[] }) => Promise<Result>;
  enablePush: () => Promise<Result>; captureChecklistPhoto: (run: string, item: string) => Promise<Result>;
  sendTestPush: () => Promise<Result>;
};
const Context = createContext<ContextValue | null>(null);

export function EOProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notices, setNotices] = useState<LiveNotice[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [checklists, setChecklists] = useState<ChecklistRun[]>([]);
  const [checklistDetail, setChecklistDetail] = useState<ChecklistDetail | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [pushGranted, setPushGranted] = useState(false);
  const [more, setMore] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [members, setMembers] = useState<LivePerson[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const busyRef = useRef(false);

  const clearFeedback = useCallback(() => { setError(""); setMessage(""); }, []);
  const act = useCallback(async (work: () => Promise<void>, success?: string | (() => string)): Promise<Result> => {
    if (busyRef.current) return { ok: false };
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); if (success) setMessage(typeof success === "function" ? success() : success); return { ok: true }; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação."); return { ok: false }; }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    const client = supabase;
    if (!client) { setInitializing(false); return; }
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!alive) return;
      if (authError) setError("Não foi possível recuperar sua sessão segura.");
      setSession(data.session); setInitializing(false);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_, next) => {
      if (alive) setSession(next);
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    if (AppState.currentState === "active") void client.auth.startAutoRefresh();
    return () => { alive = false; subscription.unsubscribe(); appStateSubscription.remove(); void client.auth.stopAutoRefresh(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!session) { setPushGranted(false); return () => { alive = false; }; }
    void Notifications.getPermissionsAsync().then((permission) => { if (alive) setPushGranted(permission.granted); });
    return () => { alive = false; };
  }, [session?.user.id]);

  useEffect(() => {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!session?.user.id || !pushGranted || !Device.isDevice || !projectId || !supabase) return;
    const register = (token: string) => rpc("eo_register_push_device", { p_token: token, p_platform: Platform.OS }).catch(() => undefined);
    void Notifications.getExpoPushTokenAsync({ projectId }).then(({ data }) => register(data)).catch(() => undefined);
    const subscription = Notifications.addPushTokenListener((token) => { void register(token.data); });
    return () => subscription.remove();
  }, [session?.user.id, pushGranted]);

  const refresh = useCallback(async () => {
    if (!supabase || !session) return;
    const current = ++epoch.current;
    setLoading(true); setError("");
    try {
      const status = await rpc<{ must_change_password: boolean }>("eo_password_status");
      if (status.must_change_password) { setPasswordMode(true); return; }
      setPasswordMode(false);
      const [ctx, feed] = await Promise.all([rpc<Workspace>("eo_context"), rpc<LiveNotice[]>("eo_feed")]);
      if (current !== epoch.current) return;
      setWorkspace(ctx); setNotices(feed); setMore(feed.length === 20);
    } catch (cause) {
      if (current === epoch.current) { setWorkspace(null); setError(cause instanceof Error ? cause.message : "Não foi possível carregar seu espaço."); }
    } finally { if (current === epoch.current) setLoading(false); }
  }, [session]);

  const refreshOperational = useCallback(async () => {
    if (!session || passwordMode) return;
    const [nextAlerts, nextChecklists, preferences] = await Promise.all([
      rpc<LiveAlert[]>("eo_alert_feed"), rpc<ChecklistRun[]>("eo_checklist_feed"), rpc<{ sound_enabled: boolean }>("eo_notification_preferences"),
    ]);
    setAlerts(nextAlerts); setChecklists(nextChecklists); setSoundEnabledState(preferences.sound_enabled);
  }, [session, passwordMode]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || passwordMode || !supabase) return;
    void refreshOperational().catch(() => undefined);
    const channel = supabase.channel(`eo-operational-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "eo_alert_recipients", filter: `user_id=eq.${userId}` }, () => { void refreshOperational().catch(() => undefined); })
      .on("postgres_changes", { event: "*", schema: "public", table: "eo_checklist_runs", filter: `assigned_to=eq.${userId}` }, () => { void refreshOperational().catch(() => undefined); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [session?.user.id, passwordMode, refreshOperational]);

  const markAlert = useCallback((alert: LiveAlert, action: "view" | "dismiss") => act(async () => {
    await rpc("eo_alert_mark", { p_alert: alert.id, p_action: action }); await refreshOperational();
  }), [act, refreshOperational]);
  const setSoundEnabled = useCallback((enabled: boolean) => act(async () => {
    await rpc("eo_notification_preferences", { p_sound_enabled: enabled }); setSoundEnabledState(enabled);
  }, enabled ? "Som ativado." : "Som silenciado. O sistema continua exibindo alertas."), [act]);
  const openChecklist = useCallback((id: string) => act(async () => {
    setChecklistDetail(await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: id }));
  }), [act]);
  const saveChecklistAnswer = useCallback((run: string, item: string, answer: Record<string, unknown>) => act(async () => {
    await rpc("eo_checklist_save", { p_run: run, p_item: item, p_answer: answer });
    await refreshOperational(); setChecklistDetail(await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: run }));
  }, "Resposta salva e registrada."), [act, refreshOperational]);
  const publishAlert = useCallback((data: { title: string; body: string; stores: string[]; urgent: boolean }) => {
    let pushDevices = 0;
    return act(async () => {
    if (!data.stores.length) throw new Error("Selecione pelo menos uma loja.");
    const alertId = await rpc<string>("eo_publish_alert", { p_title: data.title.trim(), p_body: data.body.trim(), p_stores: data.stores, p_urgent: data.urgent });
    const { data: pushResult, error: pushError } = await supabase!.functions.invoke("send-alert-push", { body: { alert_id: alertId } });
    if (pushError) throw new Error("Alerta publicado no app, mas o envio push falhou. Confira a configuração do Supabase Functions e os tokens dos aparelhos.");
    pushDevices = Number(pushResult?.devices ?? 0);
    await refreshOperational();
  }, () => pushDevices ? `Alerta publicado e encaminhado a ${pushDevices} aparelhos registrados. A entrega é confirmada pelo serviço, não pelo aparelho.` : "Alerta publicado no app. Nenhum aparelho registrou permissão push ainda.");
  }, [act, refreshOperational]);
  const publishChecklist = useCallback((data: { title: string; description: string; items: { prompt: string; type: "acceptance" | "photo" | "text" | "yes_no"; required: boolean }[]; stores: string[] }) => act(async () => {
    if (!data.stores.length || !data.items.length) throw new Error("Selecione lojas e inclua ao menos uma pergunta.");
    await rpc("eo_checklist_create", { p_title: data.title.trim(), p_description: data.description.trim(), p_items: data.items, p_stores: data.stores });
    await refreshOperational();
  }, "Checklist criado e atribuído às equipes selecionadas."), [act, refreshOperational]);
  const enablePush = useCallback(() => act(async () => {
    if (!Device.isDevice) throw new Error("As notificações push precisam ser ativadas em um aparelho físico.");
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error("O app ainda precisa ser vinculado a um projeto Expo/EAS antes de pedir a permissão e registrar o push. O banner interno continua disponível.");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("eo-alerts", { name: "Alertas do EO", importance: Notifications.AndroidImportance.MAX, sound: "default", vibrationPattern: [0, 250, 200, 250] });
      await Notifications.setNotificationChannelAsync("eo-alerts-quiet", { name: "Alertas do EO, sem som", importance: Notifications.AndroidImportance.MAX, sound: null, vibrationPattern: [] });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    setPushGranted(permission.granted);
    if (!permission.granted) throw new Error("Permissão negada. Para ativar depois, permita notificações nas configurações do aparelho.");
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await rpc("eo_register_push_device", { p_token: token, p_platform: Platform.OS });
  }, "Notificações do sistema ativadas neste aparelho."), [act]);
  const captureChecklistPhoto = useCallback((run: string, item: string) => act(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Permita o uso da câmera nas configurações do aparelho para anexar evidências.");
    const image = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.75 });
    if (image.canceled || !image.assets[0]) return;
    const asset = image.assets[0];
    const objectPath = await rpc<string>("eo_checklist_photo_path", { p_run: run, p_item: item });
    const blob = await (await fetch(asset.uri)).blob();
    const { error: uploadError } = await supabase!.storage.from("eo-checklist-photos").upload(objectPath, blob, { contentType: asset.mimeType ?? "image/jpeg", upsert: false });
    if (uploadError) throw new Error("Não foi possível salvar a foto com segurança.");
    await rpc("eo_checklist_save", { p_run: run, p_item: item, p_answer: { path: objectPath } });
    await refreshOperational(); setChecklistDetail(await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: run }));
  }, "Foto enviada para o armazenamento privado e registrada na auditoria."), [act, refreshOperational]);
  const sendTestPush = useCallback(() => act(async () => {
    if (workspace?.person.role !== "admin") throw new Error("Somente o administrador pode enviar um teste.");
    if (!pushGranted) throw new Error("Ative as notificações e registre este aparelho primeiro.");
    const { data, error: invokeError } = await supabase!.functions.invoke("send-test-push", { body: {} });
    if (invokeError) throw new Error("Não foi possível enviar o teste. Confira o projeto EAS, a permissão e a Edge Function.");
    if (!data?.devices) throw new Error("Nenhum aparelho seu está registrado para receber o teste.");
  }, "Teste encaminhado aos seus aparelhos registrados. O serviço não confirma a exibição no aparelho."), [act, workspace?.person.role, pushGranted]);

  useEffect(() => {
    if (session?.user.id) void refresh();
    else { epoch.current++; setWorkspace(null); setNotices([]); setAlerts([]); setChecklists([]); setChecklistDetail(null); setMembers([]); setAudit([]); setPasswordMode(false); }
  }, [session?.user.id, refresh]);

  const login = useCallback((chapa: string, password: string) => act(async () => {
    if (!supabase) throw new Error("A conexão ainda não foi configurada.");
    const normalized = chapa.trim();
    if (!/^\d{1,20}$/.test(normalized)) throw new Error("Informe sua chapa numérica.");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: `app-${normalized}@login.app-eo.invalid`, password });
    if (authError) throw new Error("Não foi possível entrar. Confira seus dados e se a conta já foi liberada.");
  }), [act]);

  const signout = useCallback(async () => {
    if (!supabase) return;
    const { error: authError } = await supabase.auth.signOut({ scope: "local" });
    if (authError) setError("Não foi possível encerrar a sessão.");
  }, []);

  const changeTemporaryPassword = useCallback((password: string, confirmation: string) => act(async () => {
    if (password.length < 12 || password !== confirmation) throw new Error("As senhas devem coincidir e ter pelo menos 12 caracteres.");
    const { error: invokeError } = await supabase!.functions.invoke("admin-identity", { body: { action: "change-temporary-password", password } });
    if (invokeError) throw new Error("Não foi possível concluir a troca. Peça um novo acesso à administração.");
    setPasswordMode(false); await supabase!.auth.signOut({ scope: "local" });
  }, "Senha alterada. Entre novamente com sua chapa."), [act]);

  const acknowledge = useCallback((notice: LiveNotice) => act(async () => {
    await rpc("eo_acknowledge", { p_notice: notice.notice_id, p_version: notice.version });
    await refresh();
  }, "Sua ciência foi registrada."), [act, refresh]);

  const loadMore = useCallback(() => act(async () => {
    const tail = notices.at(-1); if (!tail) return;
    const feed = await rpc<LiveNotice[]>("eo_feed", { p_before: tail.published_at, p_before_id: tail.notice_id });
    setNotices((current) => [...current, ...feed]); setMore(feed.length === 20);
  }), [act, notices]);

  const loadAdmin = useCallback((tab: AdminTab) => act(async () => {
    if (tab === "audit") setAudit(await rpc<AuditRow[]>("eo_admin_audit"));
    if (tab === "people") setMembers(await rpc<LivePerson[]>("eo_admin_people"));
  }), [act]);

  const addStore = useCallback((data: { code: string; name: string; region: string }) => act(async () => {
    await rpc("eo_admin_store", { p_code: data.code, p_name: data.name, p_region: data.region });
    await refresh();
  }, "Loja cadastrada."), [act, refresh]);

  const inviteMember = useCallback((data: { chapa: string; email: string; name: string; role: string; stores: string[] }) => act(async () => {
    const { error: inviteError } = await supabase!.functions.invoke("admin-identity", { body: { action: "invite-person", email: data.email.trim(), chapa: data.chapa.trim(), name: data.name.trim(), role: data.role, stores: data.stores } });
    if (inviteError) throw new Error("Convite não enviado. Confira o SMTP, a chapa e as lojas selecionadas.");
    setMembers(await rpc<LivePerson[]>("eo_admin_people"));
  }, "Convite enviado. A pessoa definirá a senha no primeiro acesso."), [act]);

  const toggleMember = useCallback((person: LivePerson) => act(async () => {
    await rpc("eo_admin_update_person", { p_user: person.id, p_name: person.display_name, p_role: person.role, p_chapa: person.login_chapa, p_stores: person.stores, p_active: !person.active });
    setMembers(await rpc<LivePerson[]>("eo_admin_people"));
  }, person.active ? "Acesso desativado." : "Acesso reativado."), [act]);

  const saveMember = useCallback((person: LivePerson, data: { chapa: string; name: string; role: string; stores: string[] }) => act(async () => {
    await rpc("eo_admin_update_person", { p_user: person.id, p_name: data.name.trim(), p_role: data.role, p_chapa: data.chapa.trim(), p_stores: data.stores, p_active: person.active });
    setMembers(await rpc<LivePerson[]>("eo_admin_people"));
  }, "Perfil e lojas atualizados."), [act]);

  const publish = useCallback((data: { title: string; body: string; stores: string[]; urgent: boolean }) => act(async () => {
    if (!data.stores.length) throw new Error("Selecione pelo menos uma loja.");
    await rpc("eo_publish_notice", { p_title: data.title.trim(), p_body: data.body.trim(), p_stores: data.stores, p_urgent: data.urgent, p_request_id: Crypto.randomUUID() });
    await refresh();
  }, "Comunicado publicado."), [act, refresh]);

  const issueTemporaryPassword = useCallback(() => act(async () => {
    if (!workspace) throw new Error("Perfil não carregado.");
    const { data, error: invokeError } = await supabase!.functions.invoke("admin-identity", { body: { action: "issue-master-temporary-password", user_id: workspace.person.id } });
    if (invokeError || typeof data?.password !== "string") throw new Error("Não foi possível gerar uma senha temporária.");
    setTemporaryPassword(data.password);
  }, "Senha temporária gerada. Copie e guarde em local seguro."), [act, workspace]);

  const copyPassword = useCallback(() => {
    if (temporaryPassword) void Clipboard.setStringAsync(temporaryPassword)
      .then(() => setMessage("Senha copiada. Guarde-a em local seguro."))
      .catch(() => setError("Não foi possível copiar a senha. Selecione-a e copie manualmente."));
  }, [temporaryPassword]);

  const value = useMemo<ContextValue>(() => ({
    configured: backendConfigured, session, initializing, loading, busy, passwordMode, workspace, notices, more, alerts, checklists, checklistDetail, soundEnabled, pushGranted, audit, members, temporaryPassword, error, message,
    clearFeedback, login, changeTemporaryPassword, signout, refresh, acknowledge, loadMore, loadAdmin, addStore, inviteMember, toggleMember, saveMember, publish, issueTemporaryPassword,
    copyPassword, refreshOperational, markAlert, setSoundEnabled, openChecklist, saveChecklistAnswer, publishAlert, publishChecklist, enablePush, captureChecklistPhoto, sendTestPush,
  }), [session, initializing, loading, busy, passwordMode, workspace, notices, more, alerts, checklists, checklistDetail, soundEnabled, pushGranted, audit, members, temporaryPassword, error, message, clearFeedback, login, changeTemporaryPassword, signout, refresh, acknowledge, loadMore, loadAdmin, addStore, inviteMember, toggleMember, saveMember, publish, issueTemporaryPassword, copyPassword, refreshOperational, markAlert, setSoundEnabled, openChecklist, saveChecklistAnswer, publishAlert, publishChecklist, enablePush, captureChecklistPhoto, sendTestPush]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEO() {
  const value = useContext(Context);
  if (!value) throw new Error("useEO deve estar dentro de EOProvider.");
  return value;
}
