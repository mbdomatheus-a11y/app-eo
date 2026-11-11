// Contas genéricas de loja (gerNNN) no app. Manter equivalente a src/features/identity/store-access.ts (web):
// o Metro empacota só a pasta mobile, então a regra é duplicada de propósito.
export function normalizeStoreUser(value: string): string | null {
  const v = value.trim().toLowerCase().replace("@pernambucanas.com.br", "");
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
    { id: "default", label: "Diferente da senha padrão e sem o usuário da loja", ok: !!password && !low.includes(user) },
    { id: "repeat", label: "Sem repetir o mesmo caractere 4 vezes", ok: !/(.)\1\1\1/.test(password) },
  ];
}
