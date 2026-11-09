export function safeAttachmentName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .slice(-160) || "arquivo"
  );
}
export interface InboxItem {
  kind: "notice" | "alert";
  id: string;
  version: number | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
export interface Engagement {
  user_id: string;
  name: string;
  opened_at: string | null;
  acknowledged_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
}
export interface ScheduledMessage {
  id: string;
  title: string;
  body: string;
  message_type: "notice" | "alert";
  store_ids: string[];
  scheduled_for: string;
  status: "scheduled" | "published" | "failed" | "cancelled";
  failure: string | null;
  published_id: string | null;
}
export const scheduleStatus = {
  scheduled: "Programado",
  published: "Publicado",
  failed: "Falhou",
  cancelled: "Cancelado",
};
