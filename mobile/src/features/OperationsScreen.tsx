import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { useEO } from "../providers/eo-provider";
import { rpc, supabase } from "../services/supabase";
import { Button, Card, Choice, Field, Page, Section, StorePicker, C, s } from "../ui";
import { ScreenTitle, d } from "../design";

type DayEntry = {
  id: string; entry_date: string; store_id: string; store_code: string; store_name: string;
  region: string; person_id: string; person_name: string; outcome: string; reasons: string[];
  note: string; transcript: string | null; audio_path: string | null; updated_at: string;
};
type MoodEntry = Omit<DayEntry, "outcome" | "reasons" | "note" | "transcript" | "audio_path"> & { mood: string };
type Settings = { enabled: boolean; send_time: string; timezone: string; prompt: string };
type PageResult<T> = { items: T[]; total: number; cutoff: string };
type Overview = {
  diary_count: number; mood_count: number; store_count: number; people_count: number;
  groups: { key: string; label: string; diary_count: number; happy: number; neutral: number; sad: number }[];
  top_reasons: { reason: string; count: number }[];
};
type Tab = "diary" | "mood" | "summary";
const today = () => new Date().toLocaleDateString("en-CA");
const reasonOptions = {
  sold: ["Bom atendimento", "Produto disponível", "Campanha e preço", "Fluxo de clientes", "Equipe preparada", "Outro"],
  no_sale: ["Baixo fluxo", "Falta de produto", "Preço", "Crédito e pagamento", "Equipe reduzida", "Problema de sistema", "Outro"],
};
const moodOptions = [
  { value: "happy", label: "Bem", emoji: "🙂" },
  { value: "neutral", label: "Mais ou menos", emoji: "😐" },
  { value: "sad", label: "Difícil", emoji: "🙁" },
];

async function exportCsv(name: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((value) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(";")).join("\r\n");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write("\uFEFF" + csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error("O compartilhamento de arquivos não está disponível neste aparelho.");
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: "Exportar relatório EO" });
}

