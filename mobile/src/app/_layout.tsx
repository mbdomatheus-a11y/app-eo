import { ContactUpdateGate } from "../features/ContactRefresh";
import { DeviceSecurity } from "../providers/device-security";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Redirect, Stack, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EOProvider, useEO } from "../providers/eo-provider";
import { RouteFrame } from "../navigation/route-screens";
import { LoadingScreen } from "../../App";
import { C } from "../ui";

function RootNavigation() {
  const app = useEO();
  const segments = useSegments();
  const first = segments[0] ?? "(tabs)";
  useEffect(() => {
    if (!app.workspace || app.passwordMode) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const type = response.notification.request.content.data?.type;
      router.navigate(
        (type === "mood"
          ? "/mood"
          : type === "checklist"
            ? "/checklists"
            : type === "contact_update"
              ? "/profile"
              : "/notices") as never,
      );
      void Notifications.clearLastNotificationResponseAsync();
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const listener =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [app.workspace?.person.id, app.passwordMode]);

  if (app.initializing)
    return (
      <RouteFrame noHeader>
        <LoadingScreen configured={app.configured} error={app.error} />
      </RouteFrame>
    );
  if (!app.session && !["login", "privacy"].includes(first))
    return <Redirect href="/login" />;
  if (app.session && app.passwordMode && first !== "change-password")
    return <Redirect href="/change-password" />;
  if (app.session && !app.passwordMode && !app.workspace) {
    if (app.loading)
      return (
        <RouteFrame noHeader>
          <LoadingScreen configured={app.configured} error={app.error} />
        </RouteFrame>
      );
    if (first !== "access") return <Redirect href="/access" />;
  }
  if (app.workspace && ["login", "access", "change-password"].includes(first))
    return <Redirect href="/" />;

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.canvas },
          headerTintColor: C.dark,
          headerTitleStyle: { color: C.ink, fontSize: 17, fontWeight: "700" },
          headerShadowVisible: false,
          headerBackTitle: "Voltar",
          contentStyle: { backgroundColor: C.canvas },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ title: "Privacidade" }} />
        <Stack.Screen
          name="change-password"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="access" options={{ headerShown: false }} />
        <Stack.Screen name="notice/[id]" options={{ title: "Comunicado" }} />
        <Stack.Screen name="compose" options={{ title: "Novo comunicado" }} />
        <Stack.Screen name="scope" options={{ title: "Minhas lojas" }} />
        <Stack.Screen name="checklists" options={{ title: "Checklists" }} />
        <Stack.Screen
          name="contacts"
          options={{ title: "Atualizar contatos" }}
        />
        <Stack.Screen
          name="checklist-admin"
          options={{ title: "Criar checklist" }}
        />
        <Stack.Screen name="alerts" options={{ title: "Alertas" }} />
        <Stack.Screen name="device" options={{ title: "Meu aparelho" }} />
        <Stack.Screen name="product" options={{ title: "Pedir produto" }} />
        <Stack.Screen name="assortment" options={{ title: "Sortimento" }} />
        <Stack.Screen name="sales" options={{ title: "Vendas" }} />
        <Stack.Screen name="diary" options={{ title: "Diário de vendas" }} />
        <Stack.Screen name="mood" options={{ title: "Como está seu dia?" }} />
        <Stack.Screen name="stores" options={{ title: "Lojas" }} />
        <Stack.Screen
          name="people/index"
          options={{ title: "Pessoas e acessos" }}
        />
        <Stack.Screen
          name="people/new"
          options={{ title: "Cadastrar usuário" }}
        />
        <Stack.Screen name="people/[id]" options={{ title: "Editar acesso" }} />
        <Stack.Screen name="audit" options={{ title: "Auditoria" }} />
        <Stack.Screen name="reports" options={{ title: "Relatórios" }} />
        <Stack.Screen
          name="notice-reports"
          options={{ title: "Relatórios de comunicados" }}
        />
        <Stack.Screen
          name="module-access"
          options={{ title: "Gerenciar módulos" }}
        />
        <Stack.Screen
          name="archive"
          options={{ title: "Comunicados arquivados" }}
        />
      </Stack>
      {app.workspace && !app.passwordMode && (
        <ContactUpdateGate
          key={`${app.workspace.person.id}:${app.alerts.find((alert) => alert.data?.type === "contact_update")?.id ?? "none"}`}
          onSignOut={() => {
            void app.signout();
          }}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <EOProvider>
        <DeviceSecurity>
          <RootNavigation />
        </DeviceSecurity>
      </EOProvider>
    </SafeAreaProvider>
  );
}
