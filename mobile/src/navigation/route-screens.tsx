import { rpc } from "../services/supabase";
import { OfflineBanner } from "../features/OfflineStatus";
import { ReportsHub } from "../features/ReportsHub";
import { ModuleAccess } from "../features/ModuleAccess";
import { MoodReminderBanner } from "../features/MoodReminderBanner";
import { useMoodDeferral } from "../features/mood-deferral";
import { SuccessToast, SuccessToastHost } from "../features/SuccessToast";
import { ScreenTitle, Group, MenuItem, Tile } from "../design";
import { CapaModulo, FotoCapa, saudacao, type EspacoFoto } from "../features/aparencia";

const ROTAS_COM_CAPA = ["agenda", "escala", "sales", "product", "assortment", "diary", "mood", "checklists", "reports"];
import { useEffect, type ReactNode } from "react";
import {
  Redirect,
  router,
  useLocalSearchParams,
  usePathname,
} from "expo-router";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEO } from "../providers/eo-provider";
import { ScaleScreen } from "../features/ScaleScreen";
import { ModuleSearch } from "../features/ModuleSearch";
import { ATALHOS, GRUPOS, MODULOS, type ModuloApp } from "../features/module-catalog";
import { CartoesPendencia, GradeBlocos, type Pendencia } from "../features/Launcher";
import { roleLabels } from "../types";
import { SalesReportsScreen } from "../features/SalesReportsScreen";
import { OperationsScreen } from "../features/OperationsScreen";
import { RegisterPersonScreen } from "../../App";
import {
  AccessScreen,
  ArchiveScreen,
  AuditScreen,
  ChangePasswordScreen,
  ComposeScreen,
  EditPersonScreen,
  HomeScreen,
  LoginScreen,
  ManagementScreen,
  ModulesScreen,
  NoticeScreen,
  NoticesScreen,
  PeopleScreen,
  PrivacyScreen,
  ProfileScreen,
  ReportsScreen,
  StoresScreen,
} from "../../App";
import type { AdminTab } from "../types";
import {
  Button,
  C,
  Feedback,
  s,
  Page,
  Card,
  ActionRow,
  Section,
  Badge,
} from "../ui";

export function moduleForPath(path: string): string | null {
  const segment = path.split("/").filter(Boolean)[0] ?? "";
  return (
    (
      {
        agenda: "agenda",
        escala: "escala",
        "checklist-reports": "reports",
        sales: "sales",
        product: "product",
        assortment: "assortment",
        diary: "diary",
        mood: "mood",
        notices: "notices",
        notice: "notices",
        compose: "notices",
        checklists: "checklists",
        "checklist-admin": "checklists",
        reports: "reports",
        "notice-reports": "notices",
      } as Record<string, string>
    )[segment] ?? null
  );
}

type FrameProps = {
  children: ReactNode;
  home?: boolean;
  noHeader?: boolean;
  tabs?: boolean;
};

