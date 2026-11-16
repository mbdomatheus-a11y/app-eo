import { createClient } from "@supabase/supabase-js";

/** Limita a espera da interface e cancela requisições HTTP quando possível. */
export async function boundedRequest<T>(
  work: (signal: AbortSignal) => PromiseLike<T>,
  timeout = 20000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("A conexão demorou. Confira o resultado antes de repetir a ação."));
        }, timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured =
  !!url && !!key && key.startsWith("sb_publishable_");
const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (upstream?.aborted) controller.abort();
  else upstream?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", onAbort);
  }
};
export const supabase = backendConfigured
  ? createClient(url, key, {
      global: { fetch: timedFetch },
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface Store {
  id: string;
  code: string;
  name: string;
  region: string;
  segments?: Record<string, string>;
  team_count?: number;
}
export interface Workspace {
  person: {
    id: string;
    name: string;
    role: "admin" | "diretor" | "gerente" | "colaborador";
    master_admin: boolean;
  };
  stores: Store[];
  settings: { workspace_name: string; disabled_modules: string[] };
}
export interface LiveNotice {
  notice_id: string;
  version: number;
  title: string;
  body: string;
  category: string;
  urgent: boolean;
  published_at: string;
  acknowledged: boolean;
  eligible_count: number;
  receipt_count: number;
  attachments?: MessageAttachment[];
}
export interface MessageAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  object_path: string;
}
export interface LivePerson {
  master_admin?: boolean;
  id: string;
  display_name: string;
  role: string;
  login_chapa: string | null;
  contact_email: string | null;
  active: boolean;
  must_change_password: boolean;
  stores: string[];
}
export interface AuditRow {
  id: number;
  actor_name: string;
  action: string;
  entity_id: string;
  created_at: string;
  detail?: Record<string, unknown>;
}
export async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Conexão ainda não configurada.");
  const { data, error } = await boundedRequest(
    (signal) => supabase.rpc(name, args).abortSignal(signal),
  );
  if (error)
    throw new Error(
      error.code === "42501"
        ? "Seu acesso ainda não foi liberado para esta operação."
        : error.message,
    );
  return data as T;
}
