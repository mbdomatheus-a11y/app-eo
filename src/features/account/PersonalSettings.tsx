import { EmailDomainPreference } from "../identity/EmailField";
import { useEffect, useState } from "react";
import { rpc, type Store } from "../../services/supabase";
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
    <section>
      <h3>Contato e preferências</h3>
      <div className="form">
        <label>
          Telefone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
          />
        </label>
        <label>
          Canal preferido
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {[
              ["whatsapp", "WhatsApp"],
              ["phone", "Telefone"],
              ["email", "E-mail"],
              ["other", "Outro"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !data}
          onClick={() => void save(false)}
        >
          Salvar contato
        </button>
        {["admin", "gerente"].includes(role) && (
          <>
            <h3>Horário da unidade</h3>
            <label>
              Unidade
              <select
                value={store}
                onChange={(e) => {
                  setStore(e.target.value);
                  setHours(
                    data?.stores.find((s) => s.store_id === e.target.value)
                      ?.hours ?? empty(),
                  );
                }}
              >
                <option value="">Selecione</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            {store &&
              hours.map((d, index) => (
                <fieldset key={d.day}>
                  <legend>{days[d.day]}</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={d.closed}
                      onChange={(e) =>
                        setHours((old) =>
                          old.map((x, i) =>
                            i === index
                              ? { ...x, closed: e.target.checked }
                              : x,
                          ),
                        )
                      }
                    />
                    Fechado
                  </label>
                  {!d.closed && (
                    <div className="form-grid">
                      {(["opens", "closes"] as const).map((key) => (
                        <label key={key}>
                          {key === "opens" ? "Abertura" : "Fechamento"}
                          <input
                            type="time"
                            value={d[key]}
                            onChange={(e) =>
                              setHours((old) =>
                                old.map((x, i) =>
                                  i === index
                                    ? { ...x, [key]: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}
            <button
              type="button"
              disabled={busy || !store || !data}
              onClick={() => void save(true)}
            >
              Salvar horário da unidade
            </button>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {role === "admin" && <EmailDomainPreference />}
    </section>
  );
}
