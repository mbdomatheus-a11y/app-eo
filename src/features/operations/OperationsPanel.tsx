import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Download, Smile, Frown, Meh } from "lucide-react";
import { rpc, supabase, type Workspace } from "../../services/supabase";
import "./operations.css";

type Tab = "diary" | "mood" | "summary";
type DayEntry = {
  id: string; entry_date: string; store_id: string; store_code: string; store_name: string;
  region: string; person_id: string; person_name: string; outcome: string; reasons: string[];
  note: string; transcript: string | null; audio_path: string | null; updated_at: string;
};
type MoodEntry = Omit<DayEntry, "outcome" | "reasons" | "note" | "transcript" | "audio_path"> & { mood: string };
type MoodSettings = { enabled: boolean; send_time: string; timezone: string; prompt: string };
type PageResult<T> = { items: T[]; total: number; cutoff: string };
type Overview = {
  diary_count: number; mood_count: number; store_count: number; people_count: number;
  groups: { key: string; label: string; diary_count: number; happy: number; neutral: number; sad: number }[];
  top_reasons: { reason: string; count: number }[];
};
const today = () => new Date().toLocaleDateString("en-CA");
const reasons = {
  sold: ["Bom atendimento", "Produto disponível", "Campanha e preço", "Fluxo de clientes", "Equipe preparada", "Outro"],
  no_sale: ["Baixo fluxo", "Falta de produto", "Preço", "Crédito e pagamento", "Equipe reduzida", "Problema de sistema", "Outro"],
};
const moods = [
  { value: "happy", label: "Bem", icon: Smile, emoji: "🙂" },
  { value: "neutral", label: "Mais ou menos", icon: Meh, emoji: "😐" },
  { value: "sad", label: "Difícil", icon: Frown, emoji: "🙁" },
];

