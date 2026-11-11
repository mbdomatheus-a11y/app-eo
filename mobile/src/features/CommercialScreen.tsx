import { AssortmentTiming } from "./AssortmentTiming";
import { SuccessToast } from "./SuccessToast";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, ScrollView, Share, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { useEO } from "../providers/eo-provider";
import { rpc, supabase } from "../services/supabase";
import { Badge, Button, C, Card, Choice, Field, Heading, Page, s } from "../ui";
import { VoiceInput } from "./VoiceInput";
import { ScreenTitle } from "../design";
import {
  emptyDetails,
  fields,
  sizes,
  today,
  assortmentCsv,
  requestStatuses,
  type AssortmentSession,
  type CommercialPage,
} from "./commercial-model";

async function invoke(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase!.functions.invoke(name, { body });
  if (error) {
    let message = "O serviço está indisponível. Seu texto foi preservado.";
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function CommercialScreen({
  mode = "product",
  reportOnly = false,
}: {
  mode?: "product" | "assortment";
  reportOnly?: boolean;
}) {
  const app = useEO(),
    workspace = app.workspace!;
  const [session, setSession] = useState("");
  const [sessions, setSessions] = useState<AssortmentSession[]>([]);
  const [listTitle, setListTitle] = useState("");
  const [listCodes, setListCodes] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [response, setResponse] = useState<Record<string, string>>({});
  const [store, setStore] = useState("");
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [storePage, setStorePage] = useState(0);
  const [note, setNote] = useState("");
  const [details, setDetails] = useState(emptyDetails);
  const [dictated, setDictated] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [code, setCode] = useState("");
  const [scan, setScan] = useState("");
  const [camera, setCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [size, setSize] = useState("PP");
  const [sizeOpen, setSizeOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [report, setReport] = useState(reportOnly);
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CommercialPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false),
    request = useRef(Crypto.randomUUID()),
    scanRequest = useRef(Crypto.randomUUID()),
    scanLock = useRef(false),
    generation = useRef(0);
  useEffect(() => setReport(reportOnly), [reportOnly]);
  const scopeKey = workspace.stores
    .map((item) => item.id)
    .sort()
    .join(",");
  useEffect(() => {
    setRows(null);
    setPage(0);
    if (store && !workspace.stores.some((item) => item.id === store)) {
      setStore("");
      setSession("");
      setScan("");
      setCounts({});
    }
  }, [scopeKey]);
  const leader = ["admin", "diretor"].includes(workspace.person.role);
  const eligible = workspace.stores.filter((x) =>
    `${x.code} ${x.name} ${x.region}`
      .toLocaleLowerCase("pt-BR")
      .includes(storeSearch.toLocaleLowerCase("pt-BR")),
  );
  const currentStore = workspace.stores.find((x) => x.id === store);
  const lojaUnica = workspace.stores.length === 1 ? workspace.stores[0] : null;
  useEffect(() => {
    if (lojaUnica && store !== lojaUnica.id) setStore(lojaUnica.id);
  }, [lojaUnica?.id, store]);
  async function perform(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setCamera(false);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!report) return;
    const current = ++generation.current;
    setError("");
    void rpc<CommercialPage>("eo_commercial_page", {
      p_kind: mode,
      p_from: from,
      p_to: to,
      p_store: store || null,
      p_limit: 30,
      p_offset: page * 30,
    })
      .then((data) => {
        if (current === generation.current) setRows(data);
      })
      .catch((e) => {
        if (current === generation.current) setError(e.message);
      });
    return () => {
      generation.current++;
    };
  }, [report, mode, from, to, store, page, refresh, scopeKey]);
  async function send() {
    if (dictating)
      throw new Error("Conclua o ditado e revise o texto antes de salvar.");
    if (!store || note.trim().length < 2)
      throw new Error("Selecione a loja e descreva o produto.");
    if (dictated && !reviewed)
      throw new Error("Transcreva e confirme a revisão antes de enviar.");
    await rpc("eo_save_product_request", {
      p_store: store,
      p_note: note.trim(),
      p_details: details,
      p_request: request.current,
      p_audio: null,
      p_seconds: null,
      p_transcript: null,
    });
    request.current = Crypto.randomUUID();
    setNote("");
    setDetails(emptyDetails());
    setDictated(false);
    setReviewed(false);
    setMessage("Pedido enviado com sucesso. Consulte o histórico da unidade.");
    setReport(true);
    setRefresh((v) => v + 1);
  }
  useEffect(() => {
    if (mode !== "assortment") return;
    void rpc<AssortmentSession[]>("eo_assortment_sessions", {
      p_store: store || null,
    })
      .then(setSessions)
      .catch((e) => setError(e.message));
  }, [mode, store, refresh]);
  async function begin(value: string) {
    if (!store || !session)
      throw new Error("Selecione a loja e uma sessão antes de bipar.");
    const id = await rpc<string>("eo_begin_assortment_session", {
      p_session: session,
      p_code: value,
      p_request: scanRequest.current,
    });
    setCode(value);
    setScan(id);
    setCounts({});
    setMessage("Código salvo. Quantos produtos há em cada tamanho?");
  }
  async function startCamera() {
    if (!store) throw new Error("Selecione a loja antes de abrir a câmera.");
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted)
      throw new Error("Permita a câmera nos ajustes ou digite o código.");
    scanLock.current = false;
    setCamera(true);
  }
  return (
    <Page>
      {mode === "assortment" && <AssortmentTiming storeId={store} />}
      <SuccessToast message={message} />
      <ScreenTitle
        title={mode === "product" ? "Pedir produto" : "Sortimento"}
        subtitle={
          mode === "product"
            ? "Transforme a procura da loja em informação para o comercial."
            : "Leia o código e conte os produtos por tamanho."
        }
      />
      {!reportOnly && (
        <>
          {" "}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Registrar"
                secondary={report}
                onPress={() => setReport(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={leader ? "Consolidado" : "Histórico da unidade"}
                secondary={!report}
                onPress={() => {
                  setReport(true);
                  setPage(0);
                  setRefresh(refresh + 1);
                }}
              />
            </View>
          </View>
        </>
      )}
      {error && (
        <Card>
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            {error}
          </Text>
        </Card>
      )}
      {message && (
        <Card>
          <Text style={s.body}>{message}</Text>
        </Card>
      )}
      {lojaUnica ? null : (
      <Card>
        <Heading title="Loja" />
        <Button
          title={
            currentStore
              ? `${currentStore.code} · ${currentStore.name}`
              : report
                ? "Todas as lojas permitidas"
                : "Selecionar loja"
          }
          secondary
          disabled={!!scan}
          onPress={() => setStoreOpen(!storeOpen)}
        />
        {storeOpen && (
          <>
            <Field
              label="Buscar código, nome ou regional"
              value={storeSearch}
              onChangeText={(v) => {
                setStoreSearch(v);
                setStorePage(0);
              }}
            />
            {report && (
              <Choice
                label="Todas as lojas permitidas"
                selected={!store}
                onPress={() => {
                  setStore("");
                  setStoreOpen(false);
                  setPage(0);
                }}
              />
            )}
            {eligible.slice(storePage * 10, storePage * 10 + 10).map((x) => (
              <Choice
                key={x.id}
                label={`${x.code} · ${x.name}`}
                selected={store === x.id}
                onPress={() => {
                  setStore(x.id);
                  setStoreOpen(false);
                  setPage(0);
                }}
              />
            ))}
            <Text style={s.small}>{eligible.length} lojas encontradas</Text>
            <Button
              title="Lojas anteriores"
              secondary
              disabled={!storePage}
              onPress={() => setStorePage(storePage - 1)}
            />
            <Button
              title="Próximas lojas"
              secondary
              disabled={(storePage + 1) * 10 >= eligible.length}
              onPress={() => setStorePage(storePage + 1)}
            />
          </>
        )}
      </Card>
      )}
      {!report && mode === "product" && (
        <Card>
          <Heading title="O que está faltando?" />
          <Field
            label={
              dictated
                ? "Texto transcrito, revise e edite"
                : "Descrição da procura"
            }
            value={note}
            multiline
            maxLength={4000}
            onChangeText={(v) => {
              setNote(v);
              setReviewed(false);
            }}
            placeholder="Não tenho blusa branca masculina, tamanho 44, e há muita procura."
          />
          <VoiceInput
            disabled={busy}
            onListeningChange={setDictating}
            onText={(text) => {
              setNote(text);
              setDictated(true);
              setReviewed(false);
            }}
          />
          {dictated && (
            <Choice
              label="Revisei o texto ditado antes de enviar"
              selected={reviewed}
              onPress={() => setReviewed(!reviewed)}
            />
          )}
          <Button
            title="Organizar descrição com IA"
            secondary
            disabled={busy || dictating || !store || note.trim().length < 2}
            onPress={() =>
              void perform(async () => {
                const result = await invoke("organize-product", {
                  store,
                  text: note,
                });
                setDetails(result.details);
                setMessage(
                  "Sugestão pronta. Confira as categorias antes de enviar.",
                );
              })
            }
          />
          {fields.map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={details[key]}
              maxLength={120}
              onChangeText={(v) => setDetails({ ...details, [key]: v })}
            />
          ))}
          <Text style={s.small}>
            Sugestões editáveis. O pedido sinaliza demanda, sem criar reposição
            ou compra automática.
          </Text>
          <Button
            title="Enviar pedido de produto"
            disabled={
              busy ||
              dictating ||
              !store ||
              note.trim().length < 2 ||
              (dictated && !reviewed)
            }
            onPress={() => void perform(send)}
          />
        </Card>
      )}
      {mode === "assortment" && (
        <Card>
          {workspace.person.role === "admin" && (
            <Button
              title="Exportar sessão CSV"
              disabled={!session || busy}
              secondary
              onPress={() =>
                void perform(async () => {
                  const rows = await rpc<Record<string, unknown>[]>(
                    "eo_assortment_export",
                    { p_session: session },
                  );
                  await Share.share({
                    title: "Sortimento CSV",
                    message: assortmentCsv(rows),
                  });
                })
              }
            />
          )}
          <Heading
            title="Sessões de contagem"
            detail="Prefira contar fora do funcionamento. Durante o atendimento, preserve a atenção ao cliente."
          />
          {sessions.map((x) => (
            <View key={x.id}>
              <Choice
                label={`${x.title} · ${x.mode === "demand" ? "Sob demanda" : "Livre"} · ${x.status}`}
                selected={session === x.id}
                onPress={() => {
                  if (!scan) {
                    setSession(x.id);
                    setStore(x.store_id);
                  }
                }}
              />
              {x.status === "draft" && (
                <Button
                  title="Enviar para validação"
                  secondary
                  onPress={() =>
                    void perform(async () => {
                      await rpc("eo_assortment_session_update", {
                        p_id: x.id,
                        p_status: "submitted",
                      });
                      setRefresh((v) => v + 1);
                      setMessage("Sessão enviada para validação.");
                    })
                  }
                />
              )}{" "}
              {workspace.person.role === "admin" &&
                x.status === "submitted" && (
                  <Button
                    title="Validar sessão"
                    secondary
                    onPress={() =>
                      void perform(async () => {
                        await rpc("eo_assortment_session_update", {
                          p_id: x.id,
                          p_status: "validated",
                        });
                        setRefresh((v) => v + 1);
                      })
                    }
                  />
                )}
            </View>
          ))}
          {!reportOnly && (
            <Button
              title="Iniciar contagem livre"
              secondary
              disabled={busy || !store}
              onPress={() =>
                void perform(async () => {
                  setSession(
                    await rpc<string>("eo_assortment_session", {
                      p_store: store,
                    }),
                  );
                  setRefresh((v) => v + 1);
                })
              }
            />
          )}
          {!reportOnly && workspace.person.role === "admin" && (
            <>
              <Field
                label="Título da lista"
                value={listTitle}
                onChangeText={setListTitle}
              />
              <Field
                label="Códigos autorizados, um por linha"
                value={listCodes}
                multiline
                onChangeText={setListCodes}
              />
              <Button
                title="Autorizar lista sob demanda"
                disabled={
                  busy || !store || !listTitle.trim() || !listCodes.trim()
                }
                onPress={() =>
                  void perform(async () => {
                    setSession(
                      await rpc<string>("eo_assortment_session", {
                        p_store: store,
                        p_mode: "demand",
                        p_title: listTitle,
                        p_codes: listCodes.split(/[,;\s]+/).filter(Boolean),
                      }),
                    );
                    setRefresh((v) => v + 1);
                  })
                }
              />
            </>
          )}
        </Card>
      )}
      {!report && mode === "assortment" && (
        <Card>
          {!scan ? (
            <>
              <Heading title="Ler produto" />
              <Button
                title="Bipar com a câmera"
                disabled={busy || !store}
                onPress={() => void perform(startCamera)}
              />
              <Field
                label="Código de barras"
                value={code}
                maxLength={128}
                autoCapitalize="none"
                onChangeText={setCode}
                placeholder="Ou digite o código"
              />
              <Button
                title="Registrar código e contar tamanhos"
                secondary
                disabled={busy || !store || code.trim().length < 2}
                onPress={() => void perform(() => begin(code))}
              />
            </>
          ) : (
            <>
              <Badge>Código {code}</Badge>
              <Heading
                title="Quantos há por tamanho?"
                detail="Informe zero se o tamanho foi contado e está em falta."
              />
              <Button
                title={`Tamanho: ${size} ▾`}
                secondary
                onPress={() => setSizeOpen(true)}
              />
              <Field
                label="Quantidade"
                keyboardType="number-pad"
                value={quantity}
                maxLength={6}
                onChangeText={setQuantity}
              />
              <Button
                title="Adicionar ou atualizar tamanho"
                secondary
                onPress={() => {
                  if (!/^\d+$/.test(quantity) || Number(quantity) > 100000) {
                    setError("Informe quantidade inteira de 0 a 100000.");
                    return;
                  }
                  setCounts({ ...counts, [size]: Number(quantity) });
                  setQuantity("");
                  setError("");
                }}
              />
              {Object.entries(counts).map(([s, q]) => (
                <View
                  key={s}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={[{ flex: 1 }, sStyle]}>
                    {s}: {q} unidades
                  </Text>
                  <Button
                    title="Remover"
                    secondary
                    onPress={() =>
                      setCounts((old) =>
                        Object.fromEntries(
                          Object.entries(old).filter(([key]) => key !== s),
                        ),
                      )
                    }
                  />
                </View>
              ))}
              <Button
                title="Salvar contagem"
                disabled={busy || !Object.keys(counts).length}
                onPress={() =>
                  void perform(async () => {
                    await rpc("eo_save_assortment", {
                      p_id: scan,
                      p_sizes: counts,
                    });
                    setScan("");
                    setCode("");
                    setCounts({});
                    scanRequest.current = Crypto.randomUUID();
                    setMessage(
                      "Contagem salva no rascunho da sessão. Leia outro produto ou envie para validação.",
                    );
                    setRefresh((v) => v + 1);
                  })
                }
              />
              <Button
                title="Deixar pendente e ler outro"
                secondary
                onPress={() => {
                  setScan("");
                  setCode("");
                  scanRequest.current = Crypto.randomUUID();
                }}
              />
            </>
          )}
        </Card>
      )}
      {report && (
        <>
          {mode === "product" && (
            <Choice
              label="Incluir arquivados da unidade"
              selected={showArchived}
              onPress={() => setShowArchived(!showArchived)}
            />
          )}
          <Field
            label="De · AAAA-MM-DD"
            value={from}
            maxLength={10}
            onChangeText={(v) => {
              setFrom(v);
              setPage(0);
            }}
          />
          <Field
            label="Até · AAAA-MM-DD"
            value={to}
            maxLength={10}
            onChangeText={(v) => {
              setTo(v);
              setPage(0);
            }}
          />
          <Text style={s.small}>{rows?.total ?? 0} registros no período</Text>
          {leader &&
            rows?.groups.map((g) => (
              <Card key={g.region}>
                <Heading
                  title={g.region || "Sem regional"}
                  detail={`${g.total} registros`}
                />
              </Card>
            ))}
          {leader && mode === "product" && !!rows?.top_products?.length && (
            <Card>
              <Heading
                title="20 agrupamentos mais frequentes"
                detail="Contagens de relatos, não quantidades de produtos."
              />
              {rows.top_products.map((p, i) => (
                <Text key={i} style={s.body}>
                  {p.requests} relatos · {p.region} ·{" "}
                  {p.category || "Sem categoria"} ·{" "}
                  {p.product || "Não informado"} · {p.color || "Sem cor"} ·{" "}
                  {p.size || "Sem tamanho"}
                </Text>
              ))}
            </Card>
          )}
          {rows?.items
            .filter(
              (row) =>
                mode !== "product" || showArchived || !row.payload.archived,
            )
            .map((row) => (
              <Card key={row.id}>
                <Heading
                  title={`${row.store_code} · ${row.store_name}`}
                  detail={`${row.region} · ${new Date(row.created_at).toLocaleString("pt-BR")}`}
                />
                <Text style={s.small}>{row.person_name}</Text>
                {mode === "product" ? (
                  <>
                    <Text style={s.body}>{row.payload.note}</Text>
                    <Badge>{row.payload.status || "Enviado"}</Badge>
                    {row.payload.response && (
                      <Text style={s.body}>
                        Resposta ao solicitante: {row.payload.response}
                      </Text>
                    )}
                    <Button
                      title={
                        row.payload.archived
                          ? "Restaurar na unidade"
                          : "Arquivar para toda unidade"
                      }
                      secondary
                      onPress={() =>
                        void perform(async () => {
                          await rpc("eo_product_update", {
                            p_id: row.id,
                            p_archived: !row.payload.archived,
                          });
                          setRefresh((v) => v + 1);
                        })
                      }
                    />
                    {workspace.person.role === "admin" && (
                      <>
                        <Field
                          label="Resposta ou justificativa"
                          value={response[row.id] || ""}
                          maxLength={4000}
                          multiline
                          onChangeText={(v) =>
                            setResponse({ ...response, [row.id]: v })
                          }
                        />
                        {requestStatuses.map((status) => (
                          <Button
                            key={status}
                            title={status}
                            secondary
                            disabled={busy}
                            onPress={() =>
                              void perform(async () => {
                                await rpc("eo_product_update", {
                                  p_id: row.id,
                                  p_status: status,
                                  p_response: response[row.id] || "",
                                });
                                setRefresh((v) => v + 1);
                              })
                            }
                          />
                        ))}
                      </>
                    )}
                    {fields.map(([key, label]) => (
                      <Text style={s.small} key={key}>
                        {label}: {row.payload.details?.[key] || "Não informado"}
                      </Text>
                    ))}
                  </>
                ) : (
                  <>
                    <Text style={s.strong}>Código {row.payload.barcode}</Text>
                    <Text style={s.small}>
                      {row.payload.status === "draft"
                        ? "Contagem pendente"
                        : "Contagem concluída"}
                    </Text>
                    {row.payload.status === "draft" && (
                      <Button
                        title="Retomar contagem"
                        secondary
                        onPress={() => {
                          setStore(row.store_id);
                          setCode(row.payload.barcode || "");
                          setSession(row.payload.session_id || "");
                          setScan(row.id);
                          setCounts(row.payload.sizes || {});
                          setReport(false);
                        }}
                      />
                    )}
                    <Text style={s.body}>
                      {Object.entries(row.payload.sizes ?? {})
                        .map(([s, q]) => `${s}: ${q}`)
                        .join(" · ")}
                    </Text>
                  </>
                )}
              </Card>
            ))}
          <Button
            title="Anterior"
            secondary
            disabled={!page}
            onPress={() => setPage(page - 1)}
          />
          <Text style={s.small}>Página {page + 1}</Text>
          <Button
            title="Próxima"
            secondary
            disabled={(page + 1) * 30 >= (rows?.total ?? 0)}
            onPress={() => setPage(page + 1)}
          />
        </>
      )}
      <Modal
        visible={camera}
        animationType="slide"
        onRequestClose={() => setCamera(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: C.canvas,
            padding: 24,
            paddingTop: 60,
            gap: 18,
          }}
        >
          <Heading
            title="Leia o código do produto"
            detail="Aponte para o código de barras. A câmera para após a leitura."
          />
          {camera && (
            <CameraView
              style={{ flex: 1, borderRadius: 20 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13",
                  "ean8",
                  "code128",
                  "code39",
                  "upc_a",
                  "upc_e",
                  "itf14",
                ],
              }}
              onBarcodeScanned={(event) => {
                if (scanLock.current) return;
                scanLock.current = true;
                setCamera(false);
                void perform(() => begin(event.data));
              }}
            />
          )}
          <Button
            title="Fechar câmera"
            secondary
            onPress={() => setCamera(false)}
          />
        </View>
      </Modal>
      <Modal
        visible={sizeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSizeOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#0006",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              maxHeight: "75%",
              backgroundColor: C.canvas,
              padding: 24,
              paddingBottom: 40,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              gap: 12,
            }}
          >
            <Heading title="Selecionar tamanho" />
            <ScrollView>
              {sizes.map((value) => (
                <Choice
                  key={value}
                  label={value}
                  selected={size === value}
                  onPress={() => {
                    setSize(value);
                    setSizeOpen(false);
                  }}
                />
              ))}
            </ScrollView>
            <Button
              title="Fechar"
              secondary
              onPress={() => setSizeOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </Page>
  );
}
const sStyle = { color: C.ink, fontSize: 15 };
