import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { EOProvider, useEO } from "./src/providers/eo-provider";
import { ActionRow, Badge, Brand, Button, C, Card, Choice, Feedback, Field, Heading, Page, Section, s } from "./src/ui";
import type { AdminTab, AuditRow, LiveNotice, LivePerson, Role } from "./src/types";

type Route = { name: string; id?: string };
const titles: Record<string, string> = {
  home: "Início", notices: "Comunicados", modules: "Aplicativos", management: "Gestão", profile: "Meu perfil",
  privacy: "Privacidade", notice: "Comunicado", compose: "Novo comunicado", stores: "Lojas", people: "Pessoas e acessos",
  audit: "Auditoria", edit: "Editar acesso", change: "Trocar senha",
};
const rootTabs = ["home", "notices", "modules", "management", "profile"];

export default function App() {
  return <SafeAreaProvider><EOProvider><Application /></EOProvider></SafeAreaProvider>;
}

function Application() {
  const app = useEO();
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState<Route[]>([{ name: "login" }]);
  const current = stack[stack.length - 1] ?? { name: "login" };
  const isRoot = rootTabs.includes(current.name);
  const isAdmin = app.workspace?.person.role === "admin";
  const pending = app.notices.filter((item) => !item.acknowledged).length;
  const push = useCallback((route: Route) => setStack((old) => [...old, route]), []);
  const back = useCallback(() => setStack((old) => old.length > 1 ? old.slice(0, -1) : old), []);
  const selectTab = useCallback((name: string) => setStack([{ name }]), []);

  useEffect(() => {
    if (app.initializing) return;
    const top = stack[stack.length - 1]?.name;
    if (!app.session) {
      if (top !== "login" && top !== "privacy") setStack([{ name: "login" }]);
      return;
    }
    if (app.passwordMode) {
      if (top !== "change") setStack([{ name: "change" }]);
      return;
    }
    if (app.workspace && ["login", "loading", "change"].includes(top ?? "")) setStack([{ name: "home" }]);
    else if (app.loading && top === "login") setStack([{ name: "loading" }]);
  }, [app.initializing, app.session?.user.id, app.passwordMode, app.workspace, app.loading]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 1) { back(); return true; }
      if (current.name !== "home" && rootTabs.includes(current.name)) { selectTab("home"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [back, current.name, rootTabs, selectTab, stack]);

  const title = titles[current.name] ?? "Excelência Operacional";
  const render = () => {
    if (app.initializing || current.name === "loading") return <LoadingScreen configured={app.configured} error={app.error} />;
    if (!app.session) {
      if (current.name === "privacy") return <PrivacyScreen back={back} />;
      return <LoginScreen openPrivacy={() => push({ name: "privacy" })} />;
    }
    if (app.passwordMode || current.name === "change") return <ChangePasswordScreen />;
    if (!app.workspace) return <AccessScreen />;
    switch (current.name) {
      case "home": return <HomeScreen openTab={selectTab} openNotice={(id) => push({ name: "notice", id })} openCompose={() => push({ name: "compose" })} />;
      case "notices": return <NoticesScreen openNotice={(id) => push({ name: "notice", id })} openCompose={() => push({ name: "compose" })} />;
      case "notice": return <NoticeScreen id={current.id ?? ""} back={back} />;
      case "compose": return <ComposeScreen />;
      case "modules": return <ModulesScreen openTab={selectTab} />;
      case "management": return <ManagementScreen open={(tab) => { void app.loadAdmin(tab); push({ name: tab === "stores" ? "stores" : tab }); }} />;
      case "stores": return <StoresScreen />;
      case "people": return <PeopleScreen edit={(id) => push({ name: "edit", id })} />;
      case "edit": return <EditPersonScreen id={current.id ?? ""} back={back} />;
      case "audit": return <AuditScreen />;
      case "profile": return <ProfileScreen openPrivacy={() => push({ name: "privacy" })} />;
      case "privacy": return <PrivacyScreen back={back} />;
      default: return <HomeScreen openTab={selectTab} openNotice={(id) => push({ name: "notice", id })} openCompose={() => push({ name: "compose" })} />;
    }
  };

  const hideHeader = ["login", "loading", "change"].includes(current.name) && !app.session;
  return <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
    <StatusBar barStyle="dark-content" backgroundColor={C.paper} />
    {!hideHeader && <View style={s.topbar}>
      {stack.length > 1 || !isRoot ? <Pressable accessibilityLabel="Voltar" accessibilityRole="button" onPress={back} style={s.back}><Text style={s.backText}>‹</Text></Pressable> : <Brand compact />}
      <View style={s.topText}><Text style={s.topEyebrow}>EXCELÊNCIA OPERACIONAL</Text><Text style={s.topTitle}>{title}</Text></View>
      {isRoot && <Pressable accessibilityLabel="Atualizar" accessibilityRole="button" onPress={() => void app.refresh()} style={s.refresh}><Text style={s.refreshText}>↻</Text></Pressable>}
    </View>}
    <Feedback error={app.error} message={app.message} onClose={app.clearFeedback} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>{render()}</KeyboardAvoidingView>
    {app.session && !app.passwordMode && isRoot && <View style={[s.tabbar, { paddingBottom: Math.max(insets.bottom, 5) }]}>
      <Tab name="home" active={current.name === "home"} glyph="⌂" label="Início" onPress={() => selectTab("home")} />
      <Tab name="notices" active={current.name === "notices"} glyph="▤" label="Avisos" count={pending} onPress={() => selectTab("notices")} />
      <Tab name="modules" active={current.name === "modules"} glyph="▦" label="Apps" onPress={() => selectTab("modules")} />
      {isAdmin && <Tab name="management" active={current.name === "management"} glyph="⚙" label="Gestão" onPress={() => { void app.loadAdmin("stores"); selectTab("management"); }} />}
      <Tab name="profile" active={current.name === "profile"} glyph="◉" label="Perfil" onPress={() => selectTab("profile")} />
    </View>}
  </SafeAreaView>;
}

function Tab({ active, glyph, label, count, onPress }: { name: string; active: boolean; glyph: string; label: string; count?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[s.tab, active && { backgroundColor: "#FFFBE0" }]}><View><Text style={[s.tabGlyph, active && s.tabActive]}>{glyph}</Text>{count ? <Text style={s.tabCount}>{count > 9 ? "9+" : count}</Text> : null}</View><Text style={[s.tabLabel, active && s.tabActive]}>{label}</Text></Pressable>;
}

function LoginScreen({ openPrivacy }: { openPrivacy: () => void }) {
  const app = useEO();
  const [chapa, setChapa] = useState(""); const [password, setPassword] = useState("");
  return <Page contentStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 23, paddingTop: 26, paddingBottom: 28, gap: 19 }}>
    <View style={{ gap: 25 }}><Brand /><View style={{ gap: 9 }}><Badge warning>PLATAFORMA EO</Badge><Text style={s.title}>Sua loja,{"\n"}<Text style={{ color: C.dark }}>em sintonia.</Text></Text><Text style={s.detail}>Comunicados, rotinas e ferramentas da equipe em um único espaço.</Text></View></View>
    <Card style={{ padding: 20, gap: 15, borderRadius: 22 }}><View><Text style={s.strong}>Acesse sua conta</Text><Text style={[s.small, { marginTop: 5 }]}>Entre com sua chapa e senha individual.</Text></View>
      <Field label="Chapa" value={chapa} onChangeText={setChapa} keyboardType="number-pad" maxLength={20} placeholder="Número da chapa" autoComplete="username" />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Sua senha" />
      <Button title={app.busy ? "Acessando…" : "Entrar no EO"} icon="→" disabled={app.busy} onPress={() => void app.login(chapa, password)} />
      <Text style={[s.small, { textAlign: "center" }]}>Precisa de acesso ou redefinir a senha? Fale com a administração.</Text>
    </Card>
    <Pressable onPress={openPrivacy} style={{ alignSelf: "center", padding: 8 }}><Text style={{ color: C.dark, fontWeight: "800", fontSize: 12 }}>Privacidade e suporte  ›</Text></Pressable>
    <Text style={[s.small, { textAlign: "center" }]}>Acesso individual protegido · Excelência Operacional</Text>
  </Page>;
}

