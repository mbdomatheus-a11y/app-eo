import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
import { SuccessToast } from "../../components/SuccessToast";
type Unit = {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  store_id: string | null;
};
export function BusinessUnits() {
  const [units, setUnits] = useState<Unit[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [edit, setEdit] = useState<Partial<Unit> | null>(null);
  const [people, setPeople] = useState<{ id: string; display_name: string }[]>(
      [],
    ),
    [personQuery, setPersonQuery] = useState(""),
    [person, setPerson] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () =>
        void rpc<{ items: Unit[] }>("eo_units", {
          p_search: query,
          p_limit: 30,
          p_offset: page * 30,
        })
          .then((r) => {
            if (alive) setUnits(r.items);
          })
          .catch((e) => {
            if (alive) setError(e.message);
          }),
      180,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, page, refresh]);
  useEffect(() => {
    if (!edit) return;
    let alive = true;
    const timer = setTimeout(
      () =>
        void rpc<{ items: typeof people }>("eo_admin_people_page", {
          p_search: personQuery,
          p_state: "active",
          p_limit: 20,
          p_offset: 0,
        })
          .then((r) => {
            if (alive) setPeople(r.items);
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
  }, [personQuery, !!edit]);
  async function act(work: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Unidades de negócio</h2>
      <p>
        Lojas mantêm seus vínculos operacionais. EC, CDA e Administração possuem
        unidades próprias. Uma unidade com pessoas ativas precisa ser
        reatribuída antes de arquivar.
      </p>
      <SuccessToast message={message} />
      {error && <p role="alert">{error}</p>}
      <div className="selection-actions">
        <label>
          Buscar unidade
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setEdit({ kind: "ec", active: true, code: "", name: "" });
            setPerson("");
          }}
        >
          Nova unidade administrativa
        </button>
      </div>
      {units.map((u) => (
        <button
          className="secondary"
          style={{ margin: 4, textAlign: "left" }}
          key={u.id}
          onClick={() => {
            setEdit(u);
            setPerson("");
          }}
        >
          {u.code} · {u.name} · {u.active ? "Ativa" : "Arquivada"}
        </button>
      ))}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button disabled={units.length < 30} onClick={() => setPage(page + 1)}>
          Próxima
        </button>
      </div>
      {edit && (
        <fieldset disabled={busy}>
          <legend>{edit.name || "Nova unidade"}</legend>
          {!edit.store_id && (
            <>
              <div className="form-grid">
                <label>
                  Código
                  <input
                    value={edit.code || ""}
                    maxLength={50}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </label>
                <label>
                  Nome
                  <input
                    value={edit.name || ""}
                    maxLength={160}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={edit.kind}
                    onChange={(e) => setEdit({ ...edit, kind: e.target.value })}
                  >
                    <option value="ec">Escritório Central</option>
                    <option value="cda">Centro de distribuição</option>
                    <option value="administracao">Administração</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={edit.active}
                    onChange={(e) =>
                      setEdit({ ...edit, active: e.target.checked })
                    }
                  />
                  Unidade ativa
                </label>
                <label>
                  Latitude opcional
                  <input
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    value={edit.latitude ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        latitude:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Longitude opcional
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    value={edit.longitude ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        longitude:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <button
                onClick={() =>
                  void act(async () => {
                    const id = await rpc<string>("eo_admin_save_unit", {
                      p_id: edit.id ?? null,
                      p_code: edit.code,
                      p_name: edit.name,
                      p_kind: edit.kind,
                      p_active: edit.active,
                      p_lat: edit.latitude ?? null,
                      p_lon: edit.longitude ?? null,
                    });
                    setEdit({ ...edit, id });
                  }, "Unidade salva.")
                }
              >
                Salvar unidade
              </button>
            </>
          )}
          {edit.id && (
            <>
              <h3>Vincular pessoa</h3>
              <label>
                Buscar nome ou chapa
                <input
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                />
              </label>
              <div className="registration-store-list">
                {people.map((p) => (
                  <label className="checkbox-label" key={p.id}>
                    <input
                      type="radio"
                      name="unit-person"
                      checked={person === p.id}
                      onChange={() => setPerson(p.id)}
                    />
                    {p.display_name}
                  </label>
                ))}
              </div>
              <button
                disabled={!person || !edit.active}
                onClick={() =>
                  void act(async () => {
                    await rpc("eo_admin_assign_unit", {
                      p_user: person,
                      p_unit: edit.id,
                    });
                  }, "Pessoa vinculada à unidade. Histórico preservado.")
                }
              >
                Vincular à unidade
              </button>
            </>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => setEdit(null)}
          >
            Fechar edição
          </button>
        </fieldset>
      )}
    </section>
  );
}
