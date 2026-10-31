export type Role = "colaborador" | "gerente" | "diretor" | "admin";
export type AdminTab = "stores" | "people" | "audit";

export type Store = { id: string; code: string; name: string; region: string };
export type Workspace = {
  person: { id: string; name: string; role: Role; master_admin: boolean };
  stores: Store[];
  settings: { workspace_name: string; disabled_modules: string[] };
};
export type LiveNotice = {
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
};
export type LivePerson = {
  id: string;
  display_name: string;
  role: Role;
  login_chapa: string | null;
  contact_email: string | null;
  active: boolean;
  must_change_password: boolean;
  stores: string[];
};
export type AuditRow = {
  id: number;
  actor_name: string;
  action: string;
  entity_id: string;
  created_at: string;
};

export const roleLabels: Record<Role, string> = {
  colaborador: "Colaborador",
  gerente: "Gerente",
  diretor: "Diretor",
  admin: "Administrador",
};
