import { Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";
import { useEO } from "../../providers/eo-provider";
import { C } from "../../ui";

function TabIcon({ ios, android, color }: { ios: string; android: string; color: ColorValue }) {
  return <SymbolView name={{ ios, android } as SymbolViewProps["name"]} size={22} tintColor={color} />;
}

export default function TabLayout() {
  const app = useEO();
  const isAdmin = app.workspace?.person.role === "admin";
  const pending = app.notices.filter((notice) => !notice.acknowledged).length;
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: C.canvas },
    headerTintColor: C.dark,
    headerTitleStyle: { color: C.ink, fontSize: 17, fontWeight: "700" },
    headerShadowVisible: false,
    tabBarActiveTintColor: C.dark,
    tabBarInactiveTintColor: C.muted,
    tabBarStyle: { backgroundColor: C.paper, borderTopColor: C.line, height: 62, paddingTop: 5, paddingBottom: 4 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
  }}>
    <Tabs.Screen name="index" options={{ title: "Início", headerShown: false, tabBarIcon: ({ color }) => <TabIcon ios="house.fill" android="home" color={color} /> }} />
    <Tabs.Screen name="notices" options={{ title: "Avisos", tabBarBadge: pending || undefined, tabBarBadgeStyle: { backgroundColor: C.yellow, color: C.dark }, tabBarIcon: ({ color }) => <TabIcon ios="bell.fill" android="notifications" color={color} /> }} />
    <Tabs.Screen name="modules" options={{ title: "Apps", tabBarIcon: ({ color }) => <TabIcon ios="square.grid.2x2.fill" android="apps" color={color} /> }} />
    <Tabs.Screen name="management" options={{ title: "Gestão", href: isAdmin ? undefined : null, tabBarIcon: ({ color }) => <TabIcon ios="gearshape.fill" android="settings" color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: ({ color }) => <TabIcon ios="person.crop.circle.fill" android="account_circle" color={color} /> }} />
  </Tabs>;
}
