import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured = Boolean(url && key && key.startsWith("sb_publishable_"));

const secureStorage = {
  async getItem(name: string) {
    const keyName = `eo-${name}`;
    const stored = await SecureStore.getItemAsync(keyName);
    if (!stored) return null;
    try {
      const metadata = JSON.parse(stored) as { eoSecureChunks?: number };
      if (Number.isInteger(metadata.eoSecureChunks) && metadata.eoSecureChunks! > 0) {
        const chunks = await Promise.all(Array.from({ length: metadata.eoSecureChunks! }, (_, index) => SecureStore.getItemAsync(`${keyName}.${index}`)));
        if (chunks.some((chunk) => chunk === null)) return null;
        return chunks.join("");
      }
    } catch {
      // Sessões antigas gravadas como um único valor continuam legíveis.
    }
    return stored;
  },
  async setItem(name: string, value: string) {
    const keyName = `eo-${name}`;
    const previous = await SecureStore.getItemAsync(keyName);
    let oldCount = 0;
    if (previous) {
      try { oldCount = Number((JSON.parse(previous) as { eoSecureChunks?: number }).eoSecureChunks) || 0; } catch { oldCount = 0; }
    }
    const size = 1700;
    const chunks = Array.from({ length: Math.max(1, Math.ceil(value.length / size)) }, (_, index) => value.slice(index * size, (index + 1) * size));
    for (let index = 0; index < chunks.length; index++) await SecureStore.setItemAsync(`${keyName}.${index}`, chunks[index]);
    await SecureStore.setItemAsync(keyName, JSON.stringify({ eoSecureChunks: chunks.length }));
    for (let index = chunks.length; index < oldCount; index++) await SecureStore.deleteItemAsync(`${keyName}.${index}`);
  },
  async removeItem(name: string) {
    const keyName = `eo-${name}`;
    const stored = await SecureStore.getItemAsync(keyName);
    let count = 0;
    if (stored) {
      try { count = Number((JSON.parse(stored) as { eoSecureChunks?: number }).eoSecureChunks) || 0; } catch { count = 0; }
    }
    for (let index = 0; index < count; index++) await SecureStore.deleteItemAsync(`${keyName}.${index}`);
    await SecureStore.deleteItemAsync(keyName);
  },
};

export const supabase = backendConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: secureStorage,
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Conexão ainda não configurada.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.code === "42501" ? "Seu acesso ainda não foi liberado para esta operação." : error.message);
  return data as T;
}