function LoadingScreen({ configured, error }: { configured: boolean; error: string }) {
  return <View style={s.centered}><Brand compact /><Text style={s.strong}>{configured ? "Carregando seu espaço" : "Conexão em preparação"}</Text><Text style={[s.small, { textAlign: "center" }]}>{error || (configured ? "Conferindo sua sessão segura." : "A administração precisa configurar a conexão do app.")}</Text></View>;
}
function AccessScreen() {
  const app = useEO();
  return <View style={s.centered}><Brand compact /><Heading title="Acesso em preparação" detail={app.error || "Estamos conferindo suas permissões."} /><Button title="Tentar novamente" icon="↻" onPress={() => void app.refresh()} disabled={app.loading || app.busy} /><Button title="Sair desta conta" secondary onPress={() => void app.signout()} /></View>;
}

function ChangePasswordScreen() {
  const app = useEO(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  return <Page contentStyle={{ flexGrow: 1, justifyContent: "center" }}><Brand /><Card><Badge warning>PRIMEIRO ACESSO</Badge><Heading title="Crie sua senha pessoal" detail="A senha temporária precisa ser trocada antes de continuar." /><Field label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="Mínimo de 12 caracteres" /><Field label="Confirme a senha" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" placeholder="Digite novamente" /><Button title={app.busy ? "Salvando…" : "Salvar nova senha"} disabled={app.busy} onPress={() => void app.changeTemporaryPassword(password, confirm)} /></Card></Page>;
}

function HomeScreen({ openTab, openNotice, openCompose }: { openTab: (tab: string) => void; openNotice: (id: string) => void; openCompose: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const pending = app.notices.filter((item) => !item.acknowledged);
  const name = workspace.person.name.trim().split(/\s+/)[0]; const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const leader = ["admin", "diretor"].includes(workspace.person.role);
  const roleSummary: Record<Role, string> = {
    colaborador: "Veja os comunicados e recursos disponíveis para você.",
    gerente: "Acompanhe as orientações da sua equipe.",
    diretor: "Consulte as informações das lojas autorizadas.",
    admin: "Acesse os recursos e controles do EO.",
  };
  return <Page>
    <View style={{ gap: 4 }}><Text style={s.eyebrow}>{date.toUpperCase()}</Text><Text style={[s.title, { fontSize: 22 }]}>Olá, {name}</Text></View>
    <View style={s.homeHero}><View style={{ gap: 9 }}><Text style={s.homeHeroEyebrow}>EXCELÊNCIA OPERACIONAL</Text><Text style={s.homeHeroTitle}>Tudo em ordem,{"\n"}loja em movimento.</Text><Text style={s.homeHeroDetail}>{roleSummary[workspace.person.role]}</Text></View><Text style={s.homeHeroMeta}>{workspace.stores.length} {workspace.stores.length === 1 ? "LOJA" : "LOJAS"}  ·  {roleLabels[workspace.person.role].toUpperCase()}</Text></View>
    <View style={{ flexDirection: "row", gap: 11 }}><Pressable accessibilityRole="button" accessibilityLabel={`${pending.length} comunicados para ler`} onPress={() => openTab("notices")} style={{ flex: 1 }}><Card style={[s.metricCard, { backgroundColor: C.yellow, borderColor: "#E9E2BD" }]}><Text style={s.small}>PENDÊNCIAS</Text><Text style={s.metricValue}>{pending.length.toString().padStart(2, "0")}</Text><Text style={[s.small, { color: C.dark, fontWeight: "800" }]}>Comunicados para ler  ›</Text></Card></Pressable><Card style={s.metricCard}><Text style={s.small}>SEU PERFIL</Text><Text style={[s.strong, { fontSize: 16 }]}>{roleLabels[workspace.person.role]}</Text><Text style={s.small}>{workspace.stores.length} {workspace.stores.length === 1 ? "unidade" : "unidades"} vinculadas</Text></Card></View>
    <Section title="Acesso rápido" action="Ver tudo" onAction={() => openTab("modules")} />
    <ActionRow title="Comunicados" detail={pending.length ? `${pending.length} aguardando sua leitura` : "Você está em dia"} icon="▤" onPress={() => openTab("notices")} />
    <ActionRow title="Aplicativos e rotinas" detail="Acesse as ferramentas da operação" icon="▦" onPress={() => openTab("modules")} />
    {leader && <Button title="Criar comunicado" icon="＋" onPress={openCompose} />}
    <Section title="Recentes" action="Ver todos" onAction={() => openTab("notices")} />
    {app.notices.slice(0, 3).map((notice) => <NoticeCard key={`${notice.notice_id}-${notice.version}`} notice={notice} onPress={() => openNotice(notice.notice_id)} leader={leader} />)}
    {!app.notices.length && <Empty title="Tudo em dia" detail="Quando houver um comunicado para você, ele aparecerá aqui." />}
  </Page>;
}

function NoticesScreen({ openNotice, openCompose }: { openNotice: (id: string) => void; openCompose: () => void }) {
  const app = useEO(); const leader = ["admin", "diretor"].includes(app.workspace!.person.role); const pending = app.notices.filter((item) => !item.acknowledged).length; const [filter, setFilter] = useState<"all" | "pending" | "read">("all");
  const visible = app.notices.filter((item) => filter === "all" || (filter === "pending" ? !item.acknowledged : item.acknowledged));
  return <Page><Heading eyebrow="INFORMAÇÃO PARA A EQUIPE" title="Comunicados" detail="Acompanhe as orientações e confirme sua ciência." />
    <View style={{ flexDirection: "row", gap: 7 }}>{([["all", "Todos"], ["pending", `Pendentes · ${pending}`], ["read", "Lidos"]] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={{ flex: 1, alignItems: "center", paddingVertical: 11, paddingHorizontal: 4, borderRadius: 13, backgroundColor: filter === value ? C.dark : C.paper, borderWidth: 1, borderColor: filter === value ? C.dark : C.line }}><Text numberOfLines={1} style={{ color: filter === value ? C.paper : C.muted, fontSize: 10, fontWeight: "800" }}>{label}</Text></Pressable>)}</View>
    <Text style={s.small}>{visible.length} {visible.length === 1 ? "comunicado" : "comunicados"} {filter === "pending" ? "aguardando ciência" : filter === "read" ? "com ciência confirmada" : "no seu espaço"}</Text>
    {leader && <Button title="Novo comunicado" icon="＋" onPress={openCompose} />}
    {visible.map((notice) => <NoticeCard key={`${notice.notice_id}-${notice.version}`} notice={notice} onPress={() => openNotice(notice.notice_id)} leader={leader} />)}
    {!visible.length && <Empty title={filter === "pending" ? "Tudo lido" : filter === "read" ? "Ainda sem leituras" : "Nenhum comunicado"} detail={filter === "pending" ? "Você não tem comunicados pendentes." : "As orientações destinadas a você aparecerão aqui."} />}
    {app.more && <Button title={app.busy ? "Carregando…" : "Carregar mais"} secondary disabled={app.busy} onPress={() => void app.loadMore()} />}
  </Page>;
}

function NoticeCard({ notice, onPress, leader }: { notice: LiveNotice; onPress: () => void; leader: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.card, { gap: 10 }, pressed && s.pressed]}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Badge warning={notice.urgent}>{notice.urgent ? "Prioritário" : notice.category}</Badge><Text style={s.small}>{new Date(notice.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Text></View>
    <Text style={s.strong}>{notice.title}</Text><Text style={s.small} numberOfLines={2}>{notice.body}</Text><View style={s.divider} />
    <Text style={{ color: notice.acknowledged ? C.green : C.muted, fontSize: 11, fontWeight: "700" }}>{notice.acknowledged ? "✓  Ciência confirmada" : "○  Aguardando sua ciência"}{leader ? `   ·   ${notice.receipt_count}/${notice.eligible_count}` : ""}</Text>
  </Pressable>;
}

function NoticeScreen({ id, back }: { id: string; back: () => void }) {
  const app = useEO(); const notice = app.notices.find((item) => item.notice_id === id);
  if (!notice) return <Page><Empty title="Comunicado indisponível" detail="Atualize a lista e tente novamente." /><Button title="Voltar" secondary onPress={back} /></Page>;
  return <Page><Badge warning={notice.urgent}>{notice.urgent ? "Prioritário" : notice.category}  ·  Versão {notice.version}</Badge><Heading title={notice.title} detail={`Enviado em ${new Date(notice.published_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`} />
    <Card>{notice.body.split("\n").map((line, index) => <Text key={index} style={s.body}>{line || " "}</Text>)}</Card>
    <Card style={{ backgroundColor: C.soft }}><Text style={s.small}>◈  Sua confirmação fica registrada para este comunicado.</Text></Card>
    <Button title={notice.acknowledged ? "Ciência confirmada" : "Li e estou ciente"} icon="✓" disabled={app.busy || notice.acknowledged} onPress={() => void app.acknowledge(notice)} />
  </Page>;
}

function ModulesScreen({ openTab }: { openTab: (tab: string) => void }) {
  const modules = [
    ["Checklist", "Rotinas e padrões da loja", "✓"], ["Cartazeamento", "Materiais de campanha", "▧"],
    ["Escala da equipe", "Pessoas e horários", "◷"], ["Fotos e evidências", "Registros da operação", "▣"], ["Diário de vendas", "Relato de voz e resumo", "◖"],
  ];
  const rows = Array.from({ length: Math.ceil(modules.length / 2) }, (_, index) => modules.slice(index * 2, index * 2 + 2));
  return <Page><Heading eyebrow="FERRAMENTAS DA OPERAÇÃO" title="Aplicativos" detail="Um espaço para acessar as rotinas da equipe." />
    <Section title="Disponível agora" />
    <Pressable accessibilityRole="button" onPress={() => openTab("notices")} style={({ pressed }) => [s.card, { flexDirection: "row", alignItems: "center" }, pressed && s.pressed]}><View style={s.actionIcon}><Text style={s.actionIconText}>▤</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={s.strong}>Comunicados</Text><Text style={s.small}>Orientações e confirmação de leitura</Text></View><Text style={s.chevron}>›</Text></Pressable>
    <Section title="Em desenvolvimento" />
    <Text style={s.small}>Novos recursos aparecerão aqui quando estiverem prontos para uso.</Text>
    {rows.map((row, index) => <View key={index} style={{ flexDirection: "row", gap: 10 }}>{row.map(([title, detail, icon]) => <View key={title} style={[s.moduleCard, { opacity: 0.82 }]}><View style={s.moduleIcon}><Text style={s.actionIconText}>{icon}</Text></View><View style={{ gap: 5 }}><Text style={s.moduleTitle}>{title}</Text><Text style={s.moduleDetail}>{detail}</Text></View><Text style={[s.eyebrow, { fontSize: 8 }]}>PLANEJADO</Text></View>)}{row.length === 1 && <View style={{ flex: 1 }} />}</View>)}
  </Page>;
}

function ManagementScreen({ open }: { open: (tab: AdminTab) => void }) {
  return <Page><Heading eyebrow="ÁREA RESTRITA" title="Administração" detail="Gerencie os acessos e acompanhe o espaço." />
    <ActionRow title="Lojas" detail="Unidades vinculadas ao espaço" icon="⌂" onPress={() => open("stores")} />
    <ActionRow title="Pessoas e acessos" detail="Perfis, permissões e convites" icon="◉" onPress={() => open("people")} />
    <ActionRow title="Auditoria" detail="Atividades recentes do sistema" icon="◈" onPress={() => open("audit")} />
    <Card style={{ backgroundColor: C.soft }}><Text style={s.small}>◈  Alterações administrativas ficam registradas no histórico de auditoria.</Text></Card>
  </Page>;
}

function StoresScreen() {
  const app = useEO(); const [code, setCode] = useState(""); const [name, setName] = useState(""); const [region, setRegion] = useState("");
  return <Page><Card><Badge>NOVA UNIDADE</Badge><Field label="Código" value={code} onChangeText={setCode} placeholder="Ex.: 001" maxLength={20} /><Field label="Nome da loja" value={name} onChangeText={setName} placeholder="Nome da unidade" maxLength={120} /><Field label="Regional" value={region} onChangeText={setRegion} placeholder="Opcional" maxLength={120} /><Button title={app.busy ? "Salvando…" : "Cadastrar loja"} icon="＋" disabled={app.busy} onPress={async () => { const result = await app.addStore({ code, name, region }); if (result.ok) { setCode(""); setName(""); setRegion(""); } }} /></Card>
    <Section title={`Lojas cadastradas · ${app.workspace!.stores.length}`} />
    {app.workspace!.stores.map((store) => <ActionRow key={store.id} title={store.name} detail={`${store.code}${store.region ? ` · ${store.region}` : ""}`} icon="⌂" onPress={() => undefined} />)}
  </Page>;
}

function PeopleScreen({ edit }: { edit: (id: string) => void }) {
  const app = useEO(); const workspace = app.workspace!;
  const [chapa, setChapa] = useState(""); const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState<Role>("colaborador"); const [stores, setStores] = useState<string[]>([]);
  const toggleStore = (id: string) => setStores((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
  return <Page><Card><Badge>NOVO ACESSO</Badge><Text style={s.small}>Convite individual. Escolha o perfil e as lojas autorizadas.</Text>
    <Field label="Chapa" value={chapa} onChangeText={setChapa} keyboardType="number-pad" placeholder="Número da chapa" maxLength={20} />
    <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="nome@exemplo.com" maxLength={254} />
    <Field label="Nome completo" value={name} onChangeText={setName} placeholder="Nome da pessoa" maxLength={120} />
    <Text style={s.label}>Perfil</Text><View style={{ gap: 7 }}>{(["colaborador", "gerente", ...(workspace.person.master_admin ? ["diretor", "admin"] : [])] as Role[]).map((item) => <Choice key={item} label={roleLabels[item]} selected={role === item} onPress={() => setRole(item)} />)}</View>
    <Text style={s.label}>Lojas autorizadas</Text><View style={{ gap: 7 }}>{workspace.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={stores.includes(store.id)} onPress={() => toggleStore(store.id)} />)}</View>
    <Button title={app.busy ? "Enviando…" : "Enviar convite"} disabled={app.busy} onPress={async () => { const result = await app.inviteMember({ chapa, email, name, role, stores }); if (result.ok) { setChapa(""); setEmail(""); setName(""); setStores([]); setRole("colaborador"); } }} />
  </Card>
  <Section title={`Pessoas · ${app.members.length}`} />
  {app.members.map((person) => <PersonCard key={person.id} person={person} ownId={workspace.person.id} edit={() => edit(person.id)} />)}
  {workspace.person.master_admin && <MasterPassword />}
  </Page>;
}

function PersonCard({ person, ownId, edit }: { person: LivePerson; ownId: string; edit: () => void }) {
  const app = useEO();
  return <Card><View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.dark, fontWeight: "800" }}>{person.display_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.strong}>{person.display_name}</Text><Text style={s.small}>{roleLabels[person.role] || person.role} · {person.login_chapa || "Sem chapa"}</Text></View><Badge success={person.active}>{person.active ? "Ativo" : "Inativo"}</Badge></View>
    <Text style={s.small}>{!person.active ? "Acesso inativo" : person.must_change_password ? "Aguardando primeiro acesso" : "Acesso ativo"}</Text>
    {person.id !== ownId && <View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button title="Editar acesso" secondary disabled={app.busy} onPress={edit} /></View><View style={{ flex: 1 }}><Button title={person.active ? "Desativar" : "Reativar"} danger secondary disabled={app.busy} onPress={() => Alert.alert(person.active ? "Desativar acesso?" : "Reativar acesso?", person.display_name, [{ text: "Cancelar", style: "cancel" }, { text: "Confirmar", onPress: () => void app.toggleMember(person) }])} /></View></View>}
  </Card>;
}

function EditPersonScreen({ id, back }: { id: string; back: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const person = app.members.find((item) => item.id === id);
  const [name, setName] = useState(person?.display_name ?? ""); const [chapa, setChapa] = useState(person?.login_chapa ?? ""); const [role, setRole] = useState<Role>(person?.role ?? "colaborador"); const [stores, setStores] = useState<string[]>(person?.stores ?? []);
  if (!person) return <Page><Empty title="Pessoa não encontrada" detail="Atualize a lista de acessos." /><Button title="Voltar" secondary onPress={back} /></Page>;
  return <Page><Card><Heading title="Atualizar acesso" detail={person.display_name} /><Field label="Nome" value={name} onChangeText={setName} maxLength={120} /><Field label="Chapa" value={chapa} onChangeText={setChapa} keyboardType="number-pad" maxLength={20} />
    <Text style={s.label}>Perfil</Text>{(["colaborador", "gerente", ...(workspace.person.master_admin ? ["diretor", "admin"] : [])] as Role[]).map((item) => <Choice key={item} label={roleLabels[item]} selected={role === item} onPress={() => setRole(item)} />)}
    <Text style={s.label}>Lojas autorizadas</Text>{workspace.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={stores.includes(store.id)} onPress={() => setStores((old) => old.includes(store.id) ? old.filter((value) => value !== store.id) : [...old, store.id])} />)}
    <Button title={app.busy ? "Salvando…" : "Salvar alterações"} disabled={app.busy} onPress={async () => { const result = await app.saveMember(person, { name, chapa, role, stores }); if (result.ok) back(); }} />
  </Card></Page>;
}

function AuditScreen() {
  const app = useEO();
  return <Page><Card><Text style={s.strong}>◈  Atividade segura</Text><Text style={s.small}>{app.audit.length} eventos recentes registrados pelo servidor.</Text></Card>
    {app.audit.length ? app.audit.map((entry) => <AuditItem key={entry.id} entry={entry} />) : <Empty title="Sem eventos recentes" detail="As ações administrativas serão exibidas aqui." />}
  </Page>;
}
function AuditItem({ entry }: { entry: AuditRow }) {
  return <Card style={{ gap: 5 }}><Text style={s.strong}>{entry.action}</Text><Text style={s.small}>{entry.actor_name}</Text><Text style={s.small}>{new Date(entry.created_at).toLocaleString("pt-BR")}</Text></Card>;
}

function ComposeScreen() {
  const app = useEO(); const workspace = app.workspace!;
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [urgent, setUrgent] = useState(false); const [stores, setStores] = useState<string[]>([]);
  return <Page><Card><Text style={s.small}>A mensagem será enviada às equipes das lojas selecionadas.</Text><Field label="Título" value={title} onChangeText={setTitle} maxLength={120} placeholder="Resumo da orientação" /><Field label="Mensagem" value={body} onChangeText={setBody} multiline maxLength={5000} placeholder="Escreva a orientação para a equipe…" />
    <Text style={s.label}>Lojas destinatárias</Text>{workspace.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={stores.includes(store.id)} onPress={() => setStores((old) => old.includes(store.id) ? old.filter((value) => value !== store.id) : [...old, store.id])} />)}
    <Choice label="Destacar como prioritário" selected={urgent} onPress={() => setUrgent((value) => !value)} />
    <Button title={app.busy ? "Publicando…" : "Publicar comunicado"} disabled={app.busy} onPress={async () => { const result = await app.publish({ title, body, stores, urgent }); if (result.ok) { setTitle(""); setBody(""); setStores([]); setUrgent(false); } }} />
  </Card></Page>;
}

function MasterPassword() {
  const app = useEO();
  return <Card><Badge>ADMINISTRADOR MASTER</Badge><Text style={s.strong}>Acesso de segurança</Text><Text style={s.small}>Gere uma senha temporária para liberar novamente o primeiro acesso do master.</Text>
    {app.temporaryPassword ? <><Field label="Senha temporária" value={app.temporaryPassword} editable={false} selectTextOnFocus /><Button title="Copiar senha" secondary onPress={app.copyPassword} /><Button title="Guardei a senha, sair" secondary onPress={() => void app.signout()} /></> : <Button title={app.busy ? "Gerando…" : "Gerar senha temporária"} disabled={app.busy} onPress={() => void app.issueTemporaryPassword()} />}
  </Card>;
}

function ProfileScreen({ openPrivacy }: { openPrivacy: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const initials = workspace.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <Page><Card style={{ alignItems: "center", paddingVertical: 24 }}><View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.dark, fontSize: 24, fontWeight: "800" }}>{initials}</Text></View><Text style={[s.title, { fontSize: 20 }]}>{workspace.person.name}</Text><Badge>{roleLabels[workspace.person.role]}</Badge></Card>
    <Card><Text style={s.eyebrow}>SEU ACESSO</Text><Text style={s.body}>Perfil: {roleLabels[workspace.person.role]}</Text><Text style={s.body}>Lojas autorizadas: {workspace.stores.length}</Text>{workspace.stores.map((store) => <Badge key={store.id}>{store.code} · {store.name}</Badge>)}</Card>
    <Card><Text style={s.eyebrow}>AJUDA E PRIVACIDADE</Text><ActionRow title="Política de Privacidade" detail="Como seus dados são tratados" icon="◈" onPress={openPrivacy} /><ActionRow title="Suporte" detail="Ajuda e contato" icon="?" onPress={() => void Linking.openURL("mailto:mbdo.matheus@gmail.com")} /></Card>
    <Button title={app.busy ? "Saindo…" : "Sair da conta"} secondary icon="↪" disabled={app.busy} onPress={() => void app.signout()} />
    <Text style={[s.small, { textAlign: "center" }]}>Excelência Operacional · EO</Text>
  </Page>;
}

