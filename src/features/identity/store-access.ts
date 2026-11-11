// Contas genéricas de loja (gerNNN). Toda chamada passa pela Edge Function acesso-loja.
import { supabase } from "../../services/supabase";

export const STORE_DOMAIN = "pernambucanas.com.br";

export function normalizeStoreUser(value: string): string | null {
  const v = value.trim().toLowerCase().replace(`@${STORE_DOMAIN}`, "");
  const m = /^ger0*([0-9]{1,4})$/.exec(v);
  return m ? `ger${m[1].padStart(3, "0")}` : null;
}

export type PasswordRule = { id: string; label: string; ok: boolean };

export function storePasswordRules(user: string, password: string): PasswordRule[] {
  const low = password.toLowerCase();
  return [
    { id: "len", label: "12 a 64 caracteres", ok: password.length >= 12 && password.length <= 64 },
    { id: "upper", label: "Uma letra maiúscula", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "Uma letra minúscula", ok: /[a-z]/.test(password) },
    { id: "digit", label: "Um número", ok: /[0-9]/.test(password) },
    { id: "symbol", label: "Um símbolo (ex.: ! @ # $)", ok: /[^A-Za-z0-9]/.test(password) },
    {
      id: "default",
      label: "Diferente da senha padrão e sem o usuário da loja",
      ok: !!password && !low.includes(user),
    },
    { id: "repeat", label: "Sem repetir o mesmo caractere 4 vezes", ok: !/(.)\1\1\1/.test(password) },
  ];
}

export type Platform = "web" | "ios" | "android";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Conexão ainda não configurada.");
  const { data, error } = await supabase.functions.invoke("acesso-loja", { body });
  if (error) {
    let message = "Não foi possível concluir. Tente novamente.";
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      /* mantém mensagem genérica */
    }
    throw new Error(message);
  }
  return data as T;
}

export async function storeSignIn(user: string, password: string, origem: Platform = "web") {
  const session = await call<{ access_token: string; refresh_token: string }>({
    acao: "entrar",
    usuario: user,
    senha: password,
    origem,
  });
  const { error } = await supabase!.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new Error("Não foi possível abrir a sessão.");
}

export const storeRequestReset = (user: string, origem: Platform = "web") =>
  call<{ ok: boolean; mensagem: string }>({ acao: "solicitar-reset", usuario: user, origem });

export const storeChangePassword = (current: string, next: string, origem: Platform = "web") =>
  call<{ ok: boolean }>({ acao: "trocar-senha", senha_atual: current, nova_senha: next, origem });

export const storeProvision = (limite = 25) =>
  call<{ criadas: number; falhas: string[]; restantes: number }>({ acao: "provisionar", limite });

export const storeResetToDefault = (perfilId: string, solicitacaoId?: number) =>
  call<{ ok: boolean; usuario: string }>({ acao: "redefinir", perfil_id: perfilId, solicitacao_id: solicitacaoId });
