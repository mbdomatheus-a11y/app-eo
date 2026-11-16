import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";

let generation = 0;
let storageTail: Promise<unknown> = Promise.resolve();
let markerTail: Promise<unknown> = Promise.resolve();
function storageExclusive<T>(work: () => Promise<T>): Promise<T> {
  const task = storageTail.then(work);
  storageTail = task.catch(() => {});
  return task;
}
function markerExclusive<T>(work: () => Promise<T>): Promise<T> {
  const task = markerTail.then(work);
  markerTail = task.catch(() => {});
  return task;
}
let closed: boolean | null = null;
let flagPromise: Promise<boolean> | null = null;
const CLOSED_KEY = "eo.session.closed.v1";
export const sessionGeneration = () => generation;
async function isClosed() {
  if (closed !== null) return closed;
  if (!flagPromise) {
    const start = generation;
    flagPromise = SecureStore.getItemAsync(CLOSED_KEY).then((value) => {
      if (start === generation) closed = value === "1";
      return closed ?? true;
    });
  }
  return flagPromise;
}
const keyFor = (name: string) => `eo-${name}`;
const validCount = (n: unknown) =>
  Number.isInteger(n) && Number(n) > 0 && Number(n) <= 100;
export const sessionStorage = {
  async getItem(name: string) {
    const start = generation;
    if (await isClosed()) return null;
    const key = keyFor(name),
      raw = await SecureStore.getItemAsync(key);
    if (start !== generation || closed) return null;
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw);
      if (validCount(meta.eoSecureChunks)) {
        const prefix =
          typeof meta.chunkId === "string" &&
          /^[a-f0-9-]{36}$/.test(meta.chunkId)
            ? `${key}.${meta.chunkId}`
            : key;
        const parts = await Promise.all(
          Array.from({ length: meta.eoSecureChunks }, (_, i) =>
            SecureStore.getItemAsync(`${prefix}.${i}`),
          ),
        );
        return start === generation && !closed && !parts.some((v) => v === null)
          ? parts.join("")
          : null;
      }
    } catch {
      /* valor legado sem fragmentação */
    }
    return start === generation && !closed ? raw : null;
  },
  async setItem(name: string, value: string) {
    const start = generation;
    return storageExclusive(async () => {
      if (start !== generation || (await isClosed())) return;
      const key = keyFor(name),
        id = randomUUID(),
        parts = Array.from(
          { length: Math.max(1, Math.ceil(value.length / 1700)) },
          (_, i) => value.slice(i * 1700, (i + 1) * 1700),
        );
      if (parts.length > 100)
        throw new Error("Sessão acima do limite permitido.");
      const written: string[] = [];
      try {
        for (let i = 0; i < parts.length; i++) {
          if (start !== generation || closed) return;
          const part = `${key}.${id}.${i}`;
          await SecureStore.setItemAsync(part, parts[i]);
          written.push(part);
        }
        if (start !== generation || closed) return;
        const previous = await SecureStore.getItemAsync(key);
        if (start !== generation || closed) return;
        await SecureStore.setItemAsync(
          key,
          JSON.stringify({ eoSecureChunks: parts.length, chunkId: id }),
        );
        if (start !== generation || closed) {
          await SecureStore.deleteItemAsync(key);
          return;
        }
        written.length = 0;
        if (previous) {
          try {
            const old = JSON.parse(previous);
            if (validCount(old.eoSecureChunks)) {
              const prefix =
                typeof old.chunkId === "string" ? `${key}.${old.chunkId}` : key;
              void Promise.all(
                Array.from({ length: old.eoSecureChunks }, (_, i) =>
                  SecureStore.deleteItemAsync(`${prefix}.${i}`),
                ),
              ).catch(() => {});
            }
          } catch {
            /* legado */
          }
        }
      } finally {
        if (written.length)
          void Promise.all(
            written.map((part) => SecureStore.deleteItemAsync(part)),
          ).catch(() => {});
      }
    });
  },
  async removeItem(name: string) {
    const start = generation;
    return storageExclusive(async () => {
      if (start !== generation) return;
      const key = keyFor(name),
        raw = await SecureStore.getItemAsync(key);
      if (start !== generation) return;
      await SecureStore.deleteItemAsync(key);
      if (raw) {
        try {
          const meta = JSON.parse(raw);
          if (validCount(meta.eoSecureChunks)) {
            const prefix =
              typeof meta.chunkId === "string" ? `${key}.${meta.chunkId}` : key;
            await Promise.all(
              Array.from({ length: meta.eoSecureChunks }, (_, i) =>
                SecureStore.deleteItemAsync(`${prefix}.${i}`),
              ),
            );
          }
        } catch {
          /* legado */
        }
      }
    });
  },
};
export async function beginSessionLogin() {
  generation++;
  closed = true;
  await markerExclusive(() => SecureStore.deleteItemAsync(CLOSED_KEY));
  closed = false;
  flagPromise = Promise.resolve(false);
}
export async function closeStoredSession(storageKey: string) {
  generation++;
  closed = true;
  flagPromise = Promise.resolve(true);
  await markerExclusive(() => SecureStore.setItemAsync(CLOSED_KEY, "1"));
  await Promise.all([
    sessionStorage.removeItem(storageKey),
    sessionStorage.removeItem(`${storageKey}-user`),
    sessionStorage.removeItem(`${storageKey}-code-verifier`),
  ]);
}
export async function readStoredSession(
  storageKey: string,
): Promise<Session | null> {
  const raw = await sessionStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.user?.id === "string" &&
      /^[a-f0-9-]{36}$/i.test(value.user.id) &&
      typeof value.access_token === "string" &&
      typeof value.refresh_token === "string"
    )
      return value as Session;
  } catch {
    /* inválido */
  }
  return null;
}
export function guardSessionFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const start = generation;
    const response = await base(input, init);
    if (String(input).includes("/auth/v1/") && start !== generation)
      throw Object.assign(new Error("A sessão mudou durante a operação."), {
        code: "SESSION_CHANGED",
      });
    return response;
  };
}
