import {
  offlineEngine,
  rawRpc,
  resetEOClient,
  authStorageKey,
  deliveryMessage,
} from "../services/supabase";
import {
  beginSessionLogin,
  closeStoredSession,
  readStoredSession,
} from "../services/session-storage";
import { isTransportError, type OfflineStatus } from "../offline/engine";
import {
  beginNativeInteraction,
  nativeInteractionDeadline,
} from "./native-interactions";
import { IconOverridesProvider } from "../features/app-icon-context";
import {
  normalizeModuleIcons,
  type ModuleIconOverrides,
} from "../features/app-icons";
import { withDeadline, ensureActive } from "../services/deadline";
import { retryPushToken } from "../features/push-registration";
import {
  createSoundChannels,
  nativeSoundBundle,
} from "../features/notification-sound";
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
import {
  normalizeStoreUser,
  storePasswordRules,
} from "../features/store-access";
import { reportarErro } from "./error-reporter";
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

async function requestPushPermission() {
  const finish = beginNativeInteraction("notificacoes", 15000);
  try {
    return await withDeadline(
      () =>
        Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        }),
      12000,
      "A permissão de notificações não respondeu. Você pode continuar no app.",
    );
  } finally {
    finish();
  }
}
const tokenFlights = new Map<string, Promise<string>>();
async function devicePushToken(projectId: string): Promise<string> {
  let flight = tokenFlights.get(projectId);
  if (!flight) {
    flight = readDevicePushToken(projectId);
    tokenFlights.set(projectId, flight);
    void flight
      .finally(() => {
        if (tokenFlights.get(projectId) === flight)
          tokenFlights.delete(projectId);
      })
      .catch(() => {});
  }
  return withDeadline(
    () => flight!,
    25000,
    "O serviço de notificações demorou para responder. Tente novamente depois; o restante do app continua disponível.",
  );
}
async function readDevicePushToken(projectId: string): Promise<string> {
  try {
    return await retryPushToken(
      async () =>
        (await Notifications.getExpoPushTokenAsync({ projectId })).data,
    );
  } catch (cause) {
    reportarErro(cause, false, { origem: "push_token" });
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
  pushBusy: boolean;
  signingOut: boolean;
  offline: OfflineStatus;
  synchronize: () => Promise<void>;
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
  storeUser: string | null;
  hasLoginPassword: boolean;
  requestStoreReset: (user: string) => Promise<Result>;
  changeTemporaryPassword: (
    password: string,
    confirmation: string,
    current?: string,
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
  const [authClientEpoch, setAuthClientEpoch] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [offline, setOffline] = useState(offlineEngine.status);
  useEffect(
    () => offlineEngine.subscribe(() => setOffline(offlineEngine.status)),
    [],
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [moduleIcons, setModuleIcons] = useState<ModuleIconOverrides>({});
  const [storeUser, setStoreUser] = useState<string | null>(null);
  // Senha digitada no login da loja, só em memória, para não pedir de novo na troca obrigatória.
  const loginPassword = useRef("");
  const [hasLoginPassword, setHasLoginPassword] = useState(false);
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
  const [pushBusy, setPushBusy] = useState(false);
  const pushBusyRef = useRef(false);
  const currentUser = useRef<string | undefined>(undefined);
  currentUser.current = session?.user.id;
  const locallyOpenedUser = useRef<string | null>(null);
  const authSignedOut = useRef(false);
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
  const actionGeneration = useRef(0);

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
      const ticket = ++actionGeneration.current;
      const owner = currentUser.current;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await work();
        if (owner && currentUser.current !== owner) return { ok: false };
        if (success)
          setMessage(
            deliveryMessage(
              typeof success === "function" ? success() : success,
            ),
          );
        return { ok: true };
      } catch (cause) {
        if (owner && currentUser.current !== owner) return { ok: false };
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível concluir a operação.",
        );
        return { ok: false };
      } finally {
        if (ticket === actionGeneration.current) {
          busyRef.current = false;
          setBusy(false);
        }
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
    void (async () => {
      try {
        const local = await withDeadline(
          () => readStoredSession(authStorageKey),
          3000,
          "Não foi possível ler a sessão local.",
        );
        if (local && alive && !authSignedOut.current) {
          // A leitura da sessão não depende de sincronização antiga na fila.
          locallyOpenedUser.current = local.user.id;
          setSession(local);
        }
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : "Falha ao abrir a sessão.",
          );
      } finally {
        if (alive) setInitializing(false);
      }
      // O SDK já inicializa a sessão e emite INITIAL_SESSION. Uma chamada
      // getSession adicional competia pelo mesmo bloqueio interno do login.
    })();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      if (!alive || client !== supabase) return;
      if (event === "INITIAL_SESSION" && !next && locallyOpenedUser.current)
        return;
      if (event === "SIGNED_OUT") {
        authSignedOut.current = true;
        locallyOpenedUser.current = null;
      } else if (next?.user.id) {
        authSignedOut.current = false;
        locallyOpenedUser.current = next.user.id;
      }
      setSession(next);
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
  }, [authClientEpoch]);

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
        await rpc("eo_register_push_device_v2", {
          p_token: token,
          p_platform: Platform.OS,
          p_sound_bundle: nativeSoundBundle(),
        });
        if (active) setPushRegistered(true);
      } catch (cause) {
        reportarErro(cause, false, { origem: "push_registro" });
        if (active) setPushRegistered(false);
      }
    };
    const subscription = Notifications.addPushTokenListener(() => {
      void devicePushToken(projectId)
        .then(register)
        .catch((cause) =>
          reportarErro(cause, false, { origem: "push_token_auto" }),
        );
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [session?.user.id, pushGranted]);

  const workspaceRef = useRef<Workspace | null>(null);
  workspaceRef.current = workspace;
  const refreshFlight = useRef<Promise<void> | null>(null);
  const refreshOwner = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    if (refreshFlight.current && refreshOwner.current === session.user.id)
      return refreshFlight.current;
    refreshOwner.current = session.user.id;
    const task = (async () => {
      const current = ++epoch.current;
      if (!workspaceRef.current) setLoading(true);
      setError("");
      try {
        // O servidor pode abrir o espaço enquanto a fila cifrada termina sua
        // própria leitura. Uma requisição velha não deve prender esta tela.
        const userId = session.user.id;
        const identityReady = offlineEngine.setIdentity(userId);
        let serverDenied = false;
        let serverResolved = false;
        type Startup = {
          status: {
            must_change_password: boolean;
            conta_loja?: boolean;
            usuario_loja?: string | null;
          };
          context?: Workspace;
          modules?: VisibleModule[];
          feed?: LiveNotice[];
          icons?: unknown;
        };
        const restoreCached = () => {
          if (
            serverDenied ||
            serverResolved ||
            current !== epoch.current ||
            currentUser.current !== userId ||
            workspaceRef.current
          )
            return false;
          const restore = offlineEngine.cached<Startup>("eo_app_inicio");
          if (
            !restore ||
            restore.context?.person.id !== userId ||
            restore.status.must_change_password
          )
            return false;
          offlineEngine.markOffline();
          setWorkspace(restore.context);
          workspaceRef.current = restore.context;
          setVisibleModules(restore.modules ?? []);
          setModuleIcons(normalizeModuleIcons(restore.icons));
          setNotices(restore.feed ?? []);
          setStoreUser(
            restore.status.conta_loja
              ? (restore.status.usuario_loja ?? null)
              : null,
          );
          setLoading(false);
          setError("");
          return true;
        };
        restoreCached();
        void identityReady
          .then(restoreCached)
          .catch((cause) =>
            reportarErro(cause, false, { origem: "cache_sessao" }),
          );
        try {
          const inicio = await withDeadline(
            (signal) => rawRpc<Startup>("eo_app_inicio", {}, signal),
            8000,
            "Tempo limite de conexão. Seus dados locais continuam disponíveis.",
          );
          if (current !== epoch.current || currentUser.current !== userId)
            return;
          serverResolved = true;
          const status = inicio.status;
          setStoreUser(
            status.conta_loja ? (status.usuario_loja ?? null) : null,
          );
          if (status.must_change_password) {
            serverDenied = true;
            setWorkspace(null);
            workspaceRef.current = null;
            setPasswordMode(true);
            void identityReady
              .then(() => offlineEngine.invalidateAccess())
              .catch((cause) =>
                reportarErro(cause, false, { origem: "cache_acesso" }),
              );
            return;
          }
          setPasswordMode(false);
          const ctx = inicio.context as Workspace;
          if (ctx?.person?.id !== userId)
            throw new Error("Não foi possível validar o acesso.");
          const modules = inicio.modules ?? [];
          const feed = inicio.feed ?? [];
          if (current !== epoch.current) return;
          const nextScope = JSON.stringify({
            person: ctx.person.id,
            role: ctx.person.role,
            stores: ctx.stores.map((item) => item.id).sort(),
            modules,
          });
          offlineEngine.restrictScope(nextScope);
          setVisibleModules(modules);
          setWorkspace(ctx);
          setModuleIcons(normalizeModuleIcons(inicio.icons));
          setNotices(feed);
          setMore(feed.length === 20);
          setLoading(false);
          void identityReady
            .then(async () => {
              if (current !== epoch.current || currentUser.current !== userId)
                return;
              await offlineEngine.setScope(nextScope);
              await offlineEngine.revalidate(userId);
              await offlineEngine.remember("eo_app_inicio", {}, inicio);
              await offlineEngine.sync();
            })
            .catch((cause) =>
              reportarErro(cause, false, { origem: "sincronizacao_inicio" }),
            );
        } catch (cause) {
          if (current !== epoch.current || currentUser.current !== userId)
            return;
          if (
            isTransportError(cause) ||
            (cause instanceof Error && /Tempo limite/.test(cause.message))
          ) {
            offlineEngine.markOffline(
              cause instanceof Error ? cause.message : "Sem conexão",
            );
            if (restoreCached()) return;
            if (workspaceRef.current) return;
          } else {
            serverDenied = true;
            void identityReady
              .then(() => offlineEngine.invalidateAccess())
              .catch((failure) =>
                reportarErro(failure, false, { origem: "cache_acesso" }),
              );
            setWorkspace(null);
            workspaceRef.current = null;
          }
          throw cause;
        }
      } catch (cause) {
        if (current === epoch.current) {
          if (!workspaceRef.current) setWorkspace(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar seu espaço.",
          );
        }
      } finally {
        if (current === epoch.current) setLoading(false);
      }
    })();
    refreshFlight.current = task;
    try {
      await task;
    } finally {
      if (refreshFlight.current === task) refreshFlight.current = null;
    }
  }, [session?.user.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        session &&
        !pushBusyRef.current &&
        nativeInteractionDeadline() <= Date.now()
      )
        void refresh();
    });
    return () => subscription.remove();
  }, [session, refresh]);

  useEffect(() => {
    if (!session?.user.id || passwordMode) return;
    let alive = true;
    const load = () => {
      if (AppState.currentState !== "active") return;
      void rpc("eo_module_icons")
        .then((v) => {
          if (alive) setModuleIcons(normalizeModuleIcons(v));
        })
        .catch(() => {});
    };
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [session?.user.id, passwordMode]);
  const refreshOperational = useCallback(async () => {
    if (!session || passwordMode || visibleModules === null) return;
    const owner = session.user.id;
    const [nextAlerts, nextChecklists, preferences] = await Promise.all([
      rpc<LiveAlert[]>("eo_alert_feed"),
      moduleVisible("checklists")
        ? rpc<ChecklistRun[]>("eo_checklist_feed")
        : Promise.resolve([] as ChecklistRun[]),
      rpc<{ sound_enabled: boolean }>("eo_notification_preferences"),
    ]);
    if (currentUser.current !== owner) return;
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
    async (alert: LiveAlert, action: "view" | "dismiss") => {
      const at = new Date().toISOString();
      setAlerts((current) => current.map((item) =>
        item.id === alert.id
          ? { ...item, [action === "view" ? "seen_at" : "dismissed_at"]: at }
          : item,
      ));
      const result = await act(async () => {
        await rpc("eo_alert_mark", { p_alert: alert.id, p_action: action });
      });
      if (result.ok) void refreshOperational().catch(() => undefined);
      else setAlerts((current) => current.map((item) =>
        item.id === alert.id ? alert : item,
      ));
      return result;
    },
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
  const runPush = useCallback(
    async (
      work: (signal: AbortSignal) => Promise<void>,
      success: string,
    ): Promise<Result> => {
      if (pushBusyRef.current) return { ok: false };
      const user = currentUser.current;
      pushBusyRef.current = true;
      setPushBusy(true);
      setError("");
      setMessage("");
      try {
        await withDeadline(
          work,
          35000,
          "O registro de notificações demorou para responder. Você pode continuar usando o EO e tentar novamente depois.",
        );
        if (currentUser.current === user) setMessage(success);
        return { ok: true };
      } catch (cause) {
        reportarErro(cause, false, { origem: "push_operacao" });
        if (currentUser.current === user)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível concluir a notificação.",
          );
        return { ok: false };
      } finally {
        pushBusyRef.current = false;
        setPushBusy(false);
      }
    },
    [],
  );
  const enablePush = useCallback(
    () =>
      runPush(async (signal) => {
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
        if (!permission.granted) permission = await requestPushPermission();
        setPushGranted(permission.granted);
        if (!permission.granted)
          throw new Error(
            "Permissão negada. Para ativar depois, permita notificações nas configurações do aparelho.",
          );
        ensureActive(signal);
        const user = currentUser.current;
        setPushRegistered(false);
        const token = await devicePushToken(projectId);
        ensureActive(signal);
        if (currentUser.current !== user) return;
        await rpc(
          "eo_register_push_device_v2",
          {
            p_token: token,
            p_platform: Platform.OS,
            p_sound_bundle: nativeSoundBundle(),
          },
          signal,
        );
        ensureActive(signal);
        if (currentUser.current === user) setPushRegistered(true);
      }, "Notificações do sistema ativadas neste aparelho."),
    [runPush],
  );
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
      runPush(async (signal) => {
        if (!pushGranted) {
          // Pede a permissão aqui mesmo em vez de só recusar o teste.
          const permission = await requestPushPermission();
          setPushGranted(permission.granted);
          if (!permission.granted)
            throw new Error(
              "Permita as notificações do EO nos Ajustes do iPhone e tente de novo.",
            );
        }
        const projectId =
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId)
          throw new Error(
            "Projeto de notificações não configurado nesta versão.",
          );
        const user = currentUser.current;
        const token = await devicePushToken(projectId);
        ensureActive(signal);
        if (currentUser.current !== user) return;
        await rpc(
          "eo_register_push_device_v2",
          {
            p_token: token,
            p_platform: Platform.OS,
            p_sound_bundle: nativeSoundBundle(),
          },
          signal,
        );
        ensureActive(signal);
        if (currentUser.current === user) setPushRegistered(true);
        const { data, error: invokeError } = await supabase!.functions.invoke(
          "send-test-push",
          { body: {}, signal },
        );
        if (invokeError) {
          let detail =
            "Não foi possível enviar o teste agora. O erro foi registrado para análise.";
          try {
            const response = (invokeError as { context?: Response }).context;
            const body = await response?.json();
            if (typeof body?.error === "string")
              detail = body.error.slice(0, 300);
          } catch {
            /* manter diagnóstico seguro */
          }
          reportarErro(new Error(detail), false, { origem: "push_teste" });
          throw new Error(detail);
        }
        ensureActive(signal);
        if (!data?.devices)
          throw new Error(
            "Nenhum aparelho seu está registrado para receber o teste.",
          );
        if (!data.accepted) {
          const detail =
            data.note ||
            "O provedor recusou o teste. Seu aparelho foi registrado, mas a notificação não foi aceita.";
          reportarErro(new Error(detail), false, {
            origem: "push_teste",
            falhas: data.failures ?? {},
          });
          throw new Error(detail);
        }
      }, "Teste encaminhado aos seus aparelhos registrados. O serviço não confirma a exibição no aparelho."),
    [runPush, pushGranted],
  );

  useEffect(() => {
    if (session?.user.id) void refresh();
    else {
      epoch.current++;
      refreshFlight.current = null;
      refreshOwner.current = null;
      peopleRequest.current++;
      setAdminStores([]);
      setPeopleTotal(0);
      setVisibleModules(null);
      setWorkspace(null);
      setModuleIcons({});
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
        try {
          await withDeadline(
            async (signal) => {
              if (!supabase)
                throw new Error("A conexão ainda não foi configurada.");
              await beginSessionLogin();
              const normalized = chapa.trim();
              const lojaUser = normalizeStoreUser(normalized);
              if (lojaUser) {
                const { data, error: fnError } =
                  await supabase.functions.invoke("acesso-loja", {
                    body: {
                      acao: "entrar",
                      usuario: lojaUser,
                      senha: password,
                      origem: Platform.OS,
                    },
                  });
                if (fnError) {
                  let msg = "Usuário ou senha inválidos.";
                  try {
                    const parsed = await (
                      fnError as { context?: Response }
                    ).context?.json();
                    if (parsed?.error) msg = parsed.error;
                  } catch {
                    /* mensagem genérica */
                  }
                  throw new Error(msg);
                }
                ensureActive(signal);
                const { error: sessionError } = await supabase.auth.setSession({
                  access_token: data.access_token,
                  refresh_token: data.refresh_token,
                });
                ensureActive(signal);
                if (sessionError)
                  throw new Error("Não foi possível abrir a sessão.");
                loginPassword.current = password;
                setHasLoginPassword(true);
                return;
              }
              if (!/^\d{1,20}$/.test(normalized))
                throw new Error(
                  "Informe sua chapa ou o usuário da loja (ex.: ger006).",
                );
              const { error: authError } =
                await supabase.auth.signInWithPassword({
                  email: `app-${normalized}@login.app-eo.invalid`,
                  password,
                });
              if (authError)
                throw new Error(
                  "Não foi possível entrar. Confira seus dados e se a conta já foi liberada.",
                );
            },
            20000,
            "Tempo limite para entrar. Confira sua conexão e tente novamente.",
          );
        } catch (cause) {
          if (
            cause instanceof Error &&
            /Tempo limite para entrar/.test(cause.message)
          ) {
            await withDeadline(
              () => closeStoredSession(authStorageKey),
              4000,
              "Não foi possível limpar a sessão. Feche e abra o EO.",
            );
            resetEOClient();
            setAuthClientEpoch((value) => value + 1);
            authSignedOut.current = true;
            locallyOpenedUser.current = null;
            setSession(null);
          }
          throw cause;
        }
      }),
    [act],
  );

  const signout = useCallback(async () => {
    if (signingOutRef.current) return { ok: false };
    signingOutRef.current = true;
    setSigningOut(true);
    try {
      await withDeadline(
        () => closeStoredSession(authStorageKey),
        4000,
        "Não foi possível limpar a sessão local. Tente novamente.",
      );
      currentUser.current = undefined;
      authSignedOut.current = true;
      locallyOpenedUser.current = null;
      epoch.current++;
      actionGeneration.current++;
      busyRef.current = false;
      setBusy(false);
      setPushBusy(false);
      pushBusyRef.current = false;
      setPushRegistered(false);
      setPushGranted(false);
      void offlineEngine
        .logout()
        .catch((cause) =>
          reportarErro(cause, false, { origem: "cache_saida" }),
        );
      setWorkspace(null);
      workspaceRef.current = null;
      setSession(null);
      setPasswordMode(false);
      setStoreUser(null);
      setVisibleModules(null);
      setNotices([]);
      setAlerts([]);
      setChecklists([]);
      setModuleIcons({});
      resetEOClient();
      setAuthClientEpoch((value) => value + 1);
      setError("");
      return { ok: true };
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao encerrar acesso local.",
      );
      return { ok: false };
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  }, []);

  const synchronize = useCallback(async () => {
    await refresh();
    if (offlineEngine.status.revalidated) await offlineEngine.sync();
  }, [refresh]);

  useEffect(() => {
    if (!session?.user.id || passwordMode) return;
    const timer = setInterval(() => {
      const state = offlineEngine.status;
      if (
        AppState.currentState === "active" &&
        !pushBusyRef.current &&
        nativeInteractionDeadline() <= Date.now() &&
        (!state.online || state.pending > 0)
      )
        void synchronize().catch(() => {});
    }, 45000);
    return () => clearInterval(timer);
  }, [session?.user.id, passwordMode, synchronize]);

  const requestStoreReset = useCallback(
    (user: string) =>
      act(async () => {
        const lojaUser = normalizeStoreUser(user);
        if (!lojaUser)
          throw new Error(
            "Contas por chapa: procure a administração. Loja: digite o usuário (ex.: ger006) no campo acima.",
          );
        const { error: fnError } = await supabase!.functions.invoke(
          "acesso-loja",
          {
            body: {
              acao: "solicitar-reset",
              usuario: lojaUser,
              origem: Platform.OS,
            },
          },
        );
        if (fnError)
          throw new Error("Não foi possível enviar o pedido. Tente novamente.");
      }, "Pedido enviado ao administrador. Quando aprovado, a senha volta ao padrão da loja."),
    [act],
  );

  const changeTemporaryPassword = useCallback(
    (password: string, confirmation: string, current = "") =>
      act(async () => {
        if (storeUser) {
          if (password !== confirmation)
            throw new Error("As senhas não coincidem.");
          const broken = storePasswordRules(storeUser, password).filter(
            (r) => !r.ok,
          );
          if (broken.length)
            throw new Error(
              `Falta: ${broken.map((r) => r.label.toLowerCase()).join(", ")}.`,
            );
          const { error: fnError } = await supabase!.functions.invoke(
            "acesso-loja",
            {
              body: {
                acao: "trocar-senha",
                senha_atual: current || loginPassword.current,
                nova_senha: password,
                origem: Platform.OS,
              },
            },
          );
          if (fnError) {
            let msg = "Não foi possível trocar a senha.";
            try {
              const parsed = await (
                fnError as { context?: Response }
              ).context?.json();
              if (parsed?.error) msg = parsed.error;
            } catch {
              /* mensagem genérica */
            }
            throw new Error(msg);
          }
          loginPassword.current = "";
          setHasLoginPassword(false);
          setPasswordMode(false);
          await refresh();
          return;
        }
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
      }, "Senha alterada."),
    [act, storeUser, refresh],
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
      pushBusy,
      signingOut,
      offline,
      synchronize,
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
      storeUser,
      hasLoginPassword,
      requestStoreReset,
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
      pushBusy,
      signingOut,
      offline,
      synchronize,
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
      storeUser,
      hasLoginPassword,
      requestStoreReset,
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

  return (
    <Context.Provider value={value}>
      <IconOverridesProvider value={moduleIcons}>
        {children}
      </IconOverridesProvider>
    </Context.Provider>
  );
}

export function useEO() {
  const value = useContext(Context);
  if (!value) throw new Error("useEO deve estar dentro de EOProvider.");
  return value;
}
