import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "../../services/supabase";
import "./contact-refresh.css";

type Request = {
  required: boolean;
  motivo?: string | null;
  phone: string | null;
  requested_at: string | null;
};
type GateProps = { onComplete?: () => void; onSignOut?: () => void };
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";

export function ContactRefreshAdmin() {
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await rpc<{ requested: number; total: number }>(
        "eo_admin_request_contact_update",
        { p_only_missing: onlyMissing },
      );
      setMessage(
        `${result.requested} nova(s) solicitação(ões), entre ${result.total} usuário(s) ativo(s) do público selecionado. Solicitações pendentes não são duplicadas.`,
      );
      setConfirm(false);
      window.dispatchEvent(new Event("eo-contact-refresh"));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="contact-refresh">
      <h3>Atualização de telefones</h3>
      <p>
        Solicite o contato declarado pelos usuários. A solicitação aparece no
        aplicativo, sem enviar SMS ou verificar a titularidade do número.
      </p>
      <fieldset disabled={busy}>
        <legend>Público em todas as lojas</legend>
        <label>
          <input
            type="radio"
            name="contact-audience"
            checked={onlyMissing}
            onChange={() => {
              setOnlyMissing(true);
              setConfirm(false);
            }}
          />
          Somente usuários ativos sem telefone cadastrado no aplicativo
        </label>
        <label>
          <input
            type="radio"
            name="contact-audience"
            checked={!onlyMissing}
            onChange={() => {
              setOnlyMissing(false);
              setConfirm(false);
            }}
          />
          Todos os usuários ativos
        </label>
      </fieldset>
      {confirm ? (
        <div className="contact-confirm">
          <p>
            Confirmar solicitação para{" "}
            {onlyMissing
              ? "usuários ativos sem telefone"
              : "todos os usuários ativos"}
            ? Cada destinatário deverá salvar seu telefone para continuar usando
            o aplicativo.
          </p>
          <button disabled={busy} onClick={() => void send()}>
            {busy ? "Solicitando…" : "Confirmar solicitação"}
          </button>
          <button disabled={busy} onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)}>Solicitar atualização</button>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function formatarTelefone(valor: string) {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const telefoneValido = (valor: string) =>
  /^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$/.test(valor.replace(/\D/g, ""));

export function ContactUpdateGate({ onComplete, onSignOut }: GateProps) {
  const [request, setRequest] = useState<Request | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const requiredRef = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      const result = await rpc<Request>("eo_my_contact_request");
      if (!mounted.current) return;
      setRequest(result);
      setError("");
      if (!requiredRef.current) setPhone(formatarTelefone(result.phone ?? ""));
      requiredRef.current = result.required;
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("eo-contact-refresh", focus);
    const visibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 300000);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", focus);
      window.removeEventListener("eo-contact-refresh", focus);
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(timer);
    };
  }, [load]);
  // Só cobre a tela quando a confirmação é obrigatória; consultando ou com erro, o portal segue livre.
  const visible = Boolean(request?.required);
  useEffect(() => {
    if (visible && !dialog.current?.open) dialog.current?.showModal();
    else if (!visible) dialog.current?.close();
  }, [visible]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!telefoneValido(phone)) throw new Error("Digite DDD e número, por exemplo (11) 98765-4321.");
      await rpc("eo_save_my_phone", { p_phone: phone });
      setRequest({ required: false, phone, requested_at: null });
      requiredRef.current = false;
      onComplete?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="contact-gate"
      ref={dialog}
      aria-labelledby="contact-update-title"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="contact-update-title">Confirme seu telefone</h2>
      {loading ? (
        <p role="status">Consultando seu cadastro…</p>
      ) : request ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p>
            {request.motivo === "vencido"
              ? "Já se passaram 60 dias: confirme se o telefone continua o mesmo."
              : request.motivo === "administracao"
                ? "A administração pediu a atualização do seu contato."
                : "Confirme o seu telefone com DDD para continuar."}{" "}
            Contato declarado por você, sem verificação por SMS.
          </p>
          <label htmlFor="contact-phone">Telefone com DDD</label>
          <input
            id="contact-phone"
            autoFocus
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            maxLength={15}
            required
            disabled={busy}
            onChange={(event) => setPhone(formatarTelefone(event.target.value))}
            placeholder="(11) 98765-4321"
          />
          <button disabled={busy || !telefoneValido(phone)}>
            {busy ? "Salvando…" : "Salvar e confirmar"}
          </button>
        </form>
      ) : (
        <button disabled={loading} onClick={() => void load()}>
          Tentar novamente
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {onSignOut && (
        <button className="contact-signout" onClick={onSignOut}>
          Sair da conta
        </button>
      )}
    </dialog>
  );
}
