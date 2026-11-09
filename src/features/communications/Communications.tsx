import { Bell, X } from "lucide-react";
import { CalendarAction } from "../checklists/CalendarAction";
import { useEffect, useState } from "react";
import { rpc, type Store } from "../../services/supabase";
import {
  scheduleStatus,
  type Engagement,
  type InboxItem,
  type ScheduledMessage,
} from "./model";
import "./communications.css";

export function CommunicationTargets({
  stores,
  onChange,
}: {
  stores: Store[];
  onChange: (ids: string[]) => void;
}) {
  const [segment, setSegment] = useState("");
  const [values, setValues] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const keys = [
    ...new Set(stores.flatMap((store) => Object.keys(store.segments ?? {}))),
  ].sort();
  const choices = [
    ...new Set(
      stores.map((store) => store.segments?.[segment] || "").filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const eligible = stores.filter(
    (store) =>
      !segment ||
      values === null ||
      values.includes(store.segments?.[segment] || ""),
  );
  const ids = eligible
    .filter((store) => selected === null || selected.includes(store.id))
    .map((store) => store.id);
  const signature = ids.join(",");
  useEffect(() => {
    onChange(ids);
  }, [signature]);
  const filtered = eligible.filter((store) =>
    `${store.code} ${store.name}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <fieldset className="communication-targets">
      <legend>Quem receberá</legend>
      <input name="target_mode" type="hidden" value="stores" />
      {ids.map((id) => (
        <input key={id} type="hidden" name="stores" value={id} />
      ))}
      <label>
        1. Segmentação
        <select
          value={segment}
          onChange={(e) => {
            setSegment(e.target.value);
            setValues(e.target.value ? [] : null);
            setSelected(null);
          }}
        >
          <option value="">Toda minha abrangência</option>
          {keys.map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      {segment && (
        <div>
          <p>2. Valores de {segment}</p>
          <div className="communication-actions">
            <button
              type="button"
              onClick={() => {
                setValues(null);
                setSelected(null);
              }}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => {
                setValues([]);
                setSelected(null);
              }}
            >
              Nenhum
            </button>
          </div>
          <div className="communication-options">
            {choices.map((value) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={values === null || values.includes(value)}
                  onChange={() => {
                    const current = values ?? choices;
                    setValues(
                      current.includes(value)
                        ? current.filter((v) => v !== value)
                        : [...current, value],
                    );
                    setSelected(null);
                  }}
                />
                {value}
              </label>
            ))}
          </div>
        </div>
      )}
      <p>
        3. Lojas elegíveis: {eligible.length}. Selecionadas: {ids.length}.
        Administradores também recebem.
      </p>
      <label>
        Buscar loja
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Código ou nome"
        />
      </label>
      <div className="communication-actions">
        <button type="button" onClick={() => setSelected(null)}>
          Todas elegíveis
        </button>
        <button type="button" onClick={() => setSelected([])}>
          Nenhuma
        </button>
      </div>
      <div className="communication-options">
        {filtered.map((store) => (
          <label key={store.id}>
            <input
              type="checkbox"
              checked={ids.includes(store.id)}
              onChange={() =>
                setSelected(
                  ids.includes(store.id)
                    ? ids.filter((id) => id !== store.id)
                    : [...ids, store.id],
                )
              }
            />
            {store.code} · {store.name}
          </label>
        ))}
      </div>
    </fieldset>
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
    setStatus("");
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
    <section className="communication-panel">
      <CalendarAction title={title} description={body} />
      <p>
        A abertura registra a leitura. A confirmação de ciência é feita no botão
        abaixo.
      </p>
      <label>
        Feedback breve ao administrador
        <textarea
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dúvida ou observação sobre a orientação"
        />
      </label>
      <small>{text.length}/500 · Uma resposta por pessoa, sem conversa.</small>
      <button
        type="button"
        disabled={busy || !text.trim()}
        onClick={() => void save()}
      >
        Salvar feedback
      </button>
      <p role="status">{status}</p>
      {admin && (
        <>
          <button
            type="button"
            onClick={() =>
              void rpc<Engagement[]>("eo_notice_engagement", {
                p_notice: notice,
                p_version: version,
              })
                .then(setRows)
                .catch((e: Error) => setStatus(e.message))
            }
          >
            Ver leituras, ciência e feedbacks
          </button>
          {rows.map((row) => (
            <article key={row.user_id}>
              <strong>{row.name}</strong>
              <p>
                {row.opened_at ? "Abriu" : "Não abriu"} ·{" "}
                {row.acknowledged_at ? "Ciência confirmada" : "Sem ciência"}
              </p>
              {row.feedback && <p>{row.feedback}</p>}
            </article>
          ))}
        </>
      )}
    </section>
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
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
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
    <div className="communication-inbox">
      <button
        type="button"
        aria-label={`Notificações, ${rows.filter((r) => !r.read_at).length} não lidas`}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          void load();
        }}
      >
        <Bell size={19} aria-hidden="true" />
        <span>{rows.filter((r) => !r.read_at).length}</span>
      </button>
      {open && (
        <section className="communication-panel">
          <div className="communication-panel-heading">
            <h3>Notificações</h3>
            <button
              type="button"
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="communication-actions">
            <button onClick={() => void mark("read")}>
              Marcar todas como lidas
            </button>
            <button onClick={() => void mark("clear")}>Limpar caixa</button>
          </div>
          <p role="alert">{error}</p>
          {!rows.length && <p>Nenhuma notificação na caixa.</p>}
          {rows.map((item) => (
            <article key={`${item.kind}-${item.id}-${item.version}`}>
              <button
                onClick={() => {
                  void mark("read", item);
                  if (item.kind === "notice") openNotice(item.id);
                }}
              >
                <strong>
                  {!item.read_at && "● "}
                  {item.title}
                </strong>
              </button>
              <p>{item.body}</p>
              <button onClick={() => void mark("clear", item)}>
                Limpar esta notificação
              </button>
            </article>
          ))}
          <small>
            Limpar afeta somente sua caixa. O histórico dos comunicados e
            alertas é preservado.
          </small>
        </section>
      )}
    </div>
  );
}

export function ScheduledMessages() {
  const [rows, setRows] = useState<ScheduledMessage[]>([]);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    rpc<ScheduledMessage[]>("eo_scheduled_list")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function manage(
    item: ScheduledMessage,
    action: string,
    form?: HTMLFormElement,
  ) {
    setBusy(true);
    try {
      const data = form ? new FormData(form) : null;
      await rpc("eo_scheduled_manage", {
        p_id: item.id,
        p_action: action,
        p_title: data?.get("title") ?? null,
        p_body: data?.get("body") ?? null,
        p_scheduled_for: data
          ? new Date(String(data.get("time"))).toISOString()
          : null,
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
    <section className="communication-panel">
      <h3>Envios programados</h3>
      <button type="button" onClick={() => void load()}>
        Atualizar
      </button>
      <p role="alert">{error}</p>
      {!rows.length && <p>Nenhum envio programado.</p>}
      {rows.map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <p>
            {scheduleStatus[item.status]} ·{" "}
            {new Date(item.scheduled_for).toLocaleString("pt-BR")} ·{" "}
            {item.store_ids.length} lojas
          </p>
          <details>
            <summary>Ver mensagem</summary>
            <p>{item.body}</p>
            <CalendarAction title={item.title} description={item.body} />
          </details>
          {item.failure && <p role="alert">Motivo: {item.failure}</p>}
          {["scheduled", "failed"].includes(item.status) && (
            <div className="communication-actions">
              <button disabled={busy} onClick={() => setEditing(item)}>
                Editar
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Cancelar este envio programado?"))
                    void manage(item, "cancel");
                }}
              >
                Cancelar envio
              </button>
              {item.status === "failed" && (
                <button
                  disabled={busy}
                  onClick={() => void manage(item, "retry")}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      {editing && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void manage(editing, "edit", e.currentTarget);
          }}
        >
          <label>
            Título
            <input
              name="title"
              required
              minLength={3}
              maxLength={120}
              defaultValue={editing.title}
            />
          </label>
          <label>
            Mensagem
            <textarea
              name="body"
              required
              maxLength={editing.message_type === "alert" ? 3000 : 5000}
              defaultValue={editing.body}
            />
          </label>
          <label>
            Horário local
            <input
              type="datetime-local"
              name="time"
              required
              defaultValue={new Date(
                new Date(editing.scheduled_for).getTime() -
                  new Date().getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)}
            />
          </label>
          <p>
            As {editing.store_ids.length} lojas selecionadas e os anexos serão
            preservados. Os destinatários serão resolvidos no envio.
          </p>
          <button disabled={busy}>Salvar agendamento</button>
          <button type="button" onClick={() => setEditing(null)}>
            Fechar edição
          </button>
        </form>
      )}
    </section>
  );
}
