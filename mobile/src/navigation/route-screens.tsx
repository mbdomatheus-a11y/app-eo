import { useEffect, type ReactNode } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StatusBar, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEO } from "../providers/eo-provider";
import { AccessScreen, ArchiveScreen, AuditScreen, ChangePasswordScreen, ComposeScreen, EditPersonScreen, HomeScreen, LoginScreen, ManagementScreen, ModulesScreen, NoticeScreen, NoticesScreen, PeopleScreen, PrivacyScreen, ProfileScreen, ReportsScreen, StoresScreen } from "../../App";
import type { AdminTab } from "../types";
import { C, Feedback, s, Page, Card, ActionRow, Section, Badge } from "../ui";

type FrameProps = { children: ReactNode; home?: boolean; noHeader?: boolean; tabs?: boolean };

export function RouteFrame({ children, home = false, noHeader = false, tabs = false }: FrameProps) {
  const app = useEO();
  const [pushConsent, setPushConsent] = useState<"unknown" | "accepted" | "deferred">("unknown");
  useEffect(() => {
    let alive = true;
    if (!app.session) { setPushConsent("unknown"); return () => { alive = false; }; }
    void SecureStore.getItemAsync("eo.push-consent-v1").then((value) => { if (alive && value) setPushConsent(value === "accepted" ? "accepted" : "deferred"); });
    return () => { alive = false; };
  }, [app.session?.user.id]);
  const banner = app.alerts.find((item) => !item.seen_at && !item.dismissed_at);
  const edges = home ? ["top", "left", "right"] as const : tabs ? ["left", "right"] as const : noHeader ? ["top", "left", "right", "bottom"] as const : ["left", "right", "bottom"] as const;
  return <SafeAreaView style={s.screen} edges={edges}>
    <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
    <Feedback error={app.error} message={app.message} onClose={app.clearFeedback} />
    {app.session && !app.pushGranted && pushConsent === "deferred" && <View style={{ marginHorizontal: 14, marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: C.yellow, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: C.dark, fontSize: 12, fontWeight: "700", flex: 1 }}>Avisos do EO estão desligados neste aparelho.</Text><Pressable accessibilityRole="button" onPress={() => setPushConsent("unknown")}><Text style={{ color: C.dark, fontWeight: "900", fontSize: 12 }}>Rever</Text></Pressable></View>}
    {banner && <View style={{ marginHorizontal: 14, marginTop: 8, padding: 13, borderRadius: 16, backgroundColor: banner.urgent ? "#FFF3D6" : C.paper, borderWidth: 1, borderColor: C.line, gap: 7 }}><Text style={{ color: C.dark, fontSize: 14, fontWeight: "800" }}>{banner.urgent ? "Alerta prioritário" : "Novo alerta"} · {banner.title}</Text><Text numberOfLines={2} style={{ color: C.muted, fontSize: 12 }}>{banner.body}</Text><View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 18 }}><Pressable accessibilityRole="button" onPress={() => void app.markAlert(banner, "dismiss")}><Text style={{ color: C.muted, fontWeight: "700", fontSize: 12 }}>Descartar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { void app.markAlert(banner, "view"); router.navigate("/modules" as never); }}><Text style={{ color: C.dark, fontWeight: "800", fontSize: 12 }}>Visualizar</Text></Pressable></View></View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>{children}</KeyboardAvoidingView>
    <Modal visible={Boolean(app.session && !app.pushGranted && pushConsent === "unknown")} transparent animationType="fade" onRequestClose={() => { setPushConsent("deferred"); void SecureStore.setItemAsync("eo.push-consent-v1", "deferred"); }}>
      <View style={{ flex: 1, backgroundColor: "rgba(20,24,31,0.62)", justifyContent: "center", padding: 22 }}>
        <View style={{ backgroundColor: C.paper, borderRadius: 28, padding: 24, gap: 14, borderWidth: 1, borderColor: C.line }}>
          <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 28 }}>🔔</Text></View>
          <Text style={{ color: C.dark, fontSize: 24, lineHeight: 30, fontWeight: "900" }}>Ative os avisos do EO</Text>
          <Text style={{ color: C.muted, fontSize: 15, lineHeight: 22 }}>Você poderá receber comunicados e alertas importantes mesmo com o aplicativo fechado. Os avisos aparecem na tela do aparelho e podem tocar um som, conforme as configurações do iOS ou Android.</Text>
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>O EO também mantém os avisos dentro do aplicativo. Você pode silenciar o som interno nas preferências; banners e notificações do sistema são controlados nas configurações do aparelho.</Text>
          <Pressable accessibilityRole="button" onPress={async () => { await SecureStore.setItemAsync("eo.push-consent-v1", "accepted"); setPushConsent("accepted"); await app.enablePush(); }} style={{ marginTop: 3, backgroundColor: C.dark, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}><Text style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>Concordo e ativar avisos</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setPushConsent("deferred"); void SecureStore.setItemAsync("eo.push-consent-v1", "deferred"); }} style={{ paddingVertical: 9, alignItems: "center" }}><Text style={{ color: C.muted, fontSize: 14, fontWeight: "700" }}>Agora não</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const tabPaths: Record<string, string> = { home: "/", notices: "/notices", modules: "/modules", management: "/management", profile: "/profile" };
