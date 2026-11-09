import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, Heading, Page, s } from "../ui";
type Unit = {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
  store_id: string | null;
  latitude: number | null;
  longitude: number | null;
};
export function BusinessUnits() {
  const [rows, setRows] = useState<Unit[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [edit, setEdit] = useState<Partial<Unit> | null>(null),
    [people, setPeople] = useState<{ id: string; display_name: string }[]>([]),
    [personQuery, setPersonQuery] = useState(""),
    [person, setPerson] = useState("");
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () =>
        void rpc<{ items: Unit[] }>("eo_units", {
          p_search: query,
          p_offset: page * 30,
          p_limit: 30,
        })
          .then((r) => {
            if (alive) setRows(r.items);
          })
          .catch((e) => {
            if (alive) setMessage(e.message);
          }),
      200,
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
            if (alive) setMessage(e.message);
          }),
      200,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [personQuery, !!edit]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage("Alteração salva. Histórico preservado.");
      setRefresh((v) => v + 1);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Heading
        title="Unidades de negócio"
        detail="Lojas, EC, CDA e Administração. Para cadastrar uma loja, use o cadastro de lojas."
      />
      {!!message && (
        <Text accessibilityRole="alert" style={s.body}>
          {message}
        </Text>
      )}
      <Field
        label="Buscar unidade"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setPage(0);
        }}
      />
      <Button
        title="Nova unidade administrativa"
        onPress={() => {
          setEdit({ code: "", name: "", kind: "ec", active: true });
          setLatitude("");
          setLongitude("");
        }}
      />
      {rows.map((u) => (
        <Choice
          key={u.id}
          label={`${u.code} · ${u.name}${u.active ? "" : " · Arquivada"}`}
          selected={edit?.id === u.id}
          onPress={() => {
            setEdit(u);
            setPerson("");
            setLatitude(u.latitude == null ? "" : String(u.latitude));
            setLongitude(u.longitude == null ? "" : String(u.longitude));
          }}
        />
      ))}
      <Button
        title="Anterior"
        secondary
        disabled={!page}
        onPress={() => setPage(page - 1)}
      />
      <Button
        title="Próxima"
        secondary
        disabled={rows.length < 30}
        onPress={() => setPage(page + 1)}
      />
      {edit && (
        <Card>
          <Heading title={edit.name || "Nova unidade"} />
          {!edit.store_id && (
            <>
              <Field
                label="Código"
                value={edit.code || ""}
                maxLength={50}
                onChangeText={(v) => setEdit({ ...edit, code: v })}
              />
              <Field
                label="Nome"
                value={edit.name || ""}
                maxLength={160}
                onChangeText={(v) => setEdit({ ...edit, name: v })}
              />
              {[
                ["ec", "Escritório Central"],
                ["cda", "Centro de distribuição"],
                ["administracao", "Administração"],
              ].map(([value, label]) => (
                <Choice
                  key={value}
                  label={label}
                  selected={edit.kind === value}
                  onPress={() => setEdit({ ...edit, kind: value })}
                />
              ))}
              <Choice
                label="Unidade ativa"
                selected={!!edit.active}
                onPress={() => setEdit({ ...edit, active: !edit.active })}
              />
              <Field
                label="Latitude opcional"
                value={latitude}
                keyboardType="numbers-and-punctuation"
                onChangeText={setLatitude}
              />
              <Field
                label="Longitude opcional"
                value={longitude}
                keyboardType="numbers-and-punctuation"
                onChangeText={setLongitude}
              />
              <Button
                title="Salvar unidade"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    if (
                      (latitude &&
                        !Number.isFinite(Number(latitude.replace(",", ".")))) ||
                      (longitude &&
                        !Number.isFinite(Number(longitude.replace(",", "."))))
                    )
                      throw new Error("Coordenadas inválidas");
                    const id = await rpc<string>("eo_admin_save_unit", {
                      p_id: edit.id ?? null,
                      p_code: edit.code,
                      p_name: edit.name,
                      p_kind: edit.kind,
                      p_active: edit.active,
                      p_lat: latitude
                        ? Number(latitude.replace(",", "."))
                        : null,
                      p_lon: longitude
                        ? Number(longitude.replace(",", "."))
                        : null,
                    });
                    setEdit({ ...edit, id });
                  })
                }
              />
            </>
          )}
          {!!edit.id && (
            <>
              <Field
                label="Buscar pessoa por nome ou chapa"
                value={personQuery}
                onChangeText={setPersonQuery}
              />
              {people.map((p) => (
                <Choice
                  key={p.id}
                  label={p.display_name}
                  selected={person === p.id}
                  onPress={() => setPerson(p.id)}
                />
              ))}
              <Button
                title="Vincular pessoa à unidade"
                disabled={busy || !person || !edit.active}
                onPress={() =>
                  void act(async () => {
                    await rpc("eo_admin_assign_unit", {
                      p_user: person,
                      p_unit: edit.id,
                    });
                  })
                }
              />
            </>
          )}
          <Button
            title="Fechar edição"
            secondary
            onPress={() => setEdit(null)}
          />
        </Card>
      )}
    </Page>
  );
}
