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
export type LiveAlert = { id: string; title: string; body: string; urgent: boolean; created_at: string; seen_at: string | null; dismissed_at: string | null };
export type ChecklistRun = { run_id: string; status: "pending" | "in_progress" | "completed"; assigned_at: string; updated_at: string; store_id: string; store_name: string; template_id: string; title: string; description: string; item_count: number; answered_count: number };
export type ChecklistDetail = { run: { id: string; status: string }; store_name: string; title: string; description: string; items: { id: string; position: number; prompt: string; type: "acceptance" | "photo" | "text" | "yes_no"; required: boolean; options: string[]; answer: Record<string, unknown> | null }[] };

export const roleLabels: Record<Role, string> = {
  colaborador: "Colaborador",
  gerente: "Gerente",
  diretor: "Diretor",
  admin: "Administrador",
};
