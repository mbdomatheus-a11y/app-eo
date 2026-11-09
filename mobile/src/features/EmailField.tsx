import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Field, s } from "../ui";
import { emailSuggestions } from "./email-suggestions";
export function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const [domains, setDomains] = useState<string[]>([]),
    [preferred, setPreferred] = useState("");
  useEffect(() => {
    let alive = true;
    void Promise.all([
      rpc<{ email_domains: string[] }>("eo_admin_identity_preferences"),
      rpc<{ domain: string }>("eo_my_email_domain"),
    ])
      .then(([prefs, own]) => {
        if (alive) {
          setDomains(prefs.email_domains);
          setPreferred(own.domain);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <View style={{ gap: 6 }}>
      <Field
        label="E-mail (opcional, conforme configuração)"
        value={value}
        onChangeText={onChange}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={254}
        placeholder={preferred ? `nome@${preferred}` : "nome@dominio.com"}
      />
      {emailSuggestions(value, domains, preferred)
        .filter((email) => email !== value)
        .map((email) => (
          <Button
            key={email}
            title={email}
            secondary
            onPress={() => onChange(email)}
          />
        ))}
    </View>
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
    <View style={{ gap: 8 }}>
      <Field
        label="Meu domínio sugerido no cadastro"
        value={domain}
        onChangeText={setDomain}
        maxLength={253}
        autoCapitalize="none"
      />
      <Button
        title="Salvar meu domínio"
        secondary
        onPress={() => {
          void rpc("eo_my_email_domain", { p_domain: domain })
            .then(() =>
              setMessage(
                "Seu padrão foi salvo sem alterar os outros administradores.",
              ),
            )
            .catch((e) => setMessage(e.message));
        }}
      />
      {!!message && <Text style={s.small}>{message}</Text>}
    </View>
  );
}