export function RouteFrame({
  children,
  home = false,
  noHeader = false,
  tabs = false,
}: FrameProps) {
  const app = useEO();
  const pathname = usePathname();
  const routeModule = moduleForPath(pathname);
  useEffect(() => {
    if (!app.workspace?.person.id || !["ios", "android"].includes(Platform.OS))
      return;
    const segment = pathname.split("/").filter(Boolean)[0] || "home";
    const system = [
      "home",
      "modules",
      "profile",
      "device",
      "units",
      "people",
      "contacts",
      "privacy",
    ].includes(segment)
      ? segment
      : "modules";
    void rpc("eo_record_access", {
      p_platform: Platform.OS,
      p_module: routeModule || system,
    }).catch(() => {});
  }, [app.workspace?.person.id, pathname, routeModule]);
  const [pushConsent, setPushConsent] = useState<
    "loading" | "unknown" | "accepted" | "deferred"
  >("loading");
  useEffect(() => {
    let alive = true;
    if (!app.session) {
      setPushConsent("loading");
      return () => {
        alive = false;
      };
    }
    void SecureStore.getItemAsync("eo.push-consent-v1").then((value) => {
      if (alive)
        setPushConsent(
          !value ? "unknown" : value === "accepted" ? "accepted" : "deferred",
        );
    });
    return () => {
      alive = false;
    };
  }, [app.session?.user.id]);
  const moodDeferral = useMoodDeferral(app.workspace?.person.id);
  const banner = app.alerts.find((item) =>
    !item.seen_at && !item.dismissed_at &&
    (item.data?.type !== "mood" || (moodDeferral.loaded && !moodDeferral.deferred && moodDeferral.answeredDate !== item.data?.date)),
  );
  // Capa com foto só na tela principal de cada módulo (21/11/2026).
  const segmentos = pathname.split("/").filter(Boolean);
  const capa =
    !tabs && !noHeader && segmentos.length === 1 && ROTAS_COM_CAPA.includes(segmentos[0])
      ? MODULOS.find((m) => m.id === routeModule)
      : undefined;
  const edges = home
    ? (["top", "left", "right"] as const)
    : tabs
      ? (["top", "left", "right"] as const)
      : noHeader
        ? (["top", "left", "right", "bottom"] as const)
        : (["left", "right", "bottom"] as const);
  if (app.workspace && routeModule && !app.moduleVisible(routeModule))
    return (
      <SafeAreaView style={s.screen} edges={edges}>
        <Page>
          <ScreenTitle
            title="Aplicativo indisponível"
            subtitle="Este módulo não está liberado para sua conta."
          />
          <MenuItem
            title="Aplicativos disponíveis"
            icon="square.grid.2x2"
            onPress={() => router.replace("/modules" as never)}
          />
        </Page>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
      <Feedback error={app.error} message="" onClose={app.clearFeedback} />
      <SuccessToastHost bottom={tabs ? 86 : 24} />
      <SuccessToast message={app.message} />
      <OfflineBanner />
      {app.workspace && app.moduleVisible("mood") && (
        <MoodReminderBanner
          userId={app.workspace.person.id}
          onRespond={() => router.navigate("/mood" as never)}
        />
      )}
      {app.session && !app.pushGranted && pushConsent === "deferred" && (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            backgroundColor: C.yellow,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{ color: C.dark, fontSize: 12, fontWeight: "700", flex: 1 }}
          >
            Avisos do EO estão desligados neste aparelho.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPushConsent("unknown")}
          >
            <Text style={{ color: C.dark, fontWeight: "900", fontSize: 12 }}>
              Rever
            </Text>
          </Pressable>
        </View>
      )}
      {banner && (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 8,
            padding: 13,
            borderRadius: 16,
            backgroundColor: banner.urgent ? "#FFF3D6" : C.paper,
            borderWidth: 1,
            borderColor: C.line,
            gap: 7,
          }}
        >
          <Text style={{ color: C.dark, fontSize: 14, fontWeight: "800" }}>
            {banner.urgent ? "Alerta prioritário" : "Novo alerta"} ·{" "}
            {banner.title}
          </Text>
          <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12 }}>
            {banner.body}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 18,
            }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => void app.markAlert(banner, "dismiss")}
            >
              <Text style={{ color: C.muted, fontWeight: "700", fontSize: 12 }}>
                Descartar
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void app.markAlert(banner, "view");
                router.navigate(
                  (banner.data?.type === "mood" ? "/mood" : "/alerts") as never,
                );
              }}
            >
              <Text style={{ color: C.dark, fontWeight: "800", fontSize: 12 }}>
                Visualizar
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      {capa && <CapaModulo espaco={capa.id as EspacoFoto} titulo={capa.titulo} detalhe={capa.detalhe} />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {tabs && app.workspace ? <ModuleSearch>{children}</ModuleSearch> : children}
      </KeyboardAvoidingView>
      <Modal
        visible={Boolean(
          app.session && !app.pushGranted && pushConsent === "unknown",
        )}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPushConsent("deferred");
          void SecureStore.setItemAsync("eo.push-consent-v1", "deferred");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(20,24,31,0.62)",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <View
            style={{
              backgroundColor: C.paper,
              borderRadius: 28,
              padding: 24,
              gap: 14,
              borderWidth: 1,
              borderColor: C.line,
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 20,
                backgroundColor: C.yellow,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 28 }}>🔔</Text>
            </View>
            <Text
              style={{
                color: C.dark,
                fontSize: 24,
                lineHeight: 30,
                fontWeight: "900",
              }}
            >
              Ative os avisos do EO
            </Text>
            <Text style={{ color: C.muted, fontSize: 15, lineHeight: 22 }}>
              Você poderá receber comunicados e alertas importantes mesmo com o
              aplicativo fechado. Os avisos aparecem na tela do aparelho e podem
              tocar um som, conforme as configurações do iOS ou Android.
            </Text>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
              O EO também mantém os avisos dentro do aplicativo. Você pode
              silenciar o som interno nas preferências; banners e notificações
              do sistema são controlados nas configurações do aparelho.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                await SecureStore.setItemAsync(
                  "eo.push-consent-v1",
                  "accepted",
                );
                setPushConsent("accepted");
                await app.enablePush();
              }}
              style={{
                marginTop: 3,
                backgroundColor: C.dark,
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: "center",
              }}
            >
              <Text style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>
                Concordo e ativar avisos
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPushConsent("deferred");
                void SecureStore.setItemAsync("eo.push-consent-v1", "deferred");
              }}
              style={{ paddingVertical: 9, alignItems: "center" }}
            >
              <Text style={{ color: C.muted, fontSize: 14, fontWeight: "700" }}>
                Agora não
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const tabPaths: Record<string, string> = {
  home: "/",
  notices: "/notices",
  modules: "/modules",
  management: "/management",
  profile: "/profile",
};
const goTab = (tab: string) => router.navigate((tabPaths[tab] ?? "/") as never);
const goNotice = (id: string) =>
  router.push({ pathname: "/notice/[id]", params: { id } } as never);
