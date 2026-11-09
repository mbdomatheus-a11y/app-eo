import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
export type ModuleRule = {
  id: string;
  label: string;
  audience: "all" | "selected";
  people: string[];
};
export type VisibleModule = { id: string; label: string; visible: boolean };
export function moduleVisible(
  modules: VisibleModule[] | null,
  id: string,
  admin = false,
) {
  return admin || modules?.find((x) => x.id === id)?.visible !== false;
}
export function ModuleAccess({ onChanged }: { onChanged?: () => void }) {
  const [rules, setRules] = useState<ModuleRule[]>([]),
    [module, setModule] = useState(""),
    [audience, setAudience] = useState<"all" | "selected">("all"),
    [selected, setSelected] = useState<string[]>([]),
    [people, setPeople] = useState<{ id: string; display_name: string }[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<ModuleRule[]>("eo_admin_module_access")
      .then(setRules)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void rpc<{ items: typeof people; total: number }>(
        "eo_admin_people_page",
        {
          p_search: query,
          p_state: "active",
          p_offset: page * 20,
          p_limit: 20,
        },
      )
        .then((data) => {
          if (active) {
            setPeople(data.items);
            setTotal(data.total);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, page]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("eo_admin_set_module_access", {
        p_module: module,
        p_audience: audience,
        p_people: selected,
      });
      setRules(await rpc<ModuleRule[]>("eo_admin_module_access"));
      setMessage(
        "Visibilidade atualizada. Administradores mantêm acesso a todos os módulos.",
      );
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Visibilidade dos módulos</h3>
      <p>
        Novos módulos ficam disponíveis para todos. Selecione todos ou pessoas
        específicas. Todos os administradores mantêm acesso completo.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <label>
        Módulo
        <select
          value={module}
          onChange={(e) => {
            const rule = rules.find((x) => x.id === e.target.value);
            setModule(e.target.value);
            setAudience(rule?.audience ?? "all");
            setSelected(rule?.people ?? []);
            setMessage("");
          }}
        >
          <option value="">Selecione</option>
          {rules.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {module && (
        <>
          <label>
            Público
            <select
              value={audience}
              onChange={(e) =>
                setAudience(e.target.value as "all" | "selected")
              }
            >
              <option value="all">Todos</option>
              <option value="selected">Pessoas escolhidas</option>
            </select>
          </label>
          {audience === "selected" && (
            <>
              <p>
                {selected.length} pessoas selecionadas. Lista vazia restringe o
                módulo aos administradores.
              </p>
              <label>
                Buscar pessoa
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              {people.map((x) => (
                <label key={x.id} className="commercial-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(x.id)}
                    onChange={() =>
                      setSelected((old) =>
                        old.includes(x.id)
                          ? old.filter((id) => id !== x.id)
                          : [...old, x.id],
                      )
                    }
                  />
                  {x.display_name}
                </label>
              ))}
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Anteriores
              </button>
              <button
                disabled={(page + 1) * 20 >= total}
                onClick={() => setPage(page + 1)}
              >
                Próximas
              </button>
            </>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Salvar visibilidade
          </button>
        </>
      )}
    </section>
  );
}
