import { useEffect, useState } from "react";
import { AppState, Text } from "react-native";
import { router } from "expo-router";
import { rpc } from "../services/supabase";
import { Button, Card, Heading, Page, s } from "../ui";
import { CalendarAction } from "./CalendarAction";
type Task = {
  kind: "notice" | "checklist";
  source_id: string;
  title: string;
  description: string;
  store_code: string | null;
  store_name: string | null;
  created_at: string;
};
export function ActionAgenda() {
  const [data, setData] = useState<{ items: Task[]; total: number } | null>(
      null,
    ),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (AppState.currentState !== "active") return;
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
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [page, refresh]);
  return (
    <Page>
      <Heading
        title="Agenda de ações"
        detail="Pendências de checklist e ciência. Escolha o horário ao adicionar ao calendário; eventos exigem sua confirmação."
      />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      <Button
        title="Atualizar pendências"
        secondary
        onPress={() => setRefresh((v) => v + 1)}
      />
      {data?.items.map((task) => (
        <Card key={`${task.kind}-${task.source_id}`}>
          <Text style={s.strong}>{task.title}</Text>
          <Text style={s.small}>
            {task.kind === "checklist"
              ? `${task.store_code} · ${task.store_name}`
              : "Comunicado aguardando ciência"}
          </Text>
          <Text style={s.body}>{task.description}</Text>
          <Text style={s.small}>
            Disponibilizado em{" "}
            {new Date(task.created_at).toLocaleString("pt-BR")} · Prazo não
            definido
          </Text>
          <Button
            title="Abrir ação"
            onPress={() =>
              task.kind === "notice"
                ? router.push({
                    pathname: "/notice/[id]",
                    params: { id: task.source_id },
                  } as never)
                : router.push({
                    pathname: "/checklists",
                    params: { run: task.source_id },
                  } as never)
            }
          />
          <CalendarAction title={task.title} description={task.description} />
        </Card>
      ))}
      {data && !data.total && (
        <Text style={s.body}>Nenhuma ação pendente.</Text>
      )}
      <Text style={s.small}>
        {data?.total ?? 0} pendências · Página {page + 1}
      </Text>
      <Button
        title="Anterior"
        secondary
        disabled={!page}
        onPress={() => setPage(page - 1)}
      />
      <Button
        title="Próxima"
        secondary
        disabled={(page + 1) * 30 >= (data?.total ?? 0)}
        onPress={() => setPage(page + 1)}
      />
    </Page>
  );
}
