import { useEffect, useState } from "react";
import { rpc, type Workspace } from "../../services/supabase";
import { reportCsv, type ReportSummary, type AuditPage } from "./model";
export function ReportsHub({
  workspace,
  onOpen,
}: {
  workspace: Workspace;
  onOpen?: (module: string) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [rows, setRows] = useState<ReportSummary[]>([]),
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
      rpc<ReportSummary[]>("eo_reports_summary", { p_from: from, p_to: to }),
      workspace.person.role === "admin"
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
  }, [from, to, page, refresh, workspace.person.role]);
  async function download(kind: "summary" | "audit") {
    setError("");
    try {
      const data = kind === "summary" ? rows : (audit?.items ?? []);
      await rpc("eo_report_export_log", { p_kind: kind, p_count: data.length });
      const url = URL.createObjectURL(
        new Blob([reportCsv(data)], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `eo-${kind}-${from}-${to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    }
  }
  return (
    <section>
      <header>
        <span className="eyebrow">DADOS DA OPERAÇÃO</span>
        <h2>Relatórios</h2>
        <p>
          Consulte os registros reais dos módulos na sua abrangência. Os números
          abaixo representam registros, sem estimar resultados financeiros.
        </p>
      </header>
      <div className="form-grid">
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Carregando relatórios...</p>}
      <div className="commercial-actions">
        <button
          disabled={busy || !rows.length}
          onClick={() => void download("summary")}
        >
          Exportar resumo CSV
        </button>
        <button onClick={() => setRefresh((v) => v + 1)}>Atualizar</button>
      </div>
      <div className="module-grid">
        {rows.map((row) => (
          <article className="panel" key={row.id}>
            <h3>{row.label}</h3>
            <strong>{row.count.toLocaleString("pt-BR")} registros</strong>
            <p>{row.note}</p>
            {onOpen && (
              <button className="secondary" onClick={() => onOpen(row.id)}>
                Abrir relatório do módulo
              </button>
            )}
          </article>
        ))}
      </div>
      {workspace.person.role === "admin" && (
        <section className="panel">
          <h3>Auditoria de acessos e ações</h3>
          <p>
            Eventos efetivamente registrados. Abrir esta central e exportar são
            ações auditadas. O CSV exporta a página exibida, com até 100
            eventos.
          </p>
          <button
            disabled={busy || !audit?.items.length}
            onClick={() => void download("audit")}
          >
            Exportar página de auditoria CSV
          </button>
          {audit?.items.map((row) => (
            <p key={row.id}>
              {new Date(row.created_at).toLocaleString("pt-BR")} ·{" "}
              {row.actor_name || "Sistema"} · {row.action} · {row.entity_id}
            </p>
          ))}
          <p>
            {audit?.total ?? 0} eventos · Página {page + 1}
          </p>
          <button disabled={!page || busy} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <button
            disabled={busy || (page + 1) * 100 >= (audit?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </section>
      )}
    </section>
  );
}
