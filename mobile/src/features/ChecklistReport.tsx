import { useEffect, useState } from "react";
import { Image, Modal, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { rpc, supabase } from "../services/supabase";
import { Button, Card, Choice, Field, Heading, Page, s } from "../ui";
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
      const keys: (keyof Row)[] = [
        "id",
        "title",
        "store_code",
        "store_name",
        "person_name",
        "status",
        "answered",
        "questions",
        "flagged",
        "updated_at",
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
          keys.join(";"),
          ...result.items.map((row) =>
            keys.map((key) => cell(row[key])).join(";"),
          ),
        ].join("\r\n");
      const file = new File(Paths.cache, "checklists-pagina.csv");
      file.write(csv);
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
        });
      else setError("Compartilhamento indisponível neste aparelho.");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Page>
      <Heading title="Respostas de checklists" />
      <Field
        label="Buscar checklist, loja ou pessoa"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setPage(0);
        }}
      />
      {[
        ["", "Todas"],
        ["pending", "Pendentes"],
        ["in_progress", "Em andamento"],
        ["completed", "Concluídas"],
      ].map(([value, label]) => (
        <Choice
          key={value}
          label={label}
          selected={status === value}
          onPress={() => {
            setStatus(value);
            setPage(0);
          }}
        />
      ))}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      <Button
        title="Compartilhar página CSV"
        secondary
        disabled={!data?.items.length}
        onPress={() => void exportPage()}
      />
      {data?.items.map((row) => (
        <Card key={row.id}>
          <Text style={s.strong}>
            {row.store_code} · {row.store_name}
          </Text>
          <Text style={s.body}>
            {row.title} · {row.person_name}
          </Text>
          <Text style={s.small}>
            {row.status} · {row.answered}/{row.questions} respostas
            {row.flagged ? ` · ${row.flagged} para revisão` : ""}
          </Text>
          <Button
            title="Ver respostas"
            secondary
            onPress={() => {
              setPhotos({});
              void rpc<Detail>("eo_checklist_detail", { p_run: row.id })
                .then(setDetail)
                .catch((e) => setError(e.message));
            }}
          />
        </Card>
      ))}
      <Text style={s.small}>
        {data?.total ?? 0} atribuições · Página {page + 1}
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
      <Modal
        visible={!!detail}
        onRequestClose={() => setDetail(null)}
        animationType="slide"
      >
        <SafeAreaView
          style={{ flex: 1, padding: 16, backgroundColor: "#FEFEFE" }}
        >
          <Button
            title="Fechar respostas"
            secondary
            onPress={() => setDetail(null)}
          />
          <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 16 }}>
            <Heading title={detail?.title || "Respostas"} />
            {detail?.items.map((item) => (
              <Card key={item.id}>
                <Text style={s.strong}>{item.prompt}</Text>
                <Text style={s.body}>
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
                </Text>
                {item.answer?.moderation_flag === true && (
                  <Text style={s.small}>
                    Sinalizado para revisão de linguagem.
                  </Text>
                )}
                {typeof item.answer?.path === "string" && (
                  <Button
                    title="Ver foto"
                    secondary
                    onPress={() => {
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
                  />
                )}
                {photos[item.id] && (
                  <Image
                    accessibilityLabel={`Evidência: ${item.prompt}`}
                    source={{ uri: photos[item.id] }}
                    style={{ width: "100%", height: 260 }}
                    resizeMode="contain"
                  />
                )}
              </Card>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Page>
  );
}
