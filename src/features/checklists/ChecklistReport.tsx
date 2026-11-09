import { useEffect, useState } from "react";
import { rpc, supabase } from "../../services/supabase";
type Row = {
  id: string;
  title: string;
  store_code: string;
  store_name: string;
  person_name: string;
  status: string;
  answered: number;
  questions: number;
  flagged: number;
  updated_at: string;
};
type Detail = {
  title: string;
  items: {
    id: string;
    prompt: string;
    answer: Record<string, unknown> | null;
  }[];
};
export function ChecklistReport() {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0),
    [data, setData] = useState<{ items: Row[]; total: number } | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [photos, setPhotos] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () =>
        void rpc<typeof data>("eo_checklist_report", {
          p_query: query,
          p_status: status,
          p_limit: 30,
          p_offset: page * 30,
        })
          .then((r) => {
            if (alive) setData(r);
          })
          .catch((e) => {
            if (alive) setError(e.message);
          }),
      200,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, status, page]);
  async function exportPage() {
    try {
      const result = await rpc<{ items: Row[] }>("eo_checklist_report", {
        p_query: query,
        p_status: status,
        p_limit: 30,
        p_offset: page * 30,
        p_export: true,
      });
      const keys: [keyof Row, string][] = [
        ["id", "ID"],
        ["title", "Checklist"],
        ["store_code", "COD"],
        ["store_name", "Loja"],
        ["person_name", "Pessoa"],
        ["status", "Situação"],
        ["answered", "Respondidas"],
        ["questions", "Perguntas"],
        ["flagged", "Sinalizadas"],
        ["updated_at", "Atualizado"],
      ];
      const cell = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const csv =
        "\ufeff" +
        [
          keys.map(([, label]) => cell(label)).join(";"),
          ...result.items.map((row) =>
            keys.map(([key]) => cell(row[key])).join(";"),
          ),
        ].join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "checklists-pagina.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="panel">
      <h2>Respostas de checklists</h2>
      <div className="form-grid">
        <label>
          Buscar checklist, loja ou pessoa
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Situação
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="completed">Concluído</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button disabled={!data?.items.length} onClick={() => void exportPage()}>
        Exportar página CSV
      </button>
      {data?.items.map((row) => (
        <article className="eo-day-row" key={row.id}>
          <strong>
            {row.store_code} · {row.store_name} · {row.title}
          </strong>
          <p>
            {row.person_name} · {row.status} · {row.answered}/{row.questions}{" "}
            respostas
            {row.flagged ? ` · ${row.flagged} para revisão de linguagem` : ""}
          </p>
          <button
            className="secondary"
            onClick={() => {
              setPhotos({});
              void rpc<Detail>("eo_checklist_detail", { p_run: row.id })
                .then(setDetail)
                .catch((e) => setError(e.message));
            }}
          >
            Ver respostas
          </button>
        </article>
      ))}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>
          {data?.total ?? 0} atribuições · Página {page + 1}
        </span>
        <button
          disabled={(page + 1) * 30 >= (data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
      {detail && (
        <section aria-label="Respostas do checklist">
          <h3>{detail.title}</h3>
          <button onClick={() => setDetail(null)}>Fechar respostas</button>
          {detail.items.map((item) => (
            <article key={item.id} className="eo-day-row">
              <strong>{item.prompt}</strong>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {!item.answer
                  ? "Sem resposta"
                  : String(
                      item.answer.text ??
                        item.answer.value ??
                        (item.answer.accepted === true
                          ? "Aceite confirmado"
                          : item.answer.path
                            ? "Foto anexada"
                            : "Não informado"),
                    )}
              </p>
              {item.answer?.moderation_flag === true && (
                <small>
                  Sinalizado para revisão de linguagem, sem bloqueio.
                </small>
              )}
              {typeof item.answer?.path === "string" && (
                <button
                  onClick={() => {
                    void supabase!.storage
                      .from("eo-checklist-photos")
                      .createSignedUrl(item.answer!.path as string, 300)
                      .then(({ data, error }) => {
                        if (error) setError(error.message);
                        else if (data)
                          setPhotos((old) => ({
                            ...old,
                            [item.id]: data.signedUrl,
                          }));
                      });
                  }}
                >
                  Ver foto
                </button>
              )}
              {photos[item.id] && (
                <img
                  alt={`Evidência: ${item.prompt}`}
                  src={photos[item.id]}
                  style={{
                    width: "100%",
                    maxHeight: 360,
                    objectFit: "contain",
                  }}
                />
              )}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
