import { useRef, useState } from "react";
import { rpc, supabase, type Store } from "../../services/supabase";
import { checklistTypeLabels, createChecklistTemplate, parseChecklistWorkbook, type ChecklistQuestion } from "../../core/checklist-workbook";
import "./checklist-admin.css";

export function ChecklistAdmin({ stores, onPublished }: { stores: Store[]; onPublished?: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ChecklistQuestion[]>([]);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const targets = all ? stores.map((store) => store.id) : selected.filter((id) => stores.some((store) => store.id === id));
  function download() {
    const blob = new Blob([createChecklistTemplate().slice().buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "modelo-checklist-eo.xlsx"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(value: File) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage(""); setItems([]);
    try {
      if (!/\.xlsx$/i.test(value.name)) throw new Error("Escolha uma planilha Excel .xlsx.");
      if (value.size > 15 * 1024 * 1024) throw new Error("A planilha excede o limite de 15 MB.");
      setItems(parseChecklistWorkbook(new Uint8Array(await value.arrayBuffer())));
    } catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  async function publish() {
    if (locked.current || !items.length || !targets.length || title.trim().length < 3) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const template = await rpc<string>("eo_checklist_create", { p_title: title.trim(), p_description: description.trim(), p_items: items, p_stores: targets });
      // A atribuição e o aviso interno já estão confirmados. Uma falha no push
      // não deve oferecer reenvio do checklist e duplicar as atribuições.
      setItems([]); setTitle(""); setDescription("");
      let notification = "O aviso foi publicado no app. O envio push não pôde ser confirmado.";
      try {
        const alertId = await rpc<string>("eo_checklist_notification", { p_template: template });
        const result = await supabase!.functions.invoke("send-alert-push", { body: { alert_id: alertId } });
        if (result.error || result.data?.error) throw new Error("Push indisponível");
        const devices = Number(result.data?.devices ?? 0), accepted = Number(result.data?.accepted ?? 0);
        notification = devices ? `Aviso encaminhado ao serviço para ${devices} aparelhos, com ${accepted} aceitos. A entrega ao aparelho não é confirmada.` : "Aviso publicado no app. 0 aparelhos registrados para push.";
      } catch { /* O resultado da atribuição permanece válido. */ }
      setMessage(`Checklist enviado às pessoas das ${targets.length} lojas selecionadas. ${notification}`);
      onPublished?.();
    } catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="checklist-admin" aria-label="Criar checklist por Excel">
    <header><h2>Checklist por Excel</h2><p>Baixe o modelo, preencha as perguntas e revise antes de enviar.</p></header>
    {error && <p role="alert" className="checklist-error">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="checklist-actions"><button type="button" onClick={download}>Baixar modelo Excel</button><button type="button" disabled={busy} onClick={() => file.current?.click()}>Importar Excel</button></div>
    <input ref={file} type="file" accept=".xlsx" hidden disabled={busy} onChange={(event) => { const value = event.target.files?.[0]; event.target.value = ""; if (value) void importFile(value); }} />
    <fieldset disabled={busy}><legend>Dados do checklist</legend>
      <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ex.: Preparação da loja" /></label>
      <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
    </fieldset>
    <fieldset disabled={busy}><legend>Quem vai responder</legend>
      <label><input type="radio" checked={all} onChange={() => setAll(true)} /> Todas as lojas do meu acesso ({stores.length})</label>
      <label><input type="radio" checked={!all} onChange={() => setAll(false)} /> Selecionar lojas</label>
      {!all && <><label>Buscar loja<input value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="checklist-stores">{stores.filter((store) => `${store.code} ${store.name}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).map((store) => <label key={store.id}><input type="checkbox" checked={selected.includes(store.id)} onChange={() => setSelected((ids) => ids.includes(store.id) ? ids.filter((id) => id !== store.id) : [...ids, store.id])} /> {store.code} · {store.name}</label>)}</div></>}
      <p>Cada pessoa ativa recebe um checklist para cada loja da sua abrangência, incluindo administradores.</p>
    </fieldset>
    {!!items.length && <div><h3>Revise {items.length} perguntas</h3><ol className="checklist-preview">{items.map((item, index) => <li key={index}><p>{item.prompt}</p><small>{checklistTypeLabels[item.type]} · {item.required ? "Obrigatória" : "Opcional"}</small></li>)}</ol></div>}
    <button type="button" disabled={busy || !items.length || !targets.length || title.trim().length < 3} onClick={() => void publish()}>{busy ? "Processando…" : `Enviar checklist para ${targets.length} lojas`}</button>
  </section>;
}
