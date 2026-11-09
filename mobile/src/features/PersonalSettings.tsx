import { EmailDomainPreference } from "./EmailField";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { rpc } from "../services/supabase";
import type { Store } from "../types";
import { Button, Card, Choice, Field, Section, s } from "../ui";
type Day = { day: number; closed: boolean; opens: string; closes: string };
type Prefs = {
  phone: string | null;
  channel: string;
  stores: { store_id: string; hours: Day[] }[];
};
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const empty = () =>
  days.map((_, day) => ({
    day,
    closed: true,
    opens: "09:00",
    closes: "18:00",
  }));
export function PersonalSettings({
  stores,
  role,
}: {
  stores: Store[];
  role: string;
}) {
  const [data, setData] = useState<Prefs | null>(null);
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [store, setStore] = useState("");
  const [query, setQuery] = useState("");
  const [hours, setHours] = useState<Day[]>(empty);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void rpc<Prefs>("eo_profile_preferences")
      .then((p) => {
        if (live) {
          setData(p);
          setPhone(p.phone ?? "");
          setChannel(p.channel);
        }
      })
      .catch((e) => {
        if (live) setMessage(String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function save(withHours: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const next = await rpc<Prefs>(
        "eo_profile_preferences",
        withHours
          ? { p_store: store, p_hours: hours }
          : { p_phone: phone.trim() || null, p_channel: channel },
      );
      setData(next);
      setMessage(
        withHours
          ? "Horário da unidade atualizado, sem aprovação adicional."
          : "Contato e canal salvos.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Section title="Contato e preferências" />
      <Field
        label="Telefone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        maxLength={30}
      />
      <Text style={s.label}>Canal preferido</Text>
      {[
        ["whatsapp", "WhatsApp"],
        ["phone", "Telefone"],
        ["email", "E-mail"],
        ["other", "Outro"],
      ].map(([v, l]) => (
        <Choice
          key={v}
          label={l}
          selected={channel === v}
          onPress={() => setChannel(v)}
        />
      ))}
      <Button
        title="Salvar contato"
        disabled={busy || !data}
        onPress={() => void save(false)}
      />
      {["admin", "gerente"].includes(role) && (
        <>
          <Section title="Horário da unidade" />
          <Field
            label="Buscar unidade"
            value={query}
            onChangeText={setQuery}
            placeholder="Código ou nome"
          />
          {stores
            .filter((s) =>
              `${s.code} ${s.name}`
                .toLocaleLowerCase("pt-BR")
                .includes(query.toLocaleLowerCase("pt-BR")),
            )
            .slice(0, 20)
            .map((s) => (
              <Choice
                key={s.id}
                label={`${s.code} · ${s.name}`}
                selected={store === s.id}
                onPress={() => {
                  setStore(s.id);
                  setHours(
                    data?.stores.find((x) => x.store_id === s.id)?.hours ??
                      empty(),
                  );
                }}
              />
            ))}
          <Text style={s.small}>
            {stores.find((s) => s.id === store)?.name ??
              "Selecione uma unidade. Busque para encontrar outras opções."}
          </Text>
          {store &&
            hours.map((day, index) => (
              <View key={day.day} style={{ gap: 7 }}>
                <Text style={s.label}>{days[day.day]}</Text>
                <Choice
                  label="Fechado"
                  selected={day.closed}
                  onPress={() =>
                    setHours((old) =>
                      old.map((x, i) =>
                        i === index ? { ...x, closed: !x.closed } : x,
                      ),
                    )
                  }
                />
                {!day.closed &&
                  (["opens", "closes"] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        key === "opens" ? "Abertura HH:MM" : "Fechamento HH:MM"
                      }
                      value={day[key]}
                      maxLength={5}
                      onChangeText={(value) =>
                        setHours((old) =>
                          old.map((x, i) =>
                            i === index ? { ...x, [key]: value } : x,
                          ),
                        )
                      }
                    />
                  ))}
              </View>
            ))}
          <Button
            title="Salvar horário da unidade"
            disabled={busy || !store || !data}
            onPress={() => void save(true)}
          />
        </>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.small}>
          {message}
        </Text>
      )}
      {role === "admin" && <EmailDomainPreference />}
    </Card>
  );
}
