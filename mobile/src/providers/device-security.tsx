import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Platform, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useEO } from "./eo-provider";
import { Brand, Button, C, s } from "../ui";

type Security = { enabled: boolean; configure: (enabled: boolean) => Promise<void> };
const Context = createContext<Security>({ enabled: false, configure: async () => {} });
export const useDeviceSecurity = () => useContext(Context);
const keyFor = (id: string) => `eo.biometric.${id}`;
const options = { requireAuthentication: true, authenticationPrompt: "Desbloquear o EO", keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function DeviceSecurity({ children }: { children: ReactNode }) {
  const app = useEO();
  const user = app.session?.user.id ?? "";
  const [owner, setOwner] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(true);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const currentUser = useRef(user); currentUser.current = user;
  useEffect(() => {
    let alive = true;
    setLocked(true);
    const load = async () => {
      try {
        const active = user ? await SecureStore.getItemAsync(`${keyFor(user)}.enabled`) === "1" : false;
        if (alive) { setEnabled(active); setLocked(active); setOwner(user); }
      } catch { if (alive) { setEnabled(true); setLocked(true); setOwner(user); } }
    };
    void load();
    return () => { alive = false; };
  }, [user]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" && enabled && !busy.current) setLocked(true);
    });
    return () => subscription.remove();
  }, [enabled]);
  const unlock = async () => {
    if (busy.current) return;
    busy.current = true; setWorking(true);
    try {
      const value = await SecureStore.getItemAsync(keyFor(user), options);
      if (currentUser.current === user && value === user) setLocked(false);
      else Alert.alert("Entre com sua senha", "A proteção do aparelho mudou. Entre novamente para reativar a biometria.");
    } catch { Alert.alert("EO bloqueado", "Não foi possível confirmar sua identidade. Tente novamente ou entre com sua senha."); }
    finally { busy.current = false; setWorking(false); }
  };
  const configure = async (active: boolean) => {
    if (!user || busy.current) return;
    busy.current = true; setWorking(true);
    try {
      if (active) {
        if (!SecureStore.canUseBiometricAuthentication()) throw new Error("Configure Face ID, Touch ID ou biometria nos ajustes do aparelho primeiro.");
        await SecureStore.setItemAsync(keyFor(user), user, options);
        if (await SecureStore.getItemAsync(keyFor(user), options) !== user) throw new Error("Identidade não confirmada.");
        await SecureStore.setItemAsync(`${keyFor(user)}.enabled`, "1");
      } else {
        await SecureStore.deleteItemAsync(`${keyFor(user)}.enabled`);
        await SecureStore.deleteItemAsync(keyFor(user));
      }
      setEnabled(active); setLocked(false);
    } catch (error) { Alert.alert("Proteção do EO", error instanceof Error ? error.message : "Não foi possível configurar a biometria."); }
    finally { busy.current = false; setWorking(false); }
  };
  const passwordLogin = async () => {
    if (busy.current) return;
    const previous = user;
    const result = await app.signout();
    if (result.ok) {
      await SecureStore.deleteItemAsync(`${keyFor(previous)}.enabled`);
      await SecureStore.deleteItemAsync(keyFor(previous));
    }
  };
  const blocked = owner !== user || (Boolean(user) && enabled && locked);
  return <Context.Provider value={{ enabled, configure }}>{blocked ? <View style={[s.screen, s.centered]}><Brand /><View style={{ height: 20 }} /><Text style={s.title}>{owner !== user ? "Protegendo seu acesso" : "Seu espaço está protegido"}</Text><Text style={[s.detail, { textAlign: "center" }]}>Use {Platform.OS === "ios" ? "Face ID ou Touch ID" : "a biometria do aparelho"} para continuar na sua sessão.</Text>{owner === user && <><Button title={working ? "Confirmando…" : "Desbloquear EO"} disabled={working} onPress={() => void unlock()} /><Button title="Entrar com minha senha" secondary disabled={working || app.busy} onPress={() => void passwordLogin()} /></>}</View> : children}</Context.Provider>;
}