export function OperationsScreen({ initialTab = "diary" }: { initialTab?: Tab }) {
  const app = useEO();
  const workspace = app.workspace!;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [storeIds, setStoreIds] = useState<string[]>(workspace.stores.length === 1 ? [workspace.stores[0].id] : []);
  const [scopeOpen, setScopeOpen] = useState(false);
  const store = storeIds.length === 1 ? storeIds[0] : "";
  const [outcome, setOutcome] = useState<"sold" | "no_sale">("sold");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [audioUri, setAudioUri] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [mood, setMood] = useState("");
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [feelings, setFeelings] = useState<MoodEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reportPage, setReportPage] = useState(0);
  const [groupBy, setGroupBy] = useState<"region" | "store">("region");
  const [recordPage, setRecordPage] = useState(0);
  const [showRecords, setShowRecords] = useState(false);
  const [dayTotal, setDayTotal] = useState(0);
  const [moodTotal, setMoodTotal] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [aiSummary, setAiSummary] = useState<{ text: string; scope: string } | null>(null);
  const loadVersion = useRef(0);
  const dayRequest = useRef(Crypto.randomUUID());
  const moodRequest = useRef(Crypto.randomUUID());
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (status.isFinished && status.url) {
      setAudioUri(status.url);
      setAudioPath(null);
    }
    if (status.hasError) setError("Não foi possível concluir a gravação.");
  });
  const recording = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(audioUri || null);
  const admin = workspace.person.role === "admin";
  const leader = admin || workspace.person.role === "diretor";

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active" && recorder.isRecording) void recorder.stop().catch(() => {});
    });
    return () => listener.remove();
  }, [recorder]);
  useEffect(() => {
    if (recording.isRecording) setSeconds(Math.min(60, Math.ceil(recording.durationMillis / 1000)));
  }, [recording.isRecording, recording.durationMillis]);

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setError("Use datas no formato AAAA-MM-DD e confira o intervalo.");
      return;
    }
    setBusy(true); setError("");
    const version = ++loadVersion.current;
    try {
      const cutoff = new Date().toISOString();
      const parameters = { p_from: from, p_to: to, p_stores: storeIds, p_cutoff: cutoff };
      const [days, moods, summary, config] = await Promise.all([
        rpc<PageResult<DayEntry>>("eo_day_entries_page", { ...parameters, p_limit: 30, p_offset: recordPage * 30 }),
        rpc<PageResult<MoodEntry>>("eo_mood_entries_page", { ...parameters, p_limit: 30, p_offset: recordPage * 30 }),
        rpc<Overview>("eo_operational_overview", { ...parameters, p_group: groupBy }),
        rpc<Settings>("eo_mood_settings"),
      ]);
      if (version !== loadVersion.current) return;
      setEntries(days.items); setFeelings(moods.items);
      setDayTotal(days.total); setMoodTotal(moods.total); setOverview(summary);
      setSettings(config); setReportPage(0);
    } catch (e) { if (version === loadVersion.current) setError((e as Error).message); }
    finally { if (version === loadVersion.current) setBusy(false); }
  }, [from, to, storeIds, groupBy, recordPage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setRecordPage(0); }, [from, to, storeIds]);

  async function recordAudio() {
    setError("");
    try {
      if (recording.isRecording) {
        await recorder.stop();
        if (recorder.uri) setAudioUri(recorder.uri);
        return;
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o microfone nos ajustes do aparelho ou registre por texto.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      setAudioUri(""); setAudioPath(null);  setSeconds(0);
      recorder.record({ forDuration: 60 });
    } catch (e) { setError((e as Error).message); }
  }
  async function uploadAudio() {
    if (!audioUri) return null;
    if (audioPath) return audioPath;
    const file = new File(audioUri);
    if (file.size > 10 * 1024 * 1024) throw new Error("O áudio deve ter até 10 MB.");
    const path = `${workspace.person.id}/${Crypto.randomUUID()}.m4a`;
    const { error: uploadError } = await supabase!.storage.from("eo-day-audio").upload(path, await file.arrayBuffer(), { contentType: "audio/mp4", upsert: false });
    if (uploadError) throw new Error("Não foi possível guardar o áudio. Tente novamente.");
    setAudioPath(path);
    return path;
  }
  async function summarize() {
    setBusy(true); setError(""); setMessage("");
    try {
      const scope = JSON.stringify({ from, to, storeIds, groupBy });
      const { data, error: invokeError } = await supabase!.functions.invoke("summarize-operations", {
        body: { from, to, stores: storeIds, group: groupBy },
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
      if (!store) throw new Error("Escolha uma única loja para este registro.");
      const path = await uploadAudio();
      await rpc("eo_save_day_entry", { p_store: store, p_date: today(), p_outcome: outcome, p_reasons: reasons, p_note: note.trim(), p_audio_path: path, p_audio_seconds: path ? Math.max(1, seconds) : null, p_transcript: null, p_request_id: dayRequest.current });
      dayRequest.current = Crypto.randomUUID();
      setNote(""); setReasons([]); setAudioUri(""); setAudioPath(null); 
      setMessage("Registro salvo no diário da loja.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveMood() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!store || !mood) throw new Error("Escolha uma única loja e como está seu dia.");
      await rpc("eo_save_mood", { p_store: store, p_date: today(), p_mood: mood, p_request_id: moodRequest.current });
      moodRequest.current = Crypto.randomUUID();
      setMood(""); setMessage("Resposta registrada. Obrigado por compartilhar.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function exportReport(kind: "day" | "mood") {
    setBusy(true); setError("");
    try {
      let cutoff: string | undefined;
      const rows: (DayEntry | MoodEntry)[] = [];
      let total = 0;
      do {
        const page = await rpc<PageResult<DayEntry | MoodEntry>>(kind === "day" ? "eo_day_entries_page" : "eo_mood_entries_page", {
          p_from: from, p_to: to, p_stores: storeIds, p_cutoff: cutoff, p_limit: 500, p_offset: rows.length,
        });
        total = page.total; cutoff = page.cutoff;
        if (!page.items.length) break;
        rows.push(...page.items);
      } while (rows.length < total);
      if (kind === "day") await exportCsv("diario-vendas-eo.csv", [["Data", "COD", "Loja", "Regional", "Pessoa", "Resultado", "Motivos", "Relato", "Transcrição"], ...(rows as DayEntry[]).map((entry) => [entry.entry_date, entry.store_code, entry.store_name, entry.region, entry.person_name, entry.outcome === "sold" ? "Venda" : "Não venda", entry.reasons.join(", "), entry.note, entry.transcript])]);
      else await exportCsv("sentimento-equipe-eo.csv", [["Data", "COD", "Loja", "Regional", "Pessoa", "Sentimento", "Registrado em"], ...(rows as MoodEntry[]).map((entry) => [entry.entry_date, entry.store_code, entry.store_name, entry.region, entry.person_name, moodOptions.find((item) => item.value === entry.mood)?.label, entry.updated_at])]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const groups = overview?.groups ?? [];

  return <Page>
    <ScreenTitle title={tab === "diary" ? "Diário de vendas" : tab === "mood" ? "Como está seu dia?" : leader ? "Resumo da equipe" : "Meus registros"} subtitle="Cada registro ajuda a entender a operação." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {([["diary", "Meu dia"], ["mood", "Sentimento"], ["summary", "Resumo"]] as const).map(([value, label]) => <Choice key={value} label={label} selected={tab === value} onPress={() => setTab(value)} />)}
    </ScrollView>
    {!!error && <Card><Text accessibilityRole="alert" style={{ color: C.red }}>{error}</Text></Card>}
    {!!message && <Card><Text style={{ color: C.green }}>{message}</Text></Card>}
    <Card>
      <Button title={scopeOpen ? "Recolher lojas" : store ? `Loja · ${workspace.stores.find((item) => item.id === store)?.name}` : tab === "summary" ? "Todas as lojas do meu acesso" : "Selecionar a loja do registro"} secondary onPress={() => setScopeOpen(!scopeOpen)} />
      {scopeOpen && <StorePicker stores={workspace.stores} selected={storeIds} onChange={setStoreIds} />}
      {tab !== "summary" && storeIds.length !== 1 && <Text style={s.small}>Escolha uma única loja para registrar seu dia.</Text>}
      {tab === "summary" && storeIds.length > 1 && <Text style={s.small}>Resumo das {storeIds.length} lojas selecionadas.</Text>}
    </Card>
    {tab === "diary" && <Card>
      <Section title="Como foram as vendas?" />
      <Choice label="Conseguimos vender" selected={outcome === "sold"} onPress={() => { setOutcome("sold"); setReasons([]); }} />
      <Choice label="Oportunidades que não viraram venda" selected={outcome === "no_sale"} onPress={() => { setOutcome("no_sale"); setReasons([]); }} />
      <Section title="O que mais influenciou?" />
      {reasonOptions[outcome].map((reason) => <Choice key={reason} label={reason} selected={reasons.includes(reason)} onPress={() => setReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason])} />)}
      <Field label="Conte o que aconteceu" multiline value={note} onChangeText={setNote} maxLength={5000} placeholder="O que ajudou, dificultou e qual ação foi tomada?" />
      <Section title="Diário por áudio" />
      <Text style={s.small}>Até 1 minuto. A gravação para ao sair do app.</Text>
      <Button title={recording.isRecording ? `Parar · ${seconds}s / 60s` : audioUri ? `Gravar novamente · ${seconds}s` : "Gravar áudio de até 1 minuto"} secondary disabled={busy} onPress={() => void recordAudio()} />
      {!!audioUri && <Text style={s.small}>O áudio será guardado com o registro. Transcrição automática pendente de integração compatível.</Text>}
      {!!audioUri && <Button title="Ouvir gravação" secondary disabled={recording.isRecording} onPress={() => { void player.seekTo(0).then(() => player.play()); }} />}
      <Button title={busy ? "Salvando…" : "Salvar registro"} disabled={busy || recording.isRecording || !store || (!reasons.length && !note.trim() && !audioUri)} onPress={() => void saveDay()} />
    </Card>}
    {tab === "mood" && <>
      <Card>
        <Text style={s.small}>Como você está se sentindo agora?</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {moodOptions.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: mood === item.value }} onPress={() => setMood(item.value)} style={{ flex: 1, alignItems: "center", paddingVertical: 18, paddingHorizontal: 5, gap: 10, borderRadius: 18, backgroundColor: mood === item.value ? C.yellow : C.canvas }}><Text style={{ fontSize: 34 }}>{item.emoji}</Text><Text style={{ color: C.ink, fontSize: 12, fontWeight: "600" }}>{item.label}</Text></Pressable>)}
        </View>
        <Button title="Registrar resposta" disabled={busy || !store || !mood} onPress={() => void saveMood()} />
      </Card>
      {admin && settings && <Card>
        <Section title="Programar a pergunta" />
        <Choice label={settings.enabled ? "Envio diário ativado" : "Envio diário desativado"} selected={settings.enabled} onPress={() => setSettings({ ...settings, enabled: !settings.enabled })} />
        <Field label="Horário (HH:MM)" value={settings.send_time.slice(0, 5)} onChangeText={(value) => setSettings({ ...settings, send_time: value })} maxLength={5} keyboardType="numbers-and-punctuation" />
        <Text style={s.small}>Fuso de envio {settings.timezone}. Você pode desativar a pergunta a qualquer momento.</Text>
        <Button title="Salvar programação" secondary disabled={busy} onPress={async () => {
          setBusy(true); setError("");
          try {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.send_time.slice(0, 5))) throw new Error("Informe um horário entre 00:00 e 23:59.");
            await rpc("eo_admin_save_mood_settings", { p_enabled: settings.enabled, p_send_time: settings.send_time, p_timezone: settings.timezone });
            setMessage("Programação atualizada.");
          } catch (e) { setError((e as Error).message); }
          finally { setBusy(false); }
        }} />
      </Card>}
    </>}
    {tab === "summary" && <>
      <Card>
        <Field label="De (AAAA-MM-DD)" value={from} onChangeText={setFrom} maxLength={10} />
        <Field label="Até (AAAA-MM-DD)" value={to} onChangeText={setTo} maxLength={10} />
        <Button title="Atualizar resumo" secondary disabled={busy} onPress={() => void load()} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontSize: 30, fontWeight: "700" }}>{overview?.diary_count ?? 0}</Text><Text style={s.small}>Diários de vendas</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontSize: 30, fontWeight: "700" }}>{overview?.mood_count ?? 0}</Text><Text style={s.small}>Respostas de sentimento</Text></View>
        </View>
        <Text style={s.small}>Uma pessoa pode responder várias vezes ao dia. Os totais representam registros.</Text>
        <Choice label="Agrupar por regional" selected={groupBy === "region"} onPress={() => setGroupBy("region")} />
        <Choice label="Agrupar por loja" selected={groupBy === "store"} onPress={() => setGroupBy("store")} />
        <Button title="Exportar diário em CSV" secondary disabled={!dayTotal || busy} onPress={() => void exportReport("day")} />
        <Button title="Exportar sentimento em CSV" secondary disabled={!moodTotal || busy} onPress={() => void exportReport("mood")} />
      </Card>
      <Card>
        <Section title="Resumo com Anthropic" />
        <Text style={s.small}>Totais completos e uma amostra de até 100 relatos recentes. O resumo fica salvo no banco.</Text>
        <Button title="Gerar resumo dos relatos" secondary disabled={busy || !dayTotal} onPress={() => void summarize()} />
        {admin && <Button title="Testar conexão Anthropic" secondary disabled={busy} onPress={() => void checkAnthropic()} />}
        {aiSummary?.scope === JSON.stringify({ from, to, storeIds, groupBy }) && <Text style={{ color: C.ink, lineHeight: 22 }}>{aiSummary.text}</Text>}
      </Card>
      {!!overview?.top_reasons.length && <Card><Section title="Motivos mais registrados" />{overview.top_reasons.map((item) => <Text style={s.small} key={item.reason}>{item.reason} · {item.count}</Text>)}</Card>}
      {groups.slice(reportPage * 10, (reportPage + 1) * 10).map((item) => <Card key={item.key}><Text style={s.strong}>{item.label || "Sem regional"}</Text><Text style={s.small}>{item.diary_count} registros de vendas</Text><Text style={s.strong}>🙂 {item.happy}    😐 {item.neutral}    🙁 {item.sad}</Text></Card>)}
      {groups.length > 10 && <View style={{ flexDirection: "row", gap: 8 }}><Button title="Anterior" secondary disabled={!reportPage} onPress={() => setReportPage(reportPage - 1)} /><Button title="Próxima" secondary disabled={(reportPage + 1) * 10 >= groups.length} onPress={() => setReportPage(reportPage + 1)} /></View>}
      <Button title={showRecords ? "Recolher registros" : `Ver registros individuais (${dayTotal + moodTotal})`} secondary onPress={() => setShowRecords(!showRecords)} />
      {showRecords && <>
      <Section title="Registros do diário" />
      {entries.map((entry) => <Card key={entry.id}><Text style={s.strong}>{entry.store_code} · {entry.store_name}</Text><Text style={s.small}>{entry.person_name} · {entry.entry_date}</Text><Text style={s.small}>{entry.reasons.join(" · ")}</Text>{!!entry.note && <Text style={{ color: C.ink, lineHeight: 21 }}>{entry.note}</Text>}{!!entry.transcript && <Text style={{ color: C.ink, lineHeight: 21 }}>{entry.transcript}</Text>}</Card>)}
      <Section title="Respostas de sentimento" />
      {feelings.map((entry) => <Card key={entry.id}><Text style={s.strong}>{moodOptions.find((item) => item.value === entry.mood)?.emoji} {entry.person_name}</Text><Text style={s.small}>{entry.store_code} · {entry.store_name} · {entry.entry_date}</Text></Card>)}
      <View style={{ flexDirection: "row", gap: 8 }}><Button title="Anterior" secondary disabled={busy || !recordPage} onPress={() => setRecordPage(recordPage - 1)} /><Button title="Próxima" secondary disabled={busy || (recordPage + 1) * 30 >= Math.max(dayTotal, moodTotal)} onPress={() => setRecordPage(recordPage + 1)} /></View>
      <Text style={s.small}>Página {recordPage + 1} · até 30 registros por módulo</Text>
      </>}
      {!groups.length && <Card><Text style={s.strong}>Sem registros no período</Text><Text style={s.small}>Os registros aparecem depois que a equipe responde.</Text></Card>}
    </>}
    <Text style={d.sectionNote}>Registros vinculados à pessoa e à loja, com acesso conforme o perfil.</Text>
  </Page>;
}
