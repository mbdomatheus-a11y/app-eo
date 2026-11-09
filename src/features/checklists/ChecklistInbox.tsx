import { CalendarAction } from "./CalendarAction";
import { ChecklistLocation } from "./ChecklistLocation";
import { useEffect, useRef, useState } from "react";
import { rpc, supabase } from "../../services/supabase";
import {
  checklistTypeLabels,
  type ChecklistQuestion,
} from "../../core/checklist-workbook";
import "./checklist-admin.css";

type Run = {
  run_id: string;
  title: string;
  description: string;
  store_name: string;
  status: string;
  item_count: number;
  answered_count: number;
};
type Item = ChecklistQuestion & {
  id: string;
  position: number;
  answer: Record<string, unknown> | null;
};
type Detail = {
  run: { id: string; status: string };
  title: string;
  description: string;
  store_name: string;
  items: Item[];
};
type FeedPage = { items: Run[]; total: number };
const statusLabel: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
};

function AnswerField({
  item,
  disabled,
  save,
  photo,
}: {
  item: Item;
  disabled: boolean;
  save: (answer: Record<string, unknown>) => void;
  photo: (file: File) => void;
}) {
  const [value, setValue] = useState(String(item.answer?.text ?? ""));
  const [accepted, setAccepted] = useState(item.answer?.accepted === true);
  const [yes, setYes] = useState<boolean | undefined>(
    typeof item.answer?.value === "boolean" ? item.answer.value : undefined,
  );
  const [image, setImage] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    setImageError("");
    if (typeof item.answer?.path === "string" && supabase) {
      void supabase.storage
        .from("eo-checklist-photos")
        .createSignedUrl(item.answer.path, 300)
        .then(({ data, error }) => {
          if (active) {
            if (error) setImageError("Não foi possível abrir a foto salva.");
            else setImage(data?.signedUrl ?? "");
          }
        });
    }
    return () => {
      active = false;
    };
  }, [item.answer?.path]);
  return (
    <fieldset disabled={disabled}>
      <legend>
        {item.position}. {item.prompt}
      </legend>
      <small>
        {checklistTypeLabels[item.type]} ·{" "}
        {item.required ? "Obrigatória" : "Opcional"}
        {item.answer ? " · Resposta salva" : ""}
      </small>
      {item.type === "acceptance" && (
        <>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />{" "}
            Li e compreendi esta orientação
          </label>
          <button
            disabled={disabled || !accepted}
            onClick={() => save({ accepted: true })}
          >
            Salvar aceite
          </button>
        </>
      )}
      {["text", "short_text", "long_text", "number", "phone", "time"].includes(
        item.type,
      ) && (
        <>
          <label>
            Sua resposta
            {["text", "long_text"].includes(item.type) ? (
              <textarea
                minLength={item.min_length ?? 0}
                maxLength={item.max_length ?? 4000}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <input
                type={
                  item.type === "phone"
                    ? "tel"
                    : item.type === "time"
                      ? "time"
                      : "text"
                }
                inputMode={item.type === "number" ? "decimal" : undefined}
                minLength={item.min_length ?? 0}
                maxLength={
                  item.max_length ?? (item.type === "short_text" ? 280 : 4000)
                }
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
          <small>
            {value.length} / {item.max_length ?? 4000} caracteres
          </small>
          <button
            disabled={
              disabled ||
              (item.required && !value.trim()) ||
              (!!value.length && value.length < (item.min_length ?? 0))
            }
            onClick={() => save({ text: value })}
          >
            Salvar resposta
          </button>
        </>
      )}
      {item.answer?.moderation_flag === true && (
        <p role="status">
          Resposta salva e sinalizada para revisão de linguagem.
        </p>
      )}
      {item.type === "yes_no" && (
        <>
          <label>
            <input
              type="radio"
              name={item.id}
              checked={yes === true}
              onChange={() => setYes(true)}
            />{" "}
            Sim
          </label>
          <label>
            <input
              type="radio"
              name={item.id}
              checked={yes === false}
              onChange={() => setYes(false)}
            />{" "}
            Não
          </label>
          <button
            disabled={disabled || yes === undefined}
            onClick={() => save({ value: yes })}
          >
            Salvar resposta
          </button>
        </>
      )}
      {item.type === "photo" && (
        <>
          <label>
            {item.answer ? "Substituir foto" : "Anexar foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) photo(file);
              }}
            />
          </label>
          {image && (
            <img
              src={image}
              alt={`Foto salva: ${item.prompt}`}
              style={{
                maxWidth: "100%",
                maxHeight: 300,
                objectFit: "contain",
                borderRadius: 12,
              }}
            />
          )}
          {imageError && <p role="alert">{imageError}</p>}
        </>
      )}
    </fieldset>
  );
}

