import { useState } from "react";
import { exportCalendar } from "../../core/calendar";
export function CalendarAction({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        Adicionar à minha agenda
      </button>
      {open && (
        <>
          <label>
            Data e horário do lembrete
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!date}
            onClick={() => {
              try {
                exportCalendar({ title, date, description });
                setMessage(
                  "Arquivo de agenda preparado. Abra no calendário para revisar e salvar.",
                );
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Baixar lembrete da agenda
          </button>
          <small>Nenhum evento é salvo automaticamente.</small>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
