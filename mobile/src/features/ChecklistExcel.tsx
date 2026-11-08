import { useRef, useState } from "react";
import { Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { rpc, supabase } from "../services/supabase";
import type { Store } from "../types";
import { Button, Card, Choice, Field, Section, StorePicker, C, s } from "../ui";
import { checklistTypeLabels, createChecklistTemplate, parseChecklistWorkbook, type ChecklistQuestion } from "./checklist-workbook";

export function ChecklistExcel({ stores, onPublished }: { stores: Store[]; onPublished?: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ChecklistQuestion[]>([]);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const targets = all ? stores.map((store) => store.id) : selected.filter((id) => stores.some((store) => store.id === id));
  async function perform(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  async function download() {
    if (!await Sharing.isAvailableAsync()) throw new Error("O compartilhamento de arquivos não está disponível neste dispositivo.");
    const file = new File(Paths.cache, "modelo-checklist-eo.xlsx");
    file.create({ overwrite: true }); file.write(createChecklistTemplate());
    await Sharing.shareAsync(file.uri, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", UTI: "org.openxmlformats.spreadsheetml.sheet" });
  }
  async function importFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"], copyToCacheDirectory: true });
    if (result.canceled) return;
    setItems([]);
    const asset = result.assets[0];
    if (!/\.xlsx$/i.test(asset.name)) throw new Error("Escolha uma planilha Excel .xlsx.");
    const file = new File(asset.uri);
    if ((asset.size ?? file.size) > 15 * 1024 * 1024) throw new Error("A planilha excede o limite de 15 MB.");
    setItems(parseChecklistWorkbook(await file.bytes()));
  }
  async function publish() {
    if (!items.length || !targets.length || title.trim().length < 3) return;
    const template = await rpc<string>("eo_checklist_create", { p_title: title.trim(), p_description: description.trim(), p_items: items, p_stores: targets });
    setItems([]); setTitle(""); setDescription("");
    let notification = "O aviso foi publicado no app. O envio push não pôde ser confirmado.";
    try {
      const alertId = await rpc<string>("eo_checklist_notification", { p_template: template });
      const result = await supabase!.functions.invoke("send-alert-push", { body: { alert_id: alertId } });
      if (result.error || result.data?.error) throw new Error("Push indisponível");
      const devices = Number(result.data?.devices ?? 0), accepted = Number(result.data?.accepted ?? 0);
      notification = devices ? `Aviso encaminhado ao serviço para ${devices} aparelhos, com ${accepted} aceitos. A entrega ao aparelho não é confirmada.` : "Aviso publicado no app. 0 aparelhos registrados para push.";
    } catch { /* O resultado da atribuição permanece válido. */ }
    setMessage(`Checklist enviado às pessoas das ${targets.length} lojas selecionadas. ${notification}`); onPublished?.();
  }
  return <Card>
    <Section title="Checklist por Excel" />
    <Text style={s.small}>Baixe o modelo, preencha as perguntas e revise antes de enviar.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: C.red }}>{error}</Text>}{!!message && <Text style={{ color: C.green }}>{message}</Text>}
    <Button title="Baixar modelo Excel" secondary disabled={busy} onPress={() => void perform(download)} />
    <Button title="Importar Excel" secondary disabled={busy} onPress={() => void perform(importFile)} />
    <Field label="Título" value={title} editable={!busy} onChangeText={setTitle} maxLength={120} />
    <Field label="Descrição" value={description} editable={!busy} onChangeText={setDescription} maxLength={1000} multiline />
    <Choice label={`Todas as lojas do meu acesso (${stores.length})`} selected={all} onPress={() => { if (!busy) setAll(true); }} />
    <Choice label="Selecionar lojas" selected={!all} onPress={() => { if (!busy) setAll(false); }} />
    {!all && <View pointerEvents={busy ? "none" : "auto"}><StorePicker stores={stores} selected={selected} onChange={setSelected} /></View>}
    <Text style={s.small}>Cada pessoa ativa recebe um checklist para cada loja da sua abrangência, incluindo administradores.</Text>
    {!!items.length && <><Section title={`Revise ${items.length} perguntas`} />{items.map((item, index) => <View key={index} style={{ gap: 5, paddingVertical: 8 }}><Text style={s.label}>{index + 1}. {item.prompt}</Text><Text style={s.small}>{checklistTypeLabels[item.type]} · {item.required ? "Obrigatória" : "Opcional"}</Text></View>)}</>}
    <Button title={busy ? "Processando…" : `Enviar checklist para ${targets.length} lojas`} disabled={busy || !items.length || !targets.length || title.trim().length < 3} onPress={() => void perform(publish)} />
  </Card>;
}
