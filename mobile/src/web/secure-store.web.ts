// Substituto do expo-secure-store somente no site (Expo web).
// O navegador não tem Keychain nem Keystore: guarda no localStorage do próprio domínio,
// como o Supabase já faz no portal. Biometria não existe na web, então o bloqueio fica desligado.
export type SecureStoreOptions = {
  keychainService?: string;
  keychainAccessible?: number;
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
};

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

const PREFIXO = "eo.secure.";

function chave(key: string, options?: SecureStoreOptions) {
  return `${PREFIXO}${options?.keychainService ? `${options.keychainService}.` : ""}${key}`;
}

function armazenamento(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function isAvailableAsync() {
  return armazenamento() !== null;
}

export function canUseBiometricAuthentication() {
  return false;
}

export async function getItemAsync(key: string, options?: SecureStoreOptions) {
  return armazenamento()?.getItem(chave(key, options)) ?? null;
}

export function getItem(key: string, options?: SecureStoreOptions) {
  return armazenamento()?.getItem(chave(key, options)) ?? null;
}

export async function setItemAsync(key: string, value: string, options?: SecureStoreOptions) {
  armazenamento()?.setItem(chave(key, options), value);
}

export function setItem(key: string, value: string, options?: SecureStoreOptions) {
  armazenamento()?.setItem(chave(key, options), value);
}

export async function deleteItemAsync(key: string, options?: SecureStoreOptions) {
  armazenamento()?.removeItem(chave(key, options));
}
