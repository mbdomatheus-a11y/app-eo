import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Platform, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useEO } from "./eo-provider";
import { Brand, Button, s } from "../ui";
import { DeviceSecurityMachine } from "./device-security-machine";
import { reportarErro } from "./error-reporter";
type Security = {
  enabled: boolean;
  configure: (enabled: boolean) => Promise<void>;
};
const Context = createContext<Security>({
  enabled: false,
  configure: async () => {},
});
export const useDeviceSecurity = () => useContext(Context);
const keyFor = (id: string) => `eo.biometric.${id}`;
const options = {
  requireAuthentication: true,
  authenticationPrompt: "Desbloquear o EO",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export function DeviceSecurity({ children }: { children: ReactNode }) {
  const app = useEO(),
    appRef = useRef(app);
  appRef.current = app;
  const machineRef = useRef<DeviceSecurityMachine | null>(null);
  if (!machineRef.current)
    machineRef.current = new DeviceSecurityMachine(
      {
        readEnabled: async (user) =>
          (await SecureStore.getItemAsync(`${keyFor(user)}.enabled`)) === "1",
        readSecret: (user) => SecureStore.getItemAsync(keyFor(user), options),
        writeSecret: (user) =>
          SecureStore.setItemAsync(keyFor(user), user, options),
        writeEnabled: async (user, enabled) => {
          if (enabled)
            await SecureStore.setItemAsync(`${keyFor(user)}.enabled`, "1");
          else await SecureStore.deleteItemAsync(`${keyFor(user)}.enabled`);
        },
        canUseBiometry: () => SecureStore.canUseBiometricAuthentication(),
        signout: () => appRef.current.signout(),
        report: (error) => reportarErro(error, false, { origem: "biometria" }),
      },
      AppState.currentState,
    );
  const machine = machineRef.current;
  const state = useSyncExternalStore(
    machine.subscribe,
    machine.snapshot,
    machine.snapshot,
  );
  const user = app.session?.user.id ?? "";
  useEffect(() => {
    void machine.setUser(user);
  }, [machine, user]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      machine.onAppState(state),
    );
    return () => {
      subscription.remove();
      machine.dispose();
    };
  }, [machine]);
  const blocked =
    state.owner !== user || (!!user && state.enabled && state.locked);
  const working = ["unlocking", "configuring"].includes(state.phase);
  return (
    <Context.Provider
      value={{
        enabled: state.enabled,
        configure: (enabled) => machine.configure(enabled),
      }}
    >
      {blocked ? (
        <View style={[s.screen, s.centered]}>
          <Brand />
          <View style={{ height: 20 }} />
          <Text style={s.title}>
            {state.owner !== user
              ? "Protegendo seu acesso"
              : "Seu espaço está protegido"}
          </Text>
          <Text style={[s.detail, { textAlign: "center" }]}>
            Use{" "}
            {Platform.OS === "ios"
              ? "Face ID ou Touch ID"
              : "a biometria do aparelho"}{" "}
            para continuar.
          </Text>
          {!!state.message && (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.detail, { textAlign: "center" }]}
            >
              {state.message}
            </Text>
          )}
          {user && (
            <>
              <Button
                title={working ? "Confirmando…" : "Desbloquear EO"}
                disabled={
                  working ||
                  state.phase === "loading" ||
                  state.phase === "password"
                }
                onPress={() => void machine.unlock()}
              />
              <Button
                title={
                  state.phase === "password"
                    ? "Abrindo entrada…"
                    : "Entrar com minha senha"
                }
                secondary
                disabled={state.phase === "password"}
                onPress={() => void machine.passwordLogin()}
              />
            </>
          )}
        </View>
      ) : (
        children
      )}
    </Context.Provider>
  );
}
