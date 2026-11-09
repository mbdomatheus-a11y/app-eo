import { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { useEO } from "../providers/eo-provider";
import { rpc } from "../services/supabase";
import { Button, Card, Field, Heading, Page, s } from "../ui";
type Summary = { id: string; label: string; count: number; note: string };
type Audit = {
  id: number;
  created_at: string;
  action: string;
  entity_id: string | null;
  actor_name: string | null;
};
type AuditPage = { items: Audit[]; total: number };
function csv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return (
    "\ufeff" +
    [
      keys.map(cell).join(";"),
      ...rows.map((row) => keys.map((k) => cell(row[k])).join(";")),
    ].join("\r\n")
  );
}
export function ReportsHub({ onOpen }: { onOpen?: (module: string) => void }) {
  const app = useEO(),
    admin = app.workspace?.person.role === "admin",
    today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [rows, setRows] = useState<Summary[]>([]),
    [audit, setAudit] = useState<AuditPage | null>(null),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    Promise.all([
      rpc<Summary[]>("eo_reports_summary", { p_from: from, p_to: to }),
      admin
        ? rpc<AuditPage>("eo_report_audit_page", {
            p_from: from,
            p_to: to,
            p_offset: page * 100,
            p_limit: 100,
          })
        : Promise.resolve(null),
    ])
      .then(([r, a]) => {
        if (active) {
          setRows(r);
          setAudit(a);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [from, to, page, refresh, admin]);
  async function share(kind: "summary" | "audit") {
    setError("");
    try {
      const data = kind === "summary" ? rows : (audit?.items ?? []);
      await rpc("eo_report_export_log", { p_kind: kind, p_count: data.length });
      await Share.share({ title: "Relatório EO CSV", message: csv(data) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    }
  }
  return (
    <Page>
      <Heading
        title="Relatórios"
        detail="Registros reais da operação, conforme a sua abrangência e as permissões de cada módulo."
      />
      <Field
        label="De · AAAA-MM-DD"
        value={from}
        maxLength={10}
        onChangeText={(v) => {
          setFrom(v);
          setPage(0);
        }}
      />
      <Field
        label="Até · AAAA-MM-DD"
        value={to}
        maxLength={10}
        onChangeText={(v) => {
          setTo(v);
          setPage(0);
        }}
      />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {busy && <Text style={s.small}>Carregando relatórios...</Text>}
      <Button
        title="Compartilhar resumo CSV"
        secondary
        disabled={busy || !rows.length}
        onPress={() => void share("summary")}
      />
      <Button
        title="Atualizar"
        secondary
        onPress={() => setRefresh((v) => v + 1)}
      />
      {rows.map((row) => (
        <Card key={row.id}>
          <Heading title={row.label} detail={row.note} />
          <Text style={s.strong}>
            {row.count.toLocaleString("pt-BR")} registros
          </Text>
          {onOpen && (
            <Button
              title="Abrir relatório do módulo"
              secondary
              onPress={() => onOpen(row.id)}
            />
          )}
        </Card>
      ))}
      {admin && (
        <Card>
          <Heading
            title="Auditoria de acessos e ações"
            detail="Eventos registrados. A consulta e a exportação são auditadas. O CSV contém a página exibida, com até 100 eventos."
          />
          <Button
            title="Compartilhar página de auditoria CSV"
            secondary
            disabled={busy || !audit?.items.length}
            onPress={() => void share("audit")}
          />
          {audit?.items.map((row) => (
            <View key={row.id}>
              <Text style={s.small}>
                {new Date(row.created_at).toLocaleString("pt-BR")} ·{" "}
                {row.actor_name || "Sistema"}
              </Text>
              <Text style={s.body}>
                {row.action} · {row.entity_id}
              </Text>
            </View>
          ))}
          <Text style={s.small}>
            {audit?.total ?? 0} eventos · Página {page + 1}
          </Text>
          <Button
            title="Anterior"
            secondary
            disabled={!page || busy}
            onPress={() => setPage(page - 1)}
          />
          <Button
            title="Próxima"
            secondary
            disabled={busy || (page + 1) * 100 >= (audit?.total ?? 0)}
            onPress={() => setPage(page + 1)}
          />
        </Card>
      )}
    </Page>
  );
}
