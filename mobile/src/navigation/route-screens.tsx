import { rpc } from "../services/supabase";
import { ReportsHub } from "../features/ReportsHub";
import { ModuleAccess } from "../features/ModuleAccess";
import { MoodReminderBanner } from "../features/MoodReminderBanner";
import { SuccessToast, SuccessToastHost } from "../features/SuccessToast";
import { ScreenTitle, Group, MenuItem, Tile } from "../design";
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
  const banner = app.alerts.find((item) => !item.seen_at && !item.dismissed_at);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {children}
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

export function HomeRoute() {
  return <ModulesRoute />;
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
  const groups = [
    {
      title: "Vendas",
      items: [
        {
          id: "sales",
          title: "Venda semana",
          detail: "Relatórios e acompanhamento semanal",
          icon: "chart.bar.fill",
          path: "/sales?period=week",
        },
        {
          id: "sales",
          title: "Venda mês",
          detail: "Resultados do mês",
          icon: "calendar",
          path: "/sales?period=month",
        },
        {
          id: "sales",
          title: "Venda ano",
          detail: "Visão anual das lojas",
          icon: "chart.line.uptrend.xyaxis",
          path: "/sales?period=year",
        },
      ],
    },
    {
      title: "Comercial e sortimento",
      items: [
        {
          id: "product",
          title: "Pedir produto",
          detail: "Texto revisado e classificação por IA",
          icon: "shippingbox.fill",
          path: "/product",
        },
        {
          id: "assortment",
          title: "Sortimento por tamanho",
          detail: "Sessões e contagens por código",
          icon: "barcode.viewfinder",
          path: "/assortment",
        },
      ],
    },
    {
      title: "Pessoas e rotina",
      items: [
        {
          id: "diary",
          title: "Diário de vendas",
          detail: "Relato e motivos da operação",
          icon: "mic.fill",
          path: "/diary",
        },
        {
          id: "mood",
          title: "Como está seu dia?",
          detail: "Compartilhe como você se sente",
          icon: "face.smiling",
          path: "/mood",
        },
        {
          id: "diary",
          title: "Resumo da equipe",
          detail: "Registros por loja e regional",
          icon: "person.2.fill",
          path: "/diary?tab=summary",
        },
      ],
    },
    {
      title: "Comunicação e execução",
      items: [
        {
          id: "notices",
          title: "Comunicados",
          detail: "Orientações e ciência",
          icon: "doc.text.fill",
          path: "/notices",
        },
        {
          id: "checklists",
          title: "Checklists",
          detail: "Rotinas e evidências",
          icon: "checklist",
          path: "/checklists",
        },
        {
          id: "reports",
          title: "Relatórios",
          detail: "Central e auditoria conforme seu acesso",
          icon: "chart.bar.doc.horizontal",
          path: "/reports",
        },
      ],
    },
  ];
  return (
    <RouteFrame tabs>
      <Page>
        <ScreenTitle
          title="Aplicativos disponíveis"
          subtitle="Ferramentas liberadas para a sua conta."
        />
        {app.moduleVisible("agenda") && (
          <Group>
            <MenuItem
              title="Agenda de ações"
              detail="Pendências e lembretes no calendário"
              icon="calendar"
              onPress={() => router.push("/agenda" as never)}
            />
          </Group>
        )}
        {groups.map((group) => {
          const items = group.items.filter((item) =>
            app.moduleVisible(item.id),
          );
          return items.length ? (
            <View key={group.title}>
              <Section title={group.title} />
              <Group>
                {items.map((item, index) => (
                  <MenuItem
                    key={item.path}
                    title={item.title}
                    detail={item.detail}
                    icon={item.icon}
                    last={index === items.length - 1}
                    onPress={() => router.push(item.path as never)}
                  />
                ))}
              </Group>
            </View>
          ) : null;
        })}
        <Section title="Geral" />
        <Group>
          <MenuItem
            title="Alertas"
            detail="Avisos e pendências"
            icon="bell.fill"
            onPress={() => router.push("/alerts" as never)}
          />
          <MenuItem
            title="Minhas lojas"
            detail="Unidades do seu acesso"
            icon="building.2.fill"
            onPress={() => router.push("/scope" as never)}
          />
          <MenuItem
            title="Meu aparelho"
            detail="Notificações e permissões"
            icon="iphone"
            onPress={() => router.push("/device" as never)}
          />
          <MenuItem
            title="Configurações"
            detail="Conta, segurança e privacidade"
            icon="gearshape.fill"
            last
            onPress={() => goTab("profile")}
          />
        </Group>
      </Page>
    </RouteFrame>
  );
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
