import { OfflineEngine, type OfflineStorage } from "../offline/engine";
import { encryptedOfflineStorage } from "../offline/encrypted-storage";
import { randomUUID } from "expo-crypto";
import { createTimedFetch, withDeadline } from "./deadline";
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { sessionStorage, guardSessionFetch } from "./session-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured = Boolean(
  url && key && key.startsWith("sb_publishable_"),
);

export const authStorageKey = url
  ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  : "";
const createEOClient = () =>
  backendConfigured
    ? createClient(url!, key!, {
        global: { fetch: guardSessionFetch(createTimedFetch(fetch, 12000)) },
        auth: {
          storage: sessionStorage,
          storageKey: authStorageKey,
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export let supabase = createEOClient();
export function resetEOClient() {
  const previous = supabase;
  void previous?.auth.stopAutoRefresh();
  void previous?.removeAllChannels();
  supabase = createEOClient();
}

export async function rawRpc<T>(
  name: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new Error("Conexão ainda não configurada.");
  const client = supabase;
  const { data, error, status } = await withDeadline(
    async (timeoutSignal) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      timeoutSignal.addEventListener("abort", abort, { once: true });
      if (signal?.aborted || timeoutSignal.aborted) abort();
      try {
        return await client.rpc(name, args).abortSignal(controller.signal);
      } finally {
        signal?.removeEventListener("abort", abort);
        timeoutSignal.removeEventListener("abort", abort);
      }
    },
    15000,
    "Tempo limite de conexão. Tente sincronizar novamente.",
  );
  if (error)
    throw Object.assign(
      new Error(
        error.code === "42501"
          ? "Seu acesso ainda não foi liberado para esta operação."
          : error.message,
      ),
      { code: error.code, status },
    );
  return data as T;
}

export const offlineEngine = new OfflineEngine({
  storage: encryptedOfflineStorage as OfflineStorage,
  remote: rawRpc,
  requestId: randomUUID,
});
export async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!offlineEngine.status.userId) return rawRpc<T>(name, args, signal);
  return offlineEngine.rpc<T>(name, args, signal);
}
export function deliveryMessage(onlineMessage: string) {
  const status = offlineEngine.status;
  return !status.online || status.pending > 0
    ? "Salvo neste aparelho. Envio pendente de sincronização."
    : onlineMessage;
}
