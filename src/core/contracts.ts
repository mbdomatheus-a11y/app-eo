import type { Notice, Person, Receipt } from "./domain";

/** Contratos previstos. Não há implementação remota nesta prévia. */
export interface IdentityProvider {
  currentPerson(): Promise<Person | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
export interface NoticeService {
  list(): Promise<Notice[]>;
  // A pessoa é obtida da sessão no servidor, nunca de um ID confiado ao navegador.
  acknowledge(noticeId: string, version: number): Promise<Receipt>;
  publish(input: Omit<Notice, "id" | "date" | "version">): Promise<Notice>;
}
export interface ModuleRegistration {
  id: string;
  label: string;
  route: string;
  platforms: ("web" | "ios" | "android")[];
  requiredPermission: string;
  availability: "planned" | "pilot" | "active";
}
