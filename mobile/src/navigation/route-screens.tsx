import { useEffect, type ReactNode } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEO } from "../providers/eo-provider";
import { AccessScreen, AuditScreen, ChangePasswordScreen, ComposeScreen, EditPersonScreen, HomeScreen, LoginScreen, ManagementScreen, ModulesScreen, NoticeScreen, NoticesScreen, PeopleScreen, PrivacyScreen, ProfileScreen, StoresScreen } from "../../App";
import type { AdminTab } from "../types";
import { C, Feedback, s } from "../ui";

type FrameProps = { children: ReactNode; home?: boolean; noHeader?: boolean; tabs?: boolean };

export function RouteFrame({ children, home = false, noHeader = false, tabs = false }: FrameProps) {
  const app = useEO();
  const banner = app.alerts.find((item) => !item.seen_at && !item.dismissed_at);
  const edges = home ? ["top", "left", "right"] as const : tabs ? ["left", "right"] as const : noHeader ? ["top", "left", "right", "bottom"] as const : ["left", "right", "bottom"] as const;
  return <SafeAreaView style={s.screen} edges={edges}>
    <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
    <Feedback error={app.error} message={app.message} onClose={app.clearFeedback} />
    {app.session && !app.pushGranted && <View style={{ marginHorizontal: 14, marginTop: 8, padding: 13, borderRadius: 16, backgroundColor: C.yellow, gap: 6 }}><Text style={{ color: C.dark, fontSize: 13, fontWeight: "800" }}>Receba alertas importantes no aparelho</Text><Text style={{ color: C.dark, fontSize: 11, lineHeight: 16 }}>O EO mantém o banner dentro do app. Ative notificações para receber avisos do sistema; se desativar, isso só poderá ser alterado nas configurações do aparelho.</Text><Pressable accessibilityRole="button" onPress={() => void app.enablePush()} style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.dark }}><Text style={{ color: C.paper, fontWeight: "800", fontSize: 12 }}>Ativar notificações</Text></Pressable></View>}
    {banner && <View style={{ marginHorizontal: 14, marginTop: 8, padding: 13, borderRadius: 16, backgroundColor: banner.urgent ? "#FFF3D6" : C.paper, borderWidth: 1, borderColor: C.line, gap: 7 }}><Text style={{ color: C.dark, fontSize: 14, fontWeight: "800" }}>{banner.urgent ? "Alerta prioritário" : "Novo alerta"} · {banner.title}</Text><Text numberOfLines={2} style={{ color: C.muted, fontSize: 12 }}>{banner.body}</Text><View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 18 }}><Pressable accessibilityRole="button" onPress={() => void app.markAlert(banner, "dismiss")}><Text style={{ color: C.muted, fontWeight: "700", fontSize: 12 }}>Descartar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { void app.markAlert(banner, "view"); router.navigate("/modules" as never); }}><Text style={{ color: C.dark, fontWeight: "800", fontSize: 12 }}>Visualizar</Text></Pressable></View></View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>{children}</KeyboardAvoidingView>
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
  return <RouteFrame tabs><ModulesScreen openTab={goTab} /></RouteFrame>;
}
export function ManagementRoute() {
  const app = useEO();
  useEffect(() => { if (app.workspace?.person.role === "admin") void app.loadAdmin("stores"); }, [app.workspace?.person.id]);
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame tabs><ManagementScreen open={(tab: AdminTab) => { void app.loadAdmin(tab); router.push((tab === "stores" ? "/stores" : tab === "people" ? "/people" : "/audit") as never); }} /></RouteFrame>;
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
