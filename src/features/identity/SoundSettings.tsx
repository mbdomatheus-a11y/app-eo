import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
export function SoundSettings() {
  const [sound, setSound] = useState("default");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void rpc<{ sound: string }>("eo_notification_sound")
      .then((p) => {
        if (live) setSound(p.sound);
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
  return (
    <section className="form">
      <h3>Som dos avisos push</h3>
      <label>
        Som da organização
        <select
          value={sound}
          disabled={busy}
          onChange={(e) => setSound(e.target.value)}
        >
          {[
            ["default", "Padrão do aparelho"],
            ["eo-soft.wav", "Suave"],
            ["eo-bell.wav", "Sino"],
            ["eo-alert.wav", "Alerta"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>
        Respeita a preferência individual de som e as configurações do aparelho.
        Os sons personalizados dependem da versão instalada do app.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void rpc("eo_notification_sound", { p_sound: sound })
            .then(() => setMessage("Som dos avisos salvo."))
            .catch((e) => setMessage(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        Salvar som dos avisos
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