function PrivacyScreen({ back }: { back: () => void }) {
  return <Page><Brand compact /><Heading title="Política de Privacidade" detail="Última atualização: 30 de outubro de 2026" />
    <Text style={s.body}>Esta política explica como o aplicativo Excelência Operacional (EO), desenvolvido como projeto independente, trata dados pessoais. O app oferece comunicados e recursos de administração para equipes de loja. O acesso é liberado individualmente por um administrador.</Text>
    <Section title="Dados tratados" /><Text style={s.body}>Para autenticar e operar uma conta, o app trata chapa, nome e e-mail de contato, identificador da conta, perfil e lojas associadas. Também registra comunicados, confirmações de leitura e eventos de administração e segurança. A senha é gerenciada pelo Supabase e não é armazenada pelo app em texto aberto.</Text>
    <Text style={s.body}>A versão atual não solicita localização, fotos, vídeos ou gravações de áudio. Não inclui publicidade ou recursos de IA.</Text>
    <Section title="Finalidades e segurança" /><Text style={s.body}>Os dados são usados para autenticação, aplicação de permissões, apresentação de comunicados, registro de ciência e administração do acesso. São usadas conexões protegidas e controles por perfil e loja. Nenhuma medida técnica elimina todos os riscos inerentes à transmissão e ao armazenamento de informações.</Text>
    <Section title="Serviços utilizados" /><Text style={s.body}>O serviço utiliza Supabase para autenticação e dados operacionais e Vercel para hospedagem do portal e das páginas públicas. Os dados não são vendidos nem compartilhados para publicidade.</Text>
    <Section title="Direitos e solicitações" /><Text style={s.body}>Para solicitar acesso, correção ou esclarecimentos sobre seus dados, escreva para mbdo.matheus@gmail.com. Poderemos confirmar sua identidade antes de atender ao pedido.</Text>
    <Button title="Falar com suporte" secondary onPress={() => void Linking.openURL("mailto:mbdo.matheus@gmail.com")} /><Button title="Voltar ao aplicativo" icon="←" onPress={back} />
  </Page>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <Card style={{ alignItems: "center", paddingVertical: 25 }}><Text style={{ color: C.yellowStrong, fontSize: 25 }}>◈</Text><Text style={s.strong}>{title}</Text><Text style={[s.small, { textAlign: "center" }]}>{detail}</Text></Card>;
}

const roleLabels: Record<Role, string> = { colaborador: "Colaborador", gerente: "Gerente", diretor: "Diretor", admin: "Administrador" };
