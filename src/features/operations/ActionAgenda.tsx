import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
import { CalendarAction } from "../checklists/CalendarAction";
type Task = {
  kind: "notice" | "checklist";
  source_id: string;
  version: number | null;
  title: string;
  description: string;
  store_code: string | null;
  store_name: string | null;
  created_at: string;
};
export function ActionAgenda({ onOpen }: { onOpen: (task: Task) => void }) {
  const [data, setData] = useState<{ items: Task[]; total: number } | null>(
      null,
    ),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      void rpc<typeof data>("eo_action_agenda", {
        p_limit: 30,
        p_offset: page * 30,
      })
        .then((r) => {
          if (alive) setData(r);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [page, refresh]);
  return (
    <section>
      <h2>Agenda de ações</h2>
      <p>
        Checklists pendentes e comunicados aguardando sua ciência. Escolha um
        horário ao adicionar o lembrete ao seu calendário. Não presumimos prazos
        nem criamos eventos sem sua confirmação.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="secondary" onClick={() => setRefresh((v) => v + 1)}>
        Atualizar pendências
      </button>
      {data?.items.map((task) => (
        <article className="panel" key={`${task.kind}-${task.source_id}`}>
          <h3>{task.title}</h3>
          <p>
            {task.kind === "checklist"
              ? `Checklist · ${task.store_code} · ${task.store_name}`
              : "Comunicado · Ciência pendente"}
          </p>
          <p>{task.description}</p>
          <small>
            Disponibilizado em{" "}
            {new Date(task.created_at).toLocaleString("pt-BR")} · Prazo não
            definido
          </small>
          <div className="selection-actions">
            <button onClick={() => onOpen(task)}>Abrir ação</button>
          </div>
          <CalendarAction title={task.title} description={task.description} />
        </article>
      ))}
      {data && !data.total && <p>Nenhuma ação pendente.</p>}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>
          {data?.total ?? 0} pendências · Página {page + 1}
        </span>
        <button
          disabled={(page + 1) * 30 >= (data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
