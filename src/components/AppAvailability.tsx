import { useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ExternalLink, Smartphone } from "lucide-react";
import { rpc } from "../services/supabase";
import "./AppAvailability.css";

export function AppAvailability() {
  const id = useId();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const chapa = String(values.get("chapa") ?? "").trim();
    const email = String(values.get("email") ?? "").trim().toLowerCase();
    if (!name || !chapa || !email) {
      setError("Preencha seu nome, chapa e e-mail para entrar na lista.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await rpc("eo_android_waitlist_register", {
        p_name: name,
        p_chapa: chapa,
        p_email: email,
      });
      setRegistered(true);
      form.reset();
    } catch {
      setError("Não foi possível confirmar seu cadastro. Confira a conexão e tente novamente.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="eo-app-availability" aria-labelledby={`${id}-title`}>
      <div className="eo-app-intro">
        <Smartphone size={24} aria-hidden="true" />
        <div>
          <h2 id={`${id}-title`}>Leve o EO com você</h2>
          <p>Acompanhe a operação também pelo celular.</p>
        </div>
      </div>
      <div className="eo-app-options">
        <div className="eo-app-option">
          <span className="eo-app-platform">iPhone</span>
          <h3>Participe pelo TestFlight</h3>
          <p>Abra o convite no iPhone e siga as orientações para instalar a versão de testes do EO.</p>
          <a className="primary eo-app-link" href="https://testflight.apple.com/join/S3gyc73B" target="_blank" rel="noopener noreferrer" aria-label="Abrir TestFlight (abre em nova aba)">
            Abrir TestFlight <ExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="eo-app-option">
          <span className="eo-app-platform">Android</span>
          <h3>Teste pelo Google Play</h3>
          <p>O EO está em teste fechado. Informe o e-mail da conta Google do seu Android para a administração liberar o acesso.</p>
          <a className="eo-app-play-link" href="https://play.google.com/apps/testing/com.appeo.mobile" target="_blank" rel="noopener noreferrer">
            Abrir convite no Google Play <ExternalLink size={16} aria-hidden="true" />
          </a>
          <p className="eo-app-privacy">O convite só permite instalar depois que o e-mail informado estiver na lista de testadores do Google Play.</p>
          <details className="eo-android-details">
            <summary>Solicitar acesso ao teste</summary>
            {registered ? (
              <div className="eo-app-confirmation" role="status">
                <CheckCircle2 size={22} aria-hidden="true" />
                <div><strong>Solicitação registrada!</strong><p>Após a administração incluir seu e-mail no teste, abra o convite do Google Play com a mesma conta Google.</p></div>
              </div>
            ) : (
              <form className="eo-android-form" onSubmit={(event) => void register(event)} aria-busy={busy}>
                <label htmlFor={`${id}-name`}>Nome completo</label>
                <input id={`${id}-name`} name="name" autoComplete="name" maxLength={120} required disabled={busy} />
                <label htmlFor={`${id}-chapa`}>Chapa com 6 números</label>
                <input id={`${id}-chapa`} name="chapa" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" maxLength={6} required disabled={busy} />
                <label htmlFor={`${id}-email`}>E-mail da conta Google usada no Play</label>
                <input id={`${id}-email`} name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy} />
                <p className="eo-app-privacy" id={`${id}-privacy`}>Nome, chapa e e-mail serão vistos pela administração do EO para organizar o acesso ao teste Android.</p>
                {error && <p className="eo-app-error" role="alert">{error}</p>}
                <button type="submit" className="primary" disabled={busy} aria-describedby={`${id}-privacy`}>{busy ? "Enviando solicitação..." : "Solicitar acesso"}</button>
              </form>
            )}
          </details>
        </div>
      </div>
    </section>
  );
}