const goTab = (tab: string) => router.navigate((tabPaths[tab] ?? "/") as never);
const goNotice = (id: string) => router.push({ pathname: "/notice/[id]", params: { id } } as never);
const goCompose = () => router.push("/compose" as never);

export function HomeRoute() {
  return <RouteFrame home><HomeScreen openTab={goTab} openNotice={goNotice} openCompose={goCompose} /></RouteFrame>;
}
export function NoticesRoute() {
  return <RouteFrame tabs><NoticesScreen openNotice={goNotice} openCompose={goCompose} /></RouteFrame>;
}
export function ModulesRoute() {
  return <RouteFrame tabs><Page><Text style={s.title}>Sua operação</Text><Text style={s.detail}>Escolha uma ferramenta para continuar.</Text><Section title="Rotina da equipe" /><Card><ActionRow title="Checklists" detail="Respostas, fotos e pendências" icon="checklist" onPress={() => router.push("/checklists" as never)} /><ActionRow title="Alertas" detail="Orientações e avisos prioritários" icon="bell.fill" onPress={() => router.push("/alerts" as never)} /><ActionRow title="Comunicados" detail="Sua caixa de entrada e confirmações" icon="doc.text.fill" onPress={() => goTab("notices")} /></Card><Section title="Conectado ao aparelho" /><Card><ActionRow title="Câmera, agenda e telefone" detail="Use os recursos do seu iPhone ou Android" icon="camera.fill" onPress={() => router.push("/device" as never)} /><ActionRow title="Segurança e preferências" detail="Face ID, sessão salva e privacidade" icon="lock.fill" onPress={() => goTab("profile")} /></Card></Page></RouteFrame>;
}
export function ManagementRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("stores"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame tabs><ManagementScreen open={(tab: AdminTab) => { void app.loadAdmin(tab); router.push((tab === "stores" ? "/stores" : tab === "people" ? "/people" : tab === "audit" ? "/audit" : tab === "reports" ? "/reports" : "/archive") as never); }} /></RouteFrame>;
}
export function ProfileRoute() {
  return <RouteFrame tabs><ProfileScreen openPrivacy={() => router.push("/privacy" as never)} /></RouteFrame>;
}
export function LoginRoute() {
  return <RouteFrame noHeader><LoginScreen openPrivacy={() => router.push("/privacy" as never)} /></RouteFrame>;
}
export function PrivacyRoute() {
  return <RouteFrame><PrivacyScreen back={() => router.back()} /></RouteFrame>;
}
export function ChangePasswordRoute() {
  return <RouteFrame noHeader><ChangePasswordScreen /></RouteFrame>;
}
export function AccessRoute() {
  return <RouteFrame noHeader><AccessScreen /></RouteFrame>;
}
export function NoticeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RouteFrame><NoticeScreen id={id ?? ""} back={() => router.back()} /></RouteFrame>;
}
export function ComposeRoute() {
  const app = useEO();
  if (!app.workspace || !["admin", "diretor"].includes(app.workspace.person.role)) return <Redirect href="/" />;
  return <RouteFrame><ComposeScreen /></RouteFrame>;
}
export function StoresRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("stores"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><StoresScreen /></RouteFrame>;
}
export function PeopleRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("people"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><PeopleScreen edit={(id) => router.push({ pathname: "/people/[id]", params: { id } } as never)} /></RouteFrame>;
}
export function EditPersonRoute() {
  const app = useEO();
  const { id } = useLocalSearchParams<{ id: string }>();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("people"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><EditPersonScreen id={id ?? ""} back={() => router.back()} /></RouteFrame>;
}
export function AuditRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("audit"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><AuditScreen /></RouteFrame>;
}
export function ReportsRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("reports"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame tabs><ReportsScreen /></RouteFrame>;
}
export function ArchiveRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("archive"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame tabs><ArchiveScreen /></RouteFrame>;
}
