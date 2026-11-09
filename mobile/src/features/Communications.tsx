import { CalendarAction } from "./CalendarAction";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, s } from "../ui";
import type { Store } from "../types";
import {
  scheduleStatus,
  type Engagement,
  type InboxItem,
  type ScheduledMessage,
} from "./communications-model";

function TargetCheckbox({
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 7,
      }}
    >
      <Text style={{ fontSize: 22, color: "#4A4E58" }}>
        {selected ? "☑" : "☐"}
      </Text>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
export function CommunicationTargets({
  stores,
  onChange,
}: {
  stores: Store[];
  onChange: (ids: string[]) => void;
}) {
  const [segment, setSegment] = useState(""),
    [values, setValues] = useState<string[] | null>(null),
    [selected, setSelected] = useState<string[] | null>(null);
  const [segmentOpen, setSegmentOpen] = useState(false),
    [valuesOpen, setValuesOpen] = useState(false),
    [storesOpen, setStoresOpen] = useState(false);
  const [valueQuery, setValueQuery] = useState(""),
    [query, setQuery] = useState(""),
    [valuePage, setValuePage] = useState(0),
    [storePage, setStorePage] = useState(0);
  const valueOf = (store: Store, key: string) =>
    key === "REGIONAL"
      ? store.segments?.REGIONAL || store.region
      : store.segments?.[key] || "";
  const keys = [
    ...new Set([
      "REGIONAL",
      ...stores.flatMap((store) => Object.keys(store.segments ?? {})),
    ]),
  ].sort();
  const choices = [
    ...new Set(stores.map((store) => valueOf(store, segment)).filter(Boolean)),
  ].sort();
  const eligible = stores.filter(
    (store) =>
      !segment || values === null || values.includes(valueOf(store, segment)),
  );
  const ids = eligible
    .filter((store) => selected === null || selected.includes(store.id))
    .map((store) => store.id);
  const filtered = eligible.filter((store) =>
    `${store.code} ${store.name} ${store.region}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const visibleValues = choices.filter((value) =>
    value
      .toLocaleLowerCase("pt-BR")
      .includes(valueQuery.toLocaleLowerCase("pt-BR")),
  );
  const currentValues = Math.min(
      valuePage,
      Math.max(0, Math.ceil(visibleValues.length / 20) - 1),
    ),
    currentStores = Math.min(
      storePage,
      Math.max(0, Math.ceil(filtered.length / 20) - 1),
    );
  useEffect(() => onChange(ids), [ids.join(",")]);
  function chooseSegment(key: string) {
    setSegment(key);
    setValues(key ? [] : null);
    setSelected(null);
    setSegmentOpen(false);
    setValuesOpen(!!key);
    setStoresOpen(false);
    setValuePage(0);
    setStorePage(0);
    setValueQuery("");
    setQuery("");
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.strong}>Quem receberá</Text>
      <Button
        secondary
        title={`1. Segmentação: ${segment || "Toda minha abrangência"}`}
        onPress={() => setSegmentOpen(!segmentOpen)}
      />
      {segmentOpen && (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }}>
          <Choice
            label="Toda minha abrangência"
            selected={!segment}
            onPress={() => chooseSegment("")}
          />
          {keys.map((key) => (
            <Choice
              key={key}
              label={key}
              selected={segment === key}
              onPress={() => chooseSegment(key)}
            />
          ))}
        </ScrollView>
      )}
      {segment && (
        <>
          <Button
            secondary
            title={`2. Valores: ${values === null ? "todos" : values.length + " selecionado(s)"}`}
            onPress={() => setValuesOpen(!valuesOpen)}
          />
          {valuesOpen && (
            <>
              <Field
                label={`Buscar valor de ${segment}`}
                value={valueQuery}
                onChangeText={(v) => {
                  setValueQuery(v);
                  setValuePage(0);
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    title="Todos"
                    onPress={() => {
                      setValues(null);
                      setSelected(null);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    title="Nenhum"
                    onPress={() => {
                      setValues([]);
                      setSelected(null);
                    }}
                  />
                </View>
              </View>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }}>
                {visibleValues
                  .slice(currentValues * 20, currentValues * 20 + 20)
                  .map((value) => (
                    <TargetCheckbox
                      key={value}
                      label={value}
                      selected={values === null || values.includes(value)}
                      onPress={() => {
                        const current = values ?? choices;
                        setValues(
                          current.includes(value)
                            ? current.filter((v) => v !== value)
                            : [...current, value],
                        );
                        setSelected(null);
                        setStorePage(0);
                      }}
                    />
                  ))}
              </ScrollView>
              <Text style={s.small}>
                {visibleValues.length} valores · Página {currentValues + 1}
              </Text>
              <Button
                secondary
                title="Valores anteriores"
                disabled={!currentValues}
                onPress={() => setValuePage(currentValues - 1)}
              />
              <Button
                secondary
                title="Próximos valores"
                disabled={(currentValues + 1) * 20 >= visibleValues.length}
                onPress={() => setValuePage(currentValues + 1)}
              />
              <Button
                title="Aplicar filtro"
                onPress={() => setValuesOpen(false)}
              />
            </>
          )}
        </>
      )}
      <Text style={s.label}>
        {eligible.length} lojas elegíveis · {ids.length} selecionadas
      </Text>
      <Text style={s.small}>
        Todas as lojas do filtro ficam marcadas inicialmente. Administradores
        também recebem.
      </Text>
      <Button
        secondary
        title={storesOpen ? "Recolher lojas" : "3. Revisar ou desmarcar lojas"}
        onPress={() => setStoresOpen(!storesOpen)}
      />
      {storesOpen && (
        <>
          <Field
            label="Buscar lojas dentro da seleção"
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setStorePage(0);
            }}
          />
          <Button
            secondary
            title="Marcar todas elegíveis"
            onPress={() => setSelected(null)}
          />
          <Button
            secondary
            title="Desmarcar todas"
            onPress={() => setSelected([])}
          />
          {!!query && (
            <Button
              secondary
              title={`Marcar resultados (${filtered.length})`}
              onPress={() =>
                setSelected([
                  ...new Set([...ids, ...filtered.map((store) => store.id)]),
                ])
              }
            />
          )}
          <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
            {filtered
              .slice(currentStores * 20, currentStores * 20 + 20)
              .map((store) => (
                <TargetCheckbox
                  key={store.id}
                  label={`${store.code} · ${store.name}`}
                  selected={ids.includes(store.id)}
                  onPress={() =>
                    setSelected(
                      ids.includes(store.id)
                        ? ids.filter((id) => id !== store.id)
                        : [...ids, store.id],
                    )
                  }
                />
              ))}
          </ScrollView>
          <Text style={s.small}>
            {filtered.length} resultados · Página {currentStores + 1}
          </Text>
          <Button
            secondary
            title="Lojas anteriores"
            disabled={!currentStores}
            onPress={() => setStorePage(currentStores - 1)}
          />
          <Button
            secondary
            title="Próximas lojas"
            disabled={(currentStores + 1) * 20 >= filtered.length}
            onPress={() => setStorePage(currentStores + 1)}
          />
          <Button
            title="Concluir seleção"
            onPress={() => setStoresOpen(false)}
          />
        </>
      )}
    </View>
  );
}

export function NoticeEngagement({
  notice,
  version,
  admin,
  title = "Comunicado EO",
  body,
}: {
  notice: string;
  version: number;
  admin: boolean;
  title?: string;
  body?: string;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Engagement[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc("eo_notice_open", { p_notice: notice, p_version: version }).catch(
      (e: Error) => setStatus(e.message),
    );
  }, [notice, version]);
  async function save() {
    setBusy(true);
    try {
      await rpc("eo_notice_feedback_save", {
        p_notice: notice,
        p_version: version,
        p_feedback: text,
      });
      setStatus("Feedback registrado. Você pode atualizar sua resposta.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CalendarAction title={title} description={body} />
      <Text style={s.small}>
        A abertura registra a leitura. A ciência é confirmada separadamente.
      </Text>
      <Field
        label="Feedback breve ao administrador"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={500}
      />
      <Text style={s.small}>
        {text.length}/500 · Uma resposta por pessoa, sem conversa.
      </Text>
      <Button
        title="Salvar feedback"
        disabled={busy || !text.trim()}
        onPress={() => void save()}
      />
      {!!status && (
        <Text accessibilityRole="alert" style={s.small}>
          {status}
        </Text>
      )}
      {admin && (
        <>
          <Button
            secondary
            title="Ver leituras, ciência e feedbacks"
            onPress={() =>
              void rpc<Engagement[]>("eo_notice_engagement", {
                p_notice: notice,
                p_version: version,
              })
                .then(setRows)
                .catch((e: Error) => setStatus(e.message))
            }
          />
          {rows.map((row) => (
            <View key={row.user_id}>
              <Text style={s.strong}>{row.name}</Text>
              <Text style={s.small}>
                {row.opened_at ? "Abriu" : "Não abriu"} ·{" "}
                {row.acknowledged_at ? "Ciência confirmada" : "Sem ciência"}
              </Text>
              {!!row.feedback && <Text style={s.body}>{row.feedback}</Text>}
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

export function CommunicationInbox({
  openNotice,
}: {
  openNotice: (id: string) => void;
}) {
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = () =>
    rpc<InboxItem[]>("eo_inbox")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, []);
  async function mark(action: string, item?: InboxItem) {
    try {
      await rpc("eo_inbox_mark", {
        p_action: action,
        p_kind: item?.kind ?? null,
        p_id: item?.id ?? null,
        p_version: item?.version ?? null,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Card>
      <Button
        secondary
        title={`🔔 Notificações · ${rows.filter((r) => !r.read_at).length} não lidas`}
        onPress={() => {
          setOpen(!open);
          void load();
        }}
      />
      {open && (
        <>
          <Button
            secondary
            title="Marcar todas como lidas"
            onPress={() => void mark("read")}
          />
          <Button
            secondary
            title="Limpar caixa"
            onPress={() => void mark("clear")}
          />
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
          {!rows.length && <Text style={s.small}>Nenhuma notificação.</Text>}
          {rows.map((item) => (
            <View
              key={`${item.kind}-${item.id}-${item.version}`}
              style={{ gap: 8 }}
            >
              <Button
                secondary
                title={`${!item.read_at ? "● " : ""}${item.title}`}
                onPress={() => {
                  void mark("read", item);
                  if (item.kind === "notice") openNotice(item.id);
                }}
              />
              <Text style={s.body}>{item.body}</Text>
              <Button
                secondary
                title="Limpar esta notificação"
                onPress={() => void mark("clear", item)}
              />
            </View>
          ))}
          <Text style={s.small}>
            Limpar afeta somente sua caixa. O histórico é preservado.
          </Text>
        </>
      )}
    </Card>
  );
}

export function ScheduledMessages() {
  const [rows, setRows] = useState<ScheduledMessage[]>([]);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    rpc<ScheduledMessage[]>("eo_scheduled_list")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function manage(item: ScheduledMessage, action: string) {
    setBusy(true);
    try {
      let date: string | null = null;
      if (action === "edit") {
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time))
          throw new Error("Use AAAA-MM-DD HH:MM");
        date = new Date(time.replace(" ", "T")).toISOString();
      }
      await rpc("eo_scheduled_manage", {
        p_id: item.id,
        p_action: action,
        p_title: action === "edit" ? title : null,
        p_body: action === "edit" ? body : null,
        p_scheduled_for: date,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={s.strong}>Envios programados</Text>
      <Button secondary title="Atualizar" onPress={() => void load()} />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {!rows.length && <Text style={s.small}>Nenhum envio programado.</Text>}
      {rows.map((item) => (
        <View key={item.id} style={{ gap: 8 }}>
          <Text style={s.strong}>{item.title}</Text>
          <Text style={s.small}>
            {scheduleStatus[item.status]} ·{" "}
            {new Date(item.scheduled_for).toLocaleString("pt-BR")} ·{" "}
            {item.store_ids.length} lojas
          </Text>
          <Text style={s.body}>{item.body}</Text>
          <CalendarAction title={item.title} description={item.body} />
          {!!item.failure && (
            <Text accessibilityRole="alert">Motivo: {item.failure}</Text>
          )}
          {["scheduled", "failed"].includes(item.status) && (
            <>
              <Button
                secondary
                disabled={busy}
                title="Editar"
                onPress={() => {
                  setEditing(item);
                  setTitle(item.title);
                  setBody(item.body);
                  setTime(
                    new Date(
                      new Date(item.scheduled_for).getTime() -
                        new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " "),
                  );
                }}
              />
              <Button
                secondary
                disabled={busy}
                title="Cancelar envio"
                onPress={() =>
                  Alert.alert(
                    "Cancelar envio?",
                    "O registro ficará no histórico.",
                    [
                      { text: "Voltar" },
                      {
                        text: "Cancelar envio",
                        style: "destructive",
                        onPress: () => void manage(item, "cancel"),
                      },
                    ],
                  )
                }
              />
              {item.status === "failed" && (
                <Button
                  disabled={busy}
                  title="Tentar novamente"
                  onPress={() => void manage(item, "retry")}
                />
              )}
            </>
          )}
        </View>
      ))}
      {editing && (
        <View style={{ gap: 9 }}>
          <Field
            label="Título"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />
          <Field
            label="Mensagem"
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={editing.message_type === "alert" ? 3000 : 5000}
          />
          <Field
            label="Horário local · AAAA-MM-DD HH:MM"
            value={time}
            onChangeText={setTime}
          />
          <Text style={s.small}>
            Lojas e anexos preservados. Os destinatários serão resolvidos no
            envio.
          </Text>
          <Button
            title="Salvar agendamento"
            disabled={busy}
            onPress={() => void manage(editing, "edit")}
          />
          <Button
            title="Fechar edição"
            secondary
            onPress={() => setEditing(null)}
          />
        </View>
      )}
    </Card>
  );
}
