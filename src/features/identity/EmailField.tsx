import { useEffect, useId, useState } from "react";
import { rpc } from "../../services/supabase";
import { emailSuggestions } from "./email-suggestions";
export function EmailField() {
  const [value, setValue] = useState(""),
    [domains, setDomains] = useState<string[]>([]),
    [preferred, setPreferred] = useState(""),
    [required, setRequired] = useState(false);
  const listId = useId();
  useEffect(() => {
    let alive = true;
    void Promise.all([
      rpc<{ email_domains: string[]; require_email: boolean }>(
        "eo_admin_identity_preferences",
      ),
      rpc<{ domain: string }>("eo_my_email_domain"),
    ])
      .then(([prefs, own]) => {
        if (alive) {
          setDomains(prefs.email_domains);
          setRequired(prefs.require_email);
          setPreferred(own.domain);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <label>
      E-mail {required ? "" : "(opcional)"}
      <input
        name="email"
        type="email"
        autoCapitalize="none"
        autoCorrect="off"
        required={required}
        maxLength={254}
        list={listId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={preferred ? `nome@${preferred}` : "nome@dominio.com"}
      />
      <datalist id={listId}>
        {emailSuggestions(value, domains, preferred).map((email) => (
          <option key={email} value={email} />
        ))}
      </datalist>
      <small>As sugestões não impedem usar outro e-mail válido.</small>
    </label>
  );
}
export function EmailDomainPreference() {
  const [domain, setDomain] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    void rpc<{ domain: string }>("eo_my_email_domain")
      .then((r) => setDomain(r.domain))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <div>
      <label>
        Meu domínio sugerido no cadastro
        <input
          value={domain}
          maxLength={253}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="pernambucanas.com.br"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void rpc("eo_my_email_domain", { p_domain: domain })
            .then(() =>
              setMessage(
                "Seu domínio padrão foi salvo, sem alterar os outros administradores.",
              ),
            )
            .catch((e) => setMessage(e.message));
        }}
      >
        Salvar meu domínio
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
