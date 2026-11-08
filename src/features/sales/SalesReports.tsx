import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Archive, ChevronRight, FileText, RefreshCw, Search, Upload } from "lucide-react";
import { rpc, supabase, type Workspace } from "../../services/supabase";
import { MAX_HTML_BYTES, periodLabels, prepareSalesHtml, SALES_BUCKET, salesPeriods, STATIC_HTML_NOTICE, validateHtmlFile, type SalesPeriod, type SalesReport } from "./sales-html";
import "./sales-reports.css";
import { prepareSalesPackage } from "./sales-package";

export function SalesReports({ workspace, initialPeriod = "week" }: { workspace: Workspace; initialPeriod?: SalesPeriod }) {
  const admin = workspace.person.role === "admin";
  const [period, setPeriod] = useState<SalesPeriod>(initialPeriod);
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SalesReport | null>(null);
  const [html, setHtml] = useState("");
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [publishPeriod, setPublishPeriod] = useState<SalesPeriod>(initialPeriod);
  const [file, setFile] = useState<File | null>(null);
  const [allStores, setAllStores] = useState(true);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [storeQuery, setStoreQuery] = useState("");
  const generation = useRef(0);
  const actionLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const rows = await rpc<SalesReport[]>("eo_sales_reports", { p_period: period });
      if (current === generation.current) setReports(rows);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os relatórios.");
    } finally { if (current === generation.current) setLoading(false); }
  }, [period, workspace.person.id]);
  useEffect(() => { setError(""); void load(); return () => { generation.current++; }; }, [load]);
  const visible = reports.filter((item) => Boolean(item.archived_at) === archived && item.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const visibleStores = workspace.stores.filter((store) => `${store.code} ${store.name} ${store.region}`.toLocaleLowerCase("pt-BR").includes(storeQuery.toLocaleLowerCase("pt-BR")));

  async function openReport(report: SalesReport) {
    if (actionLock.current || !supabase) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage(""); setHtml(""); setSelected(report);
    try {
      const { data, error: failure } = await supabase.storage.from(SALES_BUCKET).download(report.object_path);
      if (failure) throw failure;
      if (!data || data.size > MAX_HTML_BYTES) throw new Error("O arquivo está vazio ou excede o limite de 10 MB.");
      const source = await data.text();
      if (!source.trim()) throw new Error("O arquivo HTML está vazio.");
      setHtml(prepareSalesHtml(source));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir o HTML."); }
    finally { actionLock.current = false; setBusy(false); }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (actionLock.current || !supabase) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    let objectPath: string | null = null;
    let published = false;
    try {
      if (!file) throw new Error("Escolha o HTML do relatório.");
      validateHtmlFile(file.name, file.size);
      const prepared = prepareSalesPackage(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!title.trim()) throw new Error("Informe um título para o relatório.");
      if (!allStores && !storeIds.length) throw new Error("Selecione pelo menos uma loja.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Entre novamente para publicar.");
      objectPath = `${user.id}/${crypto.randomUUID()}.html`;
      const { error: failure } = await supabase.storage.from(SALES_BUCKET).upload(objectPath, prepared.bytes, { contentType: "text/html", upsert: false });
      if (failure) throw failure;
      await rpc<string>("eo_publish_sales_report", { p_title: title.trim(), p_period: publishPeriod, p_object_path: objectPath, p_stores: allStores ? [] : storeIds });
      published = true;
      setTitle(""); setFile(null); setComposer(false); setArchived(false);
      if (fileInput.current) fileInput.current.value = "";
      setMessage(`Relatório publicado para as lojas selecionadas.${prepared.fileCount > 1 ? ` Pacote de ${prepared.fileCount} arquivos processado.` : ""}${prepared.hasScripts ? " A prévia mantém os scripts desativados." : ""}`);
      if (period === publishPeriod) await load(); else setPeriod(publishPeriod);
    } catch (cause) {
      if (objectPath && !published) await supabase.storage.from(SALES_BUCKET).remove([objectPath]);
      setError(cause instanceof Error ? cause.message : "Não foi possível publicar o relatório.");
    } finally { actionLock.current = false; setBusy(false); }
  }

  async function archive(report: SalesReport) {
    if (actionLock.current || !window.confirm(report.archived_at ? "Restaurar este relatório para as lojas?" : "Arquivar este relatório? Ele sairá da lista da equipe.")) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await rpc("eo_archive_sales_report", { p_id: report.id, p_archived: !report.archived_at });
      setSelected(null); setHtml(""); setMessage(report.archived_at ? "Relatório restaurado." : "Relatório arquivado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o relatório."); }
    finally { actionLock.current = false; setBusy(false); }
  }

  return <section className="sales-reports">
    {error && <div className="sales-feedback sales-error" role="alert">{error}</div>}
    {message && <div className="sales-feedback" role="status">{message}</div>}
    {selected ? <>
      <div className="sales-heading"><div><button type="button" className="text-button sales-back" disabled={busy} onClick={() => { setSelected(null); setHtml(""); setError(""); }}><ArrowLeft size={18} /> Voltar aos relatórios</button><h2>{selected.title}</h2><p>{periodLabels[selected.period]} · {new Date(selected.published_at).toLocaleDateString("pt-BR")}{selected.archived_at ? " · Arquivado" : ""}</p></div>{admin && <button className="secondary" type="button" disabled={busy} onClick={() => void archive(selected)}><Archive size={16} />{selected.archived_at ? "Restaurar" : "Arquivar"}</button>}</div>
      <p className="sales-preview-note">{STATIC_HTML_NOTICE}</p>
      {busy && <p role="status">Carregando relatório…</p>}
      {html && <div className="sales-viewer"><iframe title={selected.title} sandbox="" referrerPolicy="no-referrer" srcDoc={html} /></div>}
      {!busy && !html && <button className="secondary" type="button" onClick={() => void openReport(selected)}>Tentar abrir novamente</button>}
    </> : <>
      <div className="sales-heading"><div><span className="eyebrow">RESULTADOS DA OPERAÇÃO</span><h2>Vendas</h2><p>Seus relatórios por semana, mês e ano.</p></div><div className="sales-actions"><button className="secondary" type="button" disabled={loading || busy} onClick={() => { setError(""); void load(); }} aria-label="Atualizar relatórios"><RefreshCw size={17} /></button>{admin && <button className="primary" type="button" disabled={busy} onClick={() => setComposer(!composer)}><Upload size={17} />{composer ? "Fechar publicação" : "Publicar HTML"}</button>}</div></div>
      {admin && composer && <form className="sales-publish" onSubmit={(event) => void publish(event)}>
        <h3>Novo relatório</h3><p className="sales-preview-note">{STATIC_HTML_NOTICE} Até 10 MB no arquivo, no total descompactado e no HTML final. Máximo de 100 arquivos e pastas.</p>
        <label>Título<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} required disabled={busy} placeholder="Ex.: Resultado da semana 45" /></label>
        <label>Período<select value={publishPeriod} onChange={(event) => setPublishPeriod(event.target.value as SalesPeriod)} disabled={busy}>{salesPeriods.map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>
        <label>HTML ou pacote ZIP<input ref={fileInput} type="file" accept=".html,.htm,.zip,text/html,application/zip" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); }} required /></label>
        <fieldset disabled={busy}><legend>Lojas destinatárias</legend><label className="sales-checkbox"><input type="checkbox" checked={allStores} onChange={(event) => setAllStores(event.target.checked)} />Todas as lojas do meu escopo</label>
          {!allStores && <><input aria-label="Buscar lojas destinatárias" placeholder="Buscar loja ou regional" value={storeQuery} onChange={(event) => setStoreQuery(event.target.value)} /><div className="sales-actions"><button className="text-button" type="button" onClick={() => setStoreIds((previous) => [...new Set([...previous, ...visibleStores.map((store) => store.id)])])}>Selecionar filtradas</button><button className="text-button" type="button" onClick={() => setStoreIds([])}>Limpar seleção</button><span>{storeIds.length} selecionadas</span></div><div className="sales-store-list">{visibleStores.map((store) => <label className="sales-checkbox" key={store.id}><input type="checkbox" checked={storeIds.includes(store.id)} onChange={(event) => setStoreIds((previous) => event.target.checked ? [...previous, store.id] : previous.filter((id) => id !== store.id))} />{store.code} · {store.name}</label>)}{!visibleStores.length && <p>Nenhuma loja encontrada.</p>}</div></>}
        </fieldset><button className="primary" disabled={busy} type="submit">{busy ? "Publicando…" : "Publicar relatório"}</button>
      </form>}
      <div className="sales-toolbar"><div className="sales-periods" role="group" aria-label="Período do relatório">{salesPeriods.map((value) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? "is-active" : ""} disabled={busy} onClick={() => setPeriod(value)}>{periodLabels[value]}</button>)}</div><label className="sales-search"><Search size={17} /><input type="search" aria-label="Buscar relatório pelo título" placeholder="Buscar relatório" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{admin && <label className="sales-checkbox"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Arquivados</label>}</div>
      {loading ? <p role="status">Carregando relatórios…</p> : visible.length ? <div className="sales-list">{visible.map((report) => <button type="button" key={report.id} className="sales-report-row" disabled={busy} onClick={() => void openReport(report)}><span className="sales-report-icon"><FileText size={22} /></span><span className="sales-report-copy"><strong>{report.title}</strong><span>{periodLabels[report.period]} · {new Date(report.published_at).toLocaleDateString("pt-BR")}{report.archived_at ? " · Arquivado" : ""}</span></span><ChevronRight size={19} /></button>)}</div> : <div className="sales-empty"><FileText size={30} /><h3>{query ? "Nenhum resultado" : archived ? "Nenhum relatório arquivado" : "Nenhum relatório neste período"}</h3><p>{query ? "Tente outro título na busca." : "Os relatórios publicados para suas lojas aparecerão aqui."}</p></div>}
    </>}
  </section>;
}
