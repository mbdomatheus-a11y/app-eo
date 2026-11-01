import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import * as Calendar from "expo-calendar";
import { useEO } from "./src/providers/eo-provider";
import { ActionRow, AppIcon, Badge, Brand, Button, C, Card, Choice, Field, Heading, Page, Section, s } from "./src/ui";
import type { AdminTab, AuditRow, LiveNotice, LivePerson, Role } from "./src/types";
export function LoginScreen({ openPrivacy }: { openPrivacy: () => void }) {
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

export function LoadingScreen({ configured, error }: { configured: boolean; error: string }) {
  return <View style={s.centered}><Brand compact /><Text style={s.strong}>{configured ? "Carregando seu espaço" : "Conexão em preparação"}</Text><Text style={[s.small, { textAlign: "center" }]}>{error || (configured ? "Conferindo sua sessão segura." : "A administração precisa configurar a conexão do app.")}</Text></View>;
}
export function AccessScreen() {
  const app = useEO();
  return <View style={s.centered}><Brand compact /><Heading title="Acesso em preparação" detail={app.error || "Estamos conferindo suas permissões."} /><Button title="Tentar novamente" icon="↻" onPress={() => void app.refresh()} disabled={app.loading || app.busy} /><Button title="Sair desta conta" secondary onPress={() => void app.signout()} /></View>;
}

export function ChangePasswordScreen() {
  const app = useEO(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  return <Page contentStyle={{ flexGrow: 1, justifyContent: "center" }}><Brand /><Card><Badge warning>PRIMEIRO ACESSO</Badge><Heading title="Crie sua senha pessoal" detail="A senha temporária precisa ser trocada antes de continuar." /><Field label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="Mínimo de 12 caracteres" /><Field label="Confirme a senha" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" placeholder="Digite novamente" /><Button title={app.busy ? "Salvando…" : "Salvar nova senha"} disabled={app.busy} onPress={() => void app.changeTemporaryPassword(password, confirm)} /></Card></Page>;
}

export function HomeScreen({ openTab, openNotice, openCompose }: { openTab: (tab: string) => void; openNotice: (id: string) => void; openCompose: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const pending = app.notices.filter((item) => !item.acknowledged);
  const name = workspace.person.name.trim().split(/\s+/)[0]; const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const leader = ["admin", "diretor"].includes(workspace.person.role);
  const roleSummary: Record<Role, string> = {
    colaborador: "Veja os comunicados e recursos disponíveis para você.",
    gerente: "Acompanhe as orientações da sua equipe.",
    diretor: "Consulte as informações das lojas autorizadas.",
    admin: "Acesse os recursos e controles do EO.",
  };
  const initials = workspace.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const storeContext = workspace.stores.length === 1 ? workspace.stores[0].name : `${workspace.stores.length} lojas vinculadas`;
  const focusTitle = workspace.person.role === "colaborador" ? "Sua rotina, em um só lugar." : "Sua operação, em movimento.";
  return <Page>
    <View style={s.homeHeader}>
      <View style={{ flex: 1, gap: 3 }}><Text style={s.eyebrow}>{date.toUpperCase()}</Text><Text style={s.homeGreeting}>Olá, {name}</Text><Text style={s.homeStore}>{storeContext}  ·  {roleLabels[workspace.person.role]}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => openTab("profile")} style={s.homeAvatar}><Text style={{ color: C.dark, fontSize: 15, fontWeight: "800" }}>{initials}</Text></Pressable>
    </View>
    <View style={s.homeHero}><View style={{ gap: 9 }}><Text style={s.homeHeroEyebrow}>EXCELÊNCIA OPERACIONAL  ·  EO</Text><Text style={s.homeHeroTitle}>{focusTitle}</Text><Text style={s.homeHeroDetail}>{roleSummary[workspace.person.role]}</Text></View><Text style={s.homeHeroMeta}>{workspace.stores.length} {workspace.stores.length === 1 ? "UNIDADE NO SEU ACESSO" : "UNIDADES NO SEU ACESSO"}</Text></View>
    <View style={{ flexDirection: "row", gap: 11 }}><Pressable accessibilityRole="button" accessibilityLabel={`${pending.length} comunicados para ler`} onPress={() => openTab("notices")} style={{ flex: 1 }}><Card style={[s.metricCard, { backgroundColor: C.yellow, borderColor: "#E9E2BD" }]}><Text style={s.small}>PARA ACOMPANHAR</Text><Text style={s.metricValue}>{pending.length.toString().padStart(2, "0")}</Text><Text style={[s.small, { color: C.dark, fontWeight: "800" }]}>{pending.length === 1 ? "comunicado pendente  ›" : "comunicados pendentes  ›"}</Text></Card></Pressable><Card style={s.metricCard}><Text style={s.small}>SEU PERFIL</Text><Text style={[s.strong, { fontSize: 16 }]}>{roleLabels[workspace.person.role]}</Text><Text style={s.small}>{workspace.stores.length} {workspace.stores.length === 1 ? "unidade autorizada" : "unidades autorizadas"}</Text></Card></View>
    <Section title="Acesso rápido" action="Ver tudo" onAction={() => openTab("modules")} />
    <ActionRow title="Comunicados" detail={pending.length ? `${pending.length} aguardando sua ciência` : "Você está em dia"} icon="bell.fill" onPress={() => openTab("notices")} />
    <ActionRow title="Aplicativos e rotinas" detail="Acesse as ferramentas da operação" icon="square.grid.2x2.fill" onPress={() => openTab("modules")} />
    {leader && <Button title="Criar comunicado" icon="plus" onPress={openCompose} />}
    <Section title="Recentes" action="Ver todos" onAction={() => openTab("notices")} />
    {app.notices.slice(0, 3).map((notice) => <NoticeCard key={`${notice.notice_id}-${notice.version}`} notice={notice} onPress={() => openNotice(notice.notice_id)} leader={leader} />)}
    {!app.notices.length && <Empty title="Tudo em dia" detail="Quando houver um comunicado para você, ele aparecerá aqui." />}
  </Page>;
}

export function NoticesScreen({ openNotice, openCompose }: { openNotice: (id: string) => void; openCompose: () => void }) {
  const app = useEO(); const leader = ["admin", "diretor"].includes(app.workspace!.person.role); const pending = app.notices.filter((item) => !item.acknowledged).length; const [filter, setFilter] = useState<"all" | "pending" | "read">("all");
  const visible = app.notices.filter((item) => filter === "all" || (filter === "pending" ? !item.acknowledged : item.acknowledged));
  return <Page><Text style={s.detail}>Orientações da sua operação. Confirme a ciência em cada comunicado.</Text>
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

export function NoticeScreen({ id, back }: { id: string; back: () => void }) {
  const app = useEO(); const notice = app.notices.find((item) => item.notice_id === id);
  if (!notice) return <Page><Empty title="Comunicado indisponível" detail="Atualize a lista e tente novamente." /><Button title="Voltar" secondary onPress={back} /></Page>;
  return <Page><Badge warning={notice.urgent}>{notice.urgent ? "Prioritário" : notice.category}  ·  Versão {notice.version}</Badge><Heading title={notice.title} detail={`Enviado em ${new Date(notice.published_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`} />
    <Card>{notice.body.split("\n").map((line, index) => <Text key={index} style={s.body}>{line || " "}</Text>)}</Card>
    <Card style={{ backgroundColor: C.soft }}><Text style={s.small}>◈  Sua confirmação fica registrada para este comunicado.</Text></Card>
    <Button title={notice.acknowledged ? "Ciência confirmada" : "Li e estou ciente"} icon="✓" disabled={app.busy || notice.acknowledged} onPress={() => void app.acknowledge(notice)} />
  </Page>;
}

export function ModulesScreen({ openTab }: { openTab: (tab: string) => void }) {
  const app = useEO();
  const [checklistId, setChecklistId] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [alertTitle, setAlertTitle] = useState(""); const [alertBody, setAlertBody] = useState(""); const [alertStores, setAlertStores] = useState<string[]>([]);
  const [templateTitle, setTemplateTitle] = useState(""); const [templateDescription, setTemplateDescription] = useState(""); const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState<"acceptance" | "photo" | "text" | "yes_no">("acceptance");
  const [questions, setQuestions] = useState<{ prompt: string; type: "acceptance" | "photo" | "text" | "yes_no"; required: boolean }[]>([]);
  const [checklistStores, setChecklistStores] = useState<string[]>([]);
  const [eventTitle, setEventTitle] = useState(""); const [eventNotes, setEventNotes] = useState("");
  const [eventStart, setEventStart] = useState(() => { const date = new Date(Date.now() + 60 * 60 * 1000); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; });
  const [phoneNumber, setPhoneNumber] = useState("");
  const canPublish = ["admin", "diretor", "gerente"].includes(app.workspace!.person.role);
  const activeRun = app.checklists.find((run) => run.run_id === checklistId);
  const addToCalendar = async () => {
    const match = eventStart.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!eventTitle.trim() || !match) { Alert.alert("Confira a agenda", "Informe o título e a data no formato AAAA-MM-DD HH:MM."); return; }
    const [, year, month, day, hour, minute] = match;
    const startDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (Number.isNaN(startDate.getTime()) || startDate.getMonth() !== Number(month) - 1 || startDate.getDate() !== Number(day) || startDate.getHours() !== Number(hour) || startDate.getMinutes() !== Number(minute)) { Alert.alert("Data inválida", "Confira a data e o horário digitados."); return; }
    try {
      const permission = await Calendar.requestCalendarPermissions(true);
      if (!permission.granted) { Alert.alert("Acesso à agenda", "Permita adicionar eventos à agenda nas configurações do aparelho."); return; }
      const result = await Calendar.addEventWithForm({ title: eventTitle.trim(), notes: eventNotes.trim() || undefined, startDate, endDate: new Date(startDate.getTime() + 30 * 60 * 1000) });
      if (result.action === "saved" || result.action === "done") { app.clearFeedback(); setEventTitle(""); setEventNotes(""); Alert.alert(result.action === "saved" ? "Evento salvo" : "Agenda aberta", result.action === "saved" ? "O evento foi adicionado ao calendário do aparelho." : "Confira os detalhes e conclua ou cancele no calendário do aparelho."); }
    } catch { Alert.alert("Agenda indisponível", "Atualize o aplicativo para incluir a integração com o calendário do aparelho."); }
  };
  const openPhone = async () => {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 8 || !/^[+\d\s()-]+$/.test(phoneNumber)) { Alert.alert("Número inválido", "Digite um telefone válido com DDD."); return; }
    try { await Linking.openURL(`tel:${phoneNumber.replace(/[^+\d]/g, "")}`); }
    catch { Alert.alert("Telefone indisponível", "Não foi possível abrir o aplicativo de telefone neste aparelho."); }
  };
  useEffect(() => { if (checklistId && !activeRun) setChecklistId(""); }, [checklistId, activeRun]);
  useEffect(() => { if (activeRun && app.checklistDetail?.run.id !== checklistId && !app.busy) void app.openChecklist(checklistId); }, [checklistId, activeRun, app.checklistDetail?.run.id, app.busy]);
  if (activeRun && app.checklistDetail?.run.id === checklistId) {
    const detail = app.checklistDetail;
    return <Page><Button title="Voltar para rotinas" secondary onPress={() => { setChecklistId(""); }} /><Badge warning={detail.run.status !== "completed"}>{detail.run.status === "completed" ? "Concluído" : "Em andamento"}</Badge><Heading title={detail.title} detail={detail.store_name + (detail.description ? ` · ${detail.description}` : "")} />
      {detail.items.map((item) => <Card key={item.id}><Badge>{item.required ? "Obrigatório" : "Opcional"} · {item.type === "acceptance" ? "Aceite" : item.type === "photo" ? "Foto" : item.type === "yes_no" ? "Sim ou não" : "Resposta"}</Badge><Text style={s.strong}>{item.position}. {item.prompt}</Text>
        {item.type === "acceptance" ? <Button title="Aceitar e registrar" secondary onPress={() => void app.saveChecklistAnswer(checklistId, item.id, { accepted: true })} /> : item.type === "yes_no" ? <View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button title="Sim" secondary onPress={() => void app.saveChecklistAnswer(checklistId, item.id, { value: true })} /></View><View style={{ flex: 1 }}><Button title="Não" secondary onPress={() => void app.saveChecklistAnswer(checklistId, item.id, { value: false })} /></View></View> : item.type === "photo" ? <Button title="Tirar e salvar foto" secondary onPress={() => void app.captureChecklistPhoto(checklistId, item.id)} /> : <><Field label="Sua resposta" value={draft[item.id] ?? String(item.answer?.text ?? "")} onChangeText={(value) => setDraft((old) => ({ ...old, [item.id]: value }))} multiline placeholder="Digite sua resposta" /><Button title="Salvar resposta" secondary onPress={() => void app.saveChecklistAnswer(checklistId, item.id, { text: draft[item.id] ?? "" })} /></>}
        {item.answer && <Text style={[s.small, { color: C.green }]}>✓  Resposta salva no Supabase</Text>}
      </Card>)}
    </Page>;
  }
  const modules = [
    ["Checklist", "Rotinas e padrões da loja", "checklist"], ["Cartazeamento", "Materiais de campanha", "paintbrush.fill"],
    ["Escala da equipe", "Pessoas e horários", "person.3.fill"], ["Fotos e evidências", "Registros da operação", "camera.fill"], ["Diário de vendas", "Relato de voz e resumo", "waveform"],
  ];
  return <Page><Text style={s.detail}>Alertas e rotinas da operação, com atualização em tempo real e histórico no Supabase.</Text>
    <Section title="Alertas" />
    {!app.alerts.filter((item) => !item.dismissed_at).length && <Text style={s.small}>Nenhum alerta ativo para você.</Text>}
    {app.alerts.filter((item) => !item.dismissed_at).slice(0, 5).map((alert) => <Card key={alert.id}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Badge warning={alert.urgent}>{alert.urgent ? "Prioritário" : "Alerta"}</Badge><Text style={s.small}>{new Date(alert.created_at).toLocaleDateString("pt-BR")}</Text></View><Text style={s.strong}>{alert.title}</Text><Text style={s.body}>{alert.body}</Text><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button title="Visualizar" secondary onPress={() => void app.markAlert(alert, "view")} /></View><View style={{ flex: 1 }}><Button title="Descartar" secondary onPress={() => void app.markAlert(alert, "dismiss")} /></View></View></Card>)}
    {canPublish && <Card><Badge>ENVIAR A TODAS AS PESSOAS DAS LOJAS</Badge><Field label="Título do alerta" value={alertTitle} onChangeText={setAlertTitle} placeholder="Ex.: Atenção à abertura" maxLength={120} /><Field label="Mensagem" value={alertBody} onChangeText={setAlertBody} multiline placeholder="Escreva o que a equipe precisa saber" maxLength={3000} /><Text style={s.label}>Lojas destinatárias</Text>{app.workspace!.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={alertStores.includes(store.id)} onPress={() => setAlertStores((old) => old.includes(store.id) ? old.filter((id) => id !== store.id) : [...old, store.id])} />)}<Button title="Enviar alerta" disabled={app.busy || !alertStores.length} onPress={async () => { const result = await app.publishAlert({ title: alertTitle, body: alertBody, stores: alertStores, urgent: false }); if (result.ok) { setAlertTitle(""); setAlertBody(""); } }} /></Card>}
    <Section title={`Checklists · ${app.checklists.filter((item) => item.status !== "completed").length} pendentes`} />
    {canPublish && <Card><Badge>NOVO CHECKLIST</Badge><Text style={s.strong}>Monte uma rotina para sua equipe</Text><Field label="Nome da rotina" value={templateTitle} onChangeText={setTemplateTitle} placeholder="Ex.: Abertura da loja" maxLength={120} /><Field label="Orientação" value={templateDescription} onChangeText={setTemplateDescription} placeholder="Objetivo ou instruções" multiline maxLength={1000} /><Field label="Pergunta ou etapa" value={question} onChangeText={setQuestion} placeholder="Ex.: A área está organizada?" maxLength={500} /><Text style={s.label}>Formato</Text>{([ ["acceptance", "Aceite"], ["photo", "Foto"], ["text", "Resposta aberta"], ["yes_no", "Sim ou não"] ] as const).map(([type, label]) => <Choice key={type} label={label} selected={questionType === type} onPress={() => setQuestionType(type)} />)}<Button title="Adicionar pergunta" secondary disabled={!question.trim()} onPress={() => { setQuestions((old) => [...old, { prompt: question.trim(), type: questionType, required: true }]); setQuestion(""); }} />{questions.map((item, index) => <View key={`${item.prompt}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={[s.small, { flex: 1 }]}>{index + 1}. {item.prompt}</Text><Pressable accessibilityRole="button" onPress={() => setQuestions((old) => old.filter((_, i) => i !== index))}><Text style={{ color: C.red, fontWeight: "800", padding: 8 }}>Remover</Text></Pressable></View>)}<Text style={s.label}>Lojas que receberão a rotina</Text>{app.workspace!.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={checklistStores.includes(store.id)} onPress={() => setChecklistStores((old) => old.includes(store.id) ? old.filter((id) => id !== store.id) : [...old, store.id])} />)}<Button title="Salvar e atribuir" disabled={app.busy || !questions.length || !checklistStores.length} onPress={async () => { const result = await app.publishChecklist({ title: templateTitle, description: templateDescription, items: questions, stores: checklistStores }); if (result.ok) { setTemplateTitle(""); setTemplateDescription(""); setQuestions([]); setChecklistStores([]); } }} /></Card>}
    {app.checklists.map((run) => <Pressable key={run.run_id} accessibilityRole="button" onPress={() => setChecklistId(run.run_id)} style={({ pressed }) => [s.card, pressed && s.pressed]}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Badge warning={run.status !== "completed"}>{run.status === "completed" ? "Concluído" : run.status === "in_progress" ? "Em andamento" : "Pendente"}</Badge><Text style={s.small}>{run.answered_count}/{run.item_count}</Text></View><Text style={s.strong}>{run.title}</Text><Text style={s.small}>{run.store_name} · Atualizado {new Date(run.updated_at).toLocaleDateString("pt-BR")}</Text><Text style={{ color: C.dark, fontSize: 12, fontWeight: "800" }}>Abrir rotina  ›</Text></Pressable>)}
    {!app.checklists.length && <Card><Text style={s.strong}>Sua lista de rotinas está vazia</Text><Text style={s.small}>Quando um checklist for atribuído à sua loja, ele aparecerá aqui com o estágio de andamento.</Text></Card>}
    <Section title="Notificações" /><Card><Text style={s.strong}>Preferência de som</Text><Text style={s.small}>Esta preferência não desativa o banner nem o push. A entrega push ainda depende da configuração do projeto Expo; permissões do sistema são controladas nas configurações do aparelho.</Text><Button title={app.soundEnabled ? "Silenciar som" : "Ativar som"} secondary onPress={() => void app.setSoundEnabled(!app.soundEnabled)} />{app.workspace!.person.role === "admin" && <><Text style={s.small}>O teste vai somente para seus aparelhos registrados, sem notificar as lojas.</Text><Button title="Enviar teste para meus aparelhos" secondary disabled={app.busy} onPress={() => void app.sendTestPush()} /></>}</Card>
    <Section title="Agenda do aparelho" /><Card><Text style={s.small}>Crie um lembrete no calendário do iPhone ou Android. O sistema mostra os detalhes antes de salvar.</Text><Field label="Título" value={eventTitle} onChangeText={setEventTitle} placeholder="Ex.: Reunião de abertura" maxLength={120} /><Field label="Data e hora local · AAAA-MM-DD HH:MM" value={eventStart} onChangeText={setEventStart} placeholder="2026-11-01 09:00" maxLength={16} /><Field label="Observações" value={eventNotes} onChangeText={setEventNotes} placeholder="Opcional" multiline maxLength={500} /><Button title="Adicionar à agenda" secondary onPress={() => void addToCalendar()} /></Card>
    <Section title="Ligar pelo aparelho" /><Card><Text style={s.small}>O EO abre o aplicativo de telefone com o número preenchido. Você confirma a ligação no sistema.</Text><Field label="Telefone com DDD" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" placeholder="(11) 3333-4444" maxLength={20} /><Button title="Abrir aplicativo Telefone" secondary onPress={() => void openPhone()} /></Card>
    <Section title="Aplicativos" />
    <Section title="Disponível agora" />
    <Pressable accessibilityRole="button" onPress={() => openTab("notices")} style={({ pressed }) => [s.card, { flexDirection: "row", alignItems: "center" }, pressed && s.pressed]}><View style={s.actionIcon}><AppIcon name="bell.fill" size={20} color={C.dark} /></View><View style={{ flex: 1, gap: 4 }}><Text style={s.strong}>Comunicados</Text><Text style={s.small}>Orientações e confirmação de leitura</Text></View><Text style={s.chevron}>›</Text></Pressable>
    <Section title="Próximas ferramentas" />
    <Text style={s.small}>Novos recursos serão liberados aqui à medida que ficarem prontos.</Text>
    {modules.map(([title, detail, icon]) => <View key={title} style={s.actionRow}><View style={[s.actionIcon, { backgroundColor: C.sand }]}><AppIcon name={icon} size={20} color={C.dark} /></View><View style={s.actionCopy}><Text style={s.actionTitle}>{title}</Text><Text style={s.actionDetail}>{detail}</Text></View><Badge>Em breve</Badge></View>)}
  </Page>;
}

export function ManagementScreen({ open }: { open: (tab: AdminTab) => void }) {
  return <Page><Text style={s.detail}>Administre o acesso e acompanhe as atividades da plataforma.</Text>
    <ActionRow title="Lojas" detail="Unidades vinculadas ao espaço" icon="house.fill" onPress={() => open("stores")} />
    <ActionRow title="Pessoas e acessos" detail="Perfis, permissões e convites" icon="person.2.fill" onPress={() => open("people")} />
    <ActionRow title="Auditoria" detail="Atividades recentes do sistema" icon="checkmark.shield.fill" onPress={() => open("audit")} />
    <Card style={{ backgroundColor: C.soft }}><Text style={s.small}>◈  Alterações administrativas ficam registradas no histórico de auditoria.</Text></Card>
  </Page>;
}

export function StoresScreen() {
  const app = useEO(); const [code, setCode] = useState(""); const [name, setName] = useState(""); const [region, setRegion] = useState("");
  return <Page><Card><Badge>NOVA UNIDADE</Badge><Field label="Código" value={code} onChangeText={setCode} placeholder="Ex.: 001" maxLength={20} /><Field label="Nome da loja" value={name} onChangeText={setName} placeholder="Nome da unidade" maxLength={120} /><Field label="Regional" value={region} onChangeText={setRegion} placeholder="Opcional" maxLength={120} /><Button title={app.busy ? "Salvando…" : "Cadastrar loja"} icon="＋" disabled={app.busy} onPress={async () => { const result = await app.addStore({ code, name, region }); if (result.ok) { setCode(""); setName(""); setRegion(""); } }} /></Card>
    <Section title={`Lojas cadastradas · ${app.workspace!.stores.length}`} />
    {app.workspace!.stores.map((store) => <ActionRow key={store.id} title={store.name} detail={`${store.code}${store.region ? ` · ${store.region}` : ""}`} icon="house.fill" onPress={() => undefined} />)}
  </Page>;
}

export function PeopleScreen({ edit }: { edit: (id: string) => void }) {
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

export function EditPersonScreen({ id, back }: { id: string; back: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const person = app.members.find((item) => item.id === id);
  const [name, setName] = useState(person?.display_name ?? ""); const [chapa, setChapa] = useState(person?.login_chapa ?? ""); const [role, setRole] = useState<Role>(person?.role ?? "colaborador"); const [stores, setStores] = useState<string[]>(person?.stores ?? []);
  if (!person) return <Page><Empty title="Pessoa não encontrada" detail="Atualize a lista de acessos." /><Button title="Voltar" secondary onPress={back} /></Page>;
  return <Page><Card><Heading title="Atualizar acesso" detail={person.display_name} /><Field label="Nome" value={name} onChangeText={setName} maxLength={120} /><Field label="Chapa" value={chapa} onChangeText={setChapa} keyboardType="number-pad" maxLength={20} />
    <Text style={s.label}>Perfil</Text>{(["colaborador", "gerente", ...(workspace.person.master_admin ? ["diretor", "admin"] : [])] as Role[]).map((item) => <Choice key={item} label={roleLabels[item]} selected={role === item} onPress={() => setRole(item)} />)}
    <Text style={s.label}>Lojas autorizadas</Text>{workspace.stores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={stores.includes(store.id)} onPress={() => setStores((old) => old.includes(store.id) ? old.filter((value) => value !== store.id) : [...old, store.id])} />)}
    <Button title={app.busy ? "Salvando…" : "Salvar alterações"} disabled={app.busy} onPress={async () => { const result = await app.saveMember(person, { name, chapa, role, stores }); if (result.ok) back(); }} />
  </Card></Page>;
}

export function AuditScreen() {
  const app = useEO();
  return <Page><Card><Text style={s.strong}>◈  Atividade segura</Text><Text style={s.small}>{app.audit.length} eventos recentes registrados pelo servidor.</Text></Card>
    {app.audit.length ? app.audit.map((entry) => <AuditItem key={entry.id} entry={entry} />) : <Empty title="Sem eventos recentes" detail="As ações administrativas serão exibidas aqui." />}
  </Page>;
}
function AuditItem({ entry }: { entry: AuditRow }) {
  return <Card style={{ gap: 5 }}><Text style={s.strong}>{entry.action}</Text><Text style={s.small}>{entry.actor_name}</Text><Text style={s.small}>{new Date(entry.created_at).toLocaleString("pt-BR")}</Text></Card>;
}

export function ComposeScreen() {
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

export function ProfileScreen({ openPrivacy }: { openPrivacy: () => void }) {
  const app = useEO(); const workspace = app.workspace!; const initials = workspace.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <Page><Card style={{ alignItems: "center", paddingVertical: 24 }}><View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.dark, fontSize: 24, fontWeight: "800" }}>{initials}</Text></View><Text style={[s.title, { fontSize: 20 }]}>{workspace.person.name}</Text><Badge>{roleLabels[workspace.person.role]}</Badge></Card>
    <Card><Text style={s.eyebrow}>SEU ACESSO</Text><Text style={s.body}>Perfil: {roleLabels[workspace.person.role]}</Text><Text style={s.body}>Lojas autorizadas: {workspace.stores.length}</Text>{workspace.stores.map((store) => <Badge key={store.id}>{store.code} · {store.name}</Badge>)}</Card>
    <Card><Text style={s.eyebrow}>AJUDA E PRIVACIDADE</Text><ActionRow title="Política de Privacidade" detail="Como seus dados são tratados" icon="lock.fill" onPress={openPrivacy} /><ActionRow title="Suporte" detail="Ajuda e contato" icon="questionmark.circle.fill" onPress={() => void Linking.openURL("mailto:mbdo.matheus@gmail.com")} /></Card>
    <Button title={app.busy ? "Saindo…" : "Sair da conta"} secondary icon="↪" disabled={app.busy} onPress={() => void app.signout()} />
    <Text style={[s.small, { textAlign: "center" }]}>Excelência Operacional · EO</Text>
  </Page>;
}

export function PrivacyScreen({ back }: { back: () => void }) {
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
