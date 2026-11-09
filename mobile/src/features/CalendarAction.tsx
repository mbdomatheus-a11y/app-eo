import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Field, s } from "../ui";
import { exportCalendar } from "./calendar";
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
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Button
        title="Adicionar à minha agenda"
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Field
            label="Data e horário AAAA-MM-DD HH:MM"
            value={date}
            onChangeText={setDate}
            placeholder="2026-11-10 09:00"
            maxLength={16}
          />
          <Text style={s.small}>
            Confira os detalhes no editor do calendário e escolha salvar ou
            cancelar.
          </Text>
          <Button
            title="Abrir editor da agenda"
            disabled={busy || !date}
            onPress={() => {
              const match = date.match(
                /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/,
              );
              if (!match) {
                setMessage("Use AAAA-MM-DD HH:MM.");
                return;
              }
              const [, y, m, d, h, min] = match;
              const selected = new Date(+y, +m - 1, +d, +h, +min);
              if (
                selected.getFullYear() !== +y ||
                selected.getMonth() !== +m - 1 ||
                selected.getDate() !== +d ||
                selected.getHours() !== +h ||
                selected.getMinutes() !== +min
              ) {
                setMessage("Confira a data e o horário.");
                return;
              }
              setBusy(true);
              void exportCalendar({ title, date: selected, description })
                .then(() =>
                  setMessage(
                    "Editor do calendário fechado. O salvamento depende da sua escolha no calendário.",
                  ),
                )
                .catch((e) => setMessage(String(e)))
                .finally(() => setBusy(false));
            }}
          />
        </>
      )}
      {message && <Text style={s.small}>{message}</Text>}
    </View>
  );
}
