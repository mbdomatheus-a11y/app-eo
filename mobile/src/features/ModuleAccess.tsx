import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, Heading, s } from "../ui";
type Rule = {
  id: string;
  label: string;
  audience: "all" | "selected";
  people: string[];
};
export function ModuleAccess({ onChanged }: { onChanged?: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]),
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
    void rpc<Rule[]>("eo_admin_module_access")
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
      setRules(await rpc<Rule[]>("eo_admin_module_access"));
      setMessage(
        "Visibilidade atualizada. Administradores mantêm acesso completo.",
      );
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Heading
        title="Visibilidade dos módulos"
        detail="Padrão: todos. Todos os administradores têm acesso completo."
      />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {!!message && <Text style={s.body}>{message}</Text>}
      {rules.map((rule) => (
        <Choice
          key={rule.id}
          label={rule.label}
          selected={module === rule.id}
          onPress={() => {
            setModule(rule.id);
            setAudience(rule.audience);
            setSelected(rule.people);
            setMessage("");
          }}
        />
      ))}
      {!!module && (
        <>
          <Choice
            label="Todos"
            selected={audience === "all"}
            onPress={() => setAudience("all")}
          />
          <Choice
            label="Pessoas escolhidas"
            selected={audience === "selected"}
            onPress={() => setAudience("selected")}
          />
          {audience === "selected" && (
            <>
              <Text style={s.small}>
                {selected.length} pessoas selecionadas. Lista vazia libera
                apenas os administradores.
              </Text>
              <Field
                label="Buscar pessoa"
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setPage(0);
                }}
              />
              {people.map((person) => (
                <Choice
                  key={person.id}
                  label={person.display_name}
                  selected={selected.includes(person.id)}
                  onPress={() =>
                    setSelected((old) =>
                      old.includes(person.id)
                        ? old.filter((x) => x !== person.id)
                        : [...old, person.id],
                    )
                  }
                />
              ))}
              <Button
                title="Pessoas anteriores"
                secondary
                disabled={!page}
                onPress={() => setPage(page - 1)}
              />
              <Button
                title="Próximas pessoas"
                secondary
                disabled={(page + 1) * 20 >= total}
                onPress={() => setPage(page + 1)}
              />
            </>
          )}
          <Button
            title="Salvar visibilidade"
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
    </Card>
  );
}
