import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
type Preferences = {
  organization_name: string;
  email_domains: string[];
  require_email: boolean;
};
export function IdentityPreferences() {
  const [organization, setOrganization] = useState("");
  const [domains, setDomains] = useState("");
  const [required, setRequired] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    void rpc<Preferences>("eo_admin_identity_preferences")
      .then((p) => {
        if (live) {
          setOrganization(p.organization_name);
          setDomains(p.email_domains.join(", "));
          setRequired(p.require_email);
        }
      })
      .catch((e) => {
        if (live) setStatus(String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <details>
      <summary>Preferências de e-mail da organização</summary>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void rpc("eo_admin_identity_preferences", {
            p_domains: domains
              .split(/[,;\s]+/)
              .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
              .filter(Boolean),
            p_require_email: required,
            p_organization: organization,
          })
            .then(() => setStatus("Preferências salvas."))
            .catch((e) => setStatus(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Organização
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          Domínios sugeridos
          <input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="empresa.com.br, exemplo.com"
          />
          <small>
            Separe por vírgula. Sugestões para facilitar o cadastro. Outros
            e-mails válidos continuam permitidos.
          </small>
        </label>
        <label>
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Exigir e-mail no cadastro
        </label>
        <button className="secondary" disabled={busy}>
          Salvar preferências
        </button>
        {status && <p role="status">{status}</p>}
      </form>
    </details>
  );
}
