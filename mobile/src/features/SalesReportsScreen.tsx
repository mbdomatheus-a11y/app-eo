import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { WebView } from "react-native-webview";
import { useEO } from "../providers/eo-provider";
import { rpc, supabase } from "../services/supabase";
import { Group, MenuItem, ScreenTitle, d } from "../design";
import { Badge, Button, C, Card, Choice, Field, Heading, Page, s } from "../ui";
import { MAX_HTML_BYTES, periodLabels, prepareSalesHtml, readHtmlBlob, SALES_BUCKET, salesPeriods, STATIC_HTML_NOTICE, validateHtmlFile, type SalesPeriod, type SalesReport } from "./sales-html";
import { prepareSalesPackage } from "./sales-package";

type PickedFile = { uri: string; name: string; size?: number };

export function SalesReportsScreen({ initialPeriod = "week" }: { initialPeriod?: SalesPeriod } = {}) {
  const { workspace } = useEO();
  const admin = workspace?.person.role === "admin";
  const [period, setPeriod] = useState<SalesPeriod>(initialPeriod);
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SalesReport | null>(null);
  const [html, setHtml] = useState("");
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [publishPeriod, setPublishPeriod] = useState<SalesPeriod>(initialPeriod);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [allStores, setAllStores] = useState(true);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [storeQuery, setStoreQuery] = useState("");
  const generation = useRef(0);
  const actionLock = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const rows = await rpc<SalesReport[]>("eo_sales_reports", { p_period: period });
      if (current === generation.current) setReports(rows);
    } catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os relatórios."); }
    finally { if (current === generation.current) setLoading(false); }
  }, [period, workspace?.person.id]);
  useEffect(() => { if (!workspace) return; setError(""); void load(); return () => { generation.current++; }; }, [load, workspace?.person.id]);
  const visible = reports.filter((item) => Boolean(item.archived_at) === archived && item.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const visibleStores = (workspace?.stores ?? []).filter((store) => `${store.code} ${store.name} ${store.region}`.toLocaleLowerCase("pt-BR").includes(storeQuery.toLocaleLowerCase("pt-BR")));

  async function pickFile() {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/html", "application/zip", "application/x-zip-compressed", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const picked = result.assets[0];
      validateHtmlFile(picked.name, picked.size ?? new File(picked.uri).size);
      setFile(picked);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível escolher o arquivo."); }
  }

  async function openReport(report: SalesReport) {
    if (actionLock.current || !supabase) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage(""); setHtml(""); setSelected(report);
    try {
      const { data, error: failure } = await supabase.storage.from(SALES_BUCKET).download(report.object_path);
      if (failure) throw failure;
      if (!data || !data.size || data.size > MAX_HTML_BYTES) throw new Error("O arquivo está vazio ou excede o limite de 10 MB.");
      const source = await readHtmlBlob(data);
      if (!source.trim()) throw new Error("O arquivo HTML está vazio.");
      setHtml(prepareSalesHtml(source));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir o HTML."); }
    finally { actionLock.current = false; setBusy(false); }
  }

  async function publish() {
    if (actionLock.current || !supabase) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    let objectPath: string | null = null;
    let published = false;
    try {
      if (!file) throw new Error("Escolha o HTML ou ZIP do relatório.");
      if (!title.trim()) throw new Error("Informe um título para o relatório.");
      if (!allStores && !storeIds.length) throw new Error("Selecione pelo menos uma loja.");
      const localFile = new File(file.uri);
      validateHtmlFile(file.name, localFile.size);
      const prepared = prepareSalesPackage(file.name, new Uint8Array(await localFile.arrayBuffer()));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Entre novamente para publicar.");
      objectPath = `${user.id}/${Crypto.randomUUID()}.html`;
      const { error: failure } = await supabase.storage.from(SALES_BUCKET).upload(objectPath, prepared.bytes.buffer as ArrayBuffer, { contentType: "text/html", upsert: false });
      if (failure) throw failure;
      await rpc<string>("eo_publish_sales_report", { p_title: title.trim(), p_period: publishPeriod, p_object_path: objectPath, p_stores: allStores ? [] : storeIds });
      published = true;
      setTitle(""); setFile(null); setComposer(false); setArchived(false);
      setMessage(`Relatório publicado.${prepared.fileCount > 1 ? ` Pacote de ${prepared.fileCount} arquivos processado.` : ""}${prepared.hasScripts ? " Scripts desativados na prévia." : ""}`);
      if (period === publishPeriod) await load(); else setPeriod(publishPeriod);
    } catch (cause) {
      if (objectPath && !published) await supabase.storage.from(SALES_BUCKET).remove([objectPath]);
      setError(cause instanceof Error ? cause.message : "Não foi possível publicar o relatório.");
    } finally { actionLock.current = false; setBusy(false); }
  }

  function requestArchive(report: SalesReport) {
    Alert.alert(report.archived_at ? "Restaurar relatório?" : "Arquivar relatório?", report.archived_at ? "O relatório voltará à lista das lojas destinatárias." : "O relatório sairá da lista da equipe e ficará no histórico administrativo.", [{ text: "Cancelar", style: "cancel" }, { text: report.archived_at ? "Restaurar" : "Arquivar", onPress: () => { void archive(report); } }]);
  }
  async function archive(report: SalesReport) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await rpc("eo_archive_sales_report", { p_id: report.id, p_archived: !report.archived_at });
      setSelected(null); setHtml(""); setMessage(report.archived_at ? "Relatório restaurado." : "Relatório arquivado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o relatório."); }
    finally { actionLock.current = false; setBusy(false); }
  }

  const feedback = <>{error ? <View accessibilityRole="alert" style={local.error}><Text style={s.small}>{error}</Text></View> : null}{message ? <View style={local.success}><Text style={s.small}>{message}</Text></View> : null}</>;
  if (!workspace) return <Page><Text style={s.small}>Carregando seu acesso…</Text></Page>;
  if (selected) return <View style={local.detail}>
    <View style={local.detailHeader}><Button title="Voltar aos relatórios" secondary disabled={busy} onPress={() => { setSelected(null); setHtml(""); setError(""); }} /><Heading title={selected.title} detail={`${periodLabels[selected.period]} · ${new Date(selected.published_at).toLocaleDateString("pt-BR")}${selected.archived_at ? " · Arquivado" : ""}`} />{feedback}<Text style={local.previewNote}>Prévia estática. Scripts, links e conteúdo externo ficam bloqueados.</Text>{admin && <Button title={selected.archived_at ? "Restaurar relatório" : "Arquivar relatório"} secondary disabled={busy} onPress={() => requestArchive(selected)} />}{busy && <Text style={s.small}>Carregando relatório…</Text>}{!busy && !html && <Button title="Tentar abrir novamente" secondary onPress={() => void openReport(selected)} />}</View>
    {html ? <View style={local.webContainer}><WebView
      source={{ html }}
      // Uma lista restrita faz esta biblioteca abrir URLs rejeitadas no sistema.
      // A lista ampla encaminha todas ao callback abaixo, que as bloqueia.
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
      onOpenWindow={() => {}}
      javaScriptEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      incognito
      mediaPlaybackRequiresUserAction
      style={local.web}
      onError={() => setError("Não foi possível exibir o relatório neste aparelho.")}
    /></View> : null}
  </View>;
  return <Page>
    <ScreenTitle title="Vendas" subtitle="Relatórios por semana, mês e ano." />
    {feedback}
    <View style={d.filterTrack}>{salesPeriods.map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value === period }} key={value} style={[d.filter, period === value && d.filterActive]} disabled={busy} onPress={() => setPeriod(value)}><Text style={[d.filterText, period === value && d.filterTextActive]}>{periodLabels[value]}</Text></Pressable>)}</View>
    <Field label="Buscar relatório" placeholder="Título do relatório" value={query} onChangeText={setQuery} />
    <View style={local.actions}><View style={local.action}><Button title="Atualizar" secondary disabled={busy || loading} onPress={() => { setError(""); void load(); }} /></View>{admin && <View style={local.action}><Button title={composer ? "Fechar publicação" : "Publicar relatório"} disabled={busy} onPress={() => setComposer(!composer)} /></View>}</View>
    {admin && composer && <Card>
      <Heading title="Novo relatório" />
      <Text style={s.small}>{STATIC_HTML_NOTICE}</Text><Text style={s.small}>Até 10 MB no arquivo, no total descompactado e no HTML final. Máximo de 100 arquivos e pastas.</Text>
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={160} editable={!busy} placeholder="Ex.: Resultado da semana 45" />
      <Text style={s.label}>Período da publicação</Text><View style={d.filterTrack}>{salesPeriods.map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value === publishPeriod }} key={value} style={[d.filter, publishPeriod === value && d.filterActive]} disabled={busy} onPress={() => setPublishPeriod(value)}><Text style={[d.filterText, publishPeriod === value && d.filterTextActive]}>{periodLabels[value]}</Text></Pressable>)}</View>
      <Button title={file ? "Trocar HTML ou ZIP" : "Escolher HTML ou ZIP"} secondary disabled={busy} onPress={() => void pickFile()} />{file && <Badge>{file.name}</Badge>}
      <Choice label="Todas as lojas do meu escopo" selected={allStores} onPress={() => { if (!busy) setAllStores(!allStores); }} />
      {!allStores && <><Field label="Buscar lojas destinatárias" value={storeQuery} onChangeText={setStoreQuery} editable={!busy} placeholder="Loja ou regional" /><View style={local.actions}><View style={local.action}><Button title="Selecionar filtradas" secondary disabled={busy} onPress={() => setStoreIds((previous) => [...new Set([...previous, ...visibleStores.map((store) => store.id)])])} /></View><View style={local.action}><Button title="Limpar" secondary disabled={busy} onPress={() => setStoreIds([])} /></View></View><Text style={s.small}>{storeIds.length} lojas selecionadas</Text>{visibleStores.map((store) => <Choice key={store.id} label={`${store.code} · ${store.name}`} selected={storeIds.includes(store.id)} onPress={() => { if (!busy) setStoreIds((previous) => previous.includes(store.id) ? previous.filter((id) => id !== store.id) : [...previous, store.id]); }} />)}{!visibleStores.length && <Text style={s.small}>Nenhuma loja encontrada.</Text>}</>}
      <Button title={busy ? "Publicando…" : "Publicar relatório"} disabled={busy} onPress={() => void publish()} />
    </Card>}
    {admin && <Choice label="Mostrar arquivados" selected={archived} onPress={() => setArchived(!archived)} />}
    {loading ? <Text style={s.small}>Carregando relatórios…</Text> : visible.length ? <Group>{visible.map((report, index) => <MenuItem key={report.id} title={report.title} detail={`${periodLabels[report.period]} · ${new Date(report.published_at).toLocaleDateString("pt-BR")}${report.archived_at ? " · Arquivado" : ""}`} icon="chart.bar.fill" tint="#F5F1D9" last={index === visible.length - 1} onPress={() => { if (!busy) void openReport(report); }} />)}</Group> : <Card><Heading title={query ? "Nenhum resultado" : archived ? "Nenhum relatório arquivado" : "Nenhum relatório neste período"} detail={query ? "Tente outro título na busca." : "As publicações destinadas às suas lojas aparecerão aqui."} /></Card>}
  </Page>;
}

const local = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, action: { flex: 1, minWidth: 120 },
  error: { backgroundColor: C.softRed, padding: 13, borderRadius: 13 }, success: { backgroundColor: "#EAF5EE", padding: 13, borderRadius: 13 },
  detail: { flex: 1, backgroundColor: C.canvas, gap: 12 }, detailHeader: { padding: 16, gap: 12 }, previewNote: { color: C.muted, fontSize: 11, lineHeight: 16 },
  webContainer: { flex: 1, minHeight: 180, overflow: "hidden", borderTopWidth: 1, borderColor: C.line, backgroundColor: "white" }, web: { flex: 1, backgroundColor: "white" },
});
