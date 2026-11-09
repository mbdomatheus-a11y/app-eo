export type CalendarEntry = {
  title: string;
  date: Date | string;
  description?: string;
  durationMinutes?: number;
};
const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const fold = (line: string) => {
  const chunks: string[] = [];
  let chunk = "",
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      chunks.push(chunk);
      chunk = " ";
      bytes = 1;
    }
    chunk += char;
    bytes += size;
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
};
export function calendarFile(entry: CalendarEntry): string {
  const date = new Date(entry.date);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Escolha uma data e um horário válidos.");
  const duration = entry.durationMinutes ?? 30;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440)
    throw new Error("Duração inválida.");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EO//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@app-eo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(date)}`,
    `DTEND:${stamp(new Date(date.getTime() + duration * 60000))}`,
    `SUMMARY:${escape(entry.title)}`,
    `DESCRIPTION:${escape(entry.description ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
export function exportCalendar(entry: CalendarEntry): void {
  const url = URL.createObjectURL(
    new Blob([calendarFile(entry)], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "lembrete-eo.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
