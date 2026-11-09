import { createEventInCalendarAsync } from "expo-calendar/legacy";
export async function exportCalendar(entry: {
  title: string;
  date: Date | string;
  description?: string;
  durationMinutes?: number;
}) {
  const startDate = new Date(entry.date);
  if (!Number.isFinite(startDate.getTime()))
    throw new Error("Escolha uma data e um horário válidos.");
  return createEventInCalendarAsync({
    title: entry.title,
    notes: entry.description ?? "",
    startDate,
    endDate: new Date(
      startDate.getTime() + (entry.durationMinutes ?? 30) * 60000,
    ),
  });
}
