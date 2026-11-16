import { DiaryQuestions, DiaryConfigurationEditor } from "./DiaryQuestionnaire";
import { SuccessToast } from "./SuccessToast";
import {
  validateAnswers,
  type DiaryConfiguration,
  type DiaryConfig,
} from "./questionnaire";
import { VoiceInput } from "./VoiceInput";
import { clearMoodReminderForToday } from "./mood-deferral";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { useEO } from "../providers/eo-provider";
import { rpc, supabase, deliveryMessage } from "../services/supabase";
import {
  Button,
  Card,
  Choice,
  Field,
  Page,
  Section,
  StorePicker,
  C,
  s,
} from "../ui";
import { d } from "../design";

type DayEntry = {
  id: string;
  entry_date: string;
  store_id: string;
  store_code: string;
  store_name: string;
  region: string;
  person_id: string;
  person_name: string;
  outcome: string;
  reasons: string[];
  questionnaire_version?: number;
  questionnaire_snapshot?: DiaryConfig;
  answers?: Record<string, string>;
  note: string;
  transcript: string | null;
  audio_path: string | null;
  updated_at: string;
};
type MoodEntry = Omit<
  DayEntry,
  "outcome" | "reasons" | "note" | "transcript" | "audio_path"
> & { mood: string };
type Settings = {
  enabled: boolean;
  send_time: string;
  timezone: string;
  prompt: string;
};
type PageResult<T> = { items: T[]; total: number; cutoff: string };
type Overview = {
  diary_count: number;
  mood_count: number;
  store_count: number;
  people_count: number;
  groups: {
    key: string;
    label: string;
    diary_count: number;
    happy: number;
    neutral: number;
    sad: number;
  }[];
  top_reasons: { reason: string; count: number }[];
};
type Tab = "diary" | "mood" | "summary";
const today = () => new Date().toLocaleDateString("en-CA");
const todayInTimezone = (timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (name: string) => parts.find((item) => item.type === name)?.value;
    const year = part("year"), month = part("month"), day = part("day");
    return year && month && day ? `${year}-${month}-${day}` : today();
  } catch {
    return today();
  }
};
const reasonOptions = {
  sold: [
    "Bom atendimento",
    "Produto disponível",
    "Campanha e preço",
    "Fluxo de clientes",
    "Equipe preparada",
    "Outro",
  ],
  no_sale: [
    "Baixo fluxo",
    "Falta de produto",
    "Preço",
    "Crédito e pagamento",
    "Equipe reduzida",
    "Problema de sistema",
    "Outro",
  ],
};
const moodOptions = [
  { value: "happy", label: "Bem", emoji: "🙂" },
  { value: "neutral", label: "Mais ou menos", emoji: "😐" },
  { value: "sad", label: "Difícil", emoji: "🙁" },
];

function CompactOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? C.dark : "#D9D9DF",
        backgroundColor: selected ? C.yellow : C.paper,
        borderRadius: 14,
        paddingHorizontal: 13,
        paddingVertical: 9,
        minHeight: 40,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: C.dark,
          fontSize: 13,
          fontWeight: selected ? "700" : "500",
        }}
      >
        {selected ? "✓  " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

async function exportCsv(name: string, rows: unknown[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
          return '"' + text.replace(/"/g, '""') + '"';
        })
        .join(";"),
    )
    .join("\r\n");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write("\uFEFF" + csv);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "O compartilhamento de arquivos não está disponível neste aparelho.",
    );
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: "Exportar relatório EO",
  });
}

