import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, Text, View } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, Page, C, s } from "../ui";

type Request = {
  required: boolean;
  phone: string | null;
  requested_at: string | null;
};
type GateProps = { onComplete?: () => void; onSignOut?: () => void };
const messageOf = (error: unknown) =>
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
        `${result.requested} nova(s) solicitação(ões), entre ${result.total} usuário(s) ativo(s). Solicitações pendentes não são duplicadas.`,
      );
      setConfirm(false);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={s.sectionTitle}>Atualização de telefones</Text>
      <Text style={s.small}>
        Solicite o contato declarado pelos usuários em todas as lojas. A
        solicitação aparece no aplicativo, sem SMS ou verificação de
        titularidade.
      </Text>
      {!busy && (
        <>
          <Choice
            label="Somente ativos sem telefone no aplicativo"
            selected={onlyMissing}
            onPress={() => {
              setOnlyMissing(true);
              setConfirm(false);
            }}
          />
          <Choice
            label="Todos os usuários ativos"
            selected={!onlyMissing}
            onPress={() => {
              setOnlyMissing(false);
              setConfirm(false);
            }}
          />
        </>
      )}
      {confirm ? (
        <>
          <Text style={s.body}>
            Confirmar para{" "}
            {onlyMissing
              ? "usuários ativos sem telefone"
              : "todos os usuários ativos"}
            ? Cada destinatário deverá salvar seu telefone para continuar.
          </Text>
          <Button
            title={busy ? "Solicitando…" : "Confirmar solicitação"}
            disabled={busy}
            onPress={() => void send()}
          />
          <Button
            title="Cancelar"
            secondary
            disabled={busy}
            onPress={() => setConfirm(false)}
          />
        </>
      ) : (
        <Button
          title="Solicitar atualização"
          onPress={() => setConfirm(true)}
        />
      )}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={s.small}>
          {message}
        </Text>
      ) : null}
    </Card>
  );
}

export function ContactUpdateGate({ onComplete, onSignOut }: GateProps) {
  const [request, setRequest] = useState<Request | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const required = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      const result = await rpc<Request>("eo_my_contact_request");
      if (!mounted.current) return;
      setRequest(result);
      setError("");
      if (!required.current) setPhone(result.phone ?? "");
      required.current = result.required;
    } catch (error) {
      if (mounted.current) setError(messageOf(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 300000);
    return () => {
      mounted.current = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, [load]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("eo_save_my_phone", { p_phone: phone });
      setRequest({ required: false, phone, requested_at: null });
      required.current = false;
      onComplete?.();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible={request === null || request.required}
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={() => {}}
    >
      <View style={s.screen}>
        <Page contentStyle={{ paddingTop: 60 }}>
          <Card>
            <Text accessibilityRole="header" style={s.title}>
              Atualize seu telefone
            </Text>
            {loading ? (
              <Text style={s.body}>Consultando seu cadastro…</Text>
            ) : request ? (
              <>
                <Text style={s.body}>
                  A administração solicitou a atualização do seu contato. Salve
                  seu telefone para continuar.
                </Text>
                <Text style={s.small}>
                  Contato declarado por você, sem verificação por SMS.
                </Text>
                <Field
                  label="Telefone com DDD"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={40}
                  editable={!busy}
                  placeholder="(11) 99999-9999"
                />
                <Button
                  title={busy ? "Salvando…" : "Salvar e continuar"}
                  disabled={busy || !phone.trim()}
                  onPress={() => void save()}
                />
              </>
            ) : (
              <Button title="Tentar novamente" onPress={() => void load()} />
            )}
            {error ? (
              <Text accessibilityRole="alert" style={{ color: C.red }}>
                {error}
              </Text>
            ) : null}
            {onSignOut && (
              <Button title="Sair da conta" secondary onPress={onSignOut} />
            )}
          </Card>
        </Page>
      </View>
    </Modal>
  );
}
