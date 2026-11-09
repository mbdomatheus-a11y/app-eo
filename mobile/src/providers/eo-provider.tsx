import { createSoundChannels } from "../features/notification-sound";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState, Linking, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { backendConfigured, rpc, supabase } from "../services/supabase";
import type {
  AdminTab,
  ArchivedMessage,
  AuditRow,
  ChecklistDetail,
  ChecklistRun,
  LiveAlert,
  LiveNotice,
  LivePerson,
  MessageFile,
  MessageAttachment,
  NoticeReport,
  ReportMessage,
  Store,
  Workspace,
} from "../types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function devicePushToken(projectId: string): Promise<string> {
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/aps[-_ ]?environment|aps[-_ ]?enviroment|entitlement/i.test(message))
      throw new Error(
        "Esta instalação do EO não possui a assinatura Apple necessária para push. Instale a nova versão pelo TestFlight e ative as notificações novamente. Som e banner locais continuam disponíveis.",
      );
    if (/firebase|fcm|google.services/i.test(message))
      throw new Error(
        "Esta versão Android ainda precisa da configuração Firebase para push. O teste local de som e banner continua disponível.",
      );
    throw new Error(
      "Não foi possível registrar este aparelho para push. Confira a internet e tente novamente.",
    );
  }
}

export type VisibleModule = { id: string; label: string; visible: boolean };
type Result = { ok: boolean };
type PeopleQuery = {
  search?: string;
  role?: string;
  state?: string;
  region?: string;
  uf?: string;
  page?: number;
  sort?: string;
};
type AdminStore = Store & { active: boolean };
type MessagePayload = {
  title: string;
  body: string;
  stores: string[];
  urgent: boolean;
  scheduledFor?: string;
  sendPush?: boolean;
  attachments?: MessageFile[];
};
type ContextValue = {
  visibleModules: VisibleModule[] | null;
  moduleVisible: (id: string) => boolean;
  configured: boolean;
  session: Session | null;
  initializing: boolean;
  loading: boolean;
  busy: boolean;
  passwordMode: boolean;
  workspace: Workspace | null;
  notices: LiveNotice[];
  more: boolean;
  alerts: LiveAlert[];
  checklists: ChecklistRun[];
  checklistDetail: ChecklistDetail | null;
  soundEnabled: boolean;
  pushGranted: boolean;
  pushRegistered: boolean;
  audit: AuditRow[];
  members: LivePerson[];
  error: string;
  message: string;
  peopleTotal: number;
  adminStores: AdminStore[];
  searchPeople: (query?: PeopleQuery) => Promise<void>;
  loadPerson: (id: string) => Promise<void>;
  saveStore: (store: AdminStore) => Promise<Result>;
  archivedMessages: ArchivedMessage[];
  reportMessages: ReportMessage[];
  reportData: NoticeReport | null;
  clearFeedback: () => void;
  login: (chapa: string, password: string) => Promise<Result>;
  changeTemporaryPassword: (
    password: string,
    confirmation: string,
  ) => Promise<Result>;
  signout: () => Promise<Result>;
  refresh: () => Promise<void>;
  acknowledge: (notice: LiveNotice) => Promise<Result>;
  loadMore: () => Promise<Result>;
  loadAdmin: (tab: AdminTab) => Promise<Result>;
  loadNoticeReport: (
    notice: string,
    version: number,
    groupBy: string,
    segmentBy?: string,
    segmentValues?: string[],
  ) => Promise<Result>;
  archiveMessage: (
    kind: "notice" | "alert",
    id: string,
    archived: boolean,
  ) => Promise<Result>;
  addStore: (data: {
    code: string;
    name: string;
    region: string;
  }) => Promise<Result>;
  inviteMember: (data: {
    chapa: string;
    email: string;
    name: string;
    role: string;
    stores: string[];
    unit_type?: string;
  }) => Promise<Result & { password?: string }>;
  toggleMember: (member: LivePerson) => Promise<Result>;
  saveMember: (
    member: LivePerson,
    data: {
      chapa: string;
      name: string;
      role: string;
      stores: string[];
      unit_type?: string;
    },
  ) => Promise<Result>;
  publish: (data: MessagePayload) => Promise<Result>;
  issueTemporaryPassword: (
    userId: string,
  ) => Promise<Result & { password?: string }>;
  refreshOperational: () => Promise<void>;
  markAlert: (alert: LiveAlert, action: "view" | "dismiss") => Promise<Result>;
  moderateAlert: (alert: LiveAlert) => Promise<Result>;
  setSoundEnabled: (enabled: boolean) => Promise<Result>;
  openChecklist: (id: string) => Promise<Result>;
  saveChecklistAnswer: (
    run: string,
    item: string,
    answer: Record<string, unknown>,
  ) => Promise<Result>;
  publishAlert: (data: MessagePayload) => Promise<Result>;
  openMessageAttachment: (file: MessageAttachment) => Promise<void>;
  publishChecklist: (data: {
    title: string;
    description: string;
    items: {
      prompt: string;
      type: "acceptance" | "photo" | "text" | "yes_no";
      required: boolean;
    }[];
    stores: string[];
  }) => Promise<Result>;
  enablePush: () => Promise<Result>;
  captureChecklistPhoto: (run: string, item: string) => Promise<Result>;
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
  const [visibleModules, setVisibleModules] = useState<VisibleModule[] | null>(
    null,
  );
  const moduleVisible = useCallback(
    (id: string) =>
      workspace?.person.role === "admin" ||
      visibleModules?.find((x) => x.id === id)?.visible !== false,
    [workspace?.person.role, visibleModules],
  );
  const [notices, setNotices] = useState<LiveNotice[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [checklists, setChecklists] = useState<ChecklistRun[]>([]);
  const [checklistDetail, setChecklistDetail] =
    useState<ChecklistDetail | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [pushGranted, setPushGranted] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [more, setMore] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [members, setMembers] = useState<LivePerson[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [adminStores, setAdminStores] = useState<AdminStore[]>([]);
  const peopleRequest = useRef(0);
  const [archivedMessages, setArchivedMessages] = useState<ArchivedMessage[]>(
    [],
  );
  const [reportMessages, setReportMessages] = useState<ReportMessage[]>([]);
  const [reportData, setReportData] = useState<NoticeReport | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const busyRef = useRef(false);

  const clearFeedback = useCallback(() => {
    setError("");
    setMessage("");
  }, []);
  const act = useCallback(
    async (
      work: () => Promise<void>,
      success?: string | (() => string),
    ): Promise<Result> => {
      if (busyRef.current) return { ok: false };
      busyRef.current = true;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await work();
        if (success)
          setMessage(typeof success === "function" ? success() : success);
        return { ok: true };
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível concluir a operação.",
        );
        return { ok: false };
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    const client = supabase;
    if (!client) {
      setInitializing(false);
      return;
    }
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!alive) return;
      if (authError) setError("Não foi possível recuperar sua sessão segura.");
      setSession(data.session);
      setInitializing(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_, next) => {
      if (alive) setSession(next);
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void client.auth.startAutoRefresh();
        else void client.auth.stopAutoRefresh();
      },
    );
    if (AppState.currentState === "active") void client.auth.startAutoRefresh();
    return () => {
      alive = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setPushRegistered(false);
    if (!session) {
      setPushGranted(false);
      return () => {
        alive = false;
      };
    }
    void Notifications.getPermissionsAsync().then((permission) => {
      if (alive) setPushGranted(permission.granted);
    });
    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    if (
      !session?.user.id ||
      !pushGranted ||
      !Device.isDevice ||
      !projectId ||
      !supabase
    )
      return;
    let active = true;
    const register = async (token: string) => {
      try {
        await rpc("eo_register_push_device", {
          p_token: token,
          p_platform: Platform.OS,
        });
        if (active) setPushRegistered(true);
      } catch {
        if (active) setPushRegistered(false);
      }
    };
    void Notifications.getExpoPushTokenAsync({ projectId })
      .then(({ data }) => register(data))
      .catch(() => undefined);
    const subscription = Notifications.addPushTokenListener(() => {
      void Notifications.getExpoPushTokenAsync({ projectId })
        .then(({ data }) => register(data))
        .catch(() => undefined);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [session?.user.id, pushGranted]);

  const refresh = useCallback(async () => {
    if (!supabase || !session) return;
    const current = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const status = await rpc<{ must_change_password: boolean }>(
        "eo_password_status",
      );
      if (status.must_change_password) {
        setPasswordMode(true);
        return;
      }
      setPasswordMode(false);
      const [ctx, modules] = await Promise.all([
        rpc<Workspace>("eo_context"),
        rpc<VisibleModule[]>("eo_my_modules"),
      ]);
      const noticesAllowed =
        ctx.person.role === "admin" ||
        modules.find((x) => x.id === "notices")?.visible !== false;
      const feed = noticesAllowed
        ? ((await rpc<LiveNotice[]>("eo_feed")) ?? [])
        : [];
      if (current !== epoch.current) return;
      setVisibleModules(modules);
      setWorkspace(ctx);
      setNotices(feed);
      setMore(feed.length === 20);
    } catch (cause) {
      if (current === epoch.current) {
        setWorkspace(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar seu espaço.",
        );
      }
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && session) void refresh();
    });
    return () => subscription.remove();
  }, [session, refresh]);

  const refreshOperational = useCallback(async () => {
    if (!session || passwordMode || visibleModules === null) return;
    const [nextAlerts, nextChecklists, preferences] = await Promise.all([
      rpc<LiveAlert[]>("eo_alert_feed"),
      moduleVisible("checklists")
        ? rpc<ChecklistRun[]>("eo_checklist_feed")
        : Promise.resolve([] as ChecklistRun[]),
      rpc<{ sound_enabled: boolean }>("eo_notification_preferences"),
    ]);
    setAlerts(nextAlerts ?? []);
    setChecklists(nextChecklists ?? []);
    setSoundEnabledState(preferences.sound_enabled);
  }, [session, passwordMode, visibleModules, moduleVisible]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || passwordMode || !supabase) return;
    void refreshOperational().catch(() => undefined);
    const channel = supabase
      .channel(`eo-operational-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eo_alert_recipients",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshOperational().catch(() => undefined);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eo_checklist_runs",
          filter: `assigned_to=eq.${userId}`,
        },
        () => {
          void refreshOperational().catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [session?.user.id, passwordMode, refreshOperational]);

  const markAlert = useCallback(
    (alert: LiveAlert, action: "view" | "dismiss") =>
      act(async () => {
        await rpc("eo_alert_mark", { p_alert: alert.id, p_action: action });
        await refreshOperational();
      }),
    [act, refreshOperational],
  );
  const moderateAlert = useCallback(
    (alert: LiveAlert) =>
      act(async () => {
        await rpc("eo_admin_hide_alert", {
          p_alert: alert.id,
          p_hidden: !alert.hidden_from_users,
        });
        await refreshOperational();
      }),
    [act, refreshOperational],
  );
  const setSoundEnabled = useCallback(
    (enabled: boolean) =>
      act(
        async () => {
          await rpc("eo_notification_preferences", {
            p_sound_enabled: enabled,
          });
          setSoundEnabledState(enabled);
        },
        enabled
          ? "Som ativado."
          : "Som silenciado. O sistema continua exibindo alertas.",
      ),
    [act],
  );
  const openChecklist = useCallback(
    (id: string) =>
      act(async () => {
        setChecklistDetail(
          await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: id }),
        );
      }),
    [act],
  );
  const saveChecklistAnswer = useCallback(
    (run: string, item: string, answer: Record<string, unknown>) =>
      act(async () => {
        await rpc("eo_checklist_save", {
          p_run: run,
          p_item: item,
          p_answer: answer,
        });
        await refreshOperational();
        setChecklistDetail(
          await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: run }),
        );
      }, "Resposta salva e registrada."),
    [act, refreshOperational],
  );
  const uploadMessageFiles = useCallback(
    async (files: MessageFile[] = []) => {
      if (!files.length)
        return [] as {
          object_path: string;
          file_name: string;
          mime_type: string;
          byte_size: number;
        }[];
      if (!workspace?.person.id || !supabase)
        throw new Error("Perfil ainda não carregado.");
      if (files.length > 10) throw new Error("Anexe no máximo 10 arquivos.");
      const accepted = new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);
      const uploaded: {
        object_path: string;
        file_name: string;
        mime_type: string;
        byte_size: number;
      }[] = [];
      for (const file of files) {
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        const mime =
          file.mimeType ||
          (
            {
              pdf: "application/pdf",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              webp: "image/webp",
            } as Record<string, string>
          )[ext] ||
          "";
        if (!accepted.has(mime)) throw new Error("Use PDF, JPG, PNG ou WebP.");
        const response = await fetch(file.uri);
        if (!response.ok) throw new Error(`Não foi possível ler ${file.name}.`);
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength)
          throw new Error("O arquivo está vazio ou não pôde ser lido.");
        const path = `${workspace.person.id}/${Crypto.randomUUID()}-${file.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Za-z0-9._-]/g, "_")
          .slice(-140)}`;
        const { error: uploadError } = await supabase.storage
          .from("eo-message-attachments")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push({
          object_path: path,
          file_name: file.name.slice(0, 255),
          mime_type: mime,
          byte_size: bytes.byteLength,
        });
      }
      return uploaded;
    },
    [workspace?.person.id],
  );
  const openMessageAttachment = useCallback(async (file: MessageAttachment) => {
    if (!supabase) throw new Error("Conexão indisponível.");
    const { data, error: signedError } = await supabase.storage
      .from("eo-message-attachments")
      .createSignedUrl(file.object_path, 60);
    if (signedError || !data?.signedUrl)
      throw new Error("Você não tem acesso a este anexo ou o link expirou.");
    await Linking.openURL(data.signedUrl);
  }, []);
  const publishAlert = useCallback(
    (data: MessagePayload) => {
      let pushDevices = 0;
      const scheduled = Boolean(data.scheduledFor);
      return act(
        async () => {
          if (!data.stores.length)
            throw new Error("Selecione pelo menos uma loja.");
          const attachments = await uploadMessageFiles(data.attachments);
          if (data.scheduledFor) {
            await rpc("eo_schedule_message_with_options", {
              p_message_type: "alert",
              p_title: data.title.trim(),
              p_body: data.body.trim(),
              p_stores: data.stores,
              p_urgent: data.urgent,
              p_scheduled_for: data.scheduledFor,
              p_request_id: Crypto.randomUUID(),
              p_send_push: true,
              p_attachments: attachments,
            });
            await refreshOperational();
            return;
          }
          const alertId = await rpc<string>("eo_publish_alert", {
            p_title: data.title.trim(),
            p_body: data.body.trim(),
            p_stores: data.stores,
            p_urgent: data.urgent,
            p_attachments: attachments,
          });
          const { data: pushResult, error: pushError } =
            await supabase!.functions.invoke("send-alert-push", {
              body: { alert_id: alertId },
            });
          if (pushError)
            throw new Error(
              "Alerta publicado no app, mas o envio push falhou. Confira a configuração do Supabase Functions e os tokens dos aparelhos.",
            );
          pushDevices = Number(pushResult?.devices ?? 0);
          await refreshOperational();
        },
        () =>
          scheduled
            ? `Alerta programado para ${new Date(data.scheduledFor!).toLocaleString("pt-BR")}.`
            : pushDevices
              ? `Alerta publicado e encaminhado a ${pushDevices} aparelhos registrados. A entrega é confirmada pelo serviço, não pelo aparelho.`
              : "Alerta publicado no app. Nenhum aparelho registrou permissão push ainda.",
      );
    },
    [act, refreshOperational, uploadMessageFiles],
  );
  const publishChecklist = useCallback(
    (data: {
      title: string;
      description: string;
      items: {
        prompt: string;
        type: "acceptance" | "photo" | "text" | "yes_no";
        required: boolean;
      }[];
      stores: string[];
    }) => {
      let delivery = "";
      return act(
        async () => {
          if (!data.stores.length || !data.items.length)
            throw new Error("Selecione lojas e inclua ao menos uma pergunta.");
          const template = await rpc<string>("eo_checklist_create", {
            p_title: data.title.trim(),
            p_description: data.description.trim(),
            p_items: data.items,
            p_stores: data.stores,
          });
          await refreshOperational();
          try {
            const alertId = await rpc<string>("eo_checklist_notification", {
              p_template: template,
            });
            const { data: result, error } = await supabase!.functions.invoke(
              "send-alert-push",
              { body: { alert_id: alertId } },
            );
            delivery = error
              ? " O aviso interno foi salvo, mas o push não pôde ser enviado."
              : ` Push encaminhado a ${result?.devices ?? 0} aparelho(s) registrado(s), sem confirmação de exibição.`;
          } catch {
            delivery =
              " O aviso interno foi salvo, mas o push não pôde ser enviado.";
          }
        },
        () =>
          "Checklist criado e atribuído às equipes selecionadas." + delivery,
      );
    },
    [act, refreshOperational],
  );
  const enablePush = useCallback(
    () =>
      act(async () => {
        if (!Device.isDevice)
          throw new Error(
            "As notificações push precisam ser ativadas em um aparelho físico.",
          );
        const projectId =
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId)
          throw new Error(
            "O app ainda precisa ser vinculado a um projeto Expo/EAS antes de pedir a permissão e registrar o push. O banner interno continua disponível.",
          );
        await createSoundChannels();
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted)
          permission = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
        setPushGranted(permission.granted);
        if (!permission.granted)
          throw new Error(
            "Permissão negada. Para ativar depois, permita notificações nas configurações do aparelho.",
          );
        setPushRegistered(false);
        const token = await devicePushToken(projectId);
        await rpc("eo_register_push_device", {
          p_token: token,
          p_platform: Platform.OS,
        });
        setPushRegistered(true);
      }, "Notificações do sistema ativadas neste aparelho."),
    [act],
  );
  const autoPushRegistration = useRef<string | null>(null);
  useEffect(() => {
    const user = workspace?.person.id;
    if (!user) {
      autoPushRegistration.current = null;
      return;
    }
    if (
      Platform.OS !== "ios" ||
      !Device.isDevice ||
      pushRegistered ||
      autoPushRegistration.current === user
    )
      return;
    let alive = true;
    void Notifications.getPermissionsAsync()
      .then((permission) => {
        if (alive && permission.granted) {
          autoPushRegistration.current = user;
          void enablePush();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspace?.person.id, pushGranted, pushRegistered, enablePush]);
  const captureChecklistPhoto = useCallback(
    (run: string, item: string) =>
      act(async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Permita o uso da câmera nas configurações do aparelho para anexar evidências.",
          );
        const image = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.75,
        });
        if (image.canceled || !image.assets[0]) return;
        const asset = image.assets[0];
        const objectPath = await rpc<string>("eo_checklist_photo_path", {
          p_run: run,
          p_item: item,
        });
        const blob = await (await fetch(asset.uri)).blob();
        const { error: uploadError } = await supabase!.storage
          .from("eo-checklist-photos")
          .upload(objectPath, blob, {
            contentType: asset.mimeType ?? "image/jpeg",
            upsert: false,
          });
        if (uploadError)
          throw new Error("Não foi possível salvar a foto com segurança.");
        await rpc("eo_checklist_save", {
          p_run: run,
          p_item: item,
          p_answer: { path: objectPath },
        });
        await refreshOperational();
        setChecklistDetail(
          await rpc<ChecklistDetail>("eo_checklist_detail", { p_run: run }),
        );
      }, "Foto enviada para o armazenamento privado e registrada na auditoria."),
    [act, refreshOperational],
  );
  const sendTestPush = useCallback(
    () =>
      act(async () => {
        if (workspace?.person.role !== "admin")
          throw new Error("Somente o administrador pode enviar um teste.");
        if (!pushGranted)
          throw new Error(
            "Ative as notificações e registre este aparelho primeiro.",
          );
        const projectId =
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId)
          throw new Error(
            "Projeto de notificações não configurado nesta versão.",
          );
        const token = await devicePushToken(projectId);
        await rpc("eo_register_push_device", {
          p_token: token,
          p_platform: Platform.OS,
        });
        setPushRegistered(true);
        const { data, error: invokeError } = await supabase!.functions.invoke(
          "send-test-push",
          { body: {} },
        );
        if (invokeError)
          throw new Error(
            "Não foi possível enviar o teste. Confira o projeto EAS, a permissão e a Edge Function.",
          );
        if (!data?.devices)
          throw new Error(
            "Nenhum aparelho seu está registrado para receber o teste.",
          );
      }, "Teste encaminhado aos seus aparelhos registrados. O serviço não confirma a exibição no aparelho."),
    [act, workspace?.person.role, pushGranted],
  );

  useEffect(() => {
    if (session?.user.id) void refresh();
    else {
      epoch.current++;
      peopleRequest.current++;
      setAdminStores([]);
      setPeopleTotal(0);
      setVisibleModules(null);
      setWorkspace(null);
      setNotices([]);
      setAlerts([]);
      setChecklists([]);
      setChecklistDetail(null);
      setMembers([]);
      setAudit([]);
      setPasswordMode(false);
    }
  }, [session?.user.id, refresh]);

  const login = useCallback(
    (chapa: string, password: string) =>
      act(async () => {
        if (!supabase) throw new Error("A conexão ainda não foi configurada.");
        const normalized = chapa.trim();
        if (!/^\d{1,20}$/.test(normalized))
          throw new Error("Informe sua chapa numérica.");
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: `app-${normalized}@login.app-eo.invalid`,
          password,
        });
        if (authError)
          throw new Error(
            "Não foi possível entrar. Confira seus dados e se a conta já foi liberada.",
          );
      }),
    [act],
  );

  const signout = useCallback(async () => {
    if (!supabase) return { ok: false };
    const { error: authError } = await supabase.auth.signOut({
      scope: "local",
    });
    if (authError) setError("Não foi possível encerrar a sessão.");
    return { ok: !authError };
  }, []);

  const changeTemporaryPassword = useCallback(
    (password: string, confirmation: string) =>
      act(async () => {
        if (password.length < 12 || password !== confirmation)
          throw new Error(
            "As senhas devem coincidir e ter pelo menos 12 caracteres.",
          );
        const { error: invokeError } = await supabase!.functions.invoke(
          "admin-identity",
          { body: { action: "change-temporary-password", password } },
        );
        if (invokeError)
          throw new Error(
            "Não foi possível concluir a troca. Peça um novo acesso à administração.",
          );
        setPasswordMode(false);
        await supabase!.auth.signOut({ scope: "local" });
      }, "Senha alterada. Entre novamente com sua chapa."),
    [act],
  );

  const acknowledge = useCallback(
    (notice: LiveNotice) =>
      act(async () => {
        await rpc("eo_acknowledge", {
          p_notice: notice.notice_id,
          p_version: notice.version,
        });
        await refresh();
      }, "Sua ciência foi registrada."),
    [act, refresh],
  );

  const loadMore = useCallback(
    () =>
      act(async () => {
        if (!moduleVisible("notices")) return;
        const tail = notices.at(-1);
        if (!tail) return;
        const feed = await rpc<LiveNotice[]>("eo_feed", {
          p_before: tail.published_at,
          p_before_id: tail.notice_id,
        });
        setNotices((current) => [...current, ...feed]);
        setMore(feed.length === 20);
      }),
    [act, notices, moduleVisible],
  );

  const searchPeople = useCallback(async (query: PeopleQuery = {}) => {
    const request = ++peopleRequest.current;
    try {
      const result = await rpc<{ items: LivePerson[]; total: number }>(
        "eo_admin_people_page",
        {
          p_search: query.search || "",
          p_role: query.role || "",
          p_state: query.state || "",
          p_region: query.region || "",
          p_uf: query.uf || "",
          p_limit: 30,
          p_offset: (query.page || 0) * 30,
          p_sort: query.sort || "name",
        },
      );
      if (request === peopleRequest.current) {
        setMembers(result.items);
        setPeopleTotal(result.total);
      }
    } catch (cause) {
      if (request === peopleRequest.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível buscar as pessoas.",
        );
    }
  }, []);
  const loadPerson = useCallback(async (id: string) => {
    try {
      const result = await rpc<{ items: LivePerson[] }>(
        "eo_admin_people_page",
        { p_user: id },
      );
      if (result.items[0])
        setMembers((old) => [
          ...old.filter((person) => person.id !== id),
          result.items[0],
        ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar a pessoa.",
      );
    }
  }, []);
  const loadAdmin = useCallback(
    (tab: AdminTab) =>
      act(async () => {
        if (tab === "audit") setAudit(await rpc<AuditRow[]>("eo_admin_audit"));
        if (tab === "people") await searchPeople();
        if (tab === "stores")
          setAdminStores(await rpc<AdminStore[]>("eo_admin_stores"));
        if (tab === "archive")
          setArchivedMessages(
            await rpc<ArchivedMessage[]>("eo_admin_archived_messages"),
          );
        if (tab === "reports") {
          const messages = await rpc<ReportMessage[]>(
            "eo_admin_report_messages",
          );
          setReportMessages(messages);
          if (messages[0])
            setReportData(
              await rpc<NoticeReport>("eo_admin_notice_report", {
                p_notice: messages[0].notice_id,
                p_version: messages[0].version,
                p_group_by: "regional",
              }),
            );
          else setReportData(null);
        }
      }),
    [act, searchPeople],
  );

  const loadNoticeReport = useCallback(
    (
      notice: string,
      version: number,
      groupBy: string,
      segmentBy = "",
      segmentValues: string[] = [],
    ) =>
      act(async () => {
        if (!notice) throw new Error("Selecione um comunicado.");
        setReportData(
          await rpc<NoticeReport>("eo_admin_notice_report", {
            p_notice: notice,
            p_version: version,
            p_group_by: groupBy,
            p_segment_by: segmentBy || null,
            p_segment_values: segmentValues,
          }),
        );
      }),
    [act],
  );
  const archiveMessage = useCallback(
    (kind: "notice" | "alert", id: string, archived: boolean) =>
      act(
        async () => {
          await rpc("eo_admin_archive_message", {
            p_kind: kind,
            p_id: id,
            p_archived: archived,
          });
          setArchivedMessages(
            await rpc<ArchivedMessage[]>("eo_admin_archived_messages"),
          );
          await refresh();
        },
        archived
          ? "Mensagem arquivada com histórico preservado."
          : "Mensagem restaurada para a equipe.",
      ),
    [act, refresh],
  );

  const addStore = useCallback(
    (data: { code: string; name: string; region: string }) =>
      act(async () => {
        await rpc("eo_admin_store", {
          p_code: data.code,
          p_name: data.name,
          p_region: data.region,
        });
        await refresh();
        setAdminStores(await rpc<AdminStore[]>("eo_admin_stores"));
      }, "Loja cadastrada."),
    [act, refresh],
  );
  const saveStore = useCallback(
    (store: AdminStore) =>
      act(async () => {
        await rpc("eo_admin_manage_store", {
          p_store: store.id,
          p_code: store.code,
          p_name: store.name,
          p_region: store.region,
          p_active: store.active,
        });
        setAdminStores(await rpc<AdminStore[]>("eo_admin_stores"));
        await refresh();
      }, "Loja atualizada. Histórico e vínculos preservados."),
    [act, refresh],
  );

  const inviteMember = useCallback(
    async (data: {
      chapa: string;
      email: string;
      name: string;
      role: string;
      stores: string[];
      unit_type?: string;
    }) => {
      let password: string | undefined;
      const result = await act(async () => {
        const { data: created, error: createError } =
          await supabase!.functions.invoke("admin-identity", {
            body: {
              action: "create-person",
              email: data.email.trim(),
              chapa: data.chapa.trim(),
              name: data.name.trim(),
              role: data.role,
              stores: data.stores,
              unit_type: data.unit_type,
            },
          });
        if (createError || typeof created?.password !== "string") {
          const response =
            createError?.context instanceof Response
              ? await createError.context.json().catch(() => null)
              : null;
          throw new Error(
            response?.error ?? "Não foi possível cadastrar a pessoa.",
          );
        }
        password = created.password;
        await searchPeople();
      }, "Usuário cadastrado. Compartilhe os dados de acesso.");
      return { ...result, password };
    },
    [act, searchPeople],
  );

  const toggleMember = useCallback(
    (person: LivePerson) =>
      act(
        async () => {
          const { error: statusError } = await supabase!.functions.invoke(
            "admin-identity",
            {
              body: {
                action: "set-person-active",
                user_id: person.id,
                active: !person.active,
              },
            },
          );
          if (statusError) {
            const response =
              statusError.context instanceof Response
                ? await statusError.context.json().catch(() => null)
                : null;
            throw new Error(
              response?.error ?? "Não foi possível alterar o acesso.",
            );
          }
          setMembers((current) =>
            current.map((item) =>
              item.id === person.id
                ? { ...item, active: !person.active }
                : item,
            ),
          );
        },
        person.active
          ? "Usuário arquivado. Histórico preservado."
          : "Acesso reativado.",
      ),
    [act],
  );

  const saveMember = useCallback(
    (
      person: LivePerson,
      data: {
        chapa: string;
        name: string;
        role: string;
        stores: string[];
        unit_type?: string;
      },
    ) =>
      act(async () => {
        await rpc("eo_admin_update_person", {
          p_user: person.id,
          p_name: data.name.trim(),
          p_role: data.role,
          p_chapa: data.chapa.trim(),
          p_stores: data.stores,
          p_active: person.active,
          p_unit_type: data.unit_type,
        });
        await loadPerson(person.id);
      }, "Perfil e lojas atualizados."),
    [act, loadPerson],
  );

  const publish = useCallback(
    (data: MessagePayload) =>
      act(
        async () => {
          if (!data.stores.length)
            throw new Error("Selecione pelo menos uma loja.");
          const attachments = await uploadMessageFiles(data.attachments);
          if (data.scheduledFor) {
            await rpc("eo_schedule_message_with_options", {
              p_message_type: "notice",
              p_title: data.title.trim(),
              p_body: data.body.trim(),
              p_stores: data.stores,
              p_urgent: data.urgent,
              p_scheduled_for: data.scheduledFor,
              p_request_id: Crypto.randomUUID(),
              p_send_push: Boolean(data.sendPush),
              p_attachments: attachments,
            });
            await refresh();
            return;
          }
          const noticeId = await rpc<string>("eo_publish_notice", {
            p_title: data.title.trim(),
            p_body: data.body.trim(),
            p_stores: data.stores,
            p_urgent: data.urgent,
            p_request_id: Crypto.randomUUID(),
            p_attachments: attachments,
            p_send_push: Boolean(data.sendPush),
          });
          if (data.sendPush) {
            const { error: pushError } = await supabase!.functions.invoke(
              "send-alert-push",
              { body: { alert_id: noticeId } },
            );
            if (pushError)
              throw new Error(
                "Comunicado publicado, mas o push não foi confirmado. Confira a auditoria antes de reenviar.",
              );
          }
          await refresh();
        },
        () =>
          data.scheduledFor
            ? `Comunicado programado para ${new Date(data.scheduledFor).toLocaleString("pt-BR")}.`
            : data.sendPush
              ? "Comunicado publicado e encaminhado também por push."
              : "Comunicado publicado.",
      ),
    [act, refresh, uploadMessageFiles],
  );

  const issueTemporaryPassword = useCallback(
    async (userId: string) => {
      let password: string | undefined;
      const result = await act(async () => {
        const { data, error: invokeError } = await supabase!.functions.invoke(
          "admin-identity",
          {
            body: {
              action: "issue-person-temporary-password",
              user_id: userId,
            },
          },
        );
        if (invokeError || typeof data?.password !== "string") {
          if (invokeError?.context instanceof Response) {
            const response = await invokeError.context.json().catch(() => null);
            if (typeof response?.error === "string")
              throw new Error(response.error);
          }
          throw new Error("Não foi possível gerar uma senha temporária.");
        }
        password = data.password;
        setMembers((current) =>
          current.map((person) =>
            person.id === userId
              ? { ...person, must_change_password: true }
              : person,
          ),
        );
      });
      return { ...result, password };
    },
    [act],
  );

  const value = useMemo<ContextValue>(
    () => ({
      visibleModules,
      moduleVisible,
      configured: backendConfigured,
      session,
      initializing,
      loading,
      busy,
      passwordMode,
      workspace,
      notices,
      more,
      alerts,
      checklists,
      checklistDetail,
      soundEnabled,
      pushGranted,
      pushRegistered,
      audit,
      members,
      error,
      message,
      archivedMessages,
      reportMessages,
      reportData,
      peopleTotal,
      adminStores,
      searchPeople,
      loadPerson,
      saveStore,
      clearFeedback,
      login,
      changeTemporaryPassword,
      signout,
      refresh,
      acknowledge,
      loadMore,
      loadAdmin,
      loadNoticeReport,
      archiveMessage,
      addStore,
      inviteMember,
      toggleMember,
      saveMember,
      publish,
      issueTemporaryPassword,
      refreshOperational,
      markAlert,
      moderateAlert,
      setSoundEnabled,
      openChecklist,
      saveChecklistAnswer,
      publishAlert,
      openMessageAttachment,
      publishChecklist,
      enablePush,
      captureChecklistPhoto,
      sendTestPush,
    }),
    [
      visibleModules,
      moduleVisible,
      session,
      initializing,
      loading,
      busy,
      passwordMode,
      workspace,
      notices,
      more,
      alerts,
      checklists,
      checklistDetail,
      soundEnabled,
      pushGranted,
      pushRegistered,
      audit,
      members,
      error,
      message,
      archivedMessages,
      reportMessages,
      reportData,
      peopleTotal,
      adminStores,
      searchPeople,
      loadPerson,
      saveStore,
      clearFeedback,
      login,
      changeTemporaryPassword,
      signout,
      refresh,
      acknowledge,
      loadMore,
      loadAdmin,
      loadNoticeReport,
      archiveMessage,
      addStore,
      inviteMember,
      toggleMember,
      saveMember,
      publish,
      issueTemporaryPassword,
      refreshOperational,
      markAlert,
      moderateAlert,
      setSoundEnabled,
      openChecklist,
      saveChecklistAnswer,
      publishAlert,
      openMessageAttachment,
      publishChecklist,
      enablePush,
      captureChecklistPhoto,
      sendTestPush,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEO() {
  const value = useContext(Context);
  if (!value) throw new Error("useEO deve estar dentro de EOProvider.");
  return value;
}
