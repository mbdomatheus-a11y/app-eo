import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
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

// Telefone com DDD: máscara, confirmação no login e a cada 60 dias.
// Camada comum (View absoluta), nunca Modal: Modal nativo preso já travou o iPhone (ver Obsidian).
export function formatarTelefone(valor: string) {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const telefoneValido = (valor: string) => /^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$/.test(valor.replace(/\D/g, ""));

type Pedido = {
  required: boolean;
  motivo?: string | null;
  phone: string | null;
  requested_at: string | null;
  confirmado_em?: string | null;
  proxima_confirmacao?: string | null;
};
const MOTIVOS: Record<string, string> = {
  administracao: "A administração pediu a atualização do seu contato.",
  sem_telefone: "Cadastre o telefone com DDD para continuar.",
  primeira_confirmacao: "Confirme se este é o seu telefone com DDD.",
  vencido: "Já se passaram 60 dias: confirme se o telefone continua o mesmo.",
};

export function PhoneUpdateCard({ onSaved }: { onSaved?: () => void }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await rpc<Pedido>("eo_my_contact_request");
      setPedido(r);
      setPhone(formatarTelefone(r.phone ?? ""));
    } catch (e) {
      setErro(messageOf(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      if (!telefoneValido(phone)) throw new Error("Digite DDD e número, por exemplo (11) 98765-4321.");
      await rpc("eo_save_my_phone", { p_phone: phone });
      setAviso("Telefone confirmado. Vamos perguntar de novo em 60 dias.");
      await load();
      onSaved?.();
    } catch (e) {
      setErro(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      {pedido?.motivo ? <Text style={s.body}>{MOTIVOS[pedido.motivo] ?? MOTIVOS.primeira_confirmacao}</Text> : null}
      <Field
        label="Telefone com DDD"
        value={phone}
        onChangeText={(v) => setPhone(formatarTelefone(v))}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={15}
        editable={!busy}
        placeholder="(11) 98765-4321"
      />
      {pedido?.confirmado_em ? (
        <Text style={s.small}>
          Confirmado em {new Date(pedido.confirmado_em).toLocaleDateString("pt-BR")}. Próxima confirmação em{" "}
          {pedido.proxima_confirmacao ? new Date(pedido.proxima_confirmacao).toLocaleDateString("pt-BR") : "60 dias"}.
        </Text>
      ) : null}
      <Button title={busy ? "Salvando…" : "Salvar e confirmar telefone"} disabled={busy || !telefoneValido(phone)} onPress={() => void save()} />
      {aviso ? <Text style={[s.small, { color: C.green }]}>{aviso}</Text> : null}
      {erro ? <Text accessibilityRole="alert" style={{ color: C.red }}>{erro}</Text> : null}
    </Card>
  );
}

export function ContactUpdateGate({ onComplete, onSignOut }: GateProps) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      const r = await rpc<Pedido>("eo_my_contact_request");
      if (mounted.current) setPedido(r);
    } catch {
      /* não bloqueia o app por falha de consulta; tenta de novo ao voltar */
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [load]);
  // Enquanto consulta, não cobre a tela: o login segue direto.
  if (!pedido?.required) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50, backgroundColor: C.canvas }]} accessibilityViewIsModal>
      <Page contentStyle={{ paddingTop: 60 }}>
        <Text accessibilityRole="header" style={s.title}>
          Confirme seu telefone
        </Text>
        <Text style={s.small}>Contato declarado por você, sem verificação por SMS.</Text>
        <PhoneUpdateCard
          onSaved={() => {
            setPedido((p) => (p ? { ...p, required: false } : p));
            onComplete?.();
          }}
        />
        {onSignOut && <Button title="Sair da conta" secondary onPress={onSignOut} />}
      </Page>
    </View>
  );
}
