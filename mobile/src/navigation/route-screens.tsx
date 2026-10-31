import { useEffect, type ReactNode } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEO } from "../providers/eo-provider";
import { AccessScreen, AuditScreen, ChangePasswordScreen, ComposeScreen, EditPersonScreen, HomeScreen, LoginScreen, ManagementScreen, ModulesScreen, NoticeScreen, NoticesScreen, PeopleScreen, PrivacyScreen, ProfileScreen, StoresScreen } from "../../App";
import type { AdminTab } from "../types";
import { C, Feedback, s } from "../ui";

type FrameProps = { children: ReactNode; home?: boolean; noHeader?: boolean; tabs?: boolean };

export function RouteFrame({ children, home = false, noHeader = false, tabs = false }: FrameProps) {
  const app = useEO();
  const edges = home ? ["top", "left", "right"] as const : tabs ? ["left", "right"] as const : noHeader ? ["top", "left", "right", "bottom"] as const : ["left", "right", "bottom"] as const;
  return <SafeAreaView style={s.screen} edges={edges}>
    <StatusBar barStyle="dark-content" backgroundColor={C.canvas} />
    <Feedback error={app.error} message={app.message} onClose={app.clearFeedback} />
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
