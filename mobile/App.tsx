import { EmailField } from "./src/features/EmailField";
import { CalendarAction } from "./src/features/CalendarAction";
import { PersonalSettings } from "./src/features/PersonalSettings";
import { ChecklistLocation } from "./src/features/ChecklistLocation";
import {
  CommunicationTargets,
  NoticeEngagement,
  ScheduledMessages,
  CommunicationInbox,
} from "./src/features/Communications";
import { IdentityPreferences } from "./src/features/IdentityPreferences";
import { rpc } from "./src/services/supabase";
import {
  ScreenTitle,
  IconButton,
  Group,
  MenuItem,
  Tile,
  d,
} from "./src/design";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { useDeviceSecurity } from "./src/providers/device-security";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { storePasswordRules } from "./src/features/store-access";
import { useEO } from "./src/providers/eo-provider";
import {
  ActionRow,
  AppIcon,
  Badge,
  Brand,
  Button,
  C,
  Card,
  Choice,
  Field,
  Heading,
  Page,
  Section,
  StorePicker,
  s,
} from "./src/ui";
import type {
  ChecklistRun,
  AdminTab,
  AuditRow,
  LiveNotice,
  LivePerson,
  Role,
  Store,
} from "./src/types";
export function LoginScreen({ openPrivacy }: { openPrivacy: () => void }) {
  const app = useEO();
  const [chapa, setChapa] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    void SecureStore.getItemAsync("eo.saved-chapa")
      .then((value) => {
        if (value) setChapa(value);
      })
      .catch(() => {});
  }, []);
  const login = async () => {
    const result = await app.login(chapa, password);
    if (result.ok) {
      setPassword("");
      if (remember)
        await SecureStore.setItemAsync("eo.saved-chapa", chapa.trim());
      else await SecureStore.deleteItemAsync("eo.saved-chapa");
    }
  };
  return (
    <Page
      contentStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 23,
        paddingTop: 26,
        paddingBottom: 28,
        gap: 19,
      }}
    >
      <View style={{ gap: 25 }}>
        <Brand large />
        <View style={{ gap: 9 }}>
          <Badge warning>PLATAFORMA EO</Badge>
          <Text style={s.title}>
            Sua loja,{"\n"}
            <Text style={{ color: C.dark }}>em sintonia.</Text>
          </Text>
          <Text style={s.detail}>
            Comunicados, rotinas e ferramentas da equipe em um único espaço.
          </Text>
        </View>
      </View>
      <Card style={{ padding: 20, gap: 15, borderRadius: 22 }}>
        <View>
          <Text style={s.strong}>Acesse sua conta</Text>
          <Text style={[s.small, { marginTop: 5 }]}>
            Entre com sua chapa ou com o usuário da loja (ex.: ger006).
          </Text>
        </View>
        <Field
          label="Chapa ou usuário da loja"
          value={chapa}
          onChangeText={setChapa}
          maxLength={40}
          placeholder="Chapa ou ger006"
          autoComplete="username"
          textContentType="username"
          autoCapitalize="none"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Sua senha"
        />
        <Button
          title="Esqueci a senha"
          secondary
          disabled={app.busy}
          onPress={() => void app.requestStoreReset(chapa)}
        />
        <Choice
          label="Lembrar meu acesso neste aparelho"
          selected={remember}
          onPress={() => setRemember(!remember)}
        />
        <Text style={s.small}>
          Use o preenchimento de senhas do aparelho. Sua sessão fica salva com
          segurança; ative Face ID no Perfil após entrar.
        </Text>
        <Button
          title={app.busy ? "Entrando…" : "Entrar no EO"}
          icon="→"
          disabled={app.busy}
          onPress={() => void login()}
        />
        {app.busy && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <ActivityIndicator color={C.dark} />
            <Text style={s.small}>Conferindo seu acesso…</Text>
          </View>
        )}
        <Text style={[s.small, { textAlign: "center" }]}>
          Precisa de acesso ou redefinir a senha? Fale com a administração.
        </Text>
      </Card>
      <Pressable
        onPress={openPrivacy}
        style={{ alignSelf: "center", padding: 8 }}
      >
        <Text style={{ color: C.dark, fontWeight: "800", fontSize: 12 }}>
          Privacidade e suporte ›
        </Text>
      </Pressable>
      <Text style={[s.small, { textAlign: "center" }]}>
        Acesso individual protegido · Excelência Operacional
      </Text>
    </Page>
  );
}

export function LoadingScreen({
  configured,
  error,
}: {
  configured: boolean;
  error: string;
}) {
  return (
    <View style={s.centered}>
      <Brand large />
      {configured && !error ? <ActivityIndicator size="large" color={C.dark} style={{ marginTop: 18 }} /> : null}
      <Text style={s.strong}>
        {configured ? "Carregando seu espaço" : "Conexão em preparação"}
      </Text>
      <Text style={[s.small, { textAlign: "center" }]}>
        {error ||
          (configured
            ? "Conferindo sua sessão segura."
            : "A administração precisa configurar a conexão do app.")}
      </Text>
    </View>
  );
}
export function AccessScreen() {
  const app = useEO();
  return (
    <View style={s.centered}>
      <Brand compact />
      <Heading
        title="Acesso em preparação"
        detail={app.error || "Estamos conferindo suas permissões."}
      />
      <Button
        title="Tentar novamente"
        icon="↻"
        onPress={() => void app.refresh()}
        disabled={app.loading || app.busy}
      />
      <Button
        title="Sair desta conta"
        secondary
        onPress={() => void app.signout()}
      />
    </View>
  );
}

export function ChangePasswordScreen() {
  const app = useEO();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const loja = app.storeUser;
  return (
    <Page contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <Brand />
      <Card>
        <Badge warning>PRIMEIRO ACESSO</Badge>
        <Heading
          title={loja ? `Crie a senha da loja (${loja})` : "Crie sua senha pessoal"}
          detail={loja ? "Troque a senha padrão para continuar." : "A senha temporária precisa ser trocada antes de continuar."}
        />
        {loja && !app.hasLoginPassword && (
          <Field
            label="Senha atual (padrão)"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Senha padrão da loja"
          />
        )}
        <Field
          label="Nova senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Mínimo de 12 caracteres"
        />
        {loja &&
          storePasswordRules(loja, password).map((r) => {
            const ok = password.length > 0 && r.ok;
            const cor = ok ? C.green : password.length ? C.red : C.lightMuted;
            return (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityLabel={`${r.label}: ${ok ? "atendido" : "pendente"}`}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cor }} />
                <Text style={[s.small, { color: ok ? C.green : C.muted }]}>{r.label}</Text>
              </View>
            );
          })}
        <Field
          label="Confirme a senha"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Digite novamente"
        />
        <Button
          title={app.busy ? "Salvando…" : "Salvar nova senha"}
          disabled={app.busy}
          onPress={() => void app.changeTemporaryPassword(password, confirm, current)}
        />
      </Card>
    </Page>
  );
}