export function ChecklistInbox({ initialRun }: { initialRun?: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  useEffect(() => {
    if (!initialRun) return;
    let alive = true;
    void rpc<Detail>("eo_checklist_detail", { p_run: initialRun })
      .then((result) => {
        if (alive) setDetail(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [initialRun]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void rpc<FeedPage>("eo_checklist_feed_page", {
      p_limit: 30,
      p_offset: page * 30,
      p_query: query,
      p_status: status,
    })
      .then((data) => {
        if (active) {
          setRuns(data.items);
          setTotal(data.total);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [page, query, status]);
  async function perform(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function refresh(id?: string) {
    const [feed, next] = await Promise.all([
      rpc<FeedPage>("eo_checklist_feed_page", {
        p_limit: 30,
        p_offset: page * 30,
        p_query: query,
        p_status: status,
      }),
      id
        ? rpc<Detail>("eo_checklist_detail", { p_run: id })
        : Promise.resolve(null),
    ]);
    setRuns(feed.items);
    setTotal(feed.total);
    if (next) setDetail(next);
    if (page > 0 && page * 30 >= feed.total)
      setPage(Math.max(0, Math.ceil(feed.total / 30) - 1));
  }
  async function save(item: Item, answer: Record<string, unknown>) {
    if (!detail) return;
    await rpc("eo_checklist_save", {
      p_run: detail.run.id,
      p_item: item.id,
      p_answer: answer,
    });
    setMessage("Resposta salva.");
    await refresh(detail.run.id);
  }
  async function photo(item: Item, file: File) {
    if (!detail || !supabase) throw new Error("Conexão indisponível.");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error("Escolha uma foto JPG, PNG ou WebP de até 10 MB.");
    const path = await rpc<string>("eo_checklist_photo_path", {
      p_run: detail.run.id,
      p_item: item.id,
    });
    const { error } = await supabase.storage
      .from("eo-checklist-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("Não foi possível salvar a foto com segurança.");
    await save(item, { path });
  }
  return (
    <section className="checklist-admin" aria-label="Meus checklists">
      {error && (
        <p role="alert" className="checklist-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {detail ? (
        <>
          <button
            disabled={busy}
            onClick={() => {
              setDetail(null);
              setMessage("");
            }}
          >
            Voltar para meus checklists
          </button>
          <header>
            <h2>{detail.title}</h2>
            <p>
              {detail.store_name} ·{" "}
              {statusLabel[detail.run.status] ?? detail.run.status}
            </p>
            <p>{detail.description}</p>
          </header>
          <p>
            {detail.items.filter((item) => item.required && item.answer).length}{" "}
            de {detail.items.filter((item) => item.required).length} perguntas
            obrigatórias respondidas.
          </p>
          <CalendarAction
            title={`Checklist: ${detail.title}`}
            description={`${detail.store_name}\n${detail.description}`}
          />
          <ChecklistLocation runId={detail.run.id} />
          {detail.items.map((item) => (
            <AnswerField
              key={`${detail.run.id}-${item.id}`}
              item={item}
              disabled={busy}
              save={(answer) => void perform(() => save(item, answer))}
              photo={(file) => void perform(() => photo(item, file))}
            />
          ))}
        </>
      ) : (
        <>
          <header>
            <h2>Meus checklists</h2>
            <p>Responda as orientações e inclua as evidências de cada loja.</p>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(0);
              setQuery(queryInput.trim());
            }}
          >
            <label>
              Buscar por título ou loja
              <input
                value={queryInput}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setQueryInput(event.target.value)}
              />
            </label>
            <button disabled={busy} type="submit">
              Buscar
            </button>
          </form>
          <label>
            Status
            <select
              value={status}
              disabled={busy}
              onChange={(event) => {
                setPage(0);
                setStatus(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluídos</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => void perform(() => refresh())}>
            {busy ? "Carregando…" : "Atualizar lista"}
          </button>
          {!busy && !runs.length && <p>Nenhum checklist atribuído a você.</p>}
          {runs.map((run) => (
            <article key={run.run_id}>
              <h3>{run.title}</h3>
              <p>
                {run.store_name} · {statusLabel[run.status] ?? run.status}
              </p>
              <p>
                {run.answered_count} de {run.item_count} perguntas respondidas
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () =>
                    setDetail(
                      await rpc<Detail>("eo_checklist_detail", {
                        p_run: run.run_id,
                      }),
                    ),
                  )
                }
              >
                Abrir checklist
              </button>
              <CalendarAction
                title={`Checklist: ${run.title}`}
                description={run.store_name}
              />
            </article>
          ))}
          {!!total && (
            <nav
              aria-label="Páginas de checklists"
              className="checklist-actions"
            >
              <button
                disabled={busy || page === 0}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(total / 30)} · {total}{" "}
                checklists
              </span>
              <button
                disabled={busy || (page + 1) * 30 >= total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