function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((value) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function OperationsPanel({ workspace, initialTab = "diary" }: { workspace: Workspace; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [store, setStore] = useState(workspace.stores.length === 1 ? workspace.stores[0].id : "");
  const [storeSearch, setStoreSearch] = useState("");
  const [outcome, setOutcome] = useState<"sold" | "no_sale">("sold");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [aiSummary, setAiSummary] = useState<{ text: string; scope: string } | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [mood, setMood] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [settings, setSettings] = useState<MoodSettings | null>(null);
  const [group, setGroup] = useState<"region" | "store">("region");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recordPage, setRecordPage] = useState(0);
  const [dayTotal, setDayTotal] = useState(0);
  const [moodTotal, setMoodTotal] = useState(0);
  const loadVersion = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(0);
  const dayRequest = useRef(crypto.randomUUID());
  const moodRequest = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const leader = ["admin", "diretor"].includes(workspace.person.role);
  const admin = workspace.person.role === "admin";
  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopRecording();
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [stopRecording]);
  useEffect(() => {
    if (!audio) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) stopRecording(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stopRecording]);

  const load = useCallback(async () => {
    if (from > to) { setError("Confira o intervalo de datas."); return; }
    const version = ++loadVersion.current;
    setBusy(true);
    setError("");
    try {
      const cutoff = new Date().toISOString();
      const parameters = { p_from: from, p_to: to, p_stores: store ? [store] : [], p_cutoff: cutoff };
      const [days, feelings, summary, config] = await Promise.all([
        rpc<PageResult<DayEntry>>("eo_day_entries_page", { ...parameters, p_limit: 50, p_offset: recordPage * 50 }),
        rpc<PageResult<MoodEntry>>("eo_mood_entries_page", { ...parameters, p_limit: 50, p_offset: recordPage * 50 }),
        rpc<Overview>("eo_operational_overview", { ...parameters, p_group: group }),
        rpc<MoodSettings>("eo_mood_settings"),
      ]);
      if (version !== loadVersion.current) return;
      setEntries(days.items);
      setMoodEntries(feelings.items);
      setDayTotal(days.total); setMoodTotal(feelings.total); setOverview(summary);
      setSettings(config);
    } catch (e) { if (version === loadVersion.current) setError((e as Error).message); }
    finally { if (version === loadVersion.current) setBusy(false); }
  }, [from, to, store, group, recordPage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setRecordPage(0); }, [from, to, store]);

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setError("A gravação não está disponível neste navegador. Você pode registrar por texto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      setAudio(null);
      setAudioPath(null);
      
      setSeconds(0);
      rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timer.current) clearInterval(timer.current);
        if (!mounted.current) return;
        setAudio(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        setSeconds(Math.min(60, Math.ceil((Date.now() - startTime.current) / 1000)));
        setRecording(false);
      };
      rec.onerror = () => { stream.getTracks().forEach((track) => track.stop()); setRecording(false); setError("Não foi possível concluir a gravação."); };
      startTime.current = Date.now();
      rec.start(250);
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
        setSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) stopRecording();
      }, 250);
    } catch { setError("Permita o microfone para gravar ou use o campo de texto."); }
  }

  async function uploadAudio() {
    if (!audio) return null;
    if (audioPath) return audioPath;
    const type = audio.type.split(";")[0];
    const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const path = `${workspace.person.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase!.storage.from("eo-day-audio").upload(path, audio, { contentType: type, upsert: false });
    if (uploadError) throw new Error("Não foi possível guardar o áudio. Tente novamente.");
    setAudioPath(path);
    return path;
  }
  async function summarize() {
    setBusy(true); setError(""); setMessage("");
    try {
      const scope = JSON.stringify({ from, to, store, group });
      const { data, error: invokeError } = await supabase!.functions.invoke("summarize-operations", {
        body: { from, to, stores: store ? [store] : [], group },
      });
      if (invokeError) {
        const detail = invokeError.context instanceof Response ? await invokeError.context.json().catch(() => null) : null;
        throw new Error(detail?.error || "Não foi possível gerar o resumo com Anthropic.");
      }
      setAiSummary({ text: data.text, scope });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function checkAnthropic() {
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await supabase!.functions.invoke("summarize-operations", { body: { action: "check" } });
      if (invokeError) {
        const detail = invokeError.context instanceof Response ? await invokeError.context.json().catch(() => null) : null;
        throw new Error(detail?.error || "Não foi possível testar a conexão.");
      }
      setMessage(`Conexão com Anthropic validada · ${data.model}.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveDay() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!store) throw new Error("Selecione a loja deste registro.");
      const path = await uploadAudio();
      await rpc("eo_save_day_entry", {
        p_store: store, p_date: today(), p_outcome: outcome, p_reasons: selectedReasons,
        p_note: note.trim(), p_audio_path: path, p_audio_seconds: path ? seconds : null, p_transcript: null, p_request_id: dayRequest.current,
      });
      dayRequest.current = crypto.randomUUID();
      setNote(""); setSelectedReasons([]); setAudio(null); setAudioPath(null); 
      setMessage("Registro salvo no diário da loja.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveMood() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!store || !mood) throw new Error("Selecione a loja e como está seu dia.");
      await rpc("eo_save_mood", { p_store: store, p_date: today(), p_mood: mood, p_request_id: moodRequest.current });
      moodRequest.current = crypto.randomUUID();
      setMood("");
      setMessage("Resposta registrada. Obrigado por compartilhar.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const storeOptions = workspace.stores.filter((item) => `${item.code} ${item.name}`.toLocaleLowerCase("pt-BR").includes(storeSearch.trim().toLocaleLowerCase("pt-BR")));
  async function exportRecords(kind: "day" | "mood") {
    setBusy(true); setError("");
    try {
      let cutoff: string | undefined;
      const rows: (DayEntry | MoodEntry)[] = [];
      let total = 0;
      do {
        const page = await rpc<PageResult<DayEntry | MoodEntry>>(kind === "day" ? "eo_day_entries_page" : "eo_mood_entries_page", {
          p_from: from, p_to: to, p_stores: store ? [store] : [], p_cutoff: cutoff, p_limit: 500, p_offset: rows.length,
        });
        total = page.total; cutoff = page.cutoff;
        if (!page.items.length) break;
        rows.push(...page.items);
      } while (rows.length < total);
      if (kind === "day") downloadCsv("diario-vendas-eo.csv", [["Data", "COD", "Loja", "Regional", "Pessoa", "Resultado", "Motivos", "Relato", "Transcrição"], ...(rows as DayEntry[]).map((entry) => [entry.entry_date, entry.store_code, entry.store_name, entry.region, entry.person_name, entry.outcome === "sold" ? "Venda" : "Não venda", entry.reasons.join(", "), entry.note, entry.transcript])]);
      else downloadCsv("sentimento-equipe-eo.csv", [["Data", "COD", "Loja", "Regional", "Pessoa", "Sentimento", "Registrado em"], ...(rows as MoodEntry[]).map((entry) => [entry.entry_date, entry.store_code, entry.store_name, entry.region, entry.person_name, moods.find((item) => item.value === entry.mood)?.label, entry.updated_at])]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="eo-operations">
    <div className="tabs" role="tablist" aria-label="Dia e equipe">
      {([["diary", "Diário de vendas"], ["mood", "Como está seu dia?"], ["summary", leader ? "Resumo da equipe" : "Meus registros"]] as const).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <div className="eo-ops-scope">
      <label>Buscar loja<input type="search" value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Código ou nome" /></label>
      <label>{tab === "summary" ? "Abrangência" : "Loja do registro"}<select value={store} onChange={(event) => setStore(event.target.value)}>
        <option value="">{tab === "summary" ? "Todas as lojas do meu acesso" : "Selecione uma loja"}</option>
        {store && !storeOptions.some((item) => item.id === store) && <option value={store}>{workspace.stores.find((item) => item.id === store)?.name}</option>}
        {storeOptions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
      </select></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="info-strip" role="status">{message}</p>}
    {tab === "diary" && <div className="panel form">
      <h2>Como foi o dia de vendas?</h2>
      <p>Registre o contexto da loja. Você pode fazer novos registros ao longo do dia.</p>
      <div className="eo-choice-row">{(["sold", "no_sale"] as const).map((value) => <button type="button" className="secondary" aria-pressed={outcome === value} key={value} onClick={() => { setOutcome(value); setSelectedReasons([]); }}>{value === "sold" ? "Conseguimos vender" : "Oportunidades que não viraram venda"}</button>)}</div>
      <fieldset><legend>O que mais influenciou?</legend><div className="eo-choice-row">
        {reasons[outcome].map((reason) => <label className="eo-reason" key={reason}><input type="checkbox" checked={selectedReasons.includes(reason)} onChange={() => setSelectedReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason])} />{reason}</label>)}
      </div></fieldset>
      <label>Conte o que aconteceu<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={5000} placeholder="O que ajudou, o que dificultou e qual ação a equipe tomou?" /></label>
      <div className="eo-audio-card">
        <div><strong>Diário por áudio</strong><p>Até 1 minuto. O microfone é usado apenas durante a gravação.</p></div>
        <button className="secondary" disabled={busy} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <Square size={17} /> : <Mic size={17} />}{recording ? "Parar gravação" : audio ? "Gravar novamente" : "Gravar áudio"} · {seconds}s / 60s</button>
        {audioUrl && <audio controls src={audioUrl} />}
        {audio && <p className="field-hint">O áudio será guardado com o registro. Transcrição automática pendente de integração compatível.</p>}
      </div>
      <button className="primary" disabled={busy || recording || !store || (!selectedReasons.length && !note.trim() && !audio)} onClick={() => void saveDay()}>{busy ? "Salvando…" : "Salvar registro"}</button>
    </div>}
    {tab === "mood" && <>
      <div className="panel form">
        <h2>Como está seu dia?</h2><p>Escolha a opção que representa seu momento.</p>
        <div className="eo-moods">{moods.map(({ value, label, icon: Icon }) => <button key={value} className="eo-mood" aria-pressed={mood === value} onClick={() => setMood(value)}><Icon size={38} /><strong>{label}</strong></button>)}</div>
        <button className="primary" disabled={busy || !mood || !store} onClick={() => void saveMood()}>Registrar resposta</button>
      </div>
      {admin && settings && <form className="panel form" onSubmit={(event) => {
        event.preventDefault(); setBusy(true); setError("");
        void rpc("eo_admin_save_mood_settings", { p_enabled: settings.enabled, p_send_time: settings.send_time, p_timezone: settings.timezone })
          .then(() => setMessage("Programação atualizada.")).catch((e) => setError(e.message)).finally(() => setBusy(false));
      }}>
        <h3>Programar a pergunta</h3>
        <label className="checkbox-label"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />Enviar diariamente</label>
        <label>Horário<input type="time" value={settings.send_time.slice(0, 5)} onChange={(event) => setSettings({ ...settings, send_time: event.target.value })} required /></label>
        <p className="field-hint">Fuso de envio {settings.timezone}. O envio fica registrado no banco.</p>
        <button className="secondary" disabled={busy}>Salvar programação</button>
      </form>}
    </>}
    {tab === "summary" && <>
      <div className="panel form-grid"><label>De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Até<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Agrupar por<select value={group} onChange={(event) => setGroup(event.target.value as typeof group)}><option value="region">Regional</option><option value="store">Loja</option></select></label></div>
      <div className="eo-ops-totals"><div><strong>{overview?.diary_count ?? 0}</strong><span>Registros de vendas</span></div><div><strong>{overview?.store_count ?? 0}</strong><span>Lojas com registros</span></div><div><strong>{overview?.mood_count ?? 0}</strong><span>Respostas de sentimento</span></div></div>
      <p className="field-hint">Consolidação dos registros do período. Uma pessoa pode responder várias vezes no dia.</p>
      <div className="table-wrap"><table><thead><tr><th>{group === "region" ? "Regional" : "Loja"}</th><th>Diários</th><th>🙂</th><th>😐</th><th>🙁</th></tr></thead><tbody>{overview?.groups.map((item) => <tr key={item.key}><td>{item.label || item.key || "Sem regional"}</td><td>{item.diary_count}</td><td>{item.happy}</td><td>{item.neutral}</td><td>{item.sad}</td></tr>)}</tbody></table></div>
      {!!overview?.top_reasons.length && <div className="panel"><h3>Motivos mais registrados</h3>{overview.top_reasons.map((item) => <p key={item.reason}>{item.reason} · {item.count}</p>)}</div>}
      <div className="panel form">
        <h3>Resumo com Anthropic</h3>
        <p>Consolida os totais do período e uma amostra de até 100 relatos recentes. O resumo fica salvo no banco.</p>
        <button className="secondary" disabled={busy || !dayTotal} onClick={() => void summarize()}>Gerar resumo dos relatos</button>
        {admin && <button className="text-button" disabled={busy} onClick={() => void checkAnthropic()}>Testar conexão Anthropic</button>}
        {aiSummary?.scope === JSON.stringify({ from, to, store, group }) && <p style={{ whiteSpace: "pre-wrap" }}>{aiSummary.text}</p>}
      </div>
      <div className="eo-choice-row">
        <button className="secondary" disabled={busy || !dayTotal} onClick={() => void exportRecords("day")}><Download size={16} />Exportar diário</button>
        <button className="secondary" disabled={busy || !moodTotal} onClick={() => void exportRecords("mood")}><Download size={16} />Exportar sentimento</button>
      </div>
      <details className="panel"><summary>Registros do diário · {dayTotal} no período</summary>{entries.map((entry) => <article className="eo-day-row" key={entry.id}><strong>{entry.store_code} · {entry.store_name}</strong><p>{entry.person_name} · {entry.entry_date}</p><p>{entry.reasons.join(" · ")}</p><p>{entry.note}</p>{entry.transcript && <blockquote>{entry.transcript}</blockquote>}</article>)}</details>
      <details className="panel"><summary>Respostas de sentimento · {moodTotal} no período</summary>{moodEntries.map((entry) => <article className="eo-day-row" key={entry.id}><strong>{moods.find((item) => item.value === entry.mood)?.emoji} {entry.person_name}</strong><p>{entry.store_code} · {entry.store_name} · {entry.entry_date}</p></article>)}</details>
      <div className="eo-choice-row"><button className="secondary" disabled={busy || recordPage === 0} onClick={() => setRecordPage(recordPage - 1)}>Anterior</button><span>Página {recordPage + 1} · até 50 registros</span><button className="secondary" disabled={busy || (recordPage + 1) * 50 >= Math.max(dayTotal, moodTotal)} onClick={() => setRecordPage(recordPage + 1)}>Próxima</button></div>
      {!dayTotal && !moodTotal && <p className="empty">Nenhum registro nesse período.</p>}
    </>}
  </section>;
}