export function OperationsScreen({
  initialTab = "diary",
}: {
  initialTab?: Tab;
}) {
  const app = useEO();
  const workspace = app.workspace!;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [storeIds, setStoreIds] = useState<string[]>(
    workspace.stores.length === 1 ? [workspace.stores[0].id] : [],
  );
  const [scopeOpen, setScopeOpen] = useState(false);
  const soleStore = workspace.stores.length === 1 ? workspace.stores[0] : null;
  const store = soleStore?.id ?? (storeIds.length === 1 ? storeIds[0] : "");
  const [outcome, setOutcome] = useState<"sold" | "no_sale">("sold");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [questionnaire, setQuestionnaire] = useState<DiaryConfiguration | null>(
    null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mood, setMood] = useState("");
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [feelings, setFeelings] = useState<MoodEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reportPage, setReportPage] = useState(0);
  const [groupBy, setGroupBy] = useState<"region" | "store">("region");
  const [recordPage, setRecordPage] = useState(0);
  const [showRecords, setShowRecords] = useState(
    workspace.person.role !== "admin" && workspace.person.role !== "diretor",
  );
  const [dayTotal, setDayTotal] = useState(0);
  const [moodTotal, setMoodTotal] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [aiSummary, setAiSummary] = useState<{
    text: string;
    scope: string;
  } | null>(null);
  const loadVersion = useRef(0);
  const dayRequest = useRef(Crypto.randomUUID());
  const moodRequest = useRef(Crypto.randomUUID());
  const admin = workspace.person.role === "admin";
  const leader = admin || workspace.person.role === "diretor";
  useEffect(() => {
    setShowRecords(!leader);
  }, [leader]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      if (tab === "diary") {
        const config = await rpc<DiaryConfiguration>("eo_diary_configuration");
        if (version === loadVersion.current) setQuestionnaire(config);
        return;
      }
      if (tab === "mood") {
        const config = await rpc<Settings>("eo_mood_settings");
        if (version === loadVersion.current) setSettings(config);
        return;
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
        from > to
      ) {
        setError("Use datas no formato AAAA-MM-DD e confira o intervalo.");
        return;
      }
      const cutoff = new Date().toISOString();
      const parameters = {
        p_from: from,
        p_to: to,
        p_stores: storeIds,
        p_cutoff: cutoff,
      };
      const [daysResult, moodsResult, summaryResult] = await Promise.allSettled(
        [
          rpc<PageResult<DayEntry>>("eo_day_entries_page", {
            ...parameters,
            p_limit: 30,
            p_offset: recordPage * 30,
          }),
          rpc<PageResult<MoodEntry>>("eo_mood_entries_page", {
            ...parameters,
            ...(!leader ? { p_from: today(), p_to: today() } : {}),
            p_limit: 30,
            p_offset: recordPage * 30,
          }),
          leader
            ? rpc<Overview>("eo_operational_overview", {
                ...parameters,
                p_group: groupBy,
              })
            : Promise.resolve(null),
        ] as const,
      );
      if (version !== loadVersion.current) return;
      if (daysResult.status === "fulfilled") {
        setEntries(daysResult.value.items);
        setDayTotal(daysResult.value.total);
      }
      if (moodsResult.status === "fulfilled") {
        setFeelings(moodsResult.value.items);
        setMoodTotal(moodsResult.value.total);
      }
      if (summaryResult.status === "fulfilled" && summaryResult.value)
        setOverview(summaryResult.value);
      else if (!leader)
        setOverview({
          diary_count:
            daysResult.status === "fulfilled" ? daysResult.value.total : 0,
          mood_count:
            moodsResult.status === "fulfilled" ? moodsResult.value.total : 0,
          store_count: 0,
          people_count: 0,
          groups: [],
          top_reasons: [],
        });
      const failed = [daysResult, moodsResult, summaryResult].find(
        (result) => result.status === "rejected",
      );
      if (failed?.status === "rejected")
        setError(
          failed.reason instanceof Error
            ? failed.reason.message
            : "Parte do histórico não pôde ser carregada.",
        );
      setReportPage(0);
    } catch (e) {
      if (version === loadVersion.current) setError((e as Error).message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [tab, from, to, storeIds, groupBy, recordPage, leader]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setAnswers({});
    setReasons([]);
  }, [questionnaire?.version]);
  useEffect(() => {
    setRecordPage(0);
  }, [from, to, storeIds]);
  useEffect(() => {
    if (soleStore && (storeIds.length !== 1 || storeIds[0] !== soleStore.id))
      setStoreIds([soleStore.id]);
  }, [soleStore?.id]);

  async function summarize() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const scope = JSON.stringify({ from, to, storeIds, groupBy });
      const { data, error: invokeError } = await supabase!.functions.invoke(
        "summarize-operations",
        {
          body: { from, to, stores: storeIds, group: groupBy },
        },
      );
      if (invokeError) {
        const detail =
          invokeError.context instanceof Response
            ? await invokeError.context.json().catch(() => null)
            : null;
        throw new Error(
          detail?.error || "Não foi possível gerar o resumo com EO.IA.",
        );
      }
      setAiSummary({ text: data.text, scope });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkAnthropic() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: invokeError } = await supabase!.functions.invoke(
        "summarize-operations",
        { body: { action: "check" } },
      );
      if (invokeError) {
        const detail =
          invokeError.context instanceof Response
            ? await invokeError.context.json().catch(() => null)
            : null;
        throw new Error(detail?.error || "Não foi possível testar a conexão.");
      }
      setMessage("Conexão com EO.IA validada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDay() {
    if (dictating) {
      setError("Conclua o ditado e revise o texto antes de salvar.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!store) throw new Error("Escolha uma única loja para este registro.");
      if (!questionnaire) throw new Error("Aguarde o questionário carregar.");
      if (outcome === "no_sale" && !reasons.length)
        throw new Error("Escolha o principal motivo da não venda.");
      const invalid = validateAnswers(questionnaire.config, answers, note);
      if (invalid) throw new Error(invalid);
      await rpc("eo_save_day_entry", {
        p_store: store,
        p_date: today(),
        p_outcome: outcome,
        p_reasons: reasons,
        p_note: note.trim(),
        p_request_id: dayRequest.current,
        p_answers: answers,
        p_questionnaire_version: questionnaire.version,
      });
      dayRequest.current = Crypto.randomUUID();
      setNote("");
      setReasons([]);
      setAnswers({});
      setMessage(deliveryMessage("Registro salvo no diário da loja."));
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveMood() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!store || !mood)
        throw new Error("Escolha uma única loja e como está seu dia.");
      const entryDate = todayInTimezone(settings?.timezone ?? "America/Sao_Paulo");
      await rpc("eo_save_mood", {
        p_store: store,
        p_date: entryDate,
        p_mood: mood,
        p_request_id: moodRequest.current,
      });
      moodRequest.current = Crypto.randomUUID();
      setMood("");
      clearMoodReminderForToday(workspace.person.id, entryDate);
      setMessage(
        deliveryMessage("Resposta registrada. Obrigado por compartilhar."),
      );
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(kind: "day" | "mood") {
    setBusy(true);
    setError("");
    try {
      let cutoff: string | undefined;
      const rows: (DayEntry | MoodEntry)[] = [];
      let total = 0;
      do {
        const page = await rpc<PageResult<DayEntry | MoodEntry>>(
          kind === "day" ? "eo_day_entries_page" : "eo_mood_entries_page",
          {
            p_from: from,
            p_to: to,
            p_stores: storeIds,
            p_cutoff: cutoff,
            p_limit: 500,
            p_offset: rows.length,
          },
        );
        total = page.total;
        cutoff = page.cutoff;
        if (!page.items.length) break;
        rows.push(...page.items);
      } while (rows.length < total);
      if (kind === "day")
        await exportCsv("diario-vendas-eo.csv", [
          [
            "Data",
            "COD",
            "Loja",
            "Regional",
            "Pessoa",
            "Resultado",
            "Motivos",
            "Relato",
            "Transcrição",
            "Versão questionário",
            "Perguntas e respostas",
          ],
          ...(rows as DayEntry[]).map((entry) => [
            entry.entry_date,
            entry.store_code,
            entry.store_name,
            entry.region,
            entry.person_name,
            entry.outcome === "sold" ? "Venda" : "Não venda",
            entry.reasons.join(", "),
            entry.note,
            entry.transcript,
            entry.questionnaire_version,
            JSON.stringify({
              questions: entry.questionnaire_snapshot?.questions,
              answers: entry.answers,
            }),
          ]),
        ]);
      else
        await exportCsv("sentimento-equipe-eo.csv", [
          [
            "Data",
            "COD",
            "Loja",
            "Regional",
            "Pessoa",
            "Sentimento",
            "Registrado em",
          ],
          ...(rows as MoodEntry[]).map((entry) => [
            entry.entry_date,
            entry.store_code,
            entry.store_name,
            entry.region,
            entry.person_name,
            moodOptions.find((item) => item.value === entry.mood)?.label,
            entry.updated_at,
          ]),
        ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const groups = overview?.groups ?? [];

  return (
    <Page>
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 23, fontWeight: "800" }}>
          {tab === "diary"
            ? "Registrar vendas"
            : tab === "mood"
              ? "Seu sentimento"
              : leader
                ? "Resumo da equipe"
                : "Histórico do mês"}
        </Text>
        {soleStore && (
          <Text style={s.small}>
            {soleStore.code} · {soleStore.name}
          </Text>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: C.paper,
          borderRadius: 14,
          padding: 4,
          gap: 4,
        }}
      >
        {(
          [
            ["diary", "Meu dia"],
            ["mood", "Sentimento"],
            ["summary", leader ? "Resumo" : "Histórico"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 11,
              backgroundColor: tab === value ? C.yellow : "transparent",
            }}
            onPress={() => setTab(value)}
          >
            <Text
              style={{
                fontSize: 13,
                color: C.dark,
                fontWeight: tab === value ? "700" : "500",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!!error && (
        <Card>
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            {error}
          </Text>
        </Card>
      )}
      <SuccessToast message={message} />
      {!soleStore && (
        <Card>
          <Button
            title={
              scopeOpen
                ? "Recolher lojas"
                : store
                  ? `Loja · ${workspace.stores.find((item) => item.id === store)?.name}`
                  : tab === "summary"
                    ? "Todas as lojas do meu acesso"
                    : "Selecionar a loja do registro"
            }
            secondary
            onPress={() => setScopeOpen(!scopeOpen)}
          />
          {scopeOpen && (
            <StorePicker
              stores={workspace.stores}
              selected={storeIds}
              onChange={setStoreIds}
            />
          )}
          {tab !== "summary" && storeIds.length !== 1 && (
            <Text style={s.small}>
              Escolha uma única loja para registrar seu dia.
            </Text>
          )}
          {tab === "summary" && storeIds.length > 1 && (
            <Text style={s.small}>
              Resumo das {storeIds.length} lojas selecionadas.
            </Text>
          )}
        </Card>
      )}
      {tab === "diary" && (
        <Card>
          <Text style={{ color: C.ink, fontSize: 18, fontWeight: "700" }}>
            {questionnaire?.config.prompt || "Como foram as vendas?"}
          </Text>
          {!questionnaire && (
            <Text style={s.small}>
              {loading
                ? "Carregando perguntas…"
                : "Perguntas indisponíveis. Toque em salvar para ver o motivo ou recarregue."}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <CompactOption
                label="Venda"
                selected={outcome === "sold"}
                onPress={() => {
                  setOutcome("sold");
                  setReasons([]);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <CompactOption
                label="Não venda"
                selected={outcome === "no_sale"}
                onPress={() => {
                  setOutcome("no_sale");
                  setReasons([]);
                }}
              />
            </View>
          </View>
          <Text style={s.label}>O que mais influenciou?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(questionnaire?.config[outcome] ?? reasonOptions[outcome]).map(
              (reason) => (
                <CompactOption
                  key={reason}
                  label={reason}
                  selected={reasons.includes(reason)}
                  onPress={() =>
                    setReasons((current) =>
                      current.includes(reason)
                        ? current.filter((item) => item !== reason)
                        : [...current, reason],
                    )
                  }
                />
              ),
            )}
          </View>
          <Field
            label={questionnaire?.config.note_label || "Conte o que aconteceu"}
            multiline
            value={note}
            onChangeText={setNote}
            maxLength={questionnaire?.config.note_max_chars ?? 5000}
            placeholder="O que ajudou, dificultou e qual ação foi tomada?"
          />
          <Text style={s.label}>Ditar relato</Text>
          <VoiceInput
            disabled={busy}
            onListeningChange={setDictating}
            onText={setNote}
          />
          {questionnaire && (
            <DiaryQuestions
              config={questionnaire.config}
              answers={answers}
              onChange={setAnswers}
            />
          )}
          <Button
            title={busy ? "Salvando…" : "Salvar registro"}
            disabled={busy || dictating || !store}
            onPress={() => void saveDay()}
          />
          {!questionnaire && (
            <Button
              secondary
              title="Recarregar perguntas"
              disabled={loading}
              onPress={() => void load()}
            />
          )}
          {admin && questionnaire && (
            <DiaryConfigurationEditor
              key={questionnaire.version}
              value={questionnaire}
              onSaved={() => {
                setMessage(
                  "Configuração do diário atualizada. Histórico preservado.",
                );
                void load();
              }}
            />
          )}
        </Card>
      )}
      {tab === "mood" && (
        <>
          <Card>
            <Text style={s.small}>
              {settings?.prompt || "Como você está se sentindo agora?"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {moodOptions.map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mood === item.value }}
                  onPress={() => setMood(item.value)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 18,
                    paddingHorizontal: 5,
                    gap: 10,
                    borderRadius: 18,
                    backgroundColor: mood === item.value ? C.yellow : C.canvas,
                  }}
                >
                  <Text style={{ fontSize: 34 }}>{item.emoji}</Text>
                  <Text
                    style={{ color: C.ink, fontSize: 12, fontWeight: "600" }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button
              title="Registrar resposta"
              disabled={busy || !store || !mood}
              onPress={() => void saveMood()}
            />
          </Card>
          {admin && settings && (
            <Card>
              <Section title="Programar a pergunta" />
              <Choice
                label={
                  settings.enabled
                    ? "Envio diário ativado"
                    : "Envio diário desativado"
                }
                selected={settings.enabled}
                onPress={() =>
                  setSettings({ ...settings, enabled: !settings.enabled })
                }
              />
              <Field
                label="Horário (HH:MM)"
                value={settings.send_time.slice(0, 5)}
                onChangeText={(value) =>
                  setSettings({ ...settings, send_time: value })
                }
                maxLength={5}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={s.small}>
                Fuso de envio {settings.timezone}. Você pode desativar a
                pergunta a qualquer momento.
              </Text>
              <Button
                title="Salvar programação"
                secondary
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (
                      !/^([01]\d|2[0-3]):[0-5]\d$/.test(
                        settings.send_time.slice(0, 5),
                      )
                    )
                      throw new Error(
                        "Informe um horário entre 00:00 e 23:59.",
                      );
                    await rpc("eo_admin_save_mood_settings", {
                      p_enabled: settings.enabled,
                      p_send_time: settings.send_time,
                      p_timezone: settings.timezone,
                    });
                    setMessage("Programação atualizada.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Card>
          )}
        </>
      )}
      {tab === "summary" && (
        <>
          <Card>
            {leader ? (
              <>
                <Field
                  label="De (AAAA-MM-DD)"
                  value={from}
                  onChangeText={setFrom}
                  maxLength={10}
                />
                <Field
                  label="Até (AAAA-MM-DD)"
                  value={to}
                  onChangeText={setTo}
                  maxLength={10}
                />
                <Button
                  title="Atualizar resumo"
                  secondary
                  disabled={loading}
                  onPress={() => void load()}
                />
              </>
            ) : (
              <Text style={s.strong}>
                Seus registros de{" "}
                {new Date().toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 30, fontWeight: "700" }}>
                  {overview?.diary_count ?? 0}
                </Text>
                <Text style={s.small}>Diários de vendas</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 30, fontWeight: "700" }}>
                  {overview?.mood_count ?? 0}
                </Text>
                <Text style={s.small}>
                  {leader ? "Respostas de sentimento" : "Sentimentos de hoje"}
                </Text>
              </View>
            </View>
            {leader && (
              <Text style={s.small}>
                Respostas de sentimento seguem a abrangência e o período
                liberados para seu perfil.
              </Text>
            )}
            {leader && (
              <>
                <Choice
                  label="Agrupar por regional"
                  selected={groupBy === "region"}
                  onPress={() => setGroupBy("region")}
                />
                <Choice
                  label="Agrupar por loja"
                  selected={groupBy === "store"}
                  onPress={() => setGroupBy("store")}
                />
                <Button
                  title="Exportar diário em CSV"
                  secondary
                  disabled={!dayTotal || busy}
                  onPress={() => void exportReport("day")}
                />
                <Button
                  title="Exportar sentimento em CSV"
                  secondary
                  disabled={!moodTotal || busy}
                  onPress={() => void exportReport("mood")}
                />
              </>
            )}
          </Card>
          {leader && (
            <Card>
              <Section title="Resumo EO.IA" />
              <Text style={s.small}>
                Totais completos e uma amostra de até 100 relatos recentes. O
                resumo fica salvo no banco.
              </Text>
              <Button
                title="Gerar resumo dos relatos"
                secondary
                disabled={busy || !dayTotal}
                onPress={() => void summarize()}
              />
              {admin && (
                <Button
                  title="Verificar EO.IA"
                  secondary
                  disabled={busy}
                  onPress={() => void checkAnthropic()}
                />
              )}
              {aiSummary?.scope ===
                JSON.stringify({ from, to, storeIds, groupBy }) && (
                <Text style={{ color: C.ink, lineHeight: 22 }}>
                  {aiSummary.text}
                </Text>
              )}
            </Card>
          )}
          {leader && !!overview?.top_reasons.length && (
            <Card>
              <Section title="Motivos mais registrados" />
              {overview.top_reasons.map((item) => (
                <Text style={s.small} key={item.reason}>
                  {item.reason} · {item.count}
                </Text>
              ))}
            </Card>
          )}
          {leader &&
            groups.slice(reportPage * 10, (reportPage + 1) * 10).map((item) => (
              <Card key={item.key}>
                <Text style={s.strong}>{item.label || "Sem regional"}</Text>
                <Text style={s.small}>
                  {item.diary_count} registros de vendas
                </Text>
                <Text style={s.strong}>
                  🙂 {item.happy} 😐 {item.neutral} 🙁 {item.sad}
                </Text>
              </Card>
            ))}
          {leader && groups.length > 10 && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                title="Anterior"
                secondary
                disabled={!reportPage}
                onPress={() => setReportPage(reportPage - 1)}
              />
              <Button
                title="Próxima"
                secondary
                disabled={(reportPage + 1) * 10 >= groups.length}
                onPress={() => setReportPage(reportPage + 1)}
              />
            </View>
          )}
          {leader && (
            <Button
              title={
                showRecords
                  ? "Recolher registros"
                  : `Ver registros individuais (${dayTotal + moodTotal})`
              }
              secondary
              onPress={() => setShowRecords(!showRecords)}
            />
          )}
          {showRecords && (
            <>
              <Section
                title={leader ? "Registros do diário" : "Seu diário neste mês"}
              />
              {entries.map((entry) => (
                <Card key={entry.id}>
                  <Text style={s.strong}>
                    {entry.store_code} · {entry.store_name}
                  </Text>
                  <Text style={s.small}>
                    {entry.person_name} · {entry.entry_date}
                  </Text>
                  <Text style={s.small}>{entry.reasons.join(" · ")}</Text>
                  {!!entry.note && (
                    <Text style={{ color: C.ink, lineHeight: 21 }}>
                      {entry.note}
                    </Text>
                  )}
                  {!!entry.transcript && (
                    <Text style={{ color: C.ink, lineHeight: 21 }}>
                      {entry.transcript}
                    </Text>
                  )}
                  {entry.answers &&
                    Object.entries(entry.answers).map(([key, value]) => (
                      <Text key={key} style={s.body}>
                        {entry.questionnaire_snapshot?.questions.find(
                          (q) => q.id === key,
                        )?.label || key}
                        : {value}
                      </Text>
                    ))}
                </Card>
              ))}
              <Section
                title={
                  leader ? "Respostas de sentimento" : "Como você está hoje"
                }
              />
              {feelings.map((entry) => (
                <Card key={entry.id}>
                  <Text style={s.strong}>
                    {
                      moodOptions.find((item) => item.value === entry.mood)
                        ?.emoji
                    }{" "}
                    {entry.person_name}
                  </Text>
                  <Text style={s.small}>
                    {entry.store_code} · {entry.store_name} · {entry.entry_date}
                  </Text>
                </Card>
              ))}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  title="Anterior"
                  secondary
                  disabled={loading || !recordPage}
                  onPress={() => setRecordPage(recordPage - 1)}
                />
                <Button
                  title="Próxima"
                  secondary
                  disabled={
                    loading ||
                    (recordPage + 1) * 30 >= Math.max(dayTotal, leader ? moodTotal : 0)
                  }
                  onPress={() => setRecordPage(recordPage + 1)}
                />
              </View>
              <Text style={s.small}>
                Página {recordPage + 1} · até 30 registros por módulo
              </Text>
            </>
          )}
          {!dayTotal && !moodTotal && (
            <Card>
              <Text style={s.strong}>Sem registros no período</Text>
              <Text style={s.small}>
                Os registros aparecem depois que a equipe responde.
              </Text>
            </Card>
          )}
        </>
      )}
      <Text style={d.sectionNote}>
        Registros vinculados à pessoa e à loja, com acesso conforme o perfil.
      </Text>
    </Page>
  );
}
