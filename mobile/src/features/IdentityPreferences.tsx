import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, s } from "../ui";
export function IdentityPreferences() {
  const [open, setOpen] = useState(false);
  const [organization, setOrganization] = useState("");
  const [domains, setDomains] = useState("");
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    void rpc<{
      organization_name: string;
      email_domains: string[];
      require_email: boolean;
    }>("eo_admin_identity_preferences")
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
  }, [open]);
  return (
    <Card>
      <Button
        title="Preferências de e-mail da organização"
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Field
            label="Organização"
            value={organization}
            onChangeText={setOrganization}
            maxLength={120}
          />
          <Field
            label="Domínios sugeridos, separados por vírgula"
            value={domains}
            onChangeText={setDomains}
            autoCapitalize="none"
          />
          <Text style={s.small}>
            Sugestões para facilitar o cadastro. Outros e-mails válidos
            continuam permitidos.
          </Text>
          <Choice
            label="Exigir e-mail no cadastro"
            selected={required}
            onPress={() => setRequired(!required)}
          />
          <Button
            title="Salvar preferências"
            disabled={busy || organization.trim().length < 2}
            onPress={() => {
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
          />
          {status && (
            <Text accessibilityRole="alert" style={s.small}>
              {status}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}
