import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
export type Audience = "all" | "admin" | "selected";
export type ModuleRule = {
  id: string;
  label: string;
  audience: Audience;
  people: string[];
  perfis?: string[];
  lojas?: string[];
  ggls?: string[];
  regionais?: string[];
};
export type VisibleModule = { id: string; label: string; visible: boolean };
export function moduleVisible(
  modules: VisibleModule[] | null,
  id: string,
  admin = false,
) {
  return admin || modules?.find((x) => x.id === id)?.visible !== false;
}
export const parseList = (v: string) =>
  [...new Set(v.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const ROLES = [
  ["gerente", "Gerentes (inclui contas de loja)"],
  ["diretor", "Diretores e regionais"],
  ["colaborador", "Colaboradores"],
] as const;
const AUDIENCES: [Audience, string, string][] = [
  ["all", "Todos", "Todas as pessoas com acesso ao EO veem o módulo."],
  ["admin", "Só administradores", "Oculto para os demais. Use para preparar e testar."],
  ["selected", "Selecionados", "Escolha perfis, lojas, GGL, regionais ou pessoas."],
];
export function ModuleAccess({ onChanged }: { onChanged?: () => void }) {
  const [rules, setRules] = useState<ModuleRule[]>([]),
    [module, setModule] = useState(""),
    [audience, setAudience] = useState<Audience>("all"),
    [selected, setSelected] = useState<string[]>([]),
    [perfis, setPerfis] = useState<string[]>([]),
    [lojas, setLojas] = useState(""),
    [ggls, setGgls] = useState(""),
    [regionais, setRegionais] = useState(""),
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
    if (audience !== "selected") return;
    let active = true;
    const timer = setTimeout(() => {
      void rpc<{ items: typeof people; total: number }>("eo_admin_people_page", {
        p_search: query,
        p_state: "active",
        p_offset: page * 20,
        p_limit: 20,
      })
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
  }, [query, page, audience]);
  function pick(id: string) {
    const rule = rules.find((x) => x.id === id);
    setModule(id);
    setAudience(rule?.audience ?? "all");
    setSelected(rule?.people ?? []);
    setPerfis(rule?.perfis ?? []);
    setLojas((rule?.lojas ?? []).join(", "));
    setGgls((rule?.ggls ?? []).join(", "));
    setRegionais((rule?.regionais ?? []).join(", "));
    setMessage("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("eo_admin_set_module_targets", {
        p_module: module,
        p_audience: audience,
        p_people: audience === "selected" ? selected : [],
        p_perfis: audience === "selected" ? perfis : [],
        p_lojas: audience === "selected" ? parseList(lojas) : [],
        p_ggls: audience === "selected" ? parseList(ggls) : [],
        p_regionais: audience === "selected" ? parseList(regionais) : [],
      });
      setRules(await rpc<ModuleRule[]>("eo_admin_module_access"));
      setMessage("Visibilidade atualizada. Administradores sempre veem todos os módulos.");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const label = (a: Audience) => AUDIENCES.find((x) => x[0] === a)?.[1] ?? a;
  return (
    <section className="panel module-access">
      <h3>Visibilidade dos módulos</h3>
      <p>Módulos novos nascem visíveis para todos. O servidor confere a regra em cada acesso.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <ul className="module-access-list">
        {rules.map((x) => (
          <li key={x.id}>
            <button className={module === x.id ? "selected" : ""} aria-pressed={module === x.id} onClick={() => pick(x.id)}>
              <strong>{x.label}</strong>
              <small>{label(x.audience)}</small>
            </button>
          </li>
        ))}
      </ul>
      {module && (
        <>
          <fieldset className="module-access-audience">
            <legend>Quem vê</legend>
            {AUDIENCES.map(([id, title, hint]) => (
              <label key={id} className="commercial-check">
                <input type="radio" name="audience" checked={audience === id} onChange={() => setAudience(id)} />
                <span>
                  <strong>{title}</strong> <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {audience === "selected" && (
            <>
              <fieldset>
                <legend>Perfis</legend>
                {ROLES.map(([id, title]) => (
                  <label key={id} className="commercial-check">
                    <input
                      type="checkbox"
                      checked={perfis.includes(id)}
                      onChange={() => setPerfis((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))}
                    />
                    {title}
                  </label>
                ))}
              </fieldset>
              <label>
                Lojas (códigos separados por vírgula)
                <input value={lojas} onChange={(e) => setLojas(e.target.value)} placeholder="Ex.: 76, 339, 699" />
              </label>
              <label>
                GGL
                <input value={ggls} onChange={(e) => setGgls(e.target.value)} placeholder="Ex.: 1, 3" />
              </label>
              <label>
                Regionais
                <input value={regionais} onChange={(e) => setRegionais(e.target.value)} placeholder="Ex.: RICARDO, VIVIANE" />
              </label>
              <details>
                <summary>Pessoas específicas ({selected.length})</summary>
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
                        setSelected((old) => (old.includes(x.id) ? old.filter((id) => id !== x.id) : [...old, x.id]))
                      }
                    />
                    {x.display_name}
                  </label>
                ))}
                <button disabled={!page} onClick={() => setPage(page - 1)}>Anteriores</button>
                <button disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Próximas</button>
              </details>
            </>
          )}
          <button className="primary" disabled={busy} onClick={() => void save()}>
            Salvar visibilidade
          </button>
        </>
      )}
    </section>
  );
}
