import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { backendConfigured, rpc, supabase } from "../services/supabase";
import type { AdminTab, AuditRow, LiveNotice, LivePerson, Store, Workspace } from "../types";

type Result = { ok: boolean };
type ContextValue = {
  configured: boolean; session: Session | null; initializing: boolean; loading: boolean; busy: boolean;
  passwordMode: boolean; workspace: Workspace | null; notices: LiveNotice[]; more: boolean;
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
  const [more, setMore] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [members, setMembers] = useState<LivePerson[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const busyRef = useRef(false);

  const clearFeedback = useCallback(() => { setError(""); setMessage(""); }, []);
  const act = useCallback(async (work: () => Promise<void>, success?: string): Promise<Result> => {
    if (busyRef.current) return { ok: false };
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); if (success) setMessage(success); return { ok: true }; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação."); return { ok: false }; }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabase) { setInitializing(false); return; }
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!alive) return;
      if (authError) setError("Não foi possível recuperar sua sessão segura.");
      setSession(data.session); setInitializing(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, next) => {
      if (alive) setSession(next);
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    if (AppState.currentState === "active") void supabase.auth.startAutoRefresh();
    return () => { alive = false; subscription.unsubscribe(); appStateSubscription.remove(); void supabase.auth.stopAutoRefresh(); };
  }, []);

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

  useEffect(() => {
    if (session?.user.id) void refresh();
    else { epoch.current++; setWorkspace(null); setNotices([]); setMembers([]); setAudit([]); setPasswordMode(false); }
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
    configured: backendConfigured, session, initializing, loading, busy, passwordMode, workspace, notices, more, audit, members, temporaryPassword, error, message,
    clearFeedback, login, changeTemporaryPassword, signout, refresh, acknowledge, loadMore, loadAdmin, addStore, inviteMember, toggleMember, saveMember, publish, issueTemporaryPassword,
    copyPassword,
  }), [session, initializing, loading, busy, passwordMode, workspace, notices, more, audit, members, temporaryPassword, error, message, clearFeedback, login, changeTemporaryPassword, signout, refresh, acknowledge, loadMore, loadAdmin, addStore, inviteMember, toggleMember, saveMember, publish, issueTemporaryPassword, copyPassword]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEO() {
  const value = useContext(Context);
  if (!value) throw new Error("useEO deve estar dentro de EOProvider.");
  return value;
}
