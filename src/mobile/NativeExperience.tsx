import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileImage,
  Grid2X2,
  Home,
  LogOut,
  Megaphone,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type {
  AuditRow,
  LiveNotice,
  LivePerson,
  Store as StoreRecord,
  Workspace,
} from "../services/supabase";
import { roleLabels } from "../core/domain";
import "./native.css";

type AdminTab = "stores" | "people" | "audit";
type MobileRoute =
  | "home"
  | "notices"
  | "modules"
  | "admin"
  | "profile"
  | "privacy"
  | "notice-detail"
  | "compose"
  | "admin-stores"
  | "admin-people"
  | "admin-audit"
  | "edit-member";

function useMobileRoute(initial: MobileRoute) {
  const [route, setRoute] = useState<MobileRoute>(initial);

  useEffect(() => {
    window.history.replaceState(
      { eoMobileRoute: initial },
      "",
      `${location.pathname}${location.search}`,
    );
    const onPopState = (event: PopStateEvent) => {
      const next = event.state?.eoMobileRoute;
      setRoute(typeof next === "string" ? (next as MobileRoute) : initial);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initial]);

  const push = useCallback((next: MobileRoute) => {
    window.history.pushState(
      { eoMobileRoute: next },
      "",
      `${location.pathname}${location.search}#eo/${next}`,
    );
    setRoute(next);
  }, []);

  const back = useCallback(() => window.history.back(), []);

  return { route, push, back };
}

function BrandMark() {
  return (
    <span className="native-brand-mark" aria-label="EO">
      eo<span>•</span>
    </span>
  );
}

function NativeBack({ onClick, label = "Voltar" }: { onClick: () => void; label?: string }) {
  return (
    <button className="native-back" type="button" onClick={onClick} aria-label={label}>
      <ArrowLeft size={21} />
      <span>{label}</span>
    </button>
  );
}

function NativeMessage({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return (
    <div className={`native-message ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>
      {error || message}
    </div>
  );
}

function NativePrivacy({ back }: { back: () => void }) {
  return (
    <div className="native-page native-document">
      <header className="native-subheader">
        <NativeBack onClick={back} />
        <BrandMark />
        <span className="native-header-spacer" />
      </header>
      <section className="native-scroll">
        <span className="native-eyebrow">EXCELÊNCIA OPERACIONAL</span>
        <h1>Política de Privacidade</h1>
        <p className="native-updated">Última atualização: 30 de outubro de 2026</p>
        <p>Esta política explica como o aplicativo Excelência Operacional (EO), desenvolvido por Matheus Barbosa de Oliveira como projeto independente, trata dados pessoais. O app oferece comunicados e recursos de administração para pessoas autorizadas de equipes de loja. Não há cadastro público: o acesso é liberado individualmente por um administrador.</p>
        <h2>Dados tratados</h2>
        <p>Para autenticar e operar uma conta, o app pode tratar número de chapa usado no login, nome e e-mail de contato, identificador da conta, perfil de acesso e lojas associadas. Também registra comunicados disponibilizados à conta, confirmações de leitura e eventos de administração e segurança. A senha é gerenciada pelo serviço de autenticação do Supabase e não é armazenada pelo app em texto aberto.</p>
        <p>A versão atual não solicita localização, fotos, vídeos nem gravações de áudio. Não inclui publicidade, rastreamento para anúncios ou recursos de IA.</p>
        <h2>Finalidades</h2>
        <p>Os dados são usados para autenticar a pessoa, aplicar permissões por perfil e loja, apresentar comunicados, registrar sua confirmação de leitura, administrar acessos autorizados, proteger o serviço e responder a solicitações de suporte.</p>
        <h2>Serviços utilizados e compartilhamento</h2>
        <p>O serviço utiliza Supabase para autenticação e armazenamento dos dados operacionais e Vercel para hospedagem do portal e das páginas públicas. Esses provedores processam dados necessários para fornecer os serviços contratados. Os dados não são vendidos nem compartilhados para publicidade. O acesso operacional é limitado a contas autorizadas conforme suas permissões.</p>
        <h2>Armazenamento e segurança</h2>
        <p>Os dados são mantidos enquanto a conta e os registros forem necessários para as finalidades descritas, obrigações legais e segurança do serviço. São usadas conexões protegidas e controles de acesso por perfil e loja. Nenhuma medida técnica elimina todos os riscos inerentes à transmissão e ao armazenamento de informações.</p>
        <h2>Direitos e solicitações</h2>
        <p>Você pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento e, quando aplicável, anonimização ou exclusão dos seus dados. Para exercer seus direitos ou pedir ajuda, escreva para <a href="mailto:mbdo.matheus@gmail.com">mbdo.matheus@gmail.com</a>. Para proteger a conta, poderemos confirmar sua identidade antes de atender ao pedido. A desativação de uma conta não implica necessariamente a eliminação imediata de registros que devam ser mantidos por segurança ou obrigação legal.</p>
        <h2>Alterações nesta política</h2>
        <p>Esta política poderá ser atualizada quando o app mudar. A data no início da página indica a revisão mais recente. Mudanças relevantes serão informadas pelos canais disponíveis no app.</p>
        <a className="native-inline-link" href="/suporte.html">Acessar suporte</a>
      </section>
    </div>
  );
}

type NativeExperienceProps = {
  initializing: boolean;
  backendConfigured: boolean;
  session: Session | null;
  workspace: Workspace | null;
  passwordMode: boolean;
  notices: LiveNotice[];
  more: boolean;
  busy: boolean;
  loading: boolean;
  error: string;
  message: string;
  setMessage: (value: string) => void;
  opened: LiveNotice | null;
  setOpened: (value: LiveNotice | null) => void;
  compose: boolean;
  setCompose: (value: boolean) => void;
  audit: AuditRow[];
  members: LivePerson[];
  temporaryPassword: string;
  editingMember: LivePerson | null;
  setEditingMember: (member: LivePerson | null) => void;
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  login: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  changePassword: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  refresh: () => Promise<void>;
  signout: () => Promise<void>;
  acknowledge: (notice: LiveNotice) => Promise<void>;
  publish: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loadMore: () => Promise<void>;
  openAdmin: (tab: AdminTab) => Promise<void>;
  addStore: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  inviteMember: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleMember: (member: LivePerson) => Promise<void>;
  saveMember: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  issueTemporaryPassword: () => Promise<void>;
};

export default function NativeExperience(props: NativeExperienceProps) {
  const authRoute = useMobileRoute("home");

  if (props.initializing) {
    return <NativeStatus title="Abrindo seu espaço" detail="Conferindo sua sessão segura." />;
  }
  if (!props.backendConfigured) {
    return <NativeStatus title="Conexão em preparação" detail="O ambiente do aplicativo precisa ser configurado pela administração." />;
  }
  if (!props.session) {
    if (authRoute.route === "privacy") return <NativePrivacy back={authRoute.back} />;
    return (
      <NativeLogin
        busy={props.busy}
        error={props.error}
        login={props.login}
        openPrivacy={() => authRoute.push("privacy")}
      />
    );
  }
  if (props.passwordMode) {
    return <NativePasswordForm busy={props.busy} error={props.error} message={props.message} changePassword={props.changePassword} />;
  }
  const workspace = props.workspace;
  if (!workspace) {
    return <NativeAccessPending busy={props.busy} loading={props.loading} error={props.error} retry={props.refresh} signout={props.signout} />;
  }
  return <NativeWorkspace {...props} workspace={workspace} />;
}

function NativeStatus({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="native-auth-screen">
      <div className="native-auth-brand"><BrandMark /></div>
      <section className="native-auth-card">
        <ShieldCheck size={27} />
        <h1>{title}</h1>
        <p>{detail}</p>
      </section>
    </main>
  );
}

function NativeLogin({
  busy,
  error,
  login,
  openPrivacy,
}: {
  busy: boolean;
  error: string;
  login: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  openPrivacy: () => void;
}) {
  return (
    <main className="native-auth-screen">
      <div className="native-auth-brand"><BrandMark /><span>EXCELÊNCIA<br /><b>OPERACIONAL</b></span></div>
      <section className="native-auth-intro">
        <span className="native-eyebrow">SEU ESPAÇO DE TRABALHO</span>
        <h1>O dia da loja,<br /><span>mais conectado.</span></h1>
        <p>Comunicados, rotina e recursos da equipe em um só lugar.</p>
      </section>
      <section className="native-auth-card">
        <h2>Entrar na sua conta</h2>
        <p>Use sua chapa e senha individual.</p>
        <form className="native-form" onSubmit={(event) => void login(event)}>
          <label>Chapa<input name="chapa" type="text" inputMode="numeric" pattern="[0-9]{1,20}" autoComplete="username" required placeholder="Número da chapa" /></label>
          <label>Senha<input name="password" type="password" autoComplete="current-password" required placeholder="Sua senha" /></label>
          {error && <div className="native-message is-error" role="alert">{error}</div>}
          <button className="native-primary" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}<ArrowRight size={18} /></button>
        </form>
        <p className="native-login-help">Precisa de acesso ou redefinir a senha? Procure a administração.</p>
        <button className="native-text-action" type="button" onClick={openPrivacy}>Política de Privacidade<ChevronRight size={17} /></button>
      </section>
      <p className="native-auth-foot"><ShieldCheck size={15} /> Acesso individual e protegido</p>
    </main>
  );
}

function NativePasswordForm({
  busy,
  error,
  message,
  changePassword,
}: {
  busy: boolean;
  error: string;
  message: string;
  changePassword: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <main className="native-auth-screen">
      <div className="native-auth-brand"><BrandMark /></div>
      <section className="native-auth-card">
        <span className="native-icon-tile"><ShieldCheck size={22} /></span>
        <h1>Crie sua senha pessoal</h1>
        <p>Por segurança, a senha temporária precisa ser trocada antes de continuar.</p>
        <form className="native-form" onSubmit={(event) => void changePassword(event)}>
          <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} required placeholder="Mínimo de 12 caracteres" /></label>
          <label>Confirme a senha<input name="confirm" type="password" autoComplete="new-password" minLength={12} required placeholder="Digite novamente" /></label>
          {error && <div className="native-message is-error" role="alert">{error}</div>}
          {message && <div className="native-message is-success" role="status">{message}</div>}
          <button className="native-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
        </form>
      </section>
    </main>
  );
}

function NativeAccessPending({
  busy,
  loading,
  error,
  retry,
  signout,
}: {
  busy: boolean;
  loading: boolean;
  error: string;
  retry: () => Promise<void>;
  signout: () => Promise<void>;
}) {
  return (
    <main className="native-auth-screen">
      <div className="native-auth-brand"><BrandMark /></div>
      <section className="native-auth-card">
        <ShieldCheck size={27} />
        <h1>{loading ? "Carregando seu espaço" : "Acesso em preparação"}</h1>
        <p>{error || "Estamos conferindo suas permissões."}</p>
        <button className="native-primary" disabled={busy || loading} onClick={() => void retry()}>Tentar novamente<RefreshCw size={17} /></button>
        <button className="native-text-action" disabled={busy} onClick={() => void signout()}>Sair desta conta<LogOut size={17} /></button>
      </section>
    </main>
  );
}

function NativeWorkspace(props: NativeExperienceProps & { workspace: Workspace }) {
  const { route, push, back } = useMobileRoute("home");
  const [future, setFuture] = useState("");
  const workspace = props.workspace;
  const isAdmin = workspace.person.role === "admin";
  const isLeader = isAdmin || workspace.person.role === "diretor";
  const pending = props.notices.filter((notice) => !notice.acknowledged);
  const activeRoot = route.startsWith("admin-") ? "admin" : route === "notice-detail" || route === "compose" ? "notices" : route;
  const subPage = ["privacy", "notice-detail", "compose", "admin-stores", "admin-people", "admin-audit", "edit-member"].includes(route);
  const pageTitle: Record<MobileRoute, string> = {
    home: "Início",
    notices: "Comunicados",
    modules: "Aplicativos",
    admin: "Gestão",
    profile: "Meu perfil",
    privacy: "Privacidade",
    "notice-detail": "Comunicado",
    compose: "Novo comunicado",
    "admin-stores": "Lojas",
    "admin-people": "Pessoas e acessos",
    "admin-audit": "Auditoria",
    "edit-member": "Editar acesso",
  };
  const navItems: { id: MobileRoute; label: string; icon: LucideIcon }[] = [
    { id: "home", label: "Início", icon: Home },
    { id: "notices", label: "Avisos", icon: Megaphone },
    { id: "modules", label: "Apps", icon: Grid2X2 },
    ...(isAdmin ? [{ id: "admin" as const, label: "Gestão", icon: ShieldCheck }] : []),
    { id: "profile", label: "Perfil", icon: Users },
  ];
  const goAdmin = (next: AdminTab) => {
    void props.openAdmin(next);
    push(`admin-${next}`);
  };
  const goNotice = (notice: LiveNotice) => {
    props.setOpened(notice);
    push("notice-detail");
  };
  const goTab = (next: MobileRoute) => {
    if (next === "admin") {
      goAdmin(props.tab);
      return;
    }
    push(next);
  };

  useEffect(() => {
    if (route === "edit-member" && !props.editingMember) back();
  }, [route, props.editingMember, back]);
  useEffect(() => {
    if (route === "compose" && !props.compose) back();
  }, [route, props.compose, back]);

  return (
    <div className="native-app">
      <header className={`native-topbar ${subPage ? "is-subpage" : ""}`}>
        {subPage ? <NativeBack onClick={back} /> : (
          <button className="native-home-brand" aria-label="Voltar ao início" onClick={() => goTab("home")}><BrandMark /></button>
        )}
        <div className="native-top-title">
          <span>{subPage ? "EXCELÊNCIA OPERACIONAL" : workspace.settings.workspace_name}</span>
          <strong>{pageTitle[route]}</strong>
        </div>
        {!subPage && <button className="native-top-action" aria-label="Atualizar" disabled={props.busy || props.loading} onClick={() => void props.refresh()}><RefreshCw size={19} /></button>}
      </header>

      <main className={`native-content ${subPage ? "has-back" : ""}`} key={route}>
        <NativeMessage message={props.message} error={props.error} />
        {route === "home" && (
          <NativeHome
            workspace={workspace}
            notices={props.notices}
            pending={pending}
            leader={isLeader}
            openNotices={() => goTab("notices")}
            openNotice={goNotice}
            openModules={() => goTab("modules")}
            openCompose={() => { props.setCompose(true); push("compose"); }}
          />
        )}
        {route === "notices" && (
          <NativeNoticeList
            notices={props.notices}
            pendingCount={pending.length}
            leader={isLeader}
            more={props.more}
            busy={props.busy}
            loadMore={props.loadMore}
            openNotice={goNotice}
            openCompose={() => { props.setCompose(true); push("compose"); }}
          />
        )}
        {route === "notice-detail" && props.opened && (
          <NativeNoticeDetail notice={props.opened} busy={props.busy} acknowledge={props.acknowledge} />
        )}
        {route === "compose" && (
          <NativeCompose workspace={workspace} busy={props.busy} error={props.error} publish={props.publish} />
        )}
        {route === "modules" && <NativeModules openNotice={() => goTab("notices")} openFuture={setFuture} />}
        {route === "profile" && (
          <NativeProfile workspace={workspace} openPrivacy={() => push("privacy")} signout={props.signout} busy={props.busy} />
        )}
        {route === "privacy" && <NativePrivacy back={back} />}
        {route === "admin" && isAdmin && <NativeAdminHome openAdmin={goAdmin} />}
        {route === "admin-stores" && isAdmin && <NativeStores workspace={workspace} busy={props.busy} addStore={props.addStore} />}
        {route === "admin-people" && isAdmin && (
          <NativePeople
            workspace={workspace}
            busy={props.busy}
            members={props.members}
            temporaryPassword={props.temporaryPassword}
            issueTemporaryPassword={props.issueTemporaryPassword}
            inviteMember={props.inviteMember}
            toggleMember={props.toggleMember}
            editMember={(member) => { props.setEditingMember(member); push("edit-member"); }}
            signout={props.signout}
          />
        )}
        {route === "edit-member" && isAdmin && props.editingMember && (
          <NativeEditMember member={props.editingMember} workspace={workspace} busy={props.busy} saveMember={props.saveMember} />
        )}
        {route === "admin-audit" && isAdmin && <NativeAudit audit={props.audit} />}
        {route.startsWith("admin-") && !isAdmin && <NativeAccessPending busy={props.busy} loading={false} error="Seu perfil não tem acesso à administração." retry={props.refresh} signout={props.signout} />}
      </main>

      {!subPage && (
        <nav className="native-tabbar" aria-label="Navegação principal">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeRoot === id ? "selected" : ""} aria-current={activeRoot === id ? "page" : undefined} onClick={() => goTab(id)}>
              <span className="native-tab-icon"><Icon size={20} strokeWidth={activeRoot === id ? 2.2 : 1.8} />{id === "notices" && pending.length > 0 && <i>{pending.length > 9 ? "9+" : pending.length}</i>}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {future && <div className="native-sheet-backdrop" onClick={() => setFuture("")} role="presentation"><section className="native-sheet" onClick={(event) => event.stopPropagation()}><span className="native-sheet-handle" /><span className="native-icon-tile"><CircleHelp size={21} /></span><h2>{future}</h2><p>Este módulo será conectado em uma próxima etapa. Sua identidade, lojas e permissões serão compartilhadas com o portal.</p><button className="native-primary" onClick={() => setFuture("")}>Entendi</button></section></div>}
    </div>
  );
}

function NativeSectionTitle({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return <div className="native-section-title"><h2>{title}</h2>{action && <button onClick={action.onClick}>{action.label}<ChevronRight size={15} /></button>}</div>;
}

function NativeHome({
  workspace,
  notices,
  pending,
  leader,
  openNotices,
  openNotice,
  openModules,
  openCompose,
}: {
  workspace: Workspace;
  notices: LiveNotice[];
  pending: LiveNotice[];
  leader: boolean;
  openNotices: () => void;
  openNotice: (notice: LiveNotice) => void;
  openModules: () => void;
  openCompose: () => void;
}) {
  const firstName = workspace.person.name.trim().split(/\s+/)[0];
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const shortcuts = [
    { title: "Comunicados", detail: `${pending.length} aguardando leitura`, icon: Megaphone, onClick: openNotices, color: "yellow" },
    { title: "Checklist", detail: "Rotinas da equipe", icon: ClipboardCheck, onClick: openModules, color: "sand" },
  ];
  return (
    <div className="native-screen-content">
      <div className="native-date-line"><CalendarDays size={15} />{date}</div>
      <section className="native-welcome-card">
        <span className="native-eyebrow">SEU ESPAÇO, SUA OPERAÇÃO</span>
        <h1>Bom dia, {firstName}.</h1>
        <p>Veja o que precisa da sua atenção hoje.</p>
        <div className="native-welcome-meta"><span><Building2 size={15} />{workspace.stores.length} {workspace.stores.length === 1 ? "loja vinculada" : "lojas vinculadas"}</span><span>{roleLabels[workspace.person.role]}</span></div>
      </section>

      <div className="native-metric-row">
        <button className="native-metric-card" onClick={openNotices}><span>Para ler</span><strong>{pending.length}</strong><small>comunicados</small></button>
        <div className="native-metric-card"><span>Meu acesso</span><strong className="native-role-value">{roleLabels[workspace.person.role]}</strong><small>perfil ativo</small></div>
      </div>

      <NativeSectionTitle title="Acesso rápido" action={{ label: "Ver tudo", onClick: openModules }} />
      <div className="native-shortcut-list">
        {shortcuts.map(({ title, detail, icon: Icon, onClick, color }) => (
          <button key={title} className="native-shortcut" onClick={onClick}><span className={`native-shortcut-icon ${color}`}><Icon size={21} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={19} /></button>
        ))}
      </div>

      {leader && <button className="native-create-notice" onClick={openCompose}><span><Plus size={18} /></span><span><strong>Novo comunicado</strong><small>Envie uma orientação para as lojas</small></span><ArrowRight size={18} />
      </button>}

      <NativeSectionTitle title="Últimos comunicados" action={{ label: "Ver todos", onClick: openNotices }} />
      {notices.length ? <div className="native-notice-list">{notices.slice(0, 3).map((notice) => <NativeNoticeCard key={`${notice.notice_id}-${notice.version}`} notice={notice} onClick={() => openNotice(notice)} leader={leader} />)}</div> : <NativeEmpty icon={Megaphone} title="Tudo em dia" detail="Quando houver novos comunicados, eles aparecerão aqui." />}
    </div>
  );
}

function NativeNoticeCard({ notice, onClick, leader }: { notice: LiveNotice; onClick: () => void; leader: boolean }) {
  const date = new Date(notice.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return (
    <button className="native-notice-card" onClick={onClick}>
      <div className="native-notice-meta"><span className={`native-category ${notice.urgent ? "urgent" : ""}`}>{notice.urgent ? "Prioritário" : notice.category}</span><time>{date}</time></div>
      <strong>{notice.title}</strong>
      <p>{notice.body}</p>
      <div className="native-notice-foot"><span className={notice.acknowledged ? "confirmed" : "awaiting"}>{notice.acknowledged ? "Ciência confirmada" : "Aguardando sua ciência"}</span>{leader && <span>{notice.receipt_count}/{notice.eligible_count}</span>}<ArrowRight size={17} /></div>
    </button>
  );
}

function NativeNoticeList({
  notices,
  pendingCount,
  leader,
  more,
  busy,
  loadMore,
  openNotice,
  openCompose,
}: {
  notices: LiveNotice[];
  pendingCount: number;
  leader: boolean;
  more: boolean;
  busy: boolean;
  loadMore: () => Promise<void>;
  openNotice: (notice: LiveNotice) => void;
  openCompose: () => void;
}) {
  return (
    <div className="native-screen-content">
      <div className="native-page-intro"><span className="native-eyebrow">INFORMAÇÃO PARA A EQUIPE</span><h1>Comunicados</h1><p>Acompanhe as orientações e confirme sua ciência.</p></div>
      <div className="native-summary-strip"><span><Megaphone size={17} />{notices.length} no total</span><strong>{pendingCount} pendente{pendingCount === 1 ? "" : "s"}</strong></div>
      {leader && <button className="native-primary native-inline-primary" onClick={openCompose}><Plus size={18} />Novo comunicado</button>}
      {notices.length ? <div className="native-notice-list">{notices.map((notice) => <NativeNoticeCard key={`${notice.notice_id}-${notice.version}`} notice={notice} onClick={() => openNotice(notice)} leader={leader} />)}</div> : <NativeEmpty icon={Megaphone} title="Nenhum comunicado" detail="As orientações destinadas a você aparecerão aqui." />}
      {more && <button className="native-secondary wide" disabled={busy} onClick={() => void loadMore()}>{busy ? "Carregando…" : "Carregar mais"}</button>}
    </div>
  );
}

function NativeNoticeDetail({ notice, busy, acknowledge }: { notice: LiveNotice; busy: boolean; acknowledge: (notice: LiveNotice) => Promise<void> }) {
  return (
    <article className="native-screen-content native-detail-content">
      <div className="native-detail-badge"><span className={`native-category ${notice.urgent ? "urgent" : ""}`}>{notice.urgent ? "Prioritário" : notice.category}</span><span>Versão {notice.version}</span></div>
      <h1>{notice.title}</h1>
      <p className="native-detail-date">Enviado em {new Date(notice.published_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}</p>
      <div className="native-detail-body">{notice.body.split("\n").map((line, index) => <p key={index}>{line || <br />}</p>)}</div>
      <div className="native-detail-callout"><ShieldCheck size={19} /><span>Sua confirmação fica registrada para este comunicado.</span></div>
      <button className="native-primary native-ack-button" disabled={busy || notice.acknowledged} onClick={() => void acknowledge(notice)}>{notice.acknowledged ? <><CheckCheck size={19} />Ciência confirmada</> : <><CheckCheck size={19} />Li e estou ciente</>}</button>
    </article>
  );
}

const futureModules: { title: string; detail: string; icon: LucideIcon; tag: string }[] = [
  { title: "Checklist", detail: "Rotinas e padrões da loja", icon: ClipboardCheck, tag: "Planejado" },
  { title: "Cartazeamento", detail: "Materiais de campanha", icon: FileImage, tag: "Planejado" },
  { title: "Escala da equipe", detail: "Pessoas e horários", icon: CalendarDays, tag: "Planejado" },
  { title: "Fotos e evidências", detail: "Registros da operação", icon: Upload, tag: "Planejado" },
  { title: "Diário de vendas", detail: "Relato de voz e resumo", icon: Mic, tag: "Planejado" },
];

function NativeModules({ openNotice, openFuture }: { openNotice: () => void; openFuture: (title: string) => void }) {
  return (
    <div className="native-screen-content">
      <div className="native-page-intro"><span className="native-eyebrow">FERRAMENTAS DA OPERAÇÃO</span><h1>Aplicativos</h1><p>Recursos atuais e próximos módulos do EO.</p></div>
      <NativeSectionTitle title="Disponível agora" />
      <button className="native-module-card available" onClick={openNotice}><span className="native-module-icon yellow"><Megaphone size={22} /></span><span className="native-module-copy"><strong>Comunicados</strong><small>Orientações e confirmação de leitura</small><em>Disponível</em></span><ChevronRight size={19} /></button>
      <NativeSectionTitle title="Novos módulos" />
      <div className="native-module-list">{futureModules.map(({ title, detail, icon: Icon, tag }) => <button key={title} className="native-module-card" onClick={() => openFuture(title)}><span className="native-module-icon"><Icon size={21} /></span><span className="native-module-copy"><strong>{title}</strong><small>{detail}</small><em>{tag}</em></span><ChevronRight size={19} /></button>)}</div>
    </div>
  );
}

function NativeProfile({ workspace, openPrivacy, signout, busy }: { workspace: Workspace; openPrivacy: () => void; signout: () => Promise<void>; busy: boolean }) {
  return (
    <div className="native-screen-content">
      <div className="native-profile-card"><div className="native-profile-avatar">{workspace.person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><h1>{workspace.person.name}</h1><p>{roleLabels[workspace.person.role]}</p></div>
      <section className="native-panel"><span className="native-panel-label">SEU ACESSO</span><div className="native-profile-row"><span>Perfil</span><strong>{roleLabels[workspace.person.role]}</strong></div><div className="native-profile-row"><span>Lojas autorizadas</span><strong>{workspace.stores.length}</strong></div><div className="native-store-chips">{workspace.stores.map((store) => <span key={store.id}>{store.code} · {store.name}</span>)}</div></section>
      <section className="native-panel native-settings-list"><span className="native-panel-label">AJUDA E PRIVACIDADE</span><button onClick={openPrivacy}><ShieldCheck size={19} /><span><strong>Política de Privacidade</strong><small>Como seus dados são tratados</small></span><ChevronRight size={18} /></button><a href="/suporte.html"><CircleHelp size={19} /><span><strong>Suporte</strong><small>Ajuda e contato</small></span><ChevronRight size={18} /></a></section>
      <button className="native-logout" disabled={busy} onClick={() => void signout()}><LogOut size={18} />Sair da conta</button>
      <p className="native-version">Excelência Operacional · EO</p>
    </div>
  );
}

function NativeAdminHome({ openAdmin }: { openAdmin: (tab: AdminTab) => void }) {
  const items: { id: AdminTab; title: string; detail: string; icon: LucideIcon }[] = [
    { id: "stores", title: "Lojas", detail: "Unidades vinculadas ao espaço", icon: Store },
    { id: "people", title: "Pessoas e acessos", detail: "Perfis, permissões e convites", icon: Users },
    { id: "audit", title: "Auditoria", detail: "Atividades recentes do sistema", icon: ShieldCheck },
  ];
  return <div className="native-screen-content"><div className="native-page-intro"><span className="native-eyebrow">ÁREA RESTRITA</span><h1>Administração</h1><p>Gerencie os acessos e acompanhe o espaço.</p></div><div className="native-admin-list">{items.map(({ id, title, detail, icon: Icon }) => <button key={id} className="native-admin-card" onClick={() => openAdmin(id)}><span className="native-admin-icon"><Icon size={21} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={19} /></button>)}</div><div className="native-admin-note"><ShieldCheck size={17} /><span>As alterações ficam registradas no histórico de auditoria.</span></div></div>;
}

function NativeStores({ workspace, busy, addStore }: { workspace: Workspace; busy: boolean; addStore: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <div className="native-screen-content"><section className="native-panel"><span className="native-panel-label">NOVA UNIDADE</span><form className="native-form" onSubmit={(event) => void addStore(event)}><label>Código<input name="code" required maxLength={20} placeholder="Ex.: 001" /></label><label>Nome da loja<input name="name" required minLength={2} maxLength={120} placeholder="Nome da unidade" /></label><label>Regional<input name="region" maxLength={120} placeholder="Opcional" /></label><button className="native-primary" disabled={busy}>{busy ? "Salvando…" : "Cadastrar loja"}<Plus size={18} /></button></form></section><NativeSectionTitle title={`Lojas cadastradas · ${workspace.stores.length}`} /><div className="native-admin-list">{workspace.stores.map((store) => <div className="native-admin-card static" key={store.id}><span className="native-admin-icon"><Store size={19} /></span><span><strong>{store.name}</strong><small>{store.code}{store.region ? ` · ${store.region}` : ""}</small></span></div>)}</div></div>;
}

function NativePeople({
  workspace,
  busy,
  members,
  temporaryPassword,
  issueTemporaryPassword,
  inviteMember,
  toggleMember,
  editMember,
  signout,
}: {
  workspace: Workspace;
  busy: boolean;
  members: LivePerson[];
  temporaryPassword: string;
  issueTemporaryPassword: () => Promise<void>;
  inviteMember: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleMember: (member: LivePerson) => Promise<void>;
  editMember: (member: LivePerson) => void;
  signout: () => Promise<void>;
}) {
  return <div className="native-screen-content">
    <section className="native-panel"><span className="native-panel-label">NOVO ACESSO</span><p className="native-form-help">O convite é individual. Escolha o perfil e as lojas que a pessoa poderá acessar.</p><form className="native-form" onSubmit={(event) => void inviteMember(event)}><label>Chapa<input name="chapa" required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} placeholder="Número da chapa" /></label><label>E-mail<input name="email" type="email" required maxLength={254} placeholder="nome@exemplo.com" /></label><label>Nome completo<input name="name" minLength={2} maxLength={120} required placeholder="Nome da pessoa" /></label><label>Perfil<select name="role" defaultValue="colaborador"><option value="colaborador">Colaborador</option><option value="gerente">Gerente</option>{workspace.person.master_admin && <option value="diretor">Diretor</option>}{workspace.person.master_admin && <option value="admin">Administrador</option>}</select></label><fieldset className="native-checks"><legend>Lojas autorizadas</legend>{workspace.stores.map((store) => <label key={store.id}><input type="checkbox" name="stores" value={store.id} />{store.code} · {store.name}</label>)}</fieldset><button className="native-primary" disabled={busy}>{busy ? "Enviando…" : "Enviar convite"}<ArrowRight size={18} /></button></form></section>
    <NativeSectionTitle title={`Pessoas · ${members.length}`} />
    <div className="native-admin-list">{members.map((member) => <article className="native-person-card" key={member.id}><div className="native-person-top"><span className="native-person-avatar">{member.display_name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><strong>{member.display_name}</strong><small>{roleLabels[member.role as keyof typeof roleLabels] || member.role} · {member.login_chapa || "Sem chapa"}</small></div><span className={`native-status-dot ${member.active ? "active" : "inactive"}`} /></div><p>{!member.active ? "Acesso inativo" : member.must_change_password ? "Aguardando primeiro acesso" : "Acesso ativo"}</p>{member.id !== workspace.person.id && <div className="native-person-actions"><button onClick={() => editMember(member)} disabled={busy}>Editar acesso</button><button onClick={() => void toggleMember(member)} disabled={busy}>{member.active ? "Desativar" : "Reativar"}</button></div>}</article>)}</div>
    {workspace.person.master_admin && <section className="native-panel native-master-panel"><span className="native-panel-label">ADMINISTRADOR MASTER</span><h2>Acesso de segurança</h2><p>Gere uma senha temporária quando precisar liberar novamente o primeiro acesso do master.</p>{temporaryPassword ? <><label className="native-static-label">Senha temporária<input readOnly value={temporaryPassword} /></label><button className="native-secondary" onClick={() => void navigator.clipboard?.writeText(temporaryPassword)}>Copiar senha</button><button className="native-text-action" onClick={() => void signout()}>Guardei a senha, sair agora<LogOut size={17} /></button></> : <button className="native-secondary" disabled={busy} onClick={() => void issueTemporaryPassword()}>{busy ? "Gerando…" : "Gerar senha temporária"}<RefreshCw size={17} /></button>}</section>}
  </div>;
}

function NativeEditMember({ member, workspace, busy, saveMember }: { member: LivePerson; workspace: Workspace; busy: boolean; saveMember: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <section className="native-panel"><p className="native-form-help">Atualize o perfil e as lojas autorizadas para esta pessoa.</p><form className="native-form" onSubmit={(event) => void saveMember(event)}><label>Nome<input name="name" required minLength={2} maxLength={120} defaultValue={member.display_name} /></label><label>Chapa<input name="chapa" required inputMode="numeric" pattern="[0-9]{1,20}" defaultValue={member.login_chapa ?? ""} /></label><label>Perfil<select name="role" defaultValue={member.role}><option value="colaborador">Colaborador</option><option value="gerente">Gerente</option>{workspace.person.master_admin && <option value="diretor">Diretor</option>}{workspace.person.master_admin && <option value="admin">Administrador</option>}</select></label><fieldset className="native-checks"><legend>Lojas autorizadas</legend>{workspace.stores.map((store) => <label key={store.id}><input type="checkbox" name="stores" value={store.id} defaultChecked={member.stores.includes(store.id)} />{store.code} · {store.name}</label>)}</fieldset><button className="native-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button></form></section>;
}

function NativeAudit({ audit }: { audit: AuditRow[] }) {
  return <div className="native-screen-content"><div className="native-summary-strip"><span><ShieldCheck size={17} />Atividade segura</span><strong>{audit.length} eventos</strong></div><p className="native-audit-intro">Últimos eventos registrados pelo servidor.</p>{audit.length ? <div className="native-audit-list">{audit.map((entry) => <article key={entry.id} className="native-audit-item"><span className="native-audit-mark"><ShieldCheck size={17} /></span><div><strong>{entry.action}</strong><p>{entry.actor_name}</p><time>{new Date(entry.created_at).toLocaleString("pt-BR")}</time></div></article>)}</div> : <NativeEmpty icon={ShieldCheck} title="Sem eventos recentes" detail="As ações administrativas serão exibidas aqui." />}</div>;
}

function NativeCompose({ workspace, busy, error, publish }: { workspace: Workspace; busy: boolean; error: string; publish: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <section className="native-panel"><p className="native-form-help">A mensagem ficará disponível para as equipes das lojas selecionadas.</p><form className="native-form" onSubmit={(event) => void publish(event)}><label>Título<input name="title" required minLength={3} maxLength={120} placeholder="Resumo da orientação" /></label><label>Mensagem<textarea name="body" rows={7} required maxLength={5000} placeholder="Escreva a orientação para a equipe…" /></label><fieldset className="native-checks"><legend>Lojas destinatárias</legend>{workspace.stores.map((store) => <label key={store.id}><input type="checkbox" name="stores" value={store.id} />{store.code} · {store.name}</label>)}</fieldset><label className="native-check-line"><input name="urgent" type="checkbox" />Destacar como prioritário</label>{error && <div className="native-message is-error" role="alert">{error}</div>}<button className="native-primary" disabled={busy}>{busy ? "Publicando…" : "Publicar comunicado"}<ArrowRight size={18} /></button></form></section>;
}

function NativeEmpty({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <section className="native-empty"><span><Icon size={25} /></span><h2>{title}</h2><p>{detail}</p></section>;
}