export function HomeScreen({
  openTab,
  openNotice,
  openCompose,
}: {
  openTab: (tab: string) => void;
  openNotice: (id: string) => void;
  openCompose: () => void;
}) {
  const app = useEO();
  const workspace = app.workspace!;
  const name = workspace.person.name.trim().split(/\s+/)[0];
  const pending = app.notices.filter((item) => !item.acknowledged).length;
  const routines = app.checklists.filter(
    (item) => item.status !== "completed",
  ).length;
  const complete =
    app.checklists.filter((item) => item.status === "completed").length +
    app.notices.filter((item) => item.acknowledged).length;
  const total = app.checklists.length + app.notices.length;
  const progress = total ? Math.round((complete / total) * 100) : 100;
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date());
  const leader = ["admin", "diretor"].includes(workspace.person.role);
  return (
    <Page>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Brand compact />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <IconButton
            icon="bell.fill"
            label="Abrir avisos pendentes"
            badge={pending}
            onPress={() => openTab("notices")}
          />
          <IconButton
            icon="person.crop.circle.fill"
            label="Abrir perfil"
            onPress={() => openTab("profile")}
          />
        </View>
      </View>
      <View style={{ gap: 5, paddingBottom: 3 }}>
        <Text style={{ color: C.muted, fontSize: 13 }}>{date}</Text>
        <Text
          style={{
            color: C.ink,
            fontSize: 32,
            fontWeight: "800",
            letterSpacing: -1,
          }}
        >
          Olá, {name}.
        </Text>
        <Text style={s.detail}>Vamos cuidar da sua operação.</Text>
      </View>
      <Section title="Vendas e equipe" />
      <Group>
        <MenuItem
          title="Acompanhar vendas"
          detail="Semana, mês e ano"
          icon="chart.bar.fill"
          tint="#E8F4ED"
          color="#1C985A"
          onPress={() => router.push("/sales" as never)}
        />
        <MenuItem
          title="Registrar meu dia"
          detail="Motivos, relato e áudio"
          icon="mic.fill"
          tint="#FFF0E4"
          color="#C9772A"
          onPress={() => router.push("/diary" as never)}
        />
        <MenuItem
          title="Como está seu dia?"
          detail="Compartilhe seu momento"
          icon="face.smiling"
          tint="#FFF4D8"
          color="#A2862F"
          last
          onPress={() => router.push("/mood" as never)}
        />
      </Group>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir minhas pendências"
        onPress={() =>
          routines ? router.push("/checklists" as never) : openTab("notices")
        }
        style={({ pressed }) => [d.summary, pressed && d.pressed]}
      >
        <View style={d.summaryTop}>
          <Text style={d.summaryEyebrow}>Seu dia em foco</Text>
          <View style={d.summaryBadge}>
            <Text style={d.summaryBadgeText}>{progress}% em dia</Text>
          </View>
        </View>
        <View>
          <Text style={d.summaryValue}>
            {String(pending + routines).padStart(2, "0")}
          </Text>
          <Text style={d.summaryCaption}>
            pendências entre os itens carregados
          </Text>
        </View>
        <View style={d.progressTrack}>
          <View style={[d.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={d.summaryStats}>
          <View style={d.stat}>
            <Text style={d.statValue}>{pending}</Text>
            <Text style={d.statLabel}>avisos para ler</Text>
          </View>
          <View style={d.stat}>
            <Text style={d.statValue}>{routines}</Text>
            <Text style={d.statLabel}>rotinas abertas</Text>
          </View>
          <View style={d.stat}>
            <Text style={d.statValue}>{workspace.stores.length}</Text>
            <Text style={d.statLabel}>lojas no acesso</Text>
          </View>
        </View>
      </Pressable>
      <Section
        title="Acesso rápido"
        action="Explorar"
        onAction={() => openTab("modules")}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Tile
          title="Minha rotina"
          detail="Checklists e evidências"
          icon="checklist"
          tint="#ECF2FF"
          color="#4C73BC"
          onPress={() => router.push("/checklists" as never)}
        />
        <Tile
          title="Comunicados"
          detail={
            pending ? `${pending} aguardando leitura` : "Sua caixa está em dia"
          }
          icon="doc.text.fill"
          tint="#F7F1D7"
          color="#9C873D"
          onPress={() => openTab("notices")}
        />
      </View>
      {leader && (
        <Group>
          <MenuItem
            title="Novo comunicado"
            detail="Conecte e oriente a sua equipe"
            icon="plus"
            color="#597659"
            tint="#EAF3E9"
            last
            onPress={openCompose}
          />
        </Group>
      )}
      <Section
        title="Últimos avisos"
        action="Ver todos"
        onAction={() => openTab("notices")}
      />
      <Group>
        {app.notices.slice(0, 3).map((notice, index, list) => (
          <Pressable
            key={`${notice.notice_id}-${notice.version}`}
            accessibilityRole="button"
            onPress={() => openNotice(notice.notice_id)}
            style={({ pressed }) => [
              d.feedItem,
              index < list.length - 1 && {
                borderBottomWidth: 0.5,
                borderBottomColor: "#E8E9ED",
              },
              pressed && d.pressed,
            ]}
          >
            <View
              style={[
                d.feedIcon,
                notice.acknowledged && { backgroundColor: "#ECF4EF" },
              ]}
            >
              <AppIcon
                name={
                  notice.acknowledged ? "checkmark.circle.fill" : "bell.fill"
                }
                size={21}
                color={notice.acknowledged ? C.green : "#99843C"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={d.feedTitle} numberOfLines={2}>
                {notice.title}
              </Text>
              <Text style={d.feedMeta}>
                {notice.acknowledged
                  ? "Ciência confirmada"
                  : "Aguardando sua ciência"}{" "}
                ·{" "}
                {new Date(notice.published_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                })}
              </Text>
            </View>
            <AppIcon name="chevron.right" color="#AFB1B8" size={13} />
          </Pressable>
        ))}
        {!app.notices.length && (
          <View style={{ padding: 22 }}>
            <Text style={s.strong}>Tudo tranquilo por aqui.</Text>
            <Text style={[s.small, { marginTop: 6 }]}>
              Os novos comunicados aparecerão neste espaço.
            </Text>
          </View>
        )}
      </Group>
    </Page>
  );
}

export function NoticesScreen({
  openNotice,
  openCompose,
}: {
  openNotice: (id: string) => void;
  openCompose: () => void;
}) {
  const app = useEO();
  const leader = ["admin", "diretor"].includes(app.workspace!.person.role);
  const pending = app.notices.filter((item) => !item.acknowledged).length;
  const [filter, setFilter] = useState<"all" | "pending" | "read">("all");
  const visible = app.notices.filter(
    (item) =>
      filter === "all" ||
      (filter === "pending" ? !item.acknowledged : item.acknowledged),
  );
  return (
    <Page>
      <ScreenTitle
        title="Avisos"
        subtitle="Sua equipe, sempre em sintonia."
        action={
          leader ? (
            <IconButton
              icon="plus"
              label="Novo comunicado"
              onPress={openCompose}
            />
          ) : undefined
        }
      />
      <CommunicationInbox openNotice={openNotice} />
      <View style={d.filterTrack}>
        {(
          [
            ["all", "Todos"],
            ["pending", `Pendentes ${pending}`],
            ["read", "Com ciência"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            onPress={() => setFilter(value)}
            style={[d.filter, filter === value && d.filterActive]}
          >
            <Text
              numberOfLines={1}
              style={[d.filterText, filter === value && d.filterTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.small}>
        {visible.length} {visible.length === 1 ? "comunicado" : "comunicados"}{" "}
        {filter === "pending"
          ? "aguardando ciência"
          : filter === "read"
            ? "com ciência confirmada"
            : "no seu espaço"}
      </Text>
      {visible.map((notice) => (
        <NoticeCard
          key={`${notice.notice_id}-${notice.version}`}
          notice={notice}
          onPress={() => openNotice(notice.notice_id)}
          leader={leader}
        />
      ))}
      {!visible.length && (
        <Empty
          title={
            filter === "pending"
              ? "Nenhuma ciência pendente"
              : filter === "read"
                ? "Ainda sem confirmações"
                : "Nenhum comunicado"
          }
          detail={
            filter === "pending"
              ? "Você não tem comunicados pendentes."
              : "As orientações destinadas a você aparecerão aqui."
          }
        />
      )}
      {app.more && (
        <Button
          title={app.busy ? "Carregando…" : "Carregar mais"}
          secondary
          disabled={app.busy}
          onPress={() => void app.loadMore()}
        />
      )}
    </Page>
  );
}

function NoticeCard({
  notice,
  onPress,
  leader,
}: {
  notice: LiveNotice;
  onPress: () => void;
  leader: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, { gap: 10 }, pressed && s.pressed]}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Badge warning={notice.urgent}>
          {notice.urgent ? "Prioritário" : notice.category}
        </Badge>
        <Text style={s.small}>
          {new Date(notice.published_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          })}
        </Text>
      </View>
      <Text style={s.strong}>{notice.title}</Text>
      <Text style={s.small} numberOfLines={2}>
        {notice.body}
      </Text>
      <View style={s.divider} />
      <Text
        style={{
          color: notice.acknowledged ? C.green : C.muted,
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        {notice.acknowledged
          ? "✓  Ciência confirmada"
          : "○  Aguardando sua ciência"}
        {leader
          ? `   ·   ${notice.receipt_count}/${notice.eligible_count}`
          : ""}
      </Text>
    </Pressable>
  );
}

export function NoticeScreen({ id, back }: { id: string; back: () => void }) {
  const app = useEO();
  const [loaded, setLoaded] = useState<LiveNotice | null>(null);
  const notice = app.notices.find((item) => item.notice_id === id) ?? loaded;
  useEffect(() => {
    if (!app.notices.some((item) => item.notice_id === id))
      void rpc<LiveNotice | null>("eo_notice_get", { p_notice: id })
        .then(setLoaded)
        .catch((e: Error) => Alert.alert("Comunicado indisponível", e.message));
  }, [id]);
  if (!notice)
    return (
      <Page>
        <Empty
          title="Comunicado indisponível"
          detail="Atualize a lista e tente novamente."
        />
        <Button title="Voltar" secondary onPress={back} />
      </Page>
    );
  return (
    <Page>
      <Badge warning={notice.urgent}>
        {notice.urgent ? "Prioritário" : notice.category} · Versão{" "}
        {notice.version}
      </Badge>
      <Heading
        title={notice.title}
        detail={`Enviado em ${new Date(notice.published_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`}
      />
      <Card>
        {notice.body.split("\n").map((line, index) => (
          <Text key={index} style={s.body}>
            {line || " "}
          </Text>
        ))}
      </Card>
      {!!notice.attachments?.length && (
        <Card>
          <Text style={s.strong}>Arquivos anexados</Text>
          {notice.attachments.map((file) => (
            <Button
              key={file.id}
              title={file.file_name}
              secondary
              onPress={() =>
                void app
                  .openMessageAttachment(file)
                  .catch((error) =>
                    Alert.alert("Anexo indisponível", error.message),
                  )
              }
            />
          ))}
        </Card>
      )}
      <NoticeEngagement
        title={notice.title}
        body={notice.body}
        notice={notice.notice_id}
        version={notice.version}
        admin={app.workspace?.person.role === "admin"}
      />
      <Card style={{ backgroundColor: C.soft }}>
        <Text style={s.small}>
          ◈ Sua confirmação fica registrada para este comunicado.
        </Text>
      </Card>
      <Button
        title={notice.acknowledged ? "Ciência confirmada" : "Li e estou ciente"}
        icon="✓"
        disabled={app.busy || notice.acknowledged}
        onPress={() =>
          void app.acknowledge(notice).then((result) => {
            if (result.ok) setLoaded({ ...notice, acknowledged: true });
          })
        }
      />
      {app.workspace?.person.role === "admin" && (
        <Button
          title="Excluir da equipe e manter histórico"
          danger
          disabled={app.busy}
          onPress={() =>
            Alert.alert(
              "Excluir comunicado da equipe?",
              "O conteúdo e a auditoria permanecerão no arquivo administrativo.",
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Excluir da equipe",
                  style: "destructive",
                  onPress: () => {
                    void app
                      .archiveMessage("notice", notice.notice_id, true)
                      .then((result) => {
                        if (result.ok) back();
                      });
                  },
                },
              ],
            )
          }
        />
      )}
    </Page>
  );
}

export function ModulesScreen({
  openTab,
  mode = "checklists",
  initialRun,
}: {
  openTab: (tab: string) => void;
  mode?: "checklists" | "alerts";
  initialRun?: string;
}) {
  const app = useEO();
  const [checklistId, setChecklistId] = useState("");
  const attemptedInitialRun = useRef<string | null>(null);
  const [selectedChecklist, setSelectedChecklist] =
    useState<ChecklistRun | null>(null);
  const [checklistPage, setChecklistPage] = useState(0);
  const [checklistQuery, setChecklistQuery] = useState("");
  const [checklistStatus, setChecklistStatus] = useState("");
  const [checklistFeed, setChecklistFeed] = useState<{
    items: ChecklistRun[];
    total: number;
  }>({ items: [], total: 0 });
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedRetry, setFeedRetry] = useState(0);
  const feedGeneration = useRef(0);
  useEffect(() => {
    if (mode !== "checklists" || !app.workspace) return;
    const current = ++feedGeneration.current;
    setFeedLoading(true);
    setFeedError("");
    const timer = setTimeout(() => {
      void rpc<{ items: ChecklistRun[]; total: number }>(
        "eo_checklist_feed_page",
        {
          p_limit: 30,
          p_offset: checklistPage * 30,
          p_query: checklistQuery,
          p_status: checklistStatus,
        },
      )
        .then((data) => {
          if (current === feedGeneration.current) setChecklistFeed(data);
        })
        .catch((cause) => {
          if (current === feedGeneration.current)
            setFeedError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar os checklists.",
            );
        })
        .finally(() => {
          if (current === feedGeneration.current) setFeedLoading(false);
        });
    }, 180);
    return () => {
      feedGeneration.current++;
      clearTimeout(timer);
    };
  }, [
    mode,
    app.workspace?.person.id,
    app.checklists,
    checklistPage,
    checklistQuery,
    checklistStatus,
    feedRetry,
  ]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [alertTitle, setAlertTitle] = useState("");
  const [alertBody, setAlertBody] = useState("");
  const [alertStores, setAlertStores] = useState<string[]>([]);
  const [alertTarget, setAlertTarget] = useState<"all" | "region" | "stores">(
    "all",
  );
  const [alertRegion, setAlertRegion] = useState("");
  const [alertSchedule, setAlertSchedule] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState<
    "acceptance" | "photo" | "text" | "yes_no"
  >("acceptance");
  const [questions, setQuestions] = useState<
    {
      prompt: string;
      type: "acceptance" | "photo" | "text" | "yes_no";
      required: boolean;
    }[]
  >([]);
  const [checklistStores, setChecklistStores] = useState<string[]>([]);
  const canPublish = ["admin", "diretor", "gerente"].includes(
    app.workspace!.person.role,
  );
  const availableRegions = [
    ...new Set(
      app.workspace!.stores.map((store) => store.region.trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const alertRecipientStores =
    alertTarget === "all"
      ? app.workspace!.stores.map((store) => store.id)
      : alertTarget === "region"
        ? app
            .workspace!.stores.filter((store) => store.region === alertRegion)
            .map((store) => store.id)
        : alertStores;
  useEffect(() => {
    if (!initialRun) return;
    const detail = app.checklistDetail;
    if (detail?.run.id !== initialRun) {
      if (attemptedInitialRun.current !== initialRun) {
        attemptedInitialRun.current = initialRun;
        void app.openChecklist(initialRun);
      }
      return;
    }
    setSelectedChecklist({
      run_id: detail.run.id,
      status: detail.run.status as ChecklistRun["status"],
      assigned_at: detail.run.assigned_at,
      updated_at: detail.run.updated_at,
      store_id: detail.run.store_id,
      store_name: detail.store_name,
      template_id: detail.run.template_id,
      title: detail.title,
      description: detail.description,
      item_count: detail.items.length,
      answered_count: detail.items.filter((item) => item.answer !== null)
        .length,
    });
    setChecklistId(initialRun);
  }, [initialRun, app.checklistDetail]);
  const activeRun =
    selectedChecklist?.run_id === checklistId
      ? selectedChecklist
      : checklistFeed.items.find((run) => run.run_id === checklistId);
  useEffect(() => {
    if (checklistId && !activeRun && checklistId !== initialRun)
      setChecklistId("");
  }, [checklistId, activeRun]);
  useEffect(() => {
    if (activeRun && app.checklistDetail?.run.id !== checklistId && !app.busy)
      void app.openChecklist(checklistId);
  }, [checklistId, activeRun, app.checklistDetail?.run.id, app.busy]);
  if (activeRun && app.checklistDetail?.run.id === checklistId) {
    const detail = app.checklistDetail;
    return (
      <Page>
        <Button
          title="Voltar para rotinas"
          secondary
          onPress={() => {
            setChecklistId("");
          }}
        />
        <Badge warning={detail.run.status !== "completed"}>
          {detail.run.status === "completed" ? "Concluído" : "Em andamento"}
        </Badge>
        <Heading
          title={detail.title}
          detail={
            detail.store_name +
            (detail.description ? ` · ${detail.description}` : "")
          }
        />
        <CalendarAction
          title={`Checklist: ${detail.title}`}
          description={`${detail.store_name}\n${detail.description}`}
        />
        <ChecklistLocation runId={checklistId} />
        {detail.items.map((item) => (
          <Card key={item.id}>
            <Badge>
              {item.required ? "Obrigatório" : "Opcional"} ·{" "}
              {item.type === "acceptance"
                ? "Aceite"
                : item.type === "photo"
                  ? "Foto"
                  : item.type === "yes_no"
                    ? "Sim ou não"
                    : "Resposta"}
            </Badge>
            <Text style={s.strong}>
              {item.position}. {item.prompt}
            </Text>
            {item.type === "acceptance" ? (
              <Button
                title="Aceitar e registrar"
                secondary
                onPress={() =>
                  void app.saveChecklistAnswer(checklistId, item.id, {
                    accepted: true,
                  })
                }
              />
            ) : item.type === "yes_no" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Sim"
                    secondary
                    onPress={() =>
                      void app.saveChecklistAnswer(checklistId, item.id, {
                        value: true,
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Não"
                    secondary
                    onPress={() =>
                      void app.saveChecklistAnswer(checklistId, item.id, {
                        value: false,
                      })
                    }
                  />
                </View>
              </View>
            ) : item.type === "photo" ? (
              <Button
                title="Tirar e salvar foto"
                secondary
                onPress={() =>
                  void app.captureChecklistPhoto(checklistId, item.id)
                }
              />
            ) : (
              <>
                <Field
                  label="Sua resposta"
                  value={draft[item.id] ?? String(item.answer?.text ?? "")}
                  onChangeText={(value) =>
                    setDraft((old) => ({ ...old, [item.id]: value }))
                  }
                  multiline={item.type === "text" || item.type === "long_text"}
                  maxLength={
                    item.max_length ?? (item.type === "short_text" ? 280 : 4000)
                  }
                  keyboardType={
                    item.type === "number"
                      ? "decimal-pad"
                      : item.type === "phone"
                        ? "phone-pad"
                        : "default"
                  }
                  placeholder={
                    item.type === "time" ? "HH:MM" : "Digite sua resposta"
                  }
                />
                <Text style={s.small}>
                  Limite: {item.min_length ?? 0} a {item.max_length ?? 4000}{" "}
                  caracteres
                  {item.answer?.moderation_flag === true
                    ? " · Resposta salva e sinalizada para revisão de linguagem"
                    : ""}
                </Text>
                <Button
                  title="Salvar resposta"
                  secondary
                  onPress={() =>
                    void app.saveChecklistAnswer(checklistId, item.id, {
                      text: draft[item.id] ?? String(item.answer?.text ?? ""),
                    })
                  }
                />
              </>
            )}
            {item.answer && (
              <Text style={[s.small, { color: C.green }]}>
                ✓ Resposta salva no Supabase
              </Text>
            )}
          </Card>
        ))}
      </Page>
    );
  }
  return (
    <Page>
      <Text style={s.detail}>
        Alertas e rotinas da operação, com atualização em tempo real e histórico
        no Supabase.
      </Text>
      {mode === "alerts" && (
        <>
          <Section title="Alertas" />
          {!app.alerts.filter((item) => !item.dismissed_at).length && (
            <Text style={s.small}>Nenhum alerta ativo para você.</Text>
          )}
          {app.alerts
            .filter((item) => !item.dismissed_at)
            .slice(0, 5)
            .map((alert) => (
              <Card key={alert.id}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Badge warning={alert.urgent}>
                    {alert.urgent ? "Prioritário" : "Alerta"}
                  </Badge>
                  <Text style={s.small}>
                    {new Date(alert.created_at).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
                {alert.hidden_from_users &&
                  app.workspace!.person.role === "admin" && (
                    <Badge>Oculto das equipes</Badge>
                  )}
                <Text style={s.strong}>{alert.title}</Text>
                <Text style={s.body}>{alert.body}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Visualizar"
                      secondary
                      onPress={() => void app.markAlert(alert, "view")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Descartar"
                      secondary
                      onPress={() => void app.markAlert(alert, "dismiss")}
                    />
                  </View>
                </View>
                {app.workspace!.person.role === "admin" && (
                  <Button
                    title={
                      alert.hidden_from_users
                        ? "Restaurar para equipes"
                        : "Ocultar das equipes"
                    }
                    danger={!alert.hidden_from_users}
                    secondary
                    onPress={() =>
                      Alert.alert(
                        alert.hidden_from_users
                          ? "Restaurar alerta?"
                          : "Ocultar alerta para as equipes?",
                        "O registro e o conteúdo continuarão visíveis para administradores e na auditoria.",
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: alert.hidden_from_users
                              ? "Restaurar"
                              : "Ocultar",
                            onPress: () => void app.moderateAlert(alert),
                          },
                        ],
                      )
                    }
                  />
                )}
              </Card>
            ))}
          {canPublish && (
            <Card>
              <Badge>ALERTA PARA AS EQUIPES</Badge>
              <Field
                label="Título do alerta"
                value={alertTitle}
                onChangeText={setAlertTitle}
                placeholder="Ex.: Atenção à abertura"
                maxLength={120}
              />
              <Field
                label="Mensagem"
                value={alertBody}
                onChangeText={setAlertBody}
                multiline
                placeholder="Escreva o que a equipe precisa saber"
                maxLength={3000}
              />
              <Text style={s.label}>Destinatários</Text>
              <Choice
                label={`Todas as lojas da minha abrangência · ${app.workspace!.stores.length}`}
                selected={alertTarget === "all"}
                onPress={() => setAlertTarget("all")}
              />
              <Choice
                label="Uma regional"
                selected={alertTarget === "region"}
                onPress={() => setAlertTarget("region")}
              />
              <Choice
                label="Selecionar lojas"
                selected={alertTarget === "stores"}
                onPress={() => setAlertTarget("stores")}
              />
              {alertTarget === "region" &&
                availableRegions.map((item) => (
                  <Choice
                    key={item}
                    label={item}
                    selected={alertRegion === item}
                    onPress={() => setAlertRegion(item)}
                  />
                ))}
              {alertTarget === "stores" && (
                <StorePicker
                  stores={app.workspace!.stores}
                  selected={alertStores}
                  onChange={setAlertStores}
                />
              )}
              <Text style={s.small}>
                {alertRecipientStores.length}{" "}
                {alertRecipientStores.length === 1
                  ? "loja selecionada"
                  : "lojas selecionadas"}
              </Text>
              <Field
                label="Programar envio (opcional) · AAAA-MM-DD HH:MM"
                value={alertSchedule}
                onChangeText={setAlertSchedule}
                placeholder="2026-11-02 15:30"
                maxLength={16}
              />
              <Button
                title={
                  app.busy
                    ? "Salvando…"
                    : alertSchedule
                      ? "Programar alerta"
                      : "Enviar alerta"
                }
                disabled={
                  app.busy ||
                  !alertRecipientStores.length ||
                  !alertTitle.trim() ||
                  !alertBody.trim()
                }
                onPress={async () => {
                  let scheduledFor: string | undefined;
                  if (alertSchedule.trim()) {
                    const match = alertSchedule
                      .trim()
                      .match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
                    if (!match) {
                      Alert.alert(
                        "Data incompleta",
                        "Use o formato AAAA-MM-DD HH:MM.",
                      );
                      return;
                    }
                    const [, year, month, day, hour, minute] = match;
                    const date = new Date(
                      Number(year),
                      Number(month) - 1,
                      Number(day),
                      Number(hour),
                      Number(minute),
                    );
                    if (
                      date.getFullYear() !== Number(year) ||
                      date.getMonth() !== Number(month) - 1 ||
                      date.getDate() !== Number(day) ||
                      date.getHours() !== Number(hour) ||
                      date.getMinutes() !== Number(minute) ||
                      date.getTime() < Date.now() + 120_000
                    ) {
                      Alert.alert(
                        "Horário inválido",
                        "Confira a data e escolha um horário pelo menos dois minutos à frente.",
                      );
                      return;
                    }
                    scheduledFor = date.toISOString();
                  }
                  const result = await app.publishAlert({
                    title: alertTitle,
                    body: alertBody,
                    stores: alertRecipientStores,
                    urgent: false,
                    scheduledFor,
                  });
                  if (result.ok) {
                    setAlertTitle("");
                    setAlertBody("");
                    setAlertStores([]);
                    setAlertSchedule("");
                    setAlertRegion("");
                    setAlertTarget("all");
                  }
                }}
              />
            </Card>
          )}
        </>
      )}
      {mode === "checklists" && (
        <>
          <Section title={`Checklists · ${checklistFeed.total} registros`} />
          {canPublish && (
            <Card>
              <Badge>NOVO CHECKLIST</Badge>
              <Text style={s.strong}>Monte uma rotina para sua equipe</Text>
              <Field
                label="Nome da rotina"
                value={templateTitle}
                onChangeText={setTemplateTitle}
                placeholder="Ex.: Abertura da loja"
                maxLength={120}
              />
              <Field
                label="Orientação"
                value={templateDescription}
                onChangeText={setTemplateDescription}
                placeholder="Objetivo ou instruções"
                multiline
                maxLength={1000}
              />
              <Field
                label="Pergunta ou etapa"
                value={question}
                onChangeText={setQuestion}
                placeholder="Ex.: A área está organizada?"
                maxLength={500}
              />
              <Text style={s.label}>Formato</Text>
              {(
                [
                  ["acceptance", "Aceite"],
                  ["photo", "Foto"],
                  ["text", "Resposta aberta"],
                  ["yes_no", "Sim ou não"],
                ] as const
              ).map(([type, label]) => (
                <Choice
                  key={type}
                  label={label}
                  selected={questionType === type}
                  onPress={() => setQuestionType(type)}
                />
              ))}
              <Button
                title="Adicionar pergunta"
                secondary
                disabled={!question.trim()}
                onPress={() => {
                  setQuestions((old) => [
                    ...old,
                    {
                      prompt: question.trim(),
                      type: questionType,
                      required: true,
                    },
                  ]);
                  setQuestion("");
                }}
              />
              {questions.map((item, index) => (
                <View
                  key={`${item.prompt}-${index}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={[s.small, { flex: 1 }]}>
                    {index + 1}. {item.prompt}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setQuestions((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    <Text
                      style={{ color: C.red, fontWeight: "800", padding: 8 }}
                    >
                      Remover
                    </Text>
                  </Pressable>
                </View>
              ))}
              <Text style={s.label}>Lojas que receberão a rotina</Text>
              <StorePicker
                stores={app.workspace!.stores}
                selected={checklistStores}
                onChange={setChecklistStores}
              />
              <Button
                title="Salvar e atribuir"
                disabled={
                  app.busy || !questions.length || !checklistStores.length
                }
                onPress={async () => {
                  const result = await app.publishChecklist({
                    title: templateTitle,
                    description: templateDescription,
                    items: questions,
                    stores: checklistStores,
                  });
                  if (result.ok) {
                    setTemplateTitle("");
                    setTemplateDescription("");
                    setQuestions([]);
                    setChecklistStores([]);
                  }
                }}
              />
            </Card>
          )}
          <Field
            label="Buscar checklist ou loja"
            value={checklistQuery}
            onChangeText={(value) => {
              setChecklistQuery(value);
              setChecklistPage(0);
            }}
          />
          <ScrollView
            horizontal
            contentContainerStyle={{ gap: 8 }}
            showsHorizontalScrollIndicator={false}
          >
            {[
              ["", "Todos"],
              ["pending", "Pendentes"],
              ["in_progress", "Em andamento"],
              ["completed", "Concluídos"],
            ].map(([value, label]) => (
              <Choice
                key={value}
                label={label}
                selected={checklistStatus === value}
                onPress={() => {
                  setChecklistStatus(value);
                  setChecklistPage(0);
                }}
              />
            ))}
          </ScrollView>
          {feedLoading && <Text style={s.small}>Carregando checklists…</Text>}
          {feedError && (
            <Card>
              <Text style={{ color: C.red }}>{feedError}</Text>
              <Button
                title="Tentar novamente"
                secondary
                onPress={() => setFeedRetry(feedRetry + 1)}
              />
            </Card>
          )}
          {!feedLoading && !feedError && !checklistFeed.total && (
            <Text style={s.small}>
              Nenhum checklist para os filtros selecionados.
            </Text>
          )}
          {checklistFeed.items.map((run) => (
            <View key={run.run_id} style={{ gap: 7 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedChecklist(run);
                  setChecklistId(run.run_id);
                }}
                style={({ pressed }) => [s.card, pressed && s.pressed]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Badge warning={run.status !== "completed"}>
                    {run.status === "completed"
                      ? "Concluído"
                      : run.status === "in_progress"
                        ? "Em andamento"
                        : "Pendente"}
                  </Badge>
                  <Text style={s.small}>
                    {run.answered_count}/{run.item_count}
                  </Text>
                </View>
                <Text style={s.strong}>{run.title}</Text>
                <Text style={s.small}>
                  {run.store_name} · Atualizado{" "}
                  {new Date(run.updated_at).toLocaleDateString("pt-BR")}
                </Text>
                <Text
                  style={{ color: C.dark, fontSize: 12, fontWeight: "800" }}
                >
                  Abrir rotina ›
                </Text>
              </Pressable>
              <CalendarAction
                title={`Checklist: ${run.title}`}
                description={run.store_name}
              />
            </View>
          ))}
          {!app.checklists.length && (
            <Card>
              <Text style={s.strong}>Sua lista de rotinas está vazia</Text>
              <Text style={s.small}>
                Quando um checklist for atribuído à sua loja, ele aparecerá aqui
                com o estágio de andamento.
              </Text>
            </Card>
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Button
              title="Anterior"
              secondary
              disabled={feedLoading || checklistPage === 0}
              onPress={() => setChecklistPage(checklistPage - 1)}
            />
            <Text style={s.small}>
              {checklistPage + 1} /{" "}
              {Math.max(1, Math.ceil(checklistFeed.total / 30))}
            </Text>
            <Button
              title="Próxima"
              secondary
              disabled={
                feedLoading || (checklistPage + 1) * 30 >= checklistFeed.total
              }
              onPress={() => setChecklistPage(checklistPage + 1)}
            />
          </View>
        </>
      )}
    </Page>
  );
}

export function ManagementScreen({ open }: { open: (tab: AdminTab) => void }) {
  return (
    <Page>
      <ScreenTitle
        title="Gestão"
        subtitle="Visibilidade para cuidar de cada loja."
      />
      <View
        style={{
          backgroundColor: "#343842",
          borderRadius: 24,
          padding: 22,
          gap: 10,
        }}
      >
        <Text style={{ color: C.yellow, fontSize: 12, fontWeight: "700" }}>
          ADMINISTRAÇÃO EO
        </Text>
        <Text
          style={{
            color: C.paper,
            fontSize: 23,
            fontWeight: "700",
            lineHeight: 30,
          }}
        >
          Uma equipe conectada.\nUma operação organizada.
        </Text>
        <Text style={{ color: "#CBCDD4", fontSize: 13, lineHeight: 20 }}>
          Acompanhe as unidades, os acessos e a comunicação.
        </Text>
      </View>
      <Section title="Operação" />
      <Group>
        <MenuItem
          title="Lojas"
          detail="Unidades e regionais"
          icon="building.2.fill"
          tint="#EAF4ED"
          color="#508267"
          onPress={() => open("stores")}
        />
        <MenuItem
          title="Pessoas e acessos"
          detail="Perfis e permissões"
          icon="person.2.fill"
          tint="#EEF1FC"
          color="#617BAC"
          last
          onPress={() => open("people")}
        />
      </Group>
      <Section title="Acompanhamento" />
      <Group>
        <MenuItem
          title="Relatórios"
          detail="Leitura por regional e por loja"
          icon="chart.bar.fill"
          tint="#F7F0DB"
          color="#A48A39"
          onPress={() => open("reports")}
        />
        <MenuItem
          title="Arquivo de comunicados"
          detail="Histórico preservado e restauração"
          icon="archivebox.fill"
          tint="#F4EDE6"
          color="#A27D57"
          onPress={() => open("archive")}
        />
        <MenuItem
          title="Auditoria"
          detail="Atividades registradas na plataforma"
          icon="checkmark.shield.fill"
          tint="#EAF2F3"
          color="#5C8A8C"
          last
          onPress={() => open("audit")}
        />
      </Group>
      <Section title="Rotinas e cadastros" />
      <Group>
        <MenuItem
          title="Atualizar telefones"
          detail="Solicitar a todos ou só a quem está sem contato"
          icon="phone.fill"
          onPress={() => router.push("/contacts" as never)}
        />
        <MenuItem
          title="Criar checklist por Excel"
          detail="Modelo, perguntas e envio para as equipes"
          icon="checklist"
          last
          onPress={() => router.push("/checklist-admin" as never)}
        />
      </Group>
      <Section title="Base de dados" />
      <Group>
        <MenuItem
          title="Modelo de importação"
          detail="Baixar a planilha padrão"
          icon="doc.text.fill"
          last
          onPress={() =>
            void Linking.openURL(
              "https://app-eo.vercel.app/modelo-importacao-administrativa-eo.xlsx",
            )
          }
        />
      </Group>
      <Text style={d.sectionNote}>
        A manutenção completa da base está disponível na administração web. As
        alterações ficam registradas na auditoria.
      </Text>
    </Page>
  );
}

export function StoresScreen() {
  const app = useEO();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [state, setState] = useState("active");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<(Store & { active: boolean }) | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<"code" | "name">("code");
  const stores = app.adminStores;
  const filtered = stores
    .filter(
      (store) =>
        (state === "" || store.active === (state === "active")) &&
        (!uf || store.segments?.UF === uf) &&
        (!filterRegion ||
          (store.segments?.REGIONAL || store.region) === filterRegion) &&
        `${store.code} ${store.name} ${store.region}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.trim().toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => a[sort].localeCompare(b[sort], "pt-BR", { numeric: true }));
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 20) - 1),
  );
  return (
    <Page>
      <ScreenTitle
        title="Lojas"
        subtitle="Busque, organize e mantenha o histórico das unidades."
      />
      <Button
        title={creating ? "Fechar cadastro" : "Cadastrar loja"}
        secondary
        onPress={() => setCreating(!creating)}
      />
      {creating && (
        <Card>
          <Badge>NOVA UNIDADE</Badge>
          <Field
            label="Código"
            value={code}
            onChangeText={setCode}
            placeholder="Ex.: 001"
            maxLength={20}
          />
          <Field
            label="Nome da loja"
            value={name}
            onChangeText={setName}
            placeholder="Nome da unidade"
            maxLength={120}
          />
          <Field
            label="Regional"
            value={region}
            onChangeText={setRegion}
            placeholder="Opcional"
            maxLength={120}
          />
          <Button
            title={app.busy ? "Salvando…" : "Cadastrar loja"}
            icon="＋"
            disabled={app.busy || !code.trim() || name.trim().length < 2}
            onPress={async () => {
              const result = await app.addStore({ code, name, region });
              if (result.ok) {
                setCode("");
                setName("");
                setRegion("");
                setCreating(false);
              }
            }}
          />
        </Card>
      )}
      {editing && (
        <Card>
          <Heading title="Editar loja" />
          <Field
            label="Código"
            value={editing.code}
            onChangeText={(value) => setEditing({ ...editing, code: value })}
            maxLength={20}
          />
          <Field
            label="Nome"
            value={editing.name}
            onChangeText={(value) => setEditing({ ...editing, name: value })}
            maxLength={120}
          />
          <Field
            label="Regional"
            value={editing.region}
            onChangeText={(value) => setEditing({ ...editing, region: value })}
            maxLength={120}
          />
          <Button
            title="Salvar alterações"
            disabled={app.busy}
            onPress={async () => {
              if ((await app.saveStore(editing)).ok) setEditing(null);
            }}
          />
          <Button
            title={editing.active ? "Arquivar loja" : "Reativar loja"}
            secondary
            danger={editing.active}
            disabled={app.busy}
            onPress={() =>
              Alert.alert(
                editing.active ? "Arquivar loja?" : "Reativar loja?",
                "O histórico e os vínculos serão preservados.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Confirmar",
                    onPress: async () => {
                      if (
                        (
                          await app.saveStore({
                            ...editing,
                            active: !editing.active,
                          })
                        ).ok
                      )
                        setEditing(null);
                    },
                  },
                ],
              )
            }
          />
          <Button
            title="Fechar edição"
            secondary
            onPress={() => setEditing(null)}
          />
        </Card>
      )}
      <Field
        label="Buscar lojas"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setPage(0);
        }}
        placeholder="Código ou nome"
      />
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          ["active", "Ativas"],
          ["archived", "Arquivadas"],
          ["", "Todas"],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={state === value}
            onPress={() => {
              setState(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Text style={s.label}>UF</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          "",
          ...new Set(
            stores.map((store) => store.segments?.UF || "").filter(Boolean),
          ),
        ].map((value) => (
          <Choice
            key={value}
            label={value || "Todas"}
            selected={uf === value}
            onPress={() => {
              setUf(value);
              setFilterRegion("");
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Text style={s.label}>Regional</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          "",
          ...new Set(
            stores
              .filter((store) => !uf || store.segments?.UF === uf)
              .map((store) => store.segments?.REGIONAL || store.region)
              .filter(Boolean),
          ),
        ].map((value) => (
          <Choice
            key={value}
            label={value || "Todas"}
            selected={filterRegion === value}
            onPress={() => {
              setFilterRegion(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Choice
        label={sort === "code" ? "Ordenação por código" : "Ordenação por nome"}
        selected={sort === "name"}
        onPress={() => setSort(sort === "code" ? "name" : "code")}
      />
      <Section title={`${filtered.length} lojas encontradas`} />
      <Group>
        {filtered
          .slice(current * 20, current * 20 + 20)
          .map((store, index, visible) => (
            <MenuItem
              key={store.id}
              title={`${store.code} · ${store.name}`}
              detail={`${store.region || "Sem regional"} · ${store.active ? "Ativa" : "Arquivada"}`}
              icon="building.2.fill"
              color="#508267"
              tint="#EAF4ED"
              last={index === visible.length - 1}
              onPress={() => setEditing({ ...store })}
            />
          ))}
      </Group>
      <Text style={s.small}>
        {filtered.length
          ? `${current * 20 + 1} a ${Math.min(current * 20 + 20, filtered.length)} de ${filtered.length}`
          : "Nenhuma loja encontrada."}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title="Anterior"
          secondary
          disabled={current === 0}
          onPress={() => setPage(current - 1)}
        />
        <Button
          title="Próxima"
          secondary
          disabled={(current + 1) * 20 >= filtered.length}
          onPress={() => setPage(current + 1)}
        />
      </View>
    </Page>
  );
}

export function RegisterPersonScreen({ done }: { done: () => void }) {
  const app = useEO();
  const workspace = app.workspace!;
  const [chapa, setChapa] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("colaborador");
  const [stores, setStores] = useState<string[]>([]);
  const [unitType, setUnitType] = useState("loja");
  const [password, setPassword] = useState("");
  const navigation = useNavigation();
  const confirming = useRef(false);
  const dirty = !!(
    chapa ||
    email ||
    name ||
    role !== "colaborador" ||
    stores.length
  );
  usePreventRemove(!password && (dirty || app.busy), ({ data }) => {
    if (app.busy || confirming.current) return;
    confirming.current = true;
    Alert.alert(
      "Sair sem salvar?",
      "Os dados preenchidos serão descartados.",
      [
        {
          text: "Continuar cadastro",
          style: "cancel",
          onPress: () => {
            confirming.current = false;
          },
        },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () => {
            confirming.current = false;
            navigation.dispatch(data.action);
          },
        },
      ],
      { cancelable: false },
    );
  });
  const valid =
    /^\d{1,20}$/.test(chapa.trim()) &&
    (!email.trim() || /^\S+@\S+\.\S+$/.test(email.trim())) &&
    name.trim().length >= 2 &&
    (unitType !== "loja" || workspace.stores.length > 0);
  if (password)
    return (
      <Page>
        <Card>
          <Heading
            title="Usuário cadastrado"
            detail={`${name.trim()} · Chapa ${chapa.trim()}`}
          />
          <Field
            label="Senha temporária"
            value={password}
            editable={false}
            selectTextOnFocus
          />
          <Text style={s.small}>
            Compartilhe com a pessoa. O EO pedirá uma nova senha no primeiro
            acesso.
          </Text>
          <Button
            title="Compartilhar dados de acesso"
            onPress={() => void shareAccess(chapa, password)}
          />
          <Button title="Concluir" secondary onPress={done} />
        </Card>
      </Page>
    );
  return (
    <Page>
      <Card>
        <Heading
          title="Dados da pessoa"
          detail="O cadastro gera uma senha temporária para compartilhar."
        />
        <Field
          label="Chapa"
          value={chapa}
          onChangeText={setChapa}
          keyboardType="number-pad"
          placeholder="Número da chapa"
          maxLength={20}
        />
        <EmailField value={email} onChange={setEmail} />
        <Field
          label="Nome completo"
          value={name}
          onChangeText={setName}
          placeholder="Nome da pessoa"
          maxLength={120}
        />
        <Text style={s.label}>Perfil</Text>
        <View style={{ gap: 7 }}>
          {(["colaborador", "gerente", ...["diretor", "admin"]] as Role[]).map(
            (item) => (
              <Choice
                key={item}
                label={roleLabels[item]}
                selected={role === item}
                onPress={() => {
                  setRole(item);
                  if (item === "admin") setUnitType("administracao");
                }}
              />
            ),
          )}
        </View>
        <Text style={s.label}>Unidade</Text>
        {[
          ["loja", "Loja"],
          ["ec", "Escritório Central (EC)"],
          ["cda", "Centro de Distribuição Araçariguama (CDA)"],
          ["administracao", "Administração"],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={unitType === value}
            onPress={() => setUnitType(value)}
          />
        ))}
        {role === "admin" ? (
          <Text style={s.small}>
            O perfil Administrador tem acesso à gestão de todas as lojas.
          </Text>
        ) : (
          <>
            <Text style={s.label}>Lojas autorizadas</Text>
            <Text style={s.small}>
              {stores.length
                ? `${stores.length} lojas selecionadas.`
                : "Sem seleção individual, o cadastro inclui todas as lojas atuais."}
            </Text>
            <StorePicker
              stores={workspace.stores}
              selected={stores}
              onChange={setStores}
            />
          </>
        )}
        <Button
          title={
            app.busy
              ? "Cadastrando…"
              : role !== "admin" && !stores.length
                ? "Cadastrar com acesso a todas as lojas"
                : "Cadastrar e gerar senha"
          }
          disabled={app.busy || !valid}
          onPress={async () => {
            const result = await app.inviteMember({
              chapa,
              email,
              name,
              role,
              unit_type: unitType,
              stores:
                unitType !== "loja" || role === "admin"
                  ? []
                  : stores.length
                    ? stores
                    : workspace.stores.map((store) => store.id),
            });
            if (result.password) {
              setPassword(result.password);
              void shareAccess(chapa, result.password);
            }
          }}
        />
      </Card>
    </Page>
  );
}

async function shareAccess(chapa: string, password: string) {
  try {
    await Share.share({
      message: `Seu acesso ao EO\nChapa: ${chapa.trim()}\nSenha temporária: ${password}\nTroque a senha no primeiro acesso: https://app-eo.vercel.app/`,
    });
  } catch {
    Alert.alert(
      "Não foi possível abrir o compartilhamento.",
      "Você pode selecionar e copiar a senha na tela.",
    );
  }
}

export function PeopleScreen({
  edit,
  register,
}: {
  edit: (id: string) => void;
  register: () => void;
}) {
  const app = useEO();
  const workspace = app.workspace!;
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState("");
  const [uf, setUf] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("name");
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void app.searchPeople({ search, role, state, uf, region, page, sort }),
      250,
    );
    return () => clearTimeout(timer);
  }, [search, role, state, uf, region, page, sort, app.searchPeople]);
  return (
    <Page>
      <ScreenTitle
        title="Pessoas e acessos"
        subtitle="Filtros e páginas para encontrar cada pessoa."
      />
      <Button title="Cadastrar usuário" icon="＋" onPress={register} />
      <IdentityPreferences />
      <Field
        label="Buscar pessoas"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(0);
        }}
        placeholder="Nome, chapa ou e-mail"
      />
      <Text style={s.label}>Perfil</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {["", "colaborador", "gerente", "diretor", "admin"].map((value) => (
          <Choice
            key={value}
            label={value ? roleLabels[value as Role] : "Todos"}
            selected={role === value}
            onPress={() => {
              setRole(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Text style={s.label}>Situação</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          ["", "Todas"],
          ["active", "Ativos"],
          ["archived", "Arquivados"],
          ["pending", "Primeiro acesso"],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={state === value}
            onPress={() => {
              setState(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Text style={s.label}>UF</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          "",
          ...new Set(
            workspace.stores
              .map((store) => store.segments?.UF || "")
              .filter(Boolean),
          ),
        ].map((value) => (
          <Choice
            key={value}
            label={value || "Todas"}
            selected={uf === value}
            onPress={() => {
              setUf(value);
              setRegion("");
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Text style={s.label}>Regional</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          "",
          ...new Set(
            workspace.stores
              .filter((store) => !uf || store.segments?.UF === uf)
              .map((store) => store.segments?.REGIONAL || store.region)
              .filter(Boolean),
          ),
        ].map((value) => (
          <Choice
            key={value}
            label={value || "Todas"}
            selected={region === value}
            onPress={() => {
              setRegion(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
        {[
          ["name", "Nome"],
          ["chapa", "Chapa"],
          ["role", "Perfil"],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={`Ordenar: ${label}`}
            selected={sort === value}
            onPress={() => {
              setSort(value);
              setPage(0);
            }}
          />
        ))}
      </ScrollView>
      <Section title={`Pessoas · ${app.peopleTotal}`} />
      {app.members.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          ownId={workspace.person.id}
          edit={() => edit(person.id)}
        />
      ))}
      {!app.members.length && (
        <Text style={s.small}>Nenhuma pessoa encontrada.</Text>
      )}
      <Text style={s.small}>Página {page + 1} · até 30 pessoas por página</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title="Anterior"
          secondary
          disabled={!page}
          onPress={() => setPage(page - 1)}
        />
        <Button
          title="Próxima"
          secondary
          disabled={(page + 1) * 30 >= app.peopleTotal}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </Page>
  );
}

function PersonCard({
  person,
  ownId,
  edit,
}: {
  person: LivePerson;
  ownId: string;
  edit: () => void;
}) {
  const app = useEO();
  const canEdit = person.id !== ownId;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: C.yellow,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: C.dark, fontWeight: "800" }}>
            {person.display_name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>{person.display_name}</Text>
          <Text style={s.small}>
            {roleLabels[person.role] || person.role} ·{" "}
            {person.login_chapa || "Sem chapa"}
          </Text>
        </View>
        <Badge success={person.active}>
          {person.active ? "Ativo" : "Inativo"}
        </Badge>
      </View>
      <Text style={s.small}>
        {!person.active
          ? "Acesso inativo"
          : person.must_change_password
            ? "Aguardando primeiro acesso"
            : "Acesso ativo"}
      </Text>
      {canEdit && (
        <Button
          title="Editar acesso"
          secondary
          disabled={app.busy}
          onPress={edit}
        />
      )}
      {person.id === ownId && <PersonPassword person={person} />}
    </Card>
  );
}

function PersonPassword({ person }: { person: LivePerson }) {
  const app = useEO();
  const ownId = app.workspace?.person.id;
  const [password, setPassword] = useState("");
  if (!person.active || !person.login_chapa) return null;
  return password ? (
    <>
      <Text style={s.small}>
        Copie agora. A senha será trocada no próximo acesso.
      </Text>
      <Field
        label="Senha temporária"
        value={password}
        editable={false}
        selectTextOnFocus
      />
      <Button
        title="Copiar senha"
        secondary
        onPress={() =>
          void Clipboard.setStringAsync(password).catch(() =>
            Alert.alert("Selecione e copie a senha manualmente."),
          )
        }
      />
      <Button
        title="Compartilhar dados de acesso"
        secondary
        onPress={() => void shareAccess(person.login_chapa!, password)}
      />
      <Button
        title={
          person.id === ownId ? "Guardei a senha, sair agora" : "Fechar senha"
        }
        secondary
        onPress={() => {
          setPassword("");
          if (person.id === ownId) void app.signout();
        }}
      />
    </>
  ) : (
    <Button
      title="Gerar senha temporária"
      secondary
      disabled={app.busy}
      onPress={() =>
        Alert.alert(
          "Gerar senha temporária?",
          `A senha atual de ${person.display_name} será substituída e a troca será obrigatória no próximo acesso.`,
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Gerar senha",
              style: "destructive",
              onPress: () =>
                void app.issueTemporaryPassword(person.id).then((result) => {
                  if (result.password) setPassword(result.password);
                }),
            },
          ],
        )
      }
    />
  );
}

export function EditPersonScreen({
  id,
  back,
}: {
  id: string;
  back: () => void;
}) {
  const app = useEO();
  const workspace = app.workspace!;
  const person = app.members.find((item) => item.id === id);
  if (!person)
    return (
      <Page>
        <Empty
          title="Carregando dados da pessoa"
          detail="Se os dados não aparecerem, atualize a lista."
        />
        <Button
          title="Atualizar lista"
          secondary
          disabled={app.busy}
          onPress={() => void app.loadAdmin("people")}
        />
        <Button title="Voltar" secondary onPress={back} />
      </Page>
    );
  if (person.id === workspace.person.id)
    return (
      <Page>
        <Empty
          title="Acesso protegido"
          detail="Este perfil não pode ser editado por aqui."
        />
        <Button title="Voltar" secondary onPress={back} />
      </Page>
    );
  return <EditPersonForm key={person.id} person={person} back={back} />;
}

function EditPersonForm({
  person,
  back,
}: {
  person: LivePerson;
  back: () => void;
}) {
  const app = useEO();
  const workspace = app.workspace!;
  const [name, setName] = useState(person.display_name);
  const chapa = person.login_chapa ?? "";
  const [role, setRole] = useState<Role>(person.role);
  const [unitType, setUnitType] = useState(
    (person as LivePerson & { unit_type?: string }).unit_type ??
      (person.stores.length ? "loja" : "administracao"),
  );
  const [stores, setStores] = useState<string[]>(person.stores);
  return (
    <Page>
      <Card>
        <Heading title="Atualizar acesso" detail={person.display_name} />
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
        <Field
          label="Chapa de login (não editável)"
          value={chapa}
          editable={false}
        />
        <Text style={s.small}>
          A chapa identifica o login e permanece fixa para preservar o acesso.
        </Text>
        <Text style={s.label}>Perfil</Text>
        {(["colaborador", "gerente", ...["diretor", "admin"]] as Role[]).map(
          (item) => (
            <Choice
              key={item}
              label={roleLabels[item]}
              selected={role === item}
              onPress={() => setRole(item)}
            />
          ),
        )}
        <Text style={s.label}>Unidade</Text>
        {[
          ["loja", "Loja"],
          ["ec", "Escritório Central (EC)"],
          ["cda", "Centro de Distribuição Araçariguama (CDA)"],
          ["administracao", "Administração"],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={unitType === value}
            onPress={() => setUnitType(value)}
          />
        ))}
        {role === "admin" && (
          <Text style={s.small}>
            O perfil Administrador tem acesso à gestão de todas as lojas.
          </Text>
        )}
        {role !== "admin" && (
          <>
            <Text style={s.small}>
              Sem lojas, a pessoa fica sem abrangência operacional. Salvar
              substitui também os vínculos importados desta pessoa.
            </Text>
            <StorePicker
              stores={workspace.stores}
              selected={stores}
              onChange={setStores}
            />
          </>
        )}
        <Button
          title={app.busy ? "Salvando…" : "Salvar alterações"}
          disabled={
            app.busy ||
            name.trim().length < 2 ||
            !/^\d{1,20}$/.test(chapa.trim())
          }
          onPress={async () => {
            const result = await app.saveMember(person, {
              name,
              chapa,
              role,
              unit_type: unitType,
              stores: unitType !== "loja" ? [] : stores,
            });
            if (result.ok) back();
          }}
        />
      </Card>
      <Card>
        <Heading title="Segurança do acesso" />
        <Button
          title={person.active ? "Arquivar usuário" : "Reativar usuário"}
          danger={person.active}
          secondary
          disabled={app.busy}
          onPress={() =>
            Alert.alert(
              person.active ? "Arquivar usuário?" : "Reativar usuário?",
              person.display_name,
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Confirmar",
                  style: person.active ? "destructive" : "default",
                  onPress: () => void app.toggleMember(person),
                },
              ],
            )
          }
        />
        {person.login_chapa !== "330023" && (
          <Button
            title="Excluir usuário"
            danger
            disabled={app.busy}
            onPress={() =>
              Alert.alert(
                "Excluir usuário?",
                "O acesso será encerrado. O histórico e a auditoria serão preservados.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Excluir",
                    style: "destructive",
                    onPress: () =>
                      void (async () => {
                        try {
                          await rpc("eo_admin_delete_person", {
                            p_user: person.id,
                          });
                          await app.searchPeople();
                          back();
                        } catch (error) {
                          Alert.alert(
                            "Não foi possível excluir",
                            error instanceof Error
                              ? error.message
                              : "Tente novamente.",
                          );
                        }
                      })(),
                  },
                ],
              )
            }
          />
        )}
        <PersonPassword person={person} />
      </Card>
    </Page>
  );
}

export function AuditScreen() {
  const app = useEO();
  return (
    <Page>
      <Card>
        <Text style={s.strong}>◈ Atividade segura</Text>
        <Text style={s.small}>
          {app.audit.length} eventos recentes registrados pelo servidor.
        </Text>
      </Card>
      {app.audit.length ? (
        app.audit.map((entry) => <AuditItem key={entry.id} entry={entry} />)
      ) : (
        <Empty
          title="Sem eventos recentes"
          detail="As ações administrativas serão exibidas aqui."
        />
      )}
    </Page>
  );
}

export function ReportsScreen() {
  const app = useEO();
  const [selectedId, setSelectedId] = useState("");
  const [group, setGroup] = useState("regional");
  const [segmentBy, setSegmentBy] = useState("");
  const [segmentValues, setSegmentValues] = useState<string[]>([]);
  const segmentOptions = [
    ["GGL", "GGL"],
    ["REGIONAL", "Regional"],
    ["UF", "UF"],
    ["CIDADE", "Cidade"],
    ["SAFRA", "Safra"],
    ["GRUPO_CIDADE", "Grupo cidade"],
    ["POPULACAO", "População"],
    ["GRUPO_LOJA", "Grupo loja"],
    ["CLIMA", "Clima"],
    ["PERFIL_PRECO", "Perfil de preço"],
    ["CLUSTERS_VEST_26", "Cluster vestuário 26"],
    ["CLUSTERS_VEST_10_25", "Cluster vestuário 10/25"],
    ["RE_VAREJO_24", "RE varejo 24"],
    ["STATUS_RE_24", "Status RE 24"],
    ["LATITUDE", "Latitude"],
    ["LONGITUDE", "Longitude"],
    ["COORDENADAS", "Coordenadas"],
    ["TIPO", "Tipo"],
    ["AT", "Área construída"],
    ["TOTAL_VENDAS", "Total de vendas"],
    ["PORTE_VENDAS", "Porte de vendas"],
  ];
  const segmentValuesAvailable = [
    ...new Set(
      app.workspace?.stores
        .map((store) => store.segments?.[segmentBy] ?? "")
        .filter(Boolean) ?? [],
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  useEffect(() => {
    const first = app.reportMessages[0];
    if (first && !selectedId) {
      setSelectedId(first.notice_id);
      void app.loadNoticeReport(
        first.notice_id,
        first.version,
        group,
        segmentBy,
        segmentValues,
      );
    }
  }, [
    app.reportMessages,
    selectedId,
    group,
    segmentBy,
    segmentValues.join("|"),
  ]);
  const selected = app.reportMessages.find(
    (item) => item.notice_id === selectedId,
  );
  return (
    <Page>
      <Card>
        <Text style={s.strong}>Leitura dos comunicados</Text>
        <Text style={s.small}>
          Lojas com ciência contam quando ao menos uma pessoa destinatária
          confirmou.
        </Text>
        <Text style={s.label}>Comunicado</Text>
        <View style={{ gap: 7 }}>
          {app.reportMessages.map((item) => (
            <Choice
              key={item.notice_id}
              label={`${item.title} · ${new Date(item.published_at).toLocaleDateString("pt-BR")}${item.archived_at ? " · arquivado" : ""}`}
              selected={selectedId === item.notice_id}
              onPress={() => {
                setSelectedId(item.notice_id);
                void app.loadNoticeReport(item.notice_id, item.version, group);
              }}
            />
          ))}
        </View>
        <Text style={s.label}>Filtrar primeiro por segmento</Text>
        <View style={{ gap: 7 }}>
          <Choice
            label="Todas as lojas do comunicado"
            selected={!segmentBy}
            onPress={() => {
              setSegmentBy("");
              setSegmentValues([]);
              if (selected)
                void app.loadNoticeReport(
                  selected.notice_id,
                  selected.version,
                  group,
                  "",
                  [],
                );
            }}
          />
          {segmentOptions.map(([key, label]) => (
            <Choice
              key={key}
              label={label}
              selected={segmentBy === key}
              onPress={() => {
                setSegmentBy(key);
                setSegmentValues([]);
                if (selected)
                  void app.loadNoticeReport(
                    selected.notice_id,
                    selected.version,
                    group,
                    key,
                    [],
                  );
              }}
            />
          ))}
        </View>
        {segmentBy ? (
          <>
            <Text style={s.label}>Depois selecione os valores</Text>
            <View style={{ gap: 7 }}>
              {segmentValuesAvailable.map((value) => (
                <Choice
                  key={value}
                  label={value}
                  selected={segmentValues.includes(value)}
                  onPress={() => {
                    const next = segmentValues.includes(value)
                      ? segmentValues.filter((x) => x !== value)
                      : [...segmentValues, value];
                    setSegmentValues(next);
                    if (selected)
                      void app.loadNoticeReport(
                        selected.notice_id,
                        selected.version,
                        group,
                        segmentBy,
                        next,
                      );
                  }}
                />
              ))}
            </View>
            <Text style={s.small}>
              {segmentValuesAvailable.length} valores disponíveis
            </Text>
          </>
        ) : null}
        <Text style={s.label}>Agrupar resultado por</Text>
        <View style={{ gap: 7 }}>
          {[
            ["regional", "Regional"],
            ["loja", "Loja"],
            ["ggl", "GGL"],
            ["uf", "UF"],
            ["cidade", "Cidade"],
            ["tipo", "Tipo de loja"],
            ["clima", "Clima"],
            ["perfil_preco", "Perfil de preço"],
            ["grupo_loja", "Grupo de loja"],
            ["safra", "Safra"],
          ].map(([value, label]) => (
            <Choice
              key={value}
              label={label}
              selected={group === value}
              onPress={() => {
                setGroup(value);
                if (selected)
                  void app.loadNoticeReport(
                    selected.notice_id,
                    selected.version,
                    value,
                    segmentBy,
                    segmentValues,
                  );
              }}
            />
          ))}
        </View>
      </Card>
      {app.reportData ? (
        <>
          <Card>
            <Text style={s.title}>
              {app.reportData.stores_with_read} de {app.reportData.total_stores}{" "}
              lojas com ciência
            </Text>
            <Text style={s.small}>
              {app.reportData.stores_pending} pendentes ·{" "}
              {app.reportData.stores_fully_read} com leitura completa
            </Text>
          </Card>
          {app.reportData.groups.map((item) => (
            <ActionRow
              key={item.group}
              title={item.group}
              detail={`${item.stores_with_read}/${item.total_stores} lojas com ciência · ${item.stores_pending} pendentes`}
              icon="building.2.fill"
              onPress={() => undefined}
            />
          ))}
        </>
      ) : (
        <Empty
          title={
            app.reportMessages.length
              ? "Carregando relatório"
              : "Nenhum comunicado"
          }
          detail={
            app.reportMessages.length
              ? "Aguarde os dados de leitura."
              : "Os comunicados publicados aparecerão aqui."
          }
        />
      )}
    </Page>
  );
}

export function ArchiveScreen() {
  const app = useEO();
  return (
    <Page>
      {app.archivedMessages.length ? (
        app.archivedMessages.map((item) => (
          <Card key={`${item.kind}-${item.id}`}>
            <Badge>{item.kind === "notice" ? "COMUNICADO" : "ALERTA"}</Badge>
            <Text style={s.strong}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
            <Text style={s.small}>
              Arquivado em {new Date(item.archived_at).toLocaleString("pt-BR")}{" "}
              · {item.archived_by_name || "Administrador"}
            </Text>
            {item.attachments.map((file) => (
              <Button
                key={file.id}
                title={file.file_name}
                secondary
                onPress={() =>
                  void app
                    .openMessageAttachment(file)
                    .catch((error) =>
                      Alert.alert("Anexo indisponível", error.message),
                    )
                }
              />
            ))}
            <Button
              title="Restaurar para a equipe"
              secondary
              disabled={app.busy}
              onPress={() =>
                Alert.alert(
                  "Restaurar comunicado?",
                  "A mensagem voltará a aparecer para seus destinatários.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Restaurar",
                      onPress: () =>
                        void app.archiveMessage(item.kind, item.id, false),
                    },
                  ],
                )
              }
            />
          </Card>
        ))
      ) : (
        <Empty
          title="Arquivo vazio"
          detail="Mensagens arquivadas ficarão guardadas aqui."
        />
      )}
    </Page>
  );
}
function AuditItem({ entry }: { entry: AuditRow }) {
  return (
    <Card style={{ gap: 5 }}>
      <Text style={s.strong}>{entry.action}</Text>
      <Text style={s.small}>{entry.actor_name}</Text>
      {entry.action === "alert.published" && entry.detail && (
        <Text style={s.small}>
          {String(entry.detail.title ?? "Alerta")}:{" "}
          {String(entry.detail.body ?? "")} · Lojas:{" "}
          {Array.isArray(entry.detail.store_codes)
            ? (entry.detail.store_codes as string[]).join(", ")
            : ""}
        </Text>
      )}
      {entry.action === "organization.imported" && entry.detail && (
        <Text style={s.small}>
          {String(entry.detail.stores ?? 0)} lojas ·{" "}
          {String(entry.detail.managers ?? 0)} gerentes ·{" "}
          {String(entry.detail.regionals ?? 0)} regionais
        </Text>
      )}
      <Text style={s.small}>
        {new Date(entry.created_at).toLocaleString("pt-BR")}
      </Text>
    </Card>
  );
}

export function ComposeScreen() {
  const app = useEO();
  const workspace = app.workspace!;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [kind, setKind] = useState<"notice" | "alert">(
    workspace.person.role === "gerente" ? "alert" : "notice",
  );
  const [stores, setStores] = useState<string[]>(
    workspace.stores.map((store) => store.id),
  );
  const [scheduleAt, setScheduleAt] = useState("");
  const [sendPush, setSendPush] = useState(false);
  const [attachments, setAttachments] = useState<
    import("./src/types").MessageFile[]
  >([]);
  async function submit() {
    let scheduledFor: string | undefined;
    if (scheduleAt.trim()) {
      const match = scheduleAt
        .trim()
        .match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
      if (!match) {
        Alert.alert("Data incompleta", "Use o formato AAAA-MM-DD HH:MM.");
        return;
      }
      const [, year, month, day, hour, minute] = match;
      const localDate = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
      );
      if (
        localDate.getFullYear() !== Number(year) ||
        localDate.getMonth() !== Number(month) - 1 ||
        localDate.getDate() !== Number(day) ||
        localDate.getHours() !== Number(hour) ||
        localDate.getMinutes() !== Number(minute) ||
        localDate.getTime() < Date.now() + 120_000
      ) {
        Alert.alert(
          "Horário inválido",
          "Confira a data e escolha um horário pelo menos dois minutos à frente.",
        );
        return;
      }
      scheduledFor = localDate.toISOString();
    }
    const payload = {
      title,
      body,
      stores,
      urgent,
      scheduledFor,
      sendPush,
      attachments,
    };
    const result =
      kind === "alert"
        ? await app.publishAlert(payload)
        : await app.publish(payload);
    if (result.ok) {
      setTitle("");
      setBody("");
      setUrgent(false);
      setScheduleAt("");
      setSendPush(false);
      setAttachments([]);
    }
  }
  return (
    <Page>
      <Card>
        <Badge warning>
          {kind === "alert" ? "ALERTA PUSH" : "COMUNICADO COM CIÊNCIA"}
        </Badge>
        <Text style={s.small}>
          Envie agora ou programe para as lojas da sua abrangência.
        </Text>
        {workspace.person.role !== "gerente" && (
          <>
            <Text style={s.label}>Tipo de mensagem</Text>
            <Choice
              label="Comunicado com confirmação de ciência"
              selected={kind === "notice"}
              onPress={() => setKind("notice")}
            />
            <Choice
              label="Alerta com notificação push"
              selected={kind === "alert"}
              onPress={() => setKind("alert")}
            />
          </>
        )}
        <Field
          label="Título"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          placeholder="Resumo da orientação"
        />
        <Field
          label="Mensagem"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={kind === "alert" ? 3000 : 5000}
          placeholder="Escreva a orientação para a equipe…"
        />
        {kind === "notice" && (
          <Choice
            label="Enviar também como notificação push"
            selected={sendPush}
            onPress={() => setSendPush((value) => !value)}
          />
        )}
        <Button
          title={
            attachments.length
              ? `Adicionar arquivos · ${attachments.length}/10`
              : "Anexar PDF ou imagem"
          }
          secondary
          onPress={async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/webp",
              ],
              multiple: true,
              copyToCacheDirectory: true,
            });
            if (!result.canceled) {
              const next = result.assets.map((asset) => ({
                uri: asset.uri,
                name: asset.name,
                mimeType: asset.mimeType ?? null,
                size: asset.size ?? null,
              }));
              if (attachments.length + next.length > 10)
                Alert.alert(
                  "Limite de anexos",
                  "Você pode enviar até 10 arquivos por mensagem.",
                );
              else setAttachments((current) => [...current, ...next]);
            }
          }}
        />
        {attachments.map((file, index) => (
          <ActionRow
            key={`${file.name}-${index}`}
            title={file.name}
            detail={
              file.size
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : "Tamanho será validado ao enviar"
            }
            icon="doc.fill"
            onPress={() =>
              setAttachments((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          />
        ))}
        <CommunicationTargets stores={workspace.stores} onChange={setStores} />
        <Choice
          label="Destacar como prioritário"
          selected={urgent}
          onPress={() => setUrgent((value) => !value)}
        />
        <Field
          label="Programar envio (opcional) · AAAA-MM-DD HH:MM"
          value={scheduleAt}
          onChangeText={setScheduleAt}
          placeholder="2026-11-02 15:30"
          maxLength={16}
        />
        <Text style={s.small}>
          Deixe em branco para enviar agora. Horário local do aparelho.
        </Text>
        <Button
          title={
            app.busy
              ? "Salvando…"
              : scheduleAt
                ? "Programar envio"
                : kind === "alert"
                  ? "Enviar alerta"
                  : "Publicar comunicado"
          }
          disabled={app.busy || !stores.length || !title.trim() || !body.trim()}
          onPress={() => void submit()}
        />
      </Card>
      <ScheduledMessages />
    </Page>
  );
}

export function ProfileScreen({ openPrivacy }: { openPrivacy: () => void }) {
  const security = useDeviceSecurity();
  const app = useEO();
  const workspace = app.workspace!;
  const initials = workspace.person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <Page>
      <ScreenTitle title="Seu perfil" subtitle="Do seu jeito. Com segurança." />
      <View
        style={{
          backgroundColor: C.paper,
          borderRadius: 24,
          padding: 22,
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 22,
            backgroundColor: C.yellow,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 23, color: C.dark, fontWeight: "800" }}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <Text
            style={{
              fontSize: 19,
              lineHeight: 25,
              fontWeight: "700",
              color: C.ink,
            }}
          >
            {workspace.person.name}
          </Text>
          <Badge>{roleLabels[workspace.person.role]}</Badge>
        </View>
      </View>
      <PersonalSettings
        stores={workspace.stores}
        role={workspace.person.role}
      />
      <Section title="Seu espaço" />
      <Group>
        <MenuItem
          title="Lojas e regionais"
          detail="Unidades da sua abrangência"
          icon="building.2.fill"
          color="#4E7C68"
          tint="#ECF5EF"
          value={String(workspace.stores.length)}
          last
          onPress={() => router.push("/scope" as never)}
        />
      </Group>
      <Section title="Preferências" />
      <Group>
        <MenuItem
          title="Face ID / biometria"
          detail={
            security.enabled
              ? "Ativado · bloquear ao sair do app"
              : "Toque para proteger a sessão salva"
          }
          icon="lock.fill"
          color="#7871A1"
          tint="#F0EDF8"
          value={security.enabled ? "Ativo" : "Ativar"}
          onPress={() => void security.configure(!security.enabled)}
        />
        <MenuItem
          title="Notificações e aparelho"
          detail="Push, câmera, agenda e telefone"
          icon="bell.fill"
          color="#B87C4F"
          tint="#FCF0E6"
          last
          onPress={() => router.push("/device" as never)}
        />
      </Group>
      <Section title="Ajuda" />
      <Group>
        <MenuItem
          title="Privacidade"
          detail="Como seus dados são tratados"
          icon="checkmark.shield.fill"
          color="#65788B"
          tint="#EFF2F5"
          onPress={openPrivacy}
        />
        <MenuItem
          title="Falar com o suporte"
          detail="Tire suas dúvidas sobre o EO"
          icon="questionmark.circle.fill"
          color="#587C9D"
          tint="#EAF2FA"
          last
          onPress={() => void Linking.openURL("mailto:mbdo.matheus@gmail.com")}
        />
      </Group>
      <Button
        title={app.busy ? "Saindo…" : "Sair da conta"}
        secondary
        disabled={app.busy}
        onPress={() =>
          Alert.alert(
            "Sair do EO?",
            "Será necessário entrar com sua senha novamente.",
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Sair",
                style: "destructive",
                onPress: () => void app.signout(),
              },
            ],
          )
        }
      />
      <Text style={[s.small, { textAlign: "center", paddingVertical: 8 }]}>
        EO · {Constants.expoConfig?.version ?? "1.0.0"} (
        {Constants.expoConfig?.ios?.buildNumber ?? "dev"})
      </Text>
    </Page>
  );
}

export function PrivacyScreen({ back }: { back: () => void }) {
  return (
    <Page>
      <Brand compact />
      <Heading
        title="Política de Privacidade"
        detail="Última atualização: 7 de novembro de 2026"
      />
      <Text style={s.body}>
        Esta política explica como o aplicativo Excelência Operacional (EO),
        desenvolvido como projeto independente, trata dados pessoais. O app
        oferece comunicados e recursos de administração para equipes de loja. O
        acesso é liberado individualmente por um administrador.
      </Text>
      <Section title="Dados tratados" />
      <Text style={s.body}>
        Para autenticar e operar uma conta, o app trata chapa, nome e e-mail de
        contato, identificador da conta, perfil e lojas associadas. Também
        registra comunicados, confirmações de leitura e eventos de administração
        e segurança. A senha é gerenciada pelo Supabase e não é armazenada pelo
        app em texto aberto.
      </Text>
      <Text style={s.body}>
        A câmera é usada com sua permissão para evidências dos checklists. A
        agenda abre o formulário do sistema para você confirmar eventos. As
        notificações usam Expo, Apple e Google para entregar avisos. A biometria
        é validada pelo sistema do aparelho; o EO não recebe dados faciais ou
        impressões digitais. Não inclui publicidade.
      </Text>
      <Text style={s.body}>
        O microfone grava relatos de vendas de até um minuto quando você inicia
        a gravação. Diário e respostas à pergunta “Como está seu dia?” ficam
        associados à pessoa, à loja e à data. Diretores acessam registros de sua
        abrangência e administradores acessam a operação completa. Áudios ficam
        no armazenamento privado do Supabase.
      </Text>
      <Section title="Finalidades e segurança" />
      <Text style={s.body}>
        Os dados são usados para autenticação, aplicação de permissões,
        apresentação de comunicados, registro de ciência e administração do
        acesso. São usadas conexões protegidas e controles por perfil e loja.
        Nenhuma medida técnica elimina todos os riscos inerentes à transmissão e
        ao armazenamento de informações.
      </Text>
      <Section title="Serviços utilizados" />
      <Text style={s.body}>
        O serviço utiliza Supabase para autenticação e dados operacionais e
        Vercel para hospedagem do portal. Quando você solicita um resumo por IA,
        os totais e uma amostra limitada dos relatos em texto são enviados à
        Anthropic. O resumo fica salvo no Supabase. Os dados não são vendidos
        nem compartilhados para publicidade.
      </Text>
      <Section title="Permissões opcionais" />
      <Text style={s.body}>
        O ditado usa reconhecimento local quando disponível e mostra texto para
        revisão antes do envio. A Anthropic organiza somente o texto. A
        localização pode ser registrada no checklist com sua autorização, sem
        acompanhamento em segundo plano nem bloqueio por distância nesta versão.
        Você pode revogar permissões nos ajustes do aparelho.
      </Text>
      <Button
        title="Consultar termos de uso"
        secondary
        onPress={() =>
          void Linking.openURL("https://app-eo.vercel.app/termos.html")
        }
      />
      <Section title="Direitos e solicitações" />
      <Text style={s.body}>
        Para solicitar acesso, correção ou esclarecimentos sobre seus dados,
        escreva para mbdo.matheus@gmail.com. Poderemos confirmar sua identidade
        antes de atender ao pedido.
      </Text>
      <Button
        title="Falar com suporte"
        secondary
        onPress={() => void Linking.openURL("mailto:mbdo.matheus@gmail.com")}
      />
      <Button title="Voltar ao aplicativo" icon="←" onPress={back} />
    </Page>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 25 }}>
      <Text style={{ color: C.yellowStrong, fontSize: 25 }}>◈</Text>
      <Text style={s.strong}>{title}</Text>
      <Text style={[s.small, { textAlign: "center" }]}>{detail}</Text>
    </Card>
  );
}

const roleLabels: Record<Role, string> = {
  colaborador: "Colaborador",
  gerente: "Gerente",
  diretor: "Diretor",
  admin: "Administrador",
};
