import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
import { SuccessToast } from "../../components/SuccessToast";
export function SoundSettings() {
  const [sound, setSound] = useState("default"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<{ sound: string }>("eo_notification_sound")
      .then((r) => setSound(r.sound))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <details className="panel">
      <summary>Som padrão dos avisos no celular</summary>
      <p>
        Os sons Suave, Sino e Alerta estão incluídos na nova versão nativa. O
        usuário pode silenciar; o sistema operacional controla volume, Foco e
        permissões.
      </p>
      <label>
        Som
        <select value={sound} onChange={(e) => setSound(e.target.value)}>
          <option value="default">Padrão do aparelho</option>
          <option value="eo-soft.wav">Suave</option>
          <option value="eo-bell.wav">Sino</option>
          <option value="eo-alert.wav">Alerta</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <SuccessToast message={message} />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await rpc("eo_notification_sound", { p_sound: sound });
            setMessage("Som padrão atualizado.");
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar som padrão
      </button>
    </details>
  );
}
