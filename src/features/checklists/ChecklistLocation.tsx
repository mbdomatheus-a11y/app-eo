import { useState } from "react";
import { rpc } from "../../services/supabase";
export function ChecklistLocation({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function capture(consent: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (!consent)
        await rpc("eo_record_checklist_location", {
          p_run: runId,
          p_consent: false,
        });
      else {
        if (!navigator.geolocation)
          throw new Error(
            "Localização indisponível. Você pode continuar o checklist.",
          );
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            }),
        );
        await rpc("eo_record_checklist_location", {
          p_run: runId,
          p_consent: true,
          p_lat: position.coords.latitude,
          p_lon: position.coords.longitude,
          p_accuracy: position.coords.accuracy,
        });
      }
      setMessage(
        consent
          ? "Localização registrada. Nesta fase não há bloqueio por distância."
          : "Preferência registrada. Você pode continuar sem compartilhar localização.",
      );
    } catch {
      setMessage(
        "Não foi possível registrar a localização. Você pode continuar o checklist e tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Localização opcional</summary>
      <p>
        Com sua autorização, registramos posição, precisão e horário neste
        checklist. Não há acompanhamento em segundo plano nem bloqueio por
        distância.
      </p>
      <div className="checklist-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void capture(true)}
        >
          Permitir e registrar localização
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void capture(false)}
        >
          Continuar sem localização
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
