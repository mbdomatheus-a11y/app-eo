import { AccountMenu } from "./features/account/AccountMenu";
import { TableViewport } from "./components/TableViewport";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCheck,
  ChevronRight,
  Grid2X2,
  Home,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
  Users,
  ClipboardCheck,
  FileImage,
  CalendarDays,
  Mic,
  Upload,
  Download,
} from "lucide-react";
import {
  backendConfigured,
  supabase,
  rpc,
  type Workspace,
  type Store,
  type LiveNotice,
  type LivePerson,
  type AuditRow,
  type MessageAttachment,
} from "./services/supabase";
import { roleLabels } from "./core/domain";
import { readOrgWorkbook } from "./core/xlsx-reader";
import { createXlsx } from "./core/xlsx-writer";
import NativeExperience from "./mobile/NativeExperience";
import { SalesReports } from "./features/sales/SalesReports";
import { OperationsPanel } from "./features/operations/OperationsPanel";

type Page = "home" | "notices" | "modules" | "admin" | "sales" | "diary" | "mood";
type AdminStore = Store & { active: boolean };
function StorePicker({ stores, selected, onChange }: { stores: Store[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [search,setSearch] = useState(""); const [uf,setUf] = useState(""); const [region,setRegion] = useState(""); const [page,setPage] = useState(0); const [sort,setSort] = useState("code");
  const regionOf = (store: Store) => store.segments?.REGIONAL || store.region || "";
  const filtered = stores.filter((store) => (!uf || store.segments?.UF===uf) && (!region || regionOf(store)===region) && `${store.code} ${store.name} ${regionOf(store)}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))).sort((a,b)=>(sort==="name" ? a.name.localeCompare(b.name,"pt-BR") : a.code.localeCompare(b.code,"pt-BR",{numeric:true})));
  const current = Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));
  return <div className="store-picker">{selected.map((id)=><input key={id} type="hidden" name="stores" value={id} />)}<p className="field-hint">{selected.length} lojas selecionadas. A seleção permanece ao mudar os filtros.</p><details><summary>Selecionar lojas</summary><div className="form-grid">
    <label>Buscar loja<input type="search" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(0);}} placeholder="Código, nome ou regional" /></label>
    <label>UF<select value={uf} onChange={(e)=>{setUf(e.target.value);setRegion("");setPage(0);}}><option value="">Todas</option>{[...new Set(stores.map((store)=>store.segments?.UF || "").filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select></label>
    <label>Regional<select value={region} onChange={(e)=>{setRegion(e.target.value);setPage(0);}}><option value="">Todas</option>{[...new Set(stores.filter((store)=>!uf || store.segments?.UF===uf).map(regionOf).filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select></label>
    <label>Ordenação<select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="code">Código</option><option value="name">Nome</option></select></label></div>
    <div className="selection-actions"><button type="button" className="secondary" onClick={()=>onChange([...new Set([...selected,...stores.map((store)=>store.id)])])}>Todas ({stores.length})</button><button type="button" className="secondary" onClick={()=>onChange([...new Set([...selected,...filtered.map((store)=>store.id)])])}>Adicionar filtro ({filtered.length})</button><button type="button" className="secondary" onClick={()=>{const ids=new Set(filtered.map((store)=>store.id));onChange(selected.filter((id)=>!ids.has(id)));}}>Remover filtro</button><button type="button" className="text-button" onClick={()=>onChange([])}>Limpar seleção</button></div>
    <div className="registration-store-list">{filtered.slice(current*20,current*20+20).map((store)=><label className="checkbox-label" key={store.id}><input type="checkbox" checked={selected.includes(store.id)} onChange={(e)=>onChange(e.target.checked ? [...selected,store.id] : selected.filter((id)=>id!==store.id))} />{store.code} · {store.name}{regionOf(store) && ` · ${regionOf(store)}`}</label>)}</div>
    <div className="pagination"><button type="button" className="secondary" disabled={!current} onClick={()=>setPage(current-1)}>Anterior</button><span>{filtered.length ? `${current*20+1} a ${Math.min(current*20+20,filtered.length)} de ${filtered.length}` : "Nenhuma loja encontrada"}</span><button type="button" className="secondary" disabled={(current+1)*20>=filtered.length} onClick={()=>setPage(current+1)}>Próxima</button></div></details></div>;
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Fechar" className="icon-button" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function ConnectedApp() {
  const [newStoreOpen, setNewStoreOpen] = useState(false);
  const [newStoreDirty, setNewStoreDirty] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!newStoreOpen || !newStoreDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [newStoreOpen, newStoreDirty]);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationRole, setRegistrationRole] = useState("colaborador");
  const [registrationDirty, setRegistrationDirty] = useState(false);
  const [registrationStores, setRegistrationStores] = useState<string[]>([]);
  const [passwordTarget, setPasswordTarget] = useState<Pick<LivePerson, "id" | "display_name" | "login_chapa"> | null>(null);
  useEffect(() => {
    if (!registrationOpen || !registrationDirty) return;
    const confirmUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmUnload);
    return () => window.removeEventListener("beforeunload", confirmUnload);
  }, [registrationOpen, registrationDirty]);
  const isNative =
    Capacitor.isNativePlatform() ||
    (import.meta.env.DEV &&
      new URLSearchParams(location.search).get("native-preview") === "1");
  const [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [notices, setNotices] = useState<LiveNotice[]>([]);
  const [page, setPage] = useState<Page>("home"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [opened, setOpened] = useState<LiveNotice | null>(null);
  const [compose, setCompose] = useState(false),
    [more, setMore] = useState(false),
    [passwordMode, setPasswordMode] = useState(
      () => new URLSearchParams(location.search).get("set-password") === "1",
    );
  const [audit, setAudit] = useState<AuditRow[]>([]),
    [members, setMembers] = useState<LivePerson[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [importData, setImportData] = useState<Record<string, Record<string, string>[]> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importCounts, setImportCounts] = useState<Record<string, number> | null>(null);
  const [importReady, setImportReady] = useState<boolean | null>(null);
  const [activeImport, setActiveImport] = useState<{ id: string; created_at: string; source_name: string; store_count: number; manager_count: number; regional_count: number; people_count: number; assignment_count: number } | null>(null);
  const [editingMember, setEditingMember] = useState<LivePerson | null>(null);
  const [tab, setTab] = useState<"stores" | "people" | "audit" | "import" | "archive" | "reports">("stores"),
    [future, setFuture] = useState("");
  const [archivedMessages, setArchivedMessages] = useState<{ kind: "notice" | "alert"; id: string; title: string; body: string; archived_at: string; archived_by_name: string | null; attachments: MessageAttachment[] }[]>([]);
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [reportMessages, setReportMessages] = useState<{ notice_id: string; version: number; title: string; published_at: string; archived_at: string | null; total_stores: number; eligible_people: number; confirmed_people: number }[]>([]);
  const [reportData, setReportData] = useState<{ total_stores: number; stores_with_read: number; stores_fully_read: number; stores_pending: number; read_rule: string; groups: { group: string; total_stores: number; stores_with_read: number; stores_fully_read: number; stores_pending: number }[] } | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  const [reportVersion, setReportVersion] = useState(1);
  const [reportGroup, setReportGroup] = useState("regional");
  const [reportSegmentBy, setReportSegmentBy] = useState("");
  const [reportSegmentValues, setReportSegmentValues] = useState<string[]>([]);
  const [composeSegmentBy, setComposeSegmentBy] = useState("");
  const [composeSegmentValues, setComposeSegmentValues] = useState<string[]>([]);
  const [importedStores, setImportedStores] = useState<Record<string, unknown>[]>([]);
  const [storeSort, setStoreSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "COD", direction: "asc" });
  const [editingStore, setEditingStore] = useState<Record<string, unknown> | null>(null);
  const [templateChoice, setTemplateChoice] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [importPage,setImportPage] = useState(0);
  const [adminStores,setAdminStores] = useState<AdminStore[]>([]);
  const [managedStore,setManagedStore] = useState<AdminStore | null>(null);
  const [storeUf,setStoreUf] = useState(""); const [storeRegion,setStoreRegion] = useState(""); const [storeState,setStoreState] = useState("active"); const [storePage,setStorePage] = useState(0);
  const [peopleSearch,setPeopleSearch] = useState(""); const [peopleRole,setPeopleRole] = useState(""); const [peopleState,setPeopleState] = useState(""); const [peopleRegion,setPeopleRegion] = useState(""); const [peopleUf,setPeopleUf] = useState(""); const [peopleSort,setPeopleSort] = useState("name"); const [peoplePage,setPeoplePage] = useState(0); const [peopleTotal,setPeopleTotal] = useState(0);
  const [editStores,setEditStores] = useState<string[]>([]); const [composeStores,setComposeStores] = useState<string[]>([]);
  const peopleRequest = useRef(0);
  const searchPeople = useCallback(async () => {
    const request = ++peopleRequest.current;
    const result = await rpc<{items: LivePerson[];total:number}>("eo_admin_people_page", {p_search:peopleSearch,p_role:peopleRole,p_state:peopleState,p_region:peopleRegion,p_uf:peopleUf,p_sort:peopleSort,p_limit:30,p_offset:peoplePage*30});
    if(request===peopleRequest.current){setMembers(result.items);setPeopleTotal(result.total);}
  },[peopleSearch,peopleRole,peopleState,peopleRegion,peopleUf,peopleSort,peoplePage]);
  useEffect(()=>{
    if(page!=="admin" || tab!=="people" || workspace?.person.role!=="admin")return;
    const timer=setTimeout(()=>void searchPeople().catch((cause)=>setError(cause instanceof Error ? cause.message : "Não foi possível buscar pessoas.")),250);
    return()=>clearTimeout(timer);
  },[page,tab,workspace?.person.role,searchPeople]);
  const epoch = useRef(0),
    requestId = useRef(crypto.randomUUID());
  const clear = useCallback(() => {
    epoch.current++;
    setWorkspace(null);
    setNotices([]);
    peopleRequest.current++;
    setMembers([]);
    setPeopleTotal(0);
    setAdminStores([]);
    setAudit([]);
    setOpened(null);
    setImportData(null);
    setImportCounts(null);
    setImportFileName("");
    setPage("home");
    setTemporaryPassword("");
  }, []);
  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error: e }) => {
      if (alive) {
        setSession(data.session);
        if (e) setError("Não foi possível recuperar a sessão.");
        setInitializing(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      if (event === "SIGNED_OUT") clear();
      if (event === "PASSWORD_RECOVERY") setPasswordMode(true);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [clear]);
  const refresh = useCallback(async () => {
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
      const ctx = await rpc<Workspace>("eo_context");
      const feed = await rpc<LiveNotice[]>("eo_feed");
      if (current !== epoch.current) return;
      setWorkspace(ctx);
      setNotices(feed);
      setMore(feed.length === 20);
    } catch (e) {
      if (current === epoch.current) {
        setWorkspace(null);
        setError((e as Error).message);
      }
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (session?.user.id) void refresh();
  }, [session?.user.id, refresh]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await act(async () => {
      if (!supabase) return;
      const chapa = String(data.get("chapa")).trim();
      if (!/^\d{1,20}$/.test(chapa))
        throw new Error("Informe sua chapa numérica.");
      const { error: e } = await supabase.auth.signInWithPassword({
        email: `app-${chapa}@login.app-eo.invalid`,
        password: String(data.get("password")),
      });
      if (e)
        throw new Error(
          "Não foi possível entrar. Confira seus dados e se a conta já foi liberada.",
        );
    });
  }
  async function signout() {
    await act(async () => {
      if (!supabase) return;
      const { error: e } = await supabase.auth.signOut({ scope: "local" });
      if (e) throw e;
      clear();
      setSession(null);
    });
  }
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await act(async () => {
      const password = String(data.get("password"));
      if (password.length < 12 || password !== data.get("confirm"))
        throw new Error(
          "As senhas devem coincidir e ter pelo menos 12 caracteres.",
        );
      const { error: e } = await supabase!.functions.invoke("admin-identity", {
        body: { action: "change-temporary-password", password },
      });
      if (e)
        throw new Error(
          "Não foi possível concluir a troca. Confira a validade do acesso ou peça um novo convite à administração.",
        );
      setPasswordMode(false);
      history.replaceState({}, "", location.pathname);
      clear();
      await supabase!.auth.signOut({ scope: "local" });
      setSession(null);
      setMessage("Senha atualizada. Entre novamente com sua chapa.");
    });
  }
  async function acknowledge(n: LiveNotice) {
    await act(async () => {
      await rpc("eo_acknowledge", {
        p_notice: n.notice_id,
        p_version: n.version,
      });
      setOpened({ ...n, acknowledged: true });
      await refresh();
      setMessage("Sua ciência foi registrada.");
    });
  }
  async function uploadMessageFiles(files: File[]) {
    if (!files.length) return [] as Omit<MessageAttachment, "id">[];
    if (files.length > 10) throw new Error("Anexe no máximo 10 arquivos.");
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    const uploaded: Omit<MessageAttachment, "id">[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      const mimeType = file.type || ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[ext] || "";
      if (!allowed.has(mimeType)) throw new Error("Use PDF, JPG, PNG ou WebP.");
      if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Cada arquivo deve ter até 10 MB.");
      const path = `${workspace!.person.id}/${crypto.randomUUID()}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-180)}`;
      const { error: uploadError } = await supabase!.storage.from("eo-message-attachments").upload(path, file, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
      uploaded.push({ object_path: path, file_name: file.name.slice(0, 255), mime_type: mimeType, byte_size: file.size });
    }
    return uploaded;
  }
  async function openMessageAttachment(file: MessageAttachment) {
    if (!supabase) return;
    const { data, error: signedError } = await supabase.storage.from("eo-message-attachments").createSignedUrl(file.object_path, 60);
    if (signedError) { setError("Você não tem acesso a este anexo ou o link expirou."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function archiveMessage(kind: "notice" | "alert", id: string, archived: boolean) {
    await act(async () => {
      await rpc("eo_admin_archive_message", { p_kind: kind, p_id: id, p_archived: archived });
      if (kind === "notice" && opened?.notice_id === id) setOpened(null);
      await refresh();
      if (tab === "archive") setArchivedMessages(await rpc<typeof archivedMessages>("eo_admin_archived_messages"));
      setMessage(archived ? "Comunicado arquivado; o histórico e a auditoria foram preservados." : "Mensagem restaurada para a equipe.");
    });
  }
  async function loadNoticeReport(noticeId: string, version: number, groupBy: string, segmentBy = reportSegmentBy, segmentValues = reportSegmentValues) {
    if (!noticeId) { setReportData(null); return; }
    await act(async () => setReportData(await rpc("eo_admin_notice_report", { p_notice: noticeId, p_version: version, p_group_by: groupBy, p_segment_by: segmentBy || null, p_segment_values: segmentValues })));
  }
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await act(async () => {
      const messageKind = String(data.get("message_kind")) === "alert" ? "alert" : "notice";
      const targetMode = String(data.get("target_mode") || "all");
      const targetRegion = String(data.get("target_region") || "");
      const eligibleStores = filterStores(workspace?.stores ?? [], composeSegmentBy, composeSegmentValues);
      const stores = targetMode === "all"
        ? eligibleStores.map((store) => store.id)
        : targetMode === "region"
          ? eligibleStores.filter((store) => store.region === targetRegion).map((store) => store.id)
          : data.getAll("stores").map(String).filter((id) => eligibleStores.some((store) => store.id === id));
      if (!stores.length) throw new Error("Selecione ao menos uma loja.");
      const title = String(data.get("title")).trim();
      const body = String(data.get("body")).trim();
      const urgent = data.get("urgent") === "on";
      const sendPush = data.get("send_push") === "on";
      const scheduleAt = String(data.get("schedule_at") || "");
      const attachments = await uploadMessageFiles(messageFiles);
      let pushFailed = false;
      if (scheduleAt) {
        const scheduledFor = new Date(scheduleAt);
        if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 120_000)
          throw new Error("Escolha um horário pelo menos dois minutos à frente.");
        await rpc<string>("eo_schedule_message_with_options", {
          p_message_type: messageKind,
          p_title: title,
          p_body: body,
          p_stores: stores,
          p_urgent: urgent,
          p_scheduled_for: scheduledFor.toISOString(),
          p_request_id: requestId.current,
          p_send_push: sendPush,
          p_attachments: attachments,
        });
      } else if (messageKind === "notice") {
        await rpc("eo_publish_notice", {
          p_title: title,
          p_body: body,
          p_stores: stores,
          p_urgent: urgent,
          p_request_id: requestId.current,
          p_attachments: attachments,
          p_send_push: sendPush,
        });
        if (sendPush) {
          const { error: pushError } = await supabase!.functions.invoke("send-alert-push", { body: { alert_id: requestId.current } });
          pushFailed = Boolean(pushError);
        }
      } else {
        const alertId = await rpc<string>("eo_publish_alert", {
          p_title: title,
          p_body: body,
          p_stores: stores,
          p_urgent: urgent,
          p_attachments: attachments,
        });
        const { error: pushError } = await supabase!.functions.invoke("send-alert-push", { body: { alert_id: alertId } });
        pushFailed = Boolean(pushError);
      }
      requestId.current = crypto.randomUUID();
      setMessageFiles([]);
      setCompose(false);
      await refresh();
      setMessage(scheduleAt
        ? `${messageKind === "notice" ? "Comunicado" : "Alerta push"} programado para ${new Date(scheduleAt).toLocaleString("pt-BR")}.`
        : messageKind === "notice" ? pushFailed ? "Comunicado publicado, mas o push não foi confirmado. Confira a auditoria." : sendPush ? "Comunicado publicado e enviado também por push." : "Comunicado publicado." : pushFailed
          ? "Alerta salvo, mas o envio push não foi confirmado. Confira a auditoria antes de reenviar."
          : "Alerta enviado para as lojas selecionadas.");
    });
  }
  const segmentOptions = [
    ["GGL", "GGL"], ["REGIONAL", "Regional"], ["UF", "UF"], ["CIDADE", "Cidade"], ["SAFRA", "Safra"],
    ["GRUPO_CIDADE", "Grupo cidade"], ["POPULACAO", "População"], ["GRUPO_LOJA", "Grupo de loja"],
    ["CLIMA", "Clima"], ["PERFIL_PRECO", "Perfil de preço"], ["CLUSTERS_VEST_26", "Cluster vestuário 26"],
    ["CLUSTERS_VEST_10_25", "Cluster vestuário 10/25"], ["RE_VAREJO_24", "RE varejo 24"], ["STATUS_RE_24", "Status RE 24"],
    ["LATITUDE", "Latitude"], ["LONGITUDE", "Longitude"], ["COORDENADAS", "Coordenadas"], ["TIPO", "Tipo de loja"],
    ["AT", "Área construída"], ["TOTAL_VENDAS", "Total de vendas"], ["PORTE_VENDAS", "Porte de vendas"],
  ] as const;
  function segmentValuesFor(stores: Store[], key: string) {
    if (!key) return [];
    return [...new Set(stores.map((store) => store.segments?.[key]?.trim() ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }
  function filterStores(stores: Store[], key: string, values: string[]) {
    if (!key || !values.length) return stores;
    return stores.filter((store) => values.includes(store.segments?.[key] ?? ""));
  }
  function downloadCurrentModel() {
    void act(async () => {
      const workbook = await rpc<Record<string, Record<string, string | number | null>[]>>("eo_admin_export_org");
      const blob = createXlsx(workbook);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "Modelo-importacao-administrativa-EO-dados-atuais.xlsx"; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Planilha com os dados atuais baixada.");
    });
  }
  function storeRecords() {
    return importedStores.map((raw) => {
      const item = raw as Record<string, unknown>; const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      return { ...attrs, COD: item.code ?? attrs.COD ?? "", LOJA: item.name ?? attrs.LOJA ?? "", REGIONAL: item.region ?? attrs.REGIONAL ?? "", GGL: item.ggl ?? attrs.GGL ?? "", "CHAPA GERENTE": item.manager_chapa ?? attrs["CHAPA GERENTE"] ?? "", "NOME DO GERENTE": item.manager_name ?? attrs["NOME DO GERENTE"] ?? "", TELEFONE: item.manager_phone ?? attrs.TELEFONE ?? "", __id: item.id } as Record<string, unknown>;
    });
  }
  function orderedStoreRecords() {
    const q = storeSearch.trim().toLocaleLowerCase("pt-BR");
    const numeric = (raw: string) => {
      const value = raw.trim().replace(/[^\d,.-]/g, "");
      const normalized = value.includes(",") ? value.replaceAll(".", "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(value) ? value.replaceAll(".", "") : value;
      return normalized && Number.isFinite(Number(normalized)) ? Number(normalized) : null;
    };
    return storeRecords().filter((row) => !q || Object.entries(row).some(([key, value]) => key !== "__id" && String(value ?? "").toLocaleLowerCase("pt-BR").includes(q)))
      .sort((a, b) => {
        const av = String(a[storeSort.key] ?? ""), bv = String(b[storeSort.key] ?? "");
        const an = numeric(av), bn = numeric(bv);
        const cmp = an !== null && bn !== null ? an - bn : av.localeCompare(bv, "pt-BR", { numeric: true, sensitivity: "base" });
        return storeSort.direction === "asc" ? cmp : -cmp;
      });
  }
  async function saveStoreEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingStore) return;
    const data = new FormData(event.currentTarget); const attributes = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
    await act(async () => {
      await rpc("eo_admin_update_store_attributes", { p_store: editingStore.__id, p_attributes: attributes });
      setImportedStores(await rpc<Record<string, unknown>[]>("eo_admin_imported_stores")); setEditingStore(null);
      setMessage("Dados da loja atualizados e registrados na auditoria.");
    });
  }
  const availableRegions = [...new Set((workspace?.stores ?? []).map((store) => store.region.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  async function loadMore() {
    await act(async () => {
      const tail = notices.at(-1);
      if (!tail) return;
      const feed = await rpc<LiveNotice[]>("eo_feed", {
        p_before: tail.published_at,
        p_before_id: tail.notice_id,
      });
      setNotices((s) => [...s, ...feed]);
      setMore(feed.length === 20);
    });
  }
  async function openAdmin(which: typeof tab) {
    setTab(which);
    setPage("admin");
    await act(async () => {
      if (which === "audit") setAudit(await rpc<AuditRow[]>("eo_admin_audit"));
      if (which === "archive") setArchivedMessages(await rpc<typeof archivedMessages>("eo_admin_archived_messages"));
      if (which === "reports") {
        const messages = await rpc<typeof reportMessages>("eo_admin_report_messages");
        setReportMessages(messages);
        if (messages.length) {
          setReportNotice(messages[0].notice_id);
          setReportVersion(messages[0].version);
          setReportData(await rpc("eo_admin_notice_report", { p_notice: messages[0].notice_id, p_version: messages[0].version, p_group_by: reportGroup, p_segment_by: reportSegmentBy || null, p_segment_values: reportSegmentValues }));
        } else setReportData(null);
      }
      if (which === "people") await searchPeople();
      if (which === "stores") setAdminStores(await rpc<AdminStore[]>("eo_admin_stores"));
      if (which === "import") {
        try {
          const latest = await rpc<{ id?: string; created_at?: string; source_name?: string; store_count?: number; manager_count?: number; regional_count?: number; people_count?: number; assignment_count?: number }>("eo_admin_import_status");
          setActiveImport(latest.id ? latest as NonNullable<typeof activeImport> : null);
          setImportReady(true);
          setImportedStores(await rpc<Record<string, unknown>[]>("eo_admin_imported_stores"));
        } catch (e) {
          setImportReady(false);
          throw e;
        }
      }
    });
  }
  async function addStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    await act(async () => {
      await rpc("eo_admin_store", {
        p_code: data.get("code"),
        p_name: data.get("name"),
        p_region: data.get("region"),
      });
      form.reset();
      await refresh();
      setAdminStores(await rpc<AdminStore[]>("eo_admin_stores"));
      setMessage("Loja cadastrada.");
      setNewStoreDirty(false); setNewStoreOpen(false);
    });
  }
  async function saveManagedStore(store: AdminStore) {
    await act(async()=>{
      await rpc("eo_admin_manage_store",{p_store:store.id,p_code:store.code,p_name:store.name,p_region:store.region,p_active:store.active});
      setAdminStores(await rpc<AdminStore[]>("eo_admin_stores")); await refresh(); setStorePage(0); setManagedStore(null);
      setMessage("Loja atualizada. Histórico e vínculos preservados.");
    });
  }
  async function inviteMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isNative) {
      setError("Use o portal app-eo.vercel.app ou atualize o aplicativo EO para cadastrar usuários.");
      return;
    }
    const form = e.currentTarget;
    const data = new FormData(form);
    const role = String(data.get("role"));
    const selected = registrationOpen ? registrationStores : data.getAll("stores").map(String);
    const stores = role === "admin" ? [] : selected.length ? selected : workspace?.stores.map((store) => store.id) ?? [];
    await act(async () => {
      if (role !== "admin" && !stores.length)
        throw new Error("Cadastre uma loja antes de criar um acesso com vínculo.");
      const { data: created, error: inviteError } = await supabase!.functions.invoke(
        "admin-identity",
        {
          body: {
            action: "create-person",
            email: String(data.get("email") ?? "").trim(),
            chapa: String(data.get("chapa")).trim(),
            name: String(data.get("name")).trim(),
            role,
            stores,
          },
        },
      );
      if (inviteError || typeof created?.password !== "string") {
        const response = inviteError?.context instanceof Response ? await inviteError.context.json().catch(() => null) : null;
        throw new Error(response?.error ?? "Não foi possível cadastrar a pessoa.");
      }
      form.reset();
      setRegistrationOpen(false);
      setTemporaryPassword(created.password);
      setPasswordTarget({ id: "", display_name: String(data.get("name")).trim(), login_chapa: String(data.get("chapa")).trim() });
      setMessage("Usuário cadastrado. Compartilhe a senha temporária com a pessoa.");
      await searchPeople();
    });
  }
  async function toggleMember(p: LivePerson) {
    await act(async () => {
      const { error: statusError } = await supabase!.functions.invoke("admin-identity", {
        body: { action: "set-person-active", user_id: p.id, active: !p.active },
      });
      if (statusError) {
        const response = statusError.context instanceof Response ? await statusError.context.json().catch(() => null) : null;
        throw new Error(response?.error ?? "Não foi possível alterar o acesso.");
      }
      setMembers((current) => current.map((member) => member.id === p.id ? { ...member, active: !p.active } : member));
      setEditingMember((current) => current?.id === p.id ? { ...current, active: !p.active } : current);
      setMessage(p.active ? "Acesso desativado." : "Acesso reativado.");
    });
  }
  async function saveMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingMember) return;
    const data = new FormData(e.currentTarget);
    await act(async () => {
      await rpc("eo_admin_update_person", {
        p_user: editingMember.id,
        p_name: String(data.get("name")).trim(),
        p_role: String(data.get("role")),
        p_chapa: String(data.get("chapa")).trim(),
        p_stores: editStores,
        p_active: editingMember.active,
      });
      await searchPeople();
      setEditingMember(null);
      setMessage("Perfil e abrangência atualizados.");
    });
  }
  async function issueTemporaryPassword(person?: Pick<LivePerson, "id">) {
    await act(async () => {
      const { data, error: issueError } = await supabase!.functions.invoke(
        "admin-identity",
        {
          body: {
            action: person ? "issue-person-temporary-password" : "issue-master-temporary-password",
            user_id: person?.id ?? workspace!.person.id,
          },
        },
      );
      if (issueError || typeof data?.password !== "string") {
        if (issueError?.context instanceof Response) {
          const response = await issueError.context.json().catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw new Error("Não foi possível gerar uma senha temporária.");
      }
      setTemporaryPassword(data.password);
      if (person) setMembers((current) => current.map((member) => member.id === person.id
        ? { ...member, must_change_password: true }
        : member));
      setMessage(
        "Senha temporária criada. Copie e guarde em local seguro agora.",
      );
    });
  }

  async function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setImportData(null);
    setImportCounts(null);
    if (!file) return;
    try {
      const data = await readOrgWorkbook(file);
      if (!data.Lojas.length) throw new Error("A aba Lojas não contém linhas para importar.");
      if (!data.Regionais.length) throw new Error("Preencha a aba Regionais antes de importar.");
      const storeCodes = new Set(data.Lojas.map((row) => row.COD.trim()).filter(Boolean));
      const managers = data.Gerentes.filter((row) => {
        const chapa = (row.CHAPA ?? "").trim();
        const storeCode = (row["COD LOJA"] ?? "").trim();
        return /^\d+$/.test(chapa) && storeCodes.has(storeCode);
      });
      const people = data.Pessoas.filter((row) =>
        /^[0-9]{1,20}$/.test((row.CHAPA ?? "").trim()) &&
        !!(row.NOME ?? "").trim() &&
        !!(row["CARGO OPERACIONAL"] ?? "").trim(),
      );
      const skippedManagers = data.Gerentes.length - managers.length;
      const skippedPeople = data.Pessoas.length - people.length;
      const importableData = { ...data, Gerentes: managers, Pessoas: people };
      setImportData(importableData);
      setImportFileName(file.name);
      setImportCounts(Object.fromEntries(Object.entries(importableData).map(([name, rows]) => [name, rows.length])));
      setError("");
      const skipped = [
        skippedManagers ? `${skippedManagers} gerente(s) sem CHAPA numérica ou COD LOJA correspondente` : "",
        skippedPeople ? `${skippedPeople} pessoa(s) sem CHAPA numérica, nome e cargo` : "",
      ].filter(Boolean);
      setMessage(
        skipped.length
          ? `Planilha lida. ${skipped.join("; ")} serão ignorados, sem bloquear as lojas e demais registros válidos. Revise as quantidades antes de importar.`
          : "Planilha lida. Revise as quantidades antes de substituir a base ativa.",
      );
    } catch (e) {
      setError((e as Error).message || "Não foi possível ler a planilha.");
    } finally {
      input.value = "";
    }
  }

  async function importOrgBase() {
    if (!importData) return;
    await act(async () => {
      const result = await rpc<{ stores: number; managers: number; regionals: number; people: number; assignments: number }>("eo_admin_import_org", {
        p_source_name: importFileName,
        p_payload: importData,
      });
      setMessage(`Base atualizada: ${result.stores} lojas, ${result.managers} gerentes, ${result.regionals} regionais, ${result.people} pessoas e ${result.assignments} vínculos. A operação anterior permanece substituída somente após validação integral.`);
      setImportData(null);
      setImportCounts(null);
      setImportFileName("");
      const latest = await rpc<{ id?: string; created_at?: string; source_name?: string; store_count?: number; manager_count?: number; regional_count?: number; people_count?: number; assignment_count?: number }>("eo_admin_import_status");
      setActiveImport(latest.id ? latest as NonNullable<typeof activeImport> : null);
      setImportReady(true);
      await refresh();
      setAudit(await rpc<AuditRow[]>("eo_admin_audit"));
    });
  }

  if (isNative) {
    return (
      <NativeExperience
        initializing={initializing}
        backendConfigured={backendConfigured}
        session={session}
        workspace={workspace}
        passwordMode={passwordMode}
        notices={notices}
        more={more}
        busy={busy}
        loading={loading}
        error={error}
        message={message}
        setMessage={setMessage}
        opened={opened}
        setOpened={setOpened}
        compose={compose}
        setCompose={setCompose}
        audit={audit}
        members={members}
        temporaryPassword={temporaryPassword}
        editingMember={editingMember}
        setEditingMember={setEditingMember}
        tab={tab === "import" ? "stores" : tab}
        setTab={(nextTab) => setTab(nextTab)}
        login={login}
        changePassword={changePassword}
        refresh={refresh}
        signout={signout}
        acknowledge={acknowledge}
        publish={publish}
        loadMore={loadMore}
        openAdmin={openAdmin}
        addStore={addStore}
        inviteMember={inviteMember}
        toggleMember={toggleMember}
        saveMember={saveMember}
        issueTemporaryPassword={issueTemporaryPassword}
        archivedMessages={archivedMessages}
        archiveMessage={archiveMessage}
        reportMessages={reportMessages}
        reportData={reportData}
        reportNotice={reportNotice}
        reportVersion={reportVersion}
        reportGroup={reportGroup}
        setReportNotice={setReportNotice}
        setReportGroup={setReportGroup}
        loadNoticeReport={loadNoticeReport}
        openMessageAttachment={openMessageAttachment}
        messageFiles={messageFiles}
        setMessageFiles={setMessageFiles}
      />
    );
  }

  if (initializing)
    return (
      <div className="auth-shell">
        <p role="status">Preparando seu espaço...</p>
      </div>
    );
  if (!backendConfigured)
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <ShieldCheck size={30} />
          <h1>Conexão em preparação</h1>
          <p>
            O ambiente do portal precisa ser configurado pela administração.
          </p>
        </section>
      </div>
    );
  if (!session)
    return (
      <div className="auth-shell eo-signin">
        <section className="auth-intro">
          <img className="eo-brand-icon" src="/eo-icon.svg" alt="EO" width="42" height="42" />
          <span className="hero-kicker">SEU ESPAÇO DE TRABALHO</span>
          <h1>Excelência Operacional</h1>
          <p>Acompanhe os comunicados e as rotinas das suas lojas.</p>
          <div className="auth-seal">
            <ShieldCheck size={19} />
            Acesso exclusivo para pessoas autorizadas
          </div>
        </section>
        <section className="auth-card">
          <h2>Entrar no EO</h2>
          <p>Use sua chapa e a senha individual.</p>
          <form className="form" onSubmit={login}>
            <label>
              Chapa
              <input
                name="chapa"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                autoComplete="username"
                required
                placeholder="Ex.: 123456"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary" type="submit">
              {busy ? "Entrando..." : "Entrar"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-hint">
            Precisa de acesso ou redefinir a senha? Procure a administração. A
            liberação é individual.
          </p>
          <a className="auth-privacy-link" href="/privacidade.html">
            Política de Privacidade
          </a>
          {import.meta.env.DEV && (
            <a className="text-button" href="?demo=1">
              Abrir demonstração local
            </a>
          )}
        </section>
      </div>
    );
  if (passwordMode)
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h2>Defina sua senha</h2>
          <form className="form" onSubmit={changePassword}>
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <label>
              Confirme a senha
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button disabled={busy} className="primary" type="submit">
              Salvar senha
            </button>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
          </form>
        </section>
      </div>
    );
  if (!workspace)
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <ShieldCheck size={30} />
          <h2>{loading ? "Carregando seu espaço" : "Acesso em preparação"}</h2>
          <p>{error || "Conferindo suas permissões..."}</p>
          <p>Conta: {session.user.email}</p>
          <button
            className="primary"
            disabled={busy || loading}
            onClick={() => void refresh()}
          >
            Tentar novamente
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void signout()}
          >
            Sair desta conta
          </button>
        </section>
      </div>
    );
  const admin = workspace.person.role === "admin",
    leader = admin || workspace.person.role === "diretor";
  const pendingNoticeCount = notices.filter((notice) => !notice.acknowledged).length;
  const filteredAdminStores = adminStores.filter((store)=>(!storeUf || store.segments?.UF===storeUf) && (!storeRegion || (store.segments?.REGIONAL || store.region)===storeRegion) && (!storeState || store.active===(storeState==="active")) && `${store.code} ${store.name} ${store.region}`.toLocaleLowerCase("pt-BR").includes(storeSearch.trim().toLocaleLowerCase("pt-BR"))).sort((a,b)=>{
    const key=storeSort.key==="name" ? "name" : storeSort.key==="region" ? "region" : "code";
    return (storeSort.direction==="asc" ? 1 : -1)*a[key].localeCompare(b[key],"pt-BR",{numeric:true});
  });
  const navigation = [
    { id: "home" as const, label: "Visão geral", icon: Home },
    { id: "notices" as const, label: "Comunicados", icon: Megaphone },
    { id: "modules" as const, label: "Aplicativos", icon: Grid2X2 },
    { id: "sales" as const, label: "Vendas", icon: Building2 },
    { id: "diary" as const, label: "Diário de vendas", icon: Mic },
    { id: "mood" as const, label: "Como está seu dia?", icon: Users },
    ...(admin
      ? [{ id: "admin" as const, label: "Administração", icon: Settings2 }]
      : []),
  ];
  const planned = [
    { title: "Checklist", icon: ClipboardCheck },
    { title: "Cartazeamento", icon: FileImage },
    { title: "Escala da equipe", icon: CalendarDays },
    { title: "Fotos e evidências", icon: Upload },
  ];
  return (
    <div className="app-shell eo-portal">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("home");
          }}
        >
          <img className="eo-brand-icon" src="/eo-icon.svg" alt="EO" width="42" height="42" />
          <span className="brand-copy">
            EXCELÊNCIA
            <br />
            <b>OPERACIONAL</b>
          </span>
        </a>
        <div className="workspace">
          <Building2 size={24} />
          <div>
            <b>{workspace.settings.workspace_name}</b>
            <span>{roleLabels[workspace.person.role]}</span>
          </div>
        </div>
        <p className="nav-label">SEU ESPAÇO</p>
        <nav aria-label="Navegação principal">
          {navigation.map((n) => (
            <button
              className={`nav-item ${page === n.id ? "active" : ""}`}
              key={n.id}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() =>
                n.id === "admin" ? void openAdmin(tab) : setPage(n.id)
              }
            >
              <n.icon size={20} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            disabled={busy}
            onClick={() => void signout()}
          >
            <LogOut size={19} />
            Sair da conta
          </button>
          <span className="sidebar-version">Excelência Operacional (EO) · atualização {__APP_VERSION__}</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Meu espaço
            <ChevronRight size={15} />
            {navigation.find((n) => n.id === page)?.label}
          </div>
          <div className="top-actions">
            <span className="badge" title="Identificador do commit publicado">Versão {__APP_VERSION__}</span>
            <button
              className="notification-button icon-button"
              aria-label={`Abrir comunicados${pendingNoticeCount ? `, ${pendingNoticeCount} pendente(s)` : ""}`}
              title="Comunicados"
              onClick={() => setPage("notices")}
            >
              <Bell size={18} />
              {pendingNoticeCount > 0 && <span />}
            </button>
            <button
              className="icon-button"
              aria-label="Atualizar dados"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              <RefreshCw size={18} />
            </button>
            <AccountMenu person={workspace.person} onSignOut={() => void signout()} disabled={busy} />
          </div>
        </header>
        <main id="conteudo" className={page === "home" ? "eo-home" : undefined}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {admin
                  ? "Administração"
                  : `${workspace.stores.length} loja(s) autorizada(s)`}
              </span>
              <h1>
                {page === "home"
                  ? `Olá, ${workspace.person.name.trim().split(/\s+/)[0]}`
                  : navigation.find((n) => n.id === page)?.label}
              </h1>
              {page === "home" && <p>Veja o que precisa da sua atenção hoje.</p>}
            </div>
            {leader && page === "notices" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => setCompose(true)}
              >
                <Plus size={17} />
                Novo comunicado
              </button>
            )}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="info-strip" role="status">
              {message}
            </div>
          )}
          {(page === "home" || page === "notices") && (
            <>
              {page === "home" && (
                <>
                  <section className="eo-overview" aria-labelledby="eo-overview-title">
                    <div className="eo-attention">
                      <span className="eo-tile-icon"><Bell size={22} /></span>
                      <div>
                        <h2 id="eo-overview-title">Comunicados para confirmar</h2>
                        <p><strong>{pendingNoticeCount}</strong> {pendingNoticeCount === 1 ? "pendente" : "pendentes"}{more ? " entre os itens carregados" : ""}</p>
                      </div>
                      <button className="secondary" onClick={() => setPage("notices")}>
                        Abrir caixa de entrada <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="eo-scope">
                      <span className="eo-tile-icon"><Building2 size={22} /></span>
                      <div><strong>{workspace.stores.length}</strong><p>Lojas no seu acesso</p></div>
                    </div>
                  </section>
                  <section className="eo-shortcuts" aria-labelledby="eo-shortcuts-title">
                    <h2 id="eo-shortcuts-title">Acesso rápido</h2>
                    <div className="eo-tile-grid">
                      <button className="eo-tile" onClick={() => setPage("notices")}>
                        <span className="eo-tile-icon" data-tone="gold"><Megaphone size={21} /></span>
                        <strong>Comunicados</strong><small>Orientações e confirmações</small>
                      </button>
                      <button className="eo-tile" onClick={() => setPage("modules")}>
                        <span className="eo-tile-icon" data-tone="green"><Grid2X2 size={21} /></span>
                        <strong>Aplicativos</strong><small>Ferramentas da operação</small>
                      </button>
                      {admin && (
                        <>
                          <button className="eo-tile" onClick={() => void openAdmin("stores")}>
                            <span className="eo-tile-icon" data-tone="blue"><Building2 size={21} /></span>
                            <strong>Lojas e acessos</strong><small>Gerenciar a operação</small>
                          </button>
                          <button className="eo-tile" onClick={() => void openAdmin("reports")}>
                            <span className="eo-tile-icon" data-tone="purple"><CheckCheck size={21} /></span>
                            <strong>Relatórios</strong><small>Leitura por loja e regional</small>
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                </>
              )}
              <div className="section-heading">
                <h2>
                  {page === "home"
                    ? "Comunicados recentes"
                    : "Orientações para o time"}
                </h2>
                {page === "home" && <button className="text-button" onClick={() => setPage("notices")}>Ver todos <ChevronRight size={16} /></button>}
              </div>
              <section className="notice-grid">
                {(page === "home" ? notices.slice(0, 4) : notices).map((n) => (
                  <button
                    className="notice-card"
                    key={`${n.notice_id}-${n.version}`}
                    onClick={() => setOpened(n)}
                  >
                    <div className="notice-top">
                      <span className={`badge ${n.urgent ? "yellow" : ""}`}>
                        {n.category}
                      </span>
                      <span className="small muted">
                        {new Date(n.published_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <div className="notice-bottom">
                      <span>
                        {n.acknowledged
                          ? "Ciência confirmada"
                          : "Aguardando sua ciência"}
                      </span>
                      <ArrowRight size={17} />
                    </div>
                    {leader && (
                      <p className="small">
                        {n.receipt_count} de {n.eligible_count} confirmações
                      </p>
                    )}
                  </button>
                ))}
              </section>
              {!notices.length && (
                <section className="empty">
                  <Megaphone size={35} />
                  <h2>Nenhum comunicado por aqui</h2>
                  <p>
                    {leader
                      ? "Cadastre as lojas e os acessos antes de publicar para o time."
                      : "As orientações destinadas a você aparecerão aqui."}
                  </p>
                </section>
              )}
              {page === "notices" && more && (
                <button
                  className="primary load-more"
                  disabled={busy}
                  onClick={() => void loadMore()}
                >
                  Carregar mais
                </button>
              )}
            </>
          )}
          {page === "sales" && <SalesReports workspace={workspace} />}
          {page === "diary" && <OperationsPanel workspace={workspace} />}
          {page === "mood" && <OperationsPanel workspace={workspace} initialTab="mood" />}
          {page === "modules" && (
            <>
              <section className="eo-shortcuts" aria-labelledby="eo-available-title">
                <h2 id="eo-available-title">Disponíveis no portal</h2>
                <div className="eo-tile-grid">
                  <button className="eo-tile" onClick={() => setPage("sales")}><span className="eo-tile-icon" data-tone="blue"><Building2 size={21} /></span><strong>Vendas</strong><small>Semana, mês e ano</small></button>
                  <button className="eo-tile" onClick={() => setPage("diary")}><span className="eo-tile-icon" data-tone="green"><Mic size={21} /></span><strong>Diário de vendas</strong><small>Relatos, motivos e áudio</small></button>
                  <button className="eo-tile" onClick={() => setPage("mood")}><span className="eo-tile-icon" data-tone="purple"><Users size={21} /></span><strong>Como está seu dia?</strong><small>Sentimento e acompanhamento</small></button>
                  <button className="eo-tile" onClick={() => setPage("notices")}>
                    <span className="eo-tile-icon" data-tone="gold"><Megaphone size={21} /></span>
                    <strong>Comunicados</strong><small>Orientações e confirmações</small>
                  </button>
                  {admin && (
                    <button className="eo-tile" onClick={() => void openAdmin("stores")}>
                      <span className="eo-tile-icon" data-tone="blue"><Settings2 size={21} /></span>
                      <strong>Administração</strong><small>Lojas, pessoas e acessos</small>
                    </button>
                  )}
                </div>
              </section>
              <section className="eo-shortcuts" aria-labelledby="eo-planned-title">
                <h2 id="eo-planned-title">Próximas integrações web</h2>
                <div className="eo-tile-grid">
                  {planned.map((m) => (
                    <button className="eo-tile" key={m.title} onClick={() => setFuture(m.title)}>
                      <span className="eo-tile-icon"><m.icon size={21} /></span>
                      <strong>{m.title}</strong><small>Em planejamento</small>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {page === "admin" && admin && (
            <>
              <div className="tabs admin-tabs">
                {(["stores", "people", "import", "audit", ...(workspace.person.role === "admin" ? ["reports" as const, "archive" as const] : [])] as const).map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    disabled={busy}
                    onClick={() => void openAdmin(t)}
                  >
                    {
                      {
                        stores: "Lojas",
                        people: "Pessoas e acessos",
                        import: "Importação de bases",
                        audit: "Auditoria",
                        reports: "Relatórios",
                        archive: "Comunicados arquivados",
                      }[t]
                    }
                  </button>
                ))}
              </div>
              {tab === "stores" && (
                <div className="admin-stores-layout">
                  <div className="admin-section-heading"><div><span className="eyebrow">ESTRUTURA DA OPERAÇÃO</span><h2>Suas lojas</h2><p>Encontre unidades, refine a seleção e gerencie os cadastros.</p></div><button type="button" className="primary" onClick={() => { setNewStoreOpen(true); setNewStoreDirty(false); }}><Plus size={18} /> Nova loja</button></div>
                  <section className="panel store-directory"><h2>Lojas cadastradas</h2>
                    <div className="form-grid"><label>Buscar<input type="search" value={storeSearch} onChange={(e)=>{setStoreSearch(e.target.value);setStorePage(0);}} placeholder="Código, nome ou regional" /></label>
                    <label>UF<select value={storeUf} onChange={(e)=>{setStoreUf(e.target.value);setStoreRegion("");setStorePage(0);}}><option value="">Todas</option>{[...new Set(adminStores.map((store)=>store.segments?.UF || "").filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select></label>
                    <label>Regional<select value={storeRegion} onChange={(e)=>{setStoreRegion(e.target.value);setStorePage(0);}}><option value="">Todas</option>{[...new Set(adminStores.filter((store)=>!storeUf || store.segments?.UF===storeUf).map((store)=>store.segments?.REGIONAL || store.region).filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select></label>
                    <label>Situação<select value={storeState} onChange={(e)=>{setStoreState(e.target.value);setStorePage(0);}}><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="">Todas</option></select></label>
                    <label>Ordenar<select value={storeSort.key} onChange={(e)=>setStoreSort({...storeSort,key:e.target.value})}><option value="code">Código</option><option value="name">Nome</option><option value="region">Regional</option></select></label>
                    <label>Ordem<select value={storeSort.direction} onChange={(e)=>setStoreSort({...storeSort,direction:e.target.value as "asc"|"desc"})}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label></div>
                    <TableViewport><table><thead><tr><th>Código</th><th>Loja</th><th>UF</th><th>Regional</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{filteredAdminStores.slice(storePage*30,storePage*30+30).map((store)=><tr key={store.id}><td>{store.code}</td><td>{store.name}</td><td>{store.segments?.UF || ""}</td><td>{store.segments?.REGIONAL || store.region}</td><td>{store.active ? "Ativa" : "Arquivada"}</td><td><button className="text-button" onClick={()=>setManagedStore({...store})}>Editar</button></td></tr>)}</tbody></table></TableViewport>
                    <div className="pagination"><button className="secondary" disabled={!storePage} onClick={()=>setStorePage(storePage-1)}>Anterior</button><span>{filteredAdminStores.length} lojas · página {storePage+1}</span><button className="secondary" disabled={(storePage+1)*30>=filteredAdminStores.length} onClick={()=>setStorePage(storePage+1)}>Próxima</button></div>
                  </section>
                </div>
              )}
              {tab === "import" && (
                <section className="panel">
                  <h2>Modelo de importação administrativa</h2>
                  <p>
                    Baixe a planilha padrão para organizar lojas, gerentes,
                    regionais, equipe e vínculos. O COD identifica a loja e o
                    GGL conecta cada loja ao regional responsável.
                  </p>
                  <button className="primary template-download" type="button" onClick={() => setTemplateChoice(true)}>
                    <Download size={18} />
                    Baixar modelo Excel
                  </button>
                  <div className="panel" style={{ marginTop: 20 }}>
                    <h3>Análise da base carregada</h3>
                    <p>Consulte os registros atuais, ordene as colunas e edite os dados da loja. As alterações ficam na auditoria.</p>
                    <div className="form-grid"><label>Buscar em todas as colunas<input value={storeSearch} onChange={(event) => {setStoreSearch(event.currentTarget.value);setImportPage(0);}} placeholder="COD, loja, cidade, gerente…" /></label>
                      <label>Ordenar coluna<select value={storeSort.key} onChange={(event) => setStoreSort((current) => ({ ...current, key: event.currentTarget.value }))}>{Object.keys(storeRecords()[0] ?? {}).filter((key) => key !== "__id").map((key) => <option key={key}>{key}</option>)}</select></label>
                      <label>Ordem<select value={storeSort.direction} onChange={(event) => setStoreSort((current) => ({ ...current, direction: event.currentTarget.value as "asc" | "desc" }))}><option value="asc">A a Z · menor para maior</option><option value="desc">Z a A · maior para menor</option></select></label>
                    </div>
                    <div className="info-strip" style={{ margin: "10px 0" }}>{orderedStoreRecords().length.toLocaleString("pt-BR")} lojas visíveis · {Object.keys(storeRecords()[0] ?? {}).filter((key) => key !== "__id").length} colunas carregadas</div>
                    <TableViewport><table><thead><tr>{Object.keys(storeRecords()[0] ?? {}).filter((key) => key !== "__id").map((key) => <th key={key}><button className="text-button" type="button" onClick={() => { setImportPage(0); setStoreSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" })); }}>{key}{storeSort.key === key ? storeSort.direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}<th>Ação</th></tr></thead><tbody>{orderedStoreRecords().slice(importPage*30, importPage*30+30).map((row) => <tr key={String(row.__id)}>{Object.keys(row).filter((key) => key !== "__id").map((key) => <td key={key}>{String(row[key] ?? "")}</td>)}<td><button type="button" className="secondary" onClick={() => setEditingStore(row)}>Editar</button></td></tr>)}</tbody></table></TableViewport>
                    <div className="pagination"><button className="secondary" type="button" disabled={!importPage} onClick={()=>setImportPage(importPage-1)}>Anterior</button><span>Página {importPage+1} · até 30 lojas por página</span><button className="secondary" type="button" disabled={(importPage+1)*30>=orderedStoreRecords().length} onClick={()=>setImportPage(importPage+1)}>Próxima</button></div>
                    {!importedStores.length && <p className="field-hint">Aplique a migration 007 para habilitar a consulta e edição da base ativa.</p>}
                  </div>
                  {activeImport ? (
                    <div className="info-strip" style={{ marginTop: 18 }}>
                      <ShieldCheck size={20} />
                      Última base válida: {new Date(activeImport.created_at).toLocaleString("pt-BR")} · {activeImport.store_count} lojas · arquivo {activeImport.source_name}.
                    </div>
                  ) : (
                    <div className="info-strip" style={{ marginTop: 18 }}>
                      <ShieldCheck size={20} />
                      Ainda não há uma base importada. A primeira carga válida ativará a estrutura organizacional.
                    </div>
                  )}
                  {importReady === false && (
                    <div className="info-strip" style={{ marginTop: 12 }}>
                      <ShieldCheck size={20} />
                      A importação ainda não está ativa no banco. Aplique a migration `supabase/migrations/202611020001_org_import.sql` no SQL Editor do Supabase para habilitar o envio.
                    </div>
                  )}
                  <label className="form" style={{ marginTop: 22 }}>
                    Importar uma nova base (.xlsx)
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => void selectImportFile(event)}
                      disabled={busy || !importReady}
                    />
                  </label>
                  {importCounts && (
                    <div className="panel" aria-live="polite">
                      <h3>Revisar antes de importar</h3>
                      <p><strong>{importFileName}</strong></p>
                      <TableViewport>
                        <table>
                          <thead><tr><th>Aba</th><th>Linhas</th></tr></thead>
                          <tbody>
                            {Object.entries(importCounts).map(([name, count]) => (
                              <tr key={name}><td>{name}</td><td>{count.toLocaleString("pt-BR")}</td></tr>
                            ))}
                          </tbody>
                        </table></TableViewport>
                      <p className="muted">A importação substitui a base organizacional ativa em uma transação. Se a validação falhar, a última base válida continua ativa. Contas, senhas e acessos individuais não são criados por esta planilha.</p>
                      <button className="primary" type="button" onClick={() => void importOrgBase()} disabled={busy || !importReady}>
                        <Upload size={18} />
                        {busy ? "Importando…" : "Validar e importar base"}
                      </button>
                    </div>
                  )}
                  <div className="info-strip">
                    <ShieldCheck size={20} />
                    Somente admins autenticados podem importar. Cada carga
                    registra autor, horário, origem e totais na auditoria.
                  </div>
                </section>
              )}
              {tab === "people" && (
                <>
                  <div className="section-heading">
                    <button className="primary" onClick={() => {
                      setError("");
                      setRegistrationRole("colaborador");

                      setRegistrationDirty(false);


                      setRegistrationStores([]);
                      setRegistrationOpen(true);
                    }}><Plus size={17} /> Cadastrar usuário</button>
                  </div>
                  {registrationOpen && <Dialog title="Cadastrar usuário" close={() => {
                    if (!busy && (!registrationDirty || window.confirm("Sair sem salvar? Os dados preenchidos serão descartados."))) setRegistrationOpen(false);
                  }}>
                    <p>
                      Após cadastrar, compartilhe a chapa e a senha temporária com a pessoa.
                    </p>
                    <form className="form" onSubmit={inviteMember} onChange={() => setRegistrationDirty(true)}>
                      <label>
                        Chapa
                        <input
                          name="chapa"
                          required
                          inputMode="numeric"
                          pattern="[0-9]{1,20}"
                          maxLength={20}
                        />
                      </label>
                      <label>
                        E-mail (opcional)
                        <input
                          name="email"
                          type="email"
                          maxLength={254}
                        />
                      </label>
                      <label>
                        Nome
                        <input
                          name="name"
                          minLength={2}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label>
                        Perfil
                        <select name="role" value={registrationRole} onChange={(event) => setRegistrationRole(event.target.value)}>
                          <option value="colaborador">Colaborador</option>
                          <option value="gerente">Gerente</option>
                          <option value="diretor">Diretor</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </label>
                      {registrationRole === "admin" ? (
                        <p className="info-strip">O perfil Administrador tem acesso à gestão de todas as lojas.</p>
                      ) : (
                      <fieldset><legend>Lojas autorizadas</legend>
                        <p className="field-hint">Sem seleção individual, o cadastro inclui todas as lojas atuais.</p>
                        <StorePicker stores={workspace.stores} selected={registrationStores} onChange={(ids)=>{setRegistrationStores(ids);setRegistrationDirty(true);}} />
                      </fieldset>
                      )}
                      {error && <p className="form-error" role="alert">{error}</p>}
                      <button disabled={busy} className="primary">
                        {busy ? "Enviando…" : registrationRole !== "admin" && !registrationStores.length
                          ? "Cadastrar com acesso a todas as lojas"
                          : "Cadastrar e gerar senha"}
                      </button>
                    </form>
                  </Dialog>}
                  <section className="panel table-panel">
                    <h2>Pessoas cadastradas</h2>
                    <div className="form-grid"><label>Buscar pessoas<input type="search" value={peopleSearch} onChange={(e)=>{setPeopleSearch(e.target.value);setPeoplePage(0);}} placeholder="Nome, chapa ou e-mail" /></label>
                    <label>Perfil<select value={peopleRole} onChange={(e)=>{setPeopleRole(e.target.value);setPeoplePage(0);}}><option value="">Todos</option><option value="colaborador">Colaborador</option><option value="gerente">Gerente</option><option value="diretor">Diretor</option><option value="admin">Administrador</option></select></label>
                    <label>Situação<select value={peopleState} onChange={(e)=>{setPeopleState(e.target.value);setPeoplePage(0);}}><option value="">Todas</option><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="pending">Primeiro acesso</option></select></label>
                    <label>UF<select value={peopleUf} onChange={(e)=>{setPeopleUf(e.target.value);setPeopleRegion("");setPeoplePage(0);}}><option value="">Todas</option>{segmentValuesFor(workspace.stores,"UF").map((value)=><option key={value}>{value}</option>)}</select></label>
                    <label>Regional<select value={peopleRegion} onChange={(e)=>{setPeopleRegion(e.target.value);setPeoplePage(0);}}><option value="">Todas</option>{[...new Set(workspace.stores.filter((store)=>!peopleUf || store.segments?.UF===peopleUf).map((store)=>store.segments?.REGIONAL || store.region).filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select></label>
                    <label>Ordenar<select value={peopleSort} onChange={(e)=>{setPeopleSort(e.target.value);setPeoplePage(0);}}><option value="name">Nome</option><option value="chapa">Chapa</option><option value="role">Perfil</option></select></label></div>
                    <p className="field-hint">{peopleTotal} pessoas encontradas · até 30 por página</p>

                    <TableViewport>
                      <table>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Chapa</th>
                            <th>E-mail</th>
                            <th>Perfil</th>
                            <th>Status</th>
                            <th>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((p) => (
                            <tr key={p.id}>
                              <td>{p.display_name}</td>
                              <td>{p.login_chapa || "Não informada"}</td>
                              <td>{p.contact_email || "Não informado"}</td>
                              <td>{p.role}</td>
                              <td>
                                {!p.active
                                  ? "Inativo"
                                  : p.must_change_password
                                    ? "Aguardando primeiro acesso"
                                    : "Ativo"}
                              </td>
                              <td>
                                {p.active && p.login_chapa && (
                                  <button className="text-button" disabled={busy} onClick={() => {
                                    setError("");
                                    setTemporaryPassword("");
                                    setPasswordTarget(p);
                                  }}>Senha temporária</button>
                                )}
                                {p.id !== workspace.person.id && (
                                  <>
                                    <button
                                      className="text-button"
                                      disabled={
                                        busy
                                      }
                                      onClick={() => {
                                        setError("");



                                        setEditStores(p.stores);
                                        setEditingMember(p);
                                      }}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      className="text-button"
                                      disabled={
                                        busy
                                      }
                                      onClick={() => {
                                        if (window.confirm(`${p.active ? "Arquivar" : "Reativar"} o acesso de ${p.display_name}?`)) void toggleMember(p);
                                      }}
                                    >
                                      {p.active ? "Arquivar" : "Reativar"}
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></TableViewport>
                    <div className="pagination"><button className="secondary" disabled={!peoplePage || busy} onClick={()=>setPeoplePage(peoplePage-1)}>Anterior</button><span>Página {peoplePage+1}</span><button className="secondary" disabled={(peoplePage+1)*30>=peopleTotal || busy} onClick={()=>setPeoplePage(peoplePage+1)}>Próxima</button></div>
                  </section>
                </>
              )}
              {tab === "audit" && (
                <section className="panel">
                  <h2>Atividade do sistema</h2>
                  <p>Últimos 50 eventos registrados pelo servidor.</p>
                  <TableViewport>
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Pessoa</th>
                          <th>Ação</th>
                          <th>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {new Date(a.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td>{a.actor_name}</td>
                            <td>{a.action}</td>
                            <td>
                              {a.action === "alert.published" && a.detail ? (
                                <span>
                                  <strong>{String(a.detail.title ?? "Alerta")}</strong>
                                  {" · "}{String(a.detail.body ?? "")}
                                  {Array.isArray(a.detail.store_codes) && ` · Lojas: ${(a.detail.store_codes as string[]).join(", ")}`}
                                </span>
                              ) : a.action === "organization.imported" && a.detail ? (
                                <span>
                                  {String(a.detail.stores ?? 0)} lojas, {String(a.detail.managers ?? 0)} gerentes, {String(a.detail.regionals ?? 0)} regionais
                                </span>
                              ) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></TableViewport>
                </section>
              )}
              {tab === "archive" && workspace.person.role === "admin" && (
                <section className="panel">
                  <h2>Histórico de comunicados e alertas</h2>
                  <p>Arquivar remove a mensagem da equipe, preservando conteúdo, anexos e auditoria. Você pode restaurá-la a qualquer momento.</p>
                  {archivedMessages.length ? archivedMessages.map((item) => (
                    <article className="notice-card" key={`${item.kind}-${item.id}`}>
                      <div className="notice-card-top"><span className="badge">{item.kind === "notice" ? "Comunicado" : "Alerta"}</span><time>{new Date(item.archived_at).toLocaleString("pt-BR")}</time></div>
                      <h3>{item.title}</h3><p>{item.body}</p>
                      <p className="field-hint">Arquivado por {item.archived_by_name || "administrador"} · registro preservado</p>
                      {!!item.attachments?.length && <div className="attachment-list">{item.attachments.map((file) => <button className="secondary" key={file.id} onClick={() => void openMessageAttachment(file)}><FileImage size={16} />{file.file_name}</button>)}</div>}
                      <button className="secondary" disabled={busy} onClick={() => void archiveMessage(item.kind, item.id, false)}>Restaurar para a equipe</button>
                    </article>
                  )) : <p>Nenhuma mensagem arquivada.</p>}
                </section>
              )}
              {tab === "reports" && workspace.person.role === "admin" && (
                <section className="panel">
                  <h2>Leitura dos comunicados</h2>
                  <p>Veja rapidamente a abrangência e a confirmação por loja, regional ou outro agrupamento da base.</p>
                  <div className="form-grid">
                    <label>Comunicado
                      <select value={reportNotice} onChange={(event) => {
                        const selected = reportMessages.find((item) => item.notice_id === event.currentTarget.value);
                        setReportNotice(event.currentTarget.value);
                        if (selected) { setReportVersion(selected.version); void loadNoticeReport(selected.notice_id, selected.version, reportGroup); }
                      }}>
                        {reportMessages.map((item) => <option key={item.notice_id} value={item.notice_id}>{item.title} · {new Date(item.published_at).toLocaleDateString("pt-BR")}{item.archived_at ? " · arquivado" : ""}</option>)}
                      </select>
                    </label>
                    <label>Agrupar por
                      <select value={reportGroup} onChange={(event) => { const value = event.currentTarget.value; setReportGroup(value); void loadNoticeReport(reportNotice, reportVersion, value); }}>
                        <option value="regional">Regional</option><option value="loja">Loja</option><option value="ggl">GGL</option><option value="uf">UF</option><option value="cidade">Cidade</option><option value="tipo">Tipo de loja</option><option value="clima">Clima</option><option value="perfil_preco">Perfil de preço</option><option value="grupo_loja">Grupo de loja</option><option value="safra">Safra</option>
                      </select>
                    </label>
                    <label>Filtrar primeiro por
                      <select value={reportSegmentBy} onChange={(event) => {
                        const key = event.currentTarget.value; setReportSegmentBy(key); setReportSegmentValues([]);
                        void loadNoticeReport(reportNotice, reportVersion, reportGroup, key, []);
                      }}><option value="">Todas as lojas do comunicado</option>{segmentOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                    </label>
                    {reportSegmentBy && <label>Depois selecione valores
                      <select multiple value={reportSegmentValues} onChange={(event) => {
                        const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value); setReportSegmentValues(values);
                        void loadNoticeReport(reportNotice, reportVersion, reportGroup, reportSegmentBy, values);
                      }}>{segmentValuesFor(workspace.stores, reportSegmentBy).map((value) => <option key={value} value={value}>{value}</option>)}</select>
                      <span className="field-hint">Use Ctrl ou Command para selecionar mais de um valor. {filterStores(workspace.stores, reportSegmentBy, reportSegmentValues).length} lojas elegíveis na base.</span>
                    </label>}
                  </div>
                  {reportData ? <>
                    <div className="stats report-stats">
                      <div className="stat"><div className="stat-top">Lojas destinatárias</div><strong>{reportData.total_stores}</strong></div>
                      <div className="stat"><div className="stat-top">Lojas com ciência</div><strong>{reportData.stores_with_read}</strong><span className="stat-foot">Pelo menos uma pessoa confirmou</span></div>
                      <div className="stat"><div className="stat-top">Lojas pendentes</div><strong>{reportData.stores_pending}</strong></div>
                    </div>
                    <p className="field-hint">{reportData.read_rule} “Leitura completa” indica que todas as pessoas destinatárias daquela loja confirmaram.</p>
                    <TableViewport><table><thead><tr><th>Agrupamento</th><th>Total de lojas</th><th>Com ciência</th><th>Leitura completa</th><th>Pendentes</th></tr></thead>
                      <tbody>{reportData.groups.map((group) => <tr key={group.group}><td>{group.group}</td><td>{group.total_stores}</td><td>{group.stores_with_read}</td><td>{group.stores_fully_read}</td><td>{group.stores_pending}</td></tr>)}</tbody>
                    </table></TableViewport>
                  </> : <p>{reportMessages.length ? "Carregando relatório…" : "Ainda não há comunicados publicados para exibir."}</p>}
                </section>
              )}
            </>
          )}
          <footer>
            <span>Feito para quem faz a operação acontecer.</span>
            <span>EO · Operação conectada</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação no celular">
        {navigation.filter((item) => ["home", "notices", "sales"].includes(item.id)).map((n) => <button key={n.id} aria-current={page === n.id ? "page" : undefined} className={page === n.id ? "active" : ""} onClick={() => { setPage(n.id); setMoreOpen(false); }}><n.icon size={21} /><span>{n.id === "home" ? "Início" : n.label}</span></button>)}
        <button className={moreOpen || ["modules", "diary", "mood", "admin"].includes(page) ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}><Grid2X2 size={21} /><span>Mais</span></button>
      </nav>
      {moreOpen && <Dialog title="Seu espaço" close={() => setMoreOpen(false)}><nav className="eo-more-menu" aria-label="Todos os módulos">{navigation.map((n) => <button type="button" key={n.id} aria-current={page === n.id ? "page" : undefined} onClick={() => { setMoreOpen(false); n.id === "admin" ? void openAdmin(tab) : setPage(n.id); }}><n.icon size={22} /><span>{n.label}</span><ChevronRight size={18} /></button>)}</nav></Dialog>}
      {newStoreOpen && <Dialog title="Nova loja" close={() => { if (!busy && (!newStoreDirty || window.confirm("Descartar as alterações desta loja?"))) { setNewStoreOpen(false); setNewStoreDirty(false); } }}><p className="field-hint">Cadastre uma unidade para associar pessoas, comunicados e resultados.</p><form className="form" onSubmit={addStore} onChange={() => setNewStoreDirty(true)}>
                      <label>
                        Código
                        <input name="code" required maxLength={20} />
                      </label>
                      <label>
                        Nome
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </label>
                      <label>
                        Regional
                        <input name="region" maxLength={120} />
                      </label>
                      <button className="primary" disabled={busy}>
                        Cadastrar loja
                      </button>
                    </form></Dialog>}
      {opened && (
        <Dialog title="Comunicado" close={() => setOpened(null)}>
          <span className="badge">Versão {opened.version}</span>
          <h2 className="notice-title">{opened.title}</h2>
          <p className="notice-body">{opened.body}</p>
          {!!opened.attachments?.length && <div className="attachment-list">{opened.attachments.map((file) => <button className="secondary" key={file.id} disabled={busy} onClick={() => void openMessageAttachment(file)}><FileImage size={16} />{file.file_name}</button>)}</div>}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy || opened.acknowledged}
            onClick={() => void acknowledge(opened)}
          >
            <CheckCheck size={18} />
            {opened.acknowledged ? "Ciência confirmada" : "Li e estou ciente"}
          </button>
          {workspace?.person.role === "admin" && <button className="secondary wide" disabled={busy} onClick={() => { if (window.confirm("Arquivar este comunicado? Ele sairá da equipe e ficará disponível no histórico administrativo.")) void archiveMessage("notice", opened.notice_id, true); }}>Arquivar comunicado</button>}
        </Dialog>
      )}
      {compose && (
        <Dialog
          title="Novo comunicado ou alerta"
          close={() => {
            if (!busy) setCompose(false);
          }}
        >
          <form className="form" onSubmit={publish}>
            <label>
              Tipo de mensagem
              <select name="message_kind" defaultValue={workspace.person.role === "gerente" ? "alert" : "notice"}>
                {workspace.person.role !== "gerente" && <option value="notice">Comunicado com confirmação de ciência</option>}
                <option value="alert">Alerta com notificação push</option>
              </select>
            </label>
            <label>
              Título
              <input name="title" required minLength={3} maxLength={120} />
            </label>
            <label>
              Mensagem
              <textarea name="body" rows={6} required maxLength={3000} />
            </label>
            <label className="checkbox-label">
              <input name="send_push" type="checkbox" />
              Enviar também como notificação push {" "}<span className="field-hint">Alertas sempre enviam push. Para comunicado, esta opção é adicional.</span>
            </label>
            <label>
              Anexos (PDF, JPG, PNG ou WebP, até 10 MB cada)
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => setMessageFiles(Array.from(event.currentTarget.files ?? []))} />
            </label>
            {messageFiles.length > 0 && <div className="attachment-list" aria-live="polite">{messageFiles.map((file, index) => <span className="badge" key={`${file.name}-${index}`}>{file.name}</span>)}<button type="button" className="text-button" onClick={() => setMessageFiles([])}>Limpar anexos</button></div>}
            <fieldset>
              <legend>Quem receberá</legend>
              <label>
                Segmentação
                <select name="target_mode" defaultValue="all">
                  <option value="all">Todas as lojas da minha abrangência</option>
                  <option value="region">Uma regional</option>
                  <option value="stores">Selecionar lojas</option>
                </select>
              </label>
              <label>
                Filtrar primeiro por atributo
                <select value={composeSegmentBy} onChange={(event) => { setComposeSegmentBy(event.currentTarget.value); setComposeSegmentValues([]); }}>
                  <option value="">Todas as lojas da abrangência</option>
                  {segmentOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              {composeSegmentBy && <label>
                Depois selecione os valores
                <select multiple value={composeSegmentValues} onChange={(event) => setComposeSegmentValues(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>
                  {segmentValuesFor(workspace.stores, composeSegmentBy).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <span className="field-hint">A lista será reduzida a {filterStores(workspace.stores, composeSegmentBy, composeSegmentValues).length} lojas e {filterStores(workspace.stores, composeSegmentBy, composeSegmentValues).reduce((total, store) => total + (store.team_count ?? 0), 0)} pessoas elegíveis.</span>
              </label>}
              <label>
                Regional (usada quando a segmentação for por regional)
                <select name="target_region" defaultValue="">
                  <option value="">Selecione uma regional</option>
                  {availableRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </label>
              <StorePicker stores={filterStores(workspace.stores, composeSegmentBy, composeSegmentValues)} selected={composeStores} onChange={setComposeStores} />
              <p className="field-hint">A seleção respeita sua abrangência de acesso. Marque lojas apenas ao escolher “Selecionar lojas”.</p>
            </fieldset>
            <label className="checkbox-label">
              <input name="urgent" type="checkbox" />
              Destacar como importante
            </label>
            <label>
              Programar envio (opcional)
              <input name="schedule_at" type="datetime-local" />
              <span className="field-hint">Deixe em branco para enviar agora. O horário segue o fuso deste dispositivo.</span>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Publicar ou programar
            </button>
          </form>
        </Dialog>
      )}
      {passwordTarget && (
        <Dialog title="Senha temporária" close={() => {
          if (busy) return;
          setTemporaryPassword("");
          setPasswordTarget(null);
          setError("");
        }}>
          <div className="form">
            <p><strong>{passwordTarget.display_name}</strong> · Chapa {passwordTarget.login_chapa}</p>
            {temporaryPassword ? <>
              <p>Copie agora. A senha só aparece nesta tela e deverá ser trocada no próximo acesso.</p>
              <label>Senha temporária<input readOnly value={temporaryPassword} autoComplete="off" /></label>
              <a className="primary" href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao EO\nChapa: ${passwordTarget.login_chapa}\nSenha temporária: ${temporaryPassword}\nTroque a senha no primeiro acesso: https://app-eo.vercel.app/`)}`} target="_blank" rel="noopener noreferrer">Compartilhar no WhatsApp</a>
              <button className="secondary" onClick={() => void navigator.clipboard.writeText(`Seu acesso ao EO\nChapa: ${passwordTarget.login_chapa}\nSenha temporária: ${temporaryPassword}\nhttps://app-eo.vercel.app/`).catch(() => setError("Selecione e copie a senha manualmente."))}>Copiar dados de acesso</button>
              {passwordTarget.id === workspace.person.id && <button className="primary" onClick={() => void signout()}>Guardei a senha, sair agora</button>}
            </> : <>
              <p>A senha atual será substituída. No próximo acesso, a pessoa terá de definir uma nova senha.</p>
              <button className="primary" disabled={busy} onClick={() => void issueTemporaryPassword(passwordTarget)}>{busy ? "Gerando…" : "Gerar senha temporária"}</button>
            </>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </Dialog>
      )}
      {editingMember && (
        <Dialog title="Editar acesso" close={() => setEditingMember(null)}>
          <form className="form" onSubmit={saveMember}>
            <label>
              Nome
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editingMember.display_name}
              />
            </label>
            <label>
              Chapa
              <input
                name="chapa"
                required
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                defaultValue={editingMember.login_chapa ?? ""}
                readOnly
              />
            </label>
            <p className="field-hint">A chapa identifica o login e não pode ser alterada.</p>
            <label>
              Perfil
              <select name="role" defaultValue={editingMember.role}>
                <option value="colaborador">Colaborador</option>
                <option value="gerente">Gerente</option>
                <option value="diretor">Diretor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <fieldset><legend>Lojas autorizadas</legend><p className="field-hint">A seleção substitui os vínculos desta pessoa, inclusive os importados. Sem lojas, o perfil comum fica sem abrangência operacional. Administradores têm todas as lojas.</p><StorePicker stores={workspace.stores} selected={editStores} onChange={setEditStores} /></fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Salvar alterações
            </button>
          </form>
          <div className="form">
            <button className="secondary" disabled={busy} onClick={() => {
              if (window.confirm(`${editingMember.active ? "Arquivar" : "Reativar"} o acesso de ${editingMember.display_name}?`)) void toggleMember(editingMember);
            }}>{editingMember.active ? "Arquivar usuário" : "Reativar usuário"}</button>
            {editingMember.active && editingMember.login_chapa && <button className="secondary" disabled={busy} onClick={() => {
              setError("");
              setTemporaryPassword("");
              setPasswordTarget(editingMember);
            }}>Gerar senha temporária</button>}
          </div>
        </Dialog>
      )}
      {templateChoice && <Dialog title="Como deseja baixar o modelo?" close={() => setTemplateChoice(false)}>
        <p>Escolha se a planilha deve vir limpa para uma nova carga ou preenchida com a base atualmente ativa.</p>
        <div className="form-grid">
          <a className="primary template-download" href="/modelo-importacao-administrativa-eo.xlsx" download="Modelo-importacao-administrativa-EO.xlsx" onClick={() => setTemplateChoice(false)}>Baixar modelo em branco</a>
          <button className="secondary" type="button" disabled={busy} onClick={() => { setTemplateChoice(false); downloadCurrentModel(); }}>Baixar com dados atuais</button>
        </div>
      </Dialog>}
      {managedStore && <Dialog title={`Gerenciar loja ${managedStore.code}`} close={()=>setManagedStore(null)}><form className="form" onSubmit={(e)=>{e.preventDefault();void saveManagedStore(managedStore);}}>
        <label>Código<input value={managedStore.code} required maxLength={20} onChange={(e)=>setManagedStore({...managedStore,code:e.target.value})} /></label>
        <label>Nome<input value={managedStore.name} required minLength={2} maxLength={120} onChange={(e)=>setManagedStore({...managedStore,name:e.target.value})} /></label>
        <label>Regional<input value={managedStore.region} maxLength={120} onChange={(e)=>setManagedStore({...managedStore,region:e.target.value})} /></label>
        <p className="field-hint">Arquivar preserva o histórico e os vínculos, e remove a loja da operação ativa. Reativar restaura sua disponibilidade.</p>
        <button className="primary" disabled={busy}>Salvar alterações</button>
        <button className="secondary" type="button" disabled={busy} onClick={()=>{if(window.confirm(`${managedStore.active ? "Arquivar" : "Reativar"} esta loja? O histórico será preservado.`))void saveManagedStore({...managedStore,active:!managedStore.active});}}>{managedStore.active ? "Arquivar loja" : "Reativar loja"}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form></Dialog>}
      {editingStore && <Dialog title={`Editar loja ${String(editingStore.COD ?? "")}`} close={() => setEditingStore(null)}>
        <form className="form" onSubmit={(event) => void saveStoreEdits(event)}>
          {Object.entries(editingStore).filter(([key]) => key !== "__id").map(([key, value]) => <label key={key}>{key}<input name={key} defaultValue={String(value ?? "")} maxLength={500} /></label>)}
          <p className="field-hint">COD, LOJA e gerente são validados. A atualização preserva o vínculo da loja e registra quem alterou os dados.</p>
          <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>
        </form>
      </Dialog>}
      {future && (
        <Dialog title={future} close={() => setFuture("")}>
          <p>
            Este módulo será conectado em uma próxima etapa. A base de
            identidade, lojas e permissões será compartilhada com o portal.
          </p>
          <button className="primary wide" onClick={() => setFuture("")}>
            Entendi
          </button>
        </Dialog>
      )}
    </div>
  );
}
