import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
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
} from "lucide-react";
import {
  backendConfigured,
  supabase,
  rpc,
  type Workspace,
  type LiveNotice,
  type LivePerson,
  type AuditRow,
} from "./services/supabase";
import { roleLabels } from "./core/domain";

type Page = "home" | "notices" | "modules" | "admin";
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
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Fechar" className="icon-button" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function ConnectedApp() {
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
  const [editingMember, setEditingMember] = useState<LivePerson | null>(null);
  const [tab, setTab] = useState<"stores" | "people" | "audit">("stores"),
    [future, setFuture] = useState("");
  const epoch = useRef(0),
    requestId = useRef(crypto.randomUUID());
  const clear = useCallback(() => {
    epoch.current++;
    setWorkspace(null);
    setNotices([]);
    setMembers([]);
    setAudit([]);
    setOpened(null);
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
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await act(async () => {
      const stores = data.getAll("stores").map(String);
      if (!stores.length) throw new Error("Selecione ao menos uma loja.");
      await rpc("eo_publish_notice", {
        p_title: String(data.get("title")).trim(),
        p_body: String(data.get("body")).trim(),
        p_stores: stores,
        p_urgent: data.get("urgent") === "on",
        p_request_id: requestId.current,
      });
      requestId.current = crypto.randomUUID();
      setCompose(false);
      await refresh();
      setMessage("Comunicado publicado.");
    });
  }
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
      if (which === "people")
        setMembers(await rpc<LivePerson[]>("eo_admin_people"));
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
      setMessage("Loja cadastrada.");
    });
  }
  async function inviteMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await act(async () => {
      const { error: inviteError } = await supabase!.functions.invoke(
        "admin-identity",
        {
          body: {
            action: "invite-person",
            email: String(data.get("email")).trim(),
            chapa: String(data.get("chapa")).trim(),
            name: String(data.get("name")).trim(),
            role: String(data.get("role")),
            stores: data.getAll("stores").map(String),
          },
        },
      );
      if (inviteError)
        throw new Error(
          "Convite não enviado. Confira o SMTP, a chapa e as lojas selecionadas.",
        );
      form.reset();
      setMembers(await rpc<LivePerson[]>("eo_admin_people"));
      setMessage(
        "Convite enviado. A pessoa criará sua senha no primeiro acesso.",
      );
    });
  }
  async function toggleMember(p: LivePerson) {
    await act(async () => {
      await rpc("eo_admin_update_person", {
        p_user: p.id,
        p_name: p.display_name,
        p_role: p.role,
        p_chapa: p.login_chapa,
        p_stores: p.stores,
        p_active: !p.active,
      });
      setMembers(await rpc<LivePerson[]>("eo_admin_people"));
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
        p_stores: data.getAll("stores").map(String),
        p_active: editingMember.active,
      });
      setMembers(await rpc<LivePerson[]>("eo_admin_people"));
      setEditingMember(null);
      setMessage("Perfil e abrangência atualizados.");
    });
  }
  async function issueTemporaryPassword() {
    await act(async () => {
      const { data, error: issueError } = await supabase!.functions.invoke(
        "admin-identity",
        {
          body: {
            action: "issue-master-temporary-password",
            user_id: workspace!.person.id,
          },
        },
      );
      if (issueError || typeof data?.password !== "string")
        throw new Error("Não foi possível gerar uma senha temporária.");
      setTemporaryPassword(data.password);
      setMessage(
        "Senha temporária criada. Copie e guarde em local seguro agora.",
      );
    });
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
      <div className="auth-shell">
        <section className="auth-intro">
          <span className="brand-mark">
            eo<span>•</span>
          </span>
          <span className="hero-kicker">OPERAÇÃO CONECTADA</span>
          <h1>
            Grandes resultados.
            <br />
            Uma equipe conectada.
          </h1>
          <p>
            Informação, pessoas e rotinas no mesmo espaço.
            <br />
            Entre com sua conta individual para continuar.
          </p>
          <div className="auth-seal">
            <ShieldCheck size={19} />
            Acesso exclusivo para pessoas autorizadas
          </div>
        </section>
        <section className="auth-card">
          <span className="eyebrow">BEM-VINDO AO SEU ESPAÇO</span>
          <h2>Vamos fazer acontecer?</h2>
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
  const navigation = [
    { id: "home" as const, label: "Visão geral", icon: Home },
    { id: "notices" as const, label: "Comunicados", icon: Megaphone },
    { id: "modules" as const, label: "Aplicativos", icon: Grid2X2 },
    ...(admin
      ? [{ id: "admin" as const, label: "Administração", icon: Settings2 }]
      : []),
  ];
  const planned = [
    { title: "Checklist", icon: ClipboardCheck },
    { title: "Cartazeamento", icon: FileImage },
    { title: "Escala da equipe", icon: CalendarDays },
    { title: "Fotos e evidências", icon: Upload },
    { title: "Diário de vendas", icon: Mic },
  ];
  return (
    <div className="app-shell">
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
          <span className="brand-mark">
            eo<span>•</span>
          </span>
          <span className="brand-copy">
            OPERAÇÃO
            <br />
            <b>CONECTADA</b>
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
        <nav>
          {navigation.map((n) => (
            <button
              className={`nav-item ${page === n.id ? "active" : ""}`}
              key={n.id}
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
          <span className="sidebar-version">App EO · MVP 0.2</span>
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
            <button
              className="icon-button"
              aria-label="Atualizar dados"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              <RefreshCw size={18} />
            </button>
            <span className="avatar">
              {workspace.person.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="top-person">
              <b>{workspace.person.name}</b>
              <span>{roleLabels[workspace.person.role]}</span>
            </div>
          </div>
        </header>
        <main id="conteudo">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {admin
                  ? "Administração"
                  : `${workspace.stores.length} loja(s) autorizada(s)`}
              </span>
              <h1>
                {page === "home"
                  ? `Olá, ${workspace.person.name.split(" ")[0]}. Vamos fazer acontecer?`
                  : navigation.find((n) => n.id === page)?.label}
              </h1>
              <p>O que importa para o seu dia, em um só lugar.</p>
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
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="hero-kicker">
                        NOSSA OPERAÇÃO, MAIS PERTO
                      </span>
                      <h2>
                        Grandes resultados.
                        <br />
                        <span>Uma equipe conectada.</span>
                      </h2>
                      <p>
                        Acompanhe orientações e confirme sua ciência.
                        <br />
                        Cada pessoa, cada loja, o mesmo propósito.
                      </p>
                      <button
                        className="dark-button"
                        onClick={() => setPage("notices")}
                      >
                        Ver comunicados
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </section>
                  <div className="stats">
                    <button className="stat" onClick={() => setPage("notices")}>
                      <div className="stat-top">
                        Na página carregada
                        <Megaphone size={20} />
                      </div>
                      <strong>
                        {notices.filter((n) => !n.acknowledged).length}
                      </strong>
                      <span className="stat-foot">
                        Comunicados para confirmar
                      </span>
                    </button>
                    <div className="stat">
                      <div className="stat-top">
                        Sua abrangência
                        <Building2 size={20} />
                      </div>
                      <strong>{workspace.stores.length}</strong>
                      <span className="stat-foot">Lojas autorizadas</span>
                    </div>
                    <div className="stat">
                      <div className="stat-top">
                        Seu acesso
                        <ShieldCheck size={20} />
                      </div>
                      <strong className="role-stat">
                        {roleLabels[workspace.person.role]}
                      </strong>
                      <span className="stat-foot">
                        Permissões conferidas no servidor
                      </span>
                    </div>
                  </div>
                </>
              )}
              <div className="section-heading">
                <h2>
                  {page === "home"
                    ? "Fique por dentro"
                    : "Orientações para o time"}
                </h2>
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
          {page === "modules" && (
            <div className="module-grid all-modules">
              <button
                className="module-card"
                onClick={() => setPage("notices")}
              >
                <span className="module-icon yellow-icon">
                  <Megaphone size={25} />
                </span>
                <h3>Comunicados</h3>
                <p>Orientações e ciência individual.</p>
                <span className="module-status">
                  Integrado ao Supabase
                  <ArrowRight size={17} />
                </span>
              </button>
              {planned.map((m) => (
                <button
                  key={m.title}
                  className="module-card"
                  onClick={() => setFuture(m.title)}
                >
                  <span className="module-icon">
                    <m.icon size={25} />
                  </span>
                  <h3>{m.title}</h3>
                  <p>Mais possibilidades para a operação.</p>
                  <span className="module-status">
                    Próxima integração
                    <ArrowRight size={17} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {page === "admin" && admin && (
            <>
              <div className="tabs admin-tabs">
                {(["stores", "people", "audit"] as const).map((t) => (
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
                        audit: "Auditoria",
                      }[t]
                    }
                  </button>
                ))}
              </div>
              {tab === "stores" && (
                <div className="admin-grid">
                  <section className="panel">
                    <h2>Nova loja</h2>
                    <form className="form" onSubmit={addStore}>
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
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Lojas cadastradas</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th>Loja</th>
                            <th>Regional</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workspace.stores.map((s) => (
                            <tr key={s.id}>
                              <td>{s.code}</td>
                              <td>{s.name}</td>
                              <td>{s.region}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
              {tab === "people" && (
                <>
                  <section className="panel">
                    <h2>Convidar pessoa</h2>
                    <p>
                      A conta é individual e recebe o perfil e as lojas
                      selecionadas. A pessoa define sua senha pelo convite.
                    </p>
                    <form className="form" onSubmit={inviteMember}>
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
                        E-mail corporativo
                        <input
                          name="email"
                          type="email"
                          required
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
                        <select name="role">
                          <option value="colaborador">Colaborador</option>
                          <option value="gerente">Gerente</option>
                          {workspace.person.master_admin && (
                            <option value="diretor">Diretor</option>
                          )}
                          {workspace.person.master_admin && (
                            <option value="admin">Administrador</option>
                          )}
                        </select>
                      </label>
                      <fieldset>
                        <legend>Lojas autorizadas</legend>
                        {workspace.stores.map((s) => (
                          <label className="checkbox-label" key={s.id}>
                            <input type="checkbox" name="stores" value={s.id} />
                            {s.code} · {s.name}
                          </label>
                        ))}
                      </fieldset>
                      <button disabled={busy} className="primary">
                        Enviar convite
                      </button>
                    </form>
                  </section>
                  <section className="panel table-panel">
                    <h2>Pessoas cadastradas</h2>
                    <div className="table-wrap">
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
                                {p.id !== workspace.person.id && (
                                  <>
                                    <button
                                      className="text-button"
                                      disabled={
                                        busy ||
                                        (!workspace.person.master_admin &&
                                          ["admin", "diretor"].includes(p.role))
                                      }
                                      onClick={() => setEditingMember(p)}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      className="text-button"
                                      disabled={
                                        busy ||
                                        (!workspace.person.master_admin &&
                                          ["admin", "diretor"].includes(p.role))
                                      }
                                      onClick={() => void toggleMember(p)}
                                    >
                                      {p.active ? "Desativar" : "Reativar"}
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {tab === "people" && workspace.person.master_admin && (
                <section className="panel">
                  <h2>Acesso do administrador master</h2>
                  <p>
                    Chapa 123456. Gere uma senha temporária para exigir a troca
                    no próximo acesso.
                  </p>
                  {!temporaryPassword ? (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void issueTemporaryPassword()}
                    >
                      Gerar senha temporária
                    </button>
                  ) : (
                    <>
                      <label>
                        Senha temporária
                        <input readOnly value={temporaryPassword} />
                      </label>
                      <button
                        className="secondary"
                        onClick={() =>
                          void navigator.clipboard.writeText(temporaryPassword)
                        }
                      >
                        Copiar senha
                      </button>
                      <button
                        className="text-button"
                        onClick={() => void signout()}
                      >
                        Guardei a senha, sair agora
                      </button>
                      <p role="status">
                        Ela aparece apenas nesta tela. Depois de entrar com ela,
                        o sistema exigirá uma nova senha.
                      </p>
                    </>
                  )}
                </section>
              )}
              {tab === "audit" && (
                <section className="panel">
                  <h2>Atividade do sistema</h2>
                  <p>Últimos 50 eventos registrados pelo servidor.</p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Pessoa</th>
                          <th>Ação</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
      <nav className="mobile-nav">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() =>
              n.id === "admin" ? void openAdmin(tab) : setPage(n.id)
            }
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button disabled={busy} onClick={() => void signout()}>
          <LogOut size={20} />
          <span>Sair</span>
        </button>
      </nav>
      {opened && (
        <Dialog title="Comunicado" close={() => setOpened(null)}>
          <span className="badge">Versão {opened.version}</span>
          <h2 className="notice-title">{opened.title}</h2>
          <p className="notice-body">{opened.body}</p>
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
        </Dialog>
      )}
      {compose && (
        <Dialog
          title="Novo comunicado"
          close={() => {
            if (!busy) setCompose(false);
          }}
        >
          <form className="form" onSubmit={publish}>
            <label>
              Título
              <input name="title" required minLength={3} maxLength={120} />
            </label>
            <label>
              Mensagem
              <textarea name="body" rows={6} required maxLength={5000} />
            </label>
            <fieldset>
              <legend>Lojas destinatárias</legend>
              {workspace.stores.map((s) => (
                <label className="checkbox-label" key={s.id}>
                  <input type="checkbox" name="stores" value={s.id} />
                  {s.code} · {s.name}
                </label>
              ))}
            </fieldset>
            <label className="checkbox-label">
              <input name="urgent" type="checkbox" />
              Destacar comunicado
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Publicar para o time
            </button>
          </form>
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
              />
            </label>
            <label>
              Perfil
              <select name="role" defaultValue={editingMember.role}>
                <option value="colaborador">Colaborador</option>
                <option value="gerente">Gerente</option>
                {workspace.person.master_admin && (
                  <option value="diretor">Diretor</option>
                )}
                {workspace.person.master_admin && (
                  <option value="admin">Administrador</option>
                )}
              </select>
            </label>
            <fieldset>
              <legend>Lojas autorizadas</legend>
              {workspace.stores.map((s) => (
                <label className="checkbox-label" key={s.id}>
                  <input
                    type="checkbox"
                    name="stores"
                    value={s.id}
                    defaultChecked={editingMember.stores.includes(s.id)}
                  />
                  {s.code} · {s.name}
                </label>
              ))}
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Salvar alterações
            </button>
          </form>
        </Dialog>
      )}
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
