export type ReportSummary = {
  id: string;
  label: string;
  count: number;
  note: string;
};
export type AuditEntry = {
  id: number;
  created_at: string;
  action: string;
  entity_id: string | null;
  actor_name: string | null;
};
export type AuditPage = { items: AuditEntry[]; total: number };
export function reportCsv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return (
    "\ufeff" +
    [
      keys.map(cell).join(";"),
      ...rows.map((row) => keys.map((key) => cell(row[key])).join(";")),
    ].join("\r\n")
  );
}