const goCompose = () => router.push("/compose" as never);

// Menus reorganizados em 18/11/2026 (versão enxuta aprovada por Matheus): Início com o que fazer agora
// e atalhos; Aplicativos sem itens repetidos; conta, aparelho e lojas ficam em Mais. Barra inferior e
// botão central de ações rápidas mantidos.
export function HomeRoute() {
  const app = useEO();
  const ws = app.workspace;
  const primeiroNome = ws?.person.name?.trim().split(/\s+/)[0] ?? "";
  const lojas = ws?.stores ?? [];
  const contexto = ws
    ? `${roleLabels[ws.person.role]} · ${lojas.length === 1 ? `${lojas[0].code} ${lojas[0].name}` : `${lojas.length} lojas`}`
    : "";
  const avisos = app.notices.filter((n) => !n.acknowledged).length;
  const alertas = app.alerts.filter((a) => !a.seen_at && !a.dismissed_at).length;
  const checklists = app.checklists.filter((c) => c.status !== "completed").length;
  const pendencias: Pendencia[] = [
    ...(app.moduleVisible("notices")
      ? [{ chave: "avisos", numero: avisos, rotulo: "comunicados para dar ciência", vazio: "Comunicados em dia", abrir: () => goTab("notices") }]
      : []),
    ...(app.moduleVisible("checklists")
      ? [{ chave: "checklists", numero: checklists, rotulo: "checklists para responder", vazio: "Checklists em dia", abrir: () => router.push("/checklists" as never) }]
      : []),
    { chave: "alertas", numero: alertas, rotulo: "alertas novos", vazio: "Sem alertas novos", abrir: () => router.push("/alerts" as never) },
  ];
  const atalhos = ATALHOS.map((rota) => MODULOS.find((m) => m.rota === rota)).filter(
    (m): m is ModuloApp => !!m && app.moduleVisible(m.id),
  );
  return (
    <RouteFrame tabs>
      <Page>
        <FotoCapa
          espaco="inicio"
          altura={Platform.OS === "web" ? 280 : 220}
          etiqueta={saudacao()}
          titulo={primeiroNome ? `Olá, ${primeiroNome}` : "Início"}
          subtitulo={contexto}
        />
        <Section title="Para fazer agora" />
        <CartoesPendencia itens={pendencias} />
        {atalhos.length > 0 && (
          <>
            <Section title="Seus atalhos" />
            <GradeBlocos itens={atalhos.map((m) => ({ chave: m.rota, titulo: m.titulo, icone: m.icone, moduleId: m.id, grupo: m.grupo, abrir: () => router.push(m.rota as never) }))} />
          </>
        )}
        <View style={{ height: 6 }} />
        <Button title="Ver todos os aplicativos" secondary icon="square.grid.2x2.fill" onPress={() => goTab("modules")} />
      </Page>
    </RouteFrame>
  );
}
export function NoticesRoute() {
  return (
    <RouteFrame tabs>
      <NoticesScreen openNotice={goNotice} openCompose={goCompose} />
    </RouteFrame>
  );
}
export function ModulesRoute() {
  const app = useEO();
  const grupos = GRUPOS.map((g) => ({
    titulo: g,
    itens: MODULOS.filter((m) => m.grupo === g && m.id !== "notices" && app.moduleVisible(m.id)),
  })).filter((g) => g.itens.length);
  return (
    <RouteFrame tabs>
      <Page>
        <ScreenTitle title="Aplicativos" subtitle="Toque para abrir. Use a busca no topo para achar mais rápido." />
        {grupos.map((g) => (
          <View key={g.titulo} style={{ gap: 2 }}>
            <Section title={g.titulo} />
            <GradeBlocos itens={g.itens.map((m) => ({ chave: m.rota, titulo: m.titulo, icone: m.icone, moduleId: m.id, grupo: g.titulo, abrir: () => router.push(m.rota as never) }))} />
          </View>
        ))}
        {!grupos.length && <Text style={s.small}>Nenhum aplicativo liberado para sua conta.</Text>}
        <Text style={[s.small, { marginTop: 14 }]}>Comunicados ficam na aba Avisos. Conta, aparelho e lojas ficam em Mais.</Text>
      </Page>
    </RouteFrame>
  );
}
export function ScaleRoute() {
  return <RouteFrame><ScaleScreen /></RouteFrame>;
}
export function SalesRoute() {
  const { period } = useLocalSearchParams<{ period?: string }>();
  const selected = period === "month" || period === "year" ? period : "week";
  return (
    <RouteFrame>
      <SalesReportsScreen key={selected} initialPeriod={selected} />
    </RouteFrame>
  );
}
export function DiaryRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const selected = tab === "summary" ? "summary" : "diary";
  return (
    <RouteFrame>
      <OperationsScreen key={selected} initialTab={selected} />
    </RouteFrame>
  );
}
export function MoodRoute() {
  return (
    <RouteFrame>
      <OperationsScreen initialTab="mood" />
    </RouteFrame>
  );
}
export function ManagementRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function ProfileRoute() {
  return (
    <RouteFrame tabs>
      <ProfileScreen openPrivacy={() => router.push("/privacy" as never)} />
    </RouteFrame>
  );
}
export function LoginRoute() {
  return (
    <RouteFrame noHeader>
      <LoginScreen openPrivacy={() => router.push("/privacy" as never)} />
    </RouteFrame>
  );
}
export function PrivacyRoute() {
  return (
    <RouteFrame>
      <PrivacyScreen back={() => router.back()} />
    </RouteFrame>
  );
}
export function ChangePasswordRoute() {
  return (
    <RouteFrame noHeader>
      <ChangePasswordScreen />
    </RouteFrame>
  );
}
export function AccessRoute() {
  return (
    <RouteFrame noHeader>
      <AccessScreen />
    </RouteFrame>
  );
}
export function NoticeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RouteFrame>
      <NoticeScreen id={id ?? ""} back={() => router.back()} />
    </RouteFrame>
  );
}
export function ComposeRoute() {
  const app = useEO();
  if (
    !app.workspace ||
    !["admin", "diretor"].includes(app.workspace.person.role)
  )
    return <Redirect href="/" />;
  return (
    <RouteFrame>
      <ComposeScreen />
    </RouteFrame>
  );
}
export function StoresRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function PeopleRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function RegisterPersonRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function EditPersonRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function AuditRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function ReportsRoute() {
  return (
    <RouteFrame>
      <ReportsHub
        onOpen={(module) =>
          router.push(
            (
              {
                notices: "/notice-reports",
                product: "/product?report=1",
                assortment: "/assortment?report=1",
                diary: "/diary?tab=summary",
                mood: "/mood",
                checklists: "/checklist-reports",
                sales: "/sales",
              } as Record<string, string>
            )[module] as never,
          )
        }
      />
    </RouteFrame>
  );
}
export function ModuleAccessRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}

export function NoticeReportsRoute() {
  const app = useEO();
  useEffect(() => {
    if (app.workspace?.person.role === "admin") void app.loadAdmin("reports");
  }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return (
    <RouteFrame>
      <ReportsScreen />
    </RouteFrame>
  );
}
export function ArchiveRoute() {
  // Gestão fica só no site (decisão de 11/11/2026).
  return <Redirect href="/" />;
}
