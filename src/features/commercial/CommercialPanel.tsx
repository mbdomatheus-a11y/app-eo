import { AssortmentTiming } from "./AssortmentTiming";
import { SuccessToast } from "../../components/SuccessToast";
import { useEffect, useRef, useState } from "react";
import { rpc, supabase, type Workspace } from "../../services/supabase";
import {
  emptyDetails,
  fields,
  sizes,
  today,
  assortmentCsv,
  requestStatuses,
  type AssortmentSession,
  type CommercialPage,
} from "./model";
import "./commercial.css";
import { VoiceInput } from "../../components/VoiceInput";

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
export function CommercialPanel({
  workspace,
  mode = "product",
  reportOnly = false,
}: {
  workspace: Workspace;
  mode?: "product" | "assortment";
  reportOnly?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const [session, setSession] = useState("");
  const [sessions, setSessions] = useState<AssortmentSession[]>([]);
  const [listTitle, setListTitle] = useState("");
  const [listCodes, setListCodes] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [response, setResponse] = useState<Record<string, string>>({});
  const [store, setStore] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [note, setNote] = useState("");
  const [details, setDetails] = useState(emptyDetails);
  const [dictated, setDictated] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [code, setCode] = useState("");
  const [scan, setScan] = useState("");
  const [size, setSize] = useState("PP");
  const [quantity, setQuantity] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [report, setReport] = useState(reportOnly);
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CommercialPage | null>(null);
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const request = useRef(crypto.randomUUID());
  const scanRequest = useRef(crypto.randomUUID());
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
  async function run(work: () => Promise<void>) {
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
    let active = true;
    if (!report) return;
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
        if (active) setRows(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [report, mode, from, to, store, page, refresh, scopeKey]);
  async function send() {
    if (dictating)
      throw new Error("Conclua o ditado e revise o texto antes de salvar.");
    if (!store || note.trim().length < 2)
      throw new Error("Selecione loja e descreva o produto.");
    if (dictated && !reviewed)
      throw new Error(
        "Transcreva e confirme a revisão do texto antes de enviar.",
      );
    await rpc("eo_save_product_request", {
      p_store: store,
      p_note: note.trim(),
      p_details: details,
      p_request: request.current,
      p_audio: null,
      p_seconds: null,
      p_transcript: null,
    });
    request.current = crypto.randomUUID();
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
  async function begin() {
    if (!store || !session)
      throw new Error("Selecione a loja e uma sessão antes da leitura.");
    const id = await rpc<string>("eo_begin_assortment_session", {
      p_session: session,
      p_code: code,
      p_request: scanRequest.current,
    });
    setScan(id);
    setCounts({});
    setMessage(
      "Código registrado. Informe quantos produtos há em cada tamanho.",
    );
  }
  return (
    <section className="commercial-panel">
      <SuccessToast message={message} />
      <header>
        <span className="eyebrow">OPERAÇÃO E COMERCIAL</span>
        <h2>
          {mode === "product" ? "Pedir produto" : "Sortimento por tamanho"}
        </h2>
        <p>
          {mode === "product"
            ? "Registre o que está faltando e a procura percebida na loja."
            : "Registre o código e conte a disponibilidade por tamanho. Uma contagem não altera o estoque de outros sistemas."}
        </p>
      </header>
      {!reportOnly && (
        <>
          {" "}
          <div className="commercial-actions">
            <button
              className={!report ? "primary" : "secondary"}
              onClick={() => {
                setReport(false);
                setPage(0);
              }}
            >
              Registrar
            </button>
            <button
              className={report ? "primary" : "secondary"}
              onClick={() => {
                setReport(true);
                setPage(0);
              }}
            >
              {leader
                ? "Consolidado da minha abrangência"
                : "Histórico da unidade"}
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="sales-feedback sales-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="sales-feedback">
          {message}
        </p>
      )}
      <label>
        Pesquisar unidade
        <input
          type="search"
          value={storeSearch}
          disabled={!!scan}
          onChange={(e) => setStoreSearch(e.target.value)}
          placeholder="Código ou nome"
        />
      </label>
      <div className="commercial-actions">
        {workspace.stores
          .filter((x) =>
            `${x.code} ${x.name}`
              .toLocaleLowerCase("pt-BR")
              .includes(storeSearch.toLocaleLowerCase("pt-BR")),
          )
          .slice(0, 30)
          .map((x) => (
            <button
              key={x.id}
              disabled={!!scan}
              className={store === x.id ? "primary" : "secondary"}
              onClick={() => {
                setStore(x.id);
                setStoreSearch(`${x.code} ${x.name}`);
                setSession("");
                setPage(0);
              }}
            >
              {x.code} · {x.name}
            </button>
          ))}
        {report && (
          <button
            onClick={() => {
              setStore("");
              setStoreSearch("");
            }}
          >
            Todas as unidades permitidas
          </button>
        )}
      </div>
      {mode === "assortment" && <AssortmentTiming storeId={store} />}
      {mode === "assortment" && (
        <div className="panel">
          <h3>Sessões de contagem</h3>
          {workspace.person.role === "admin" && (
            <button
              disabled={!session || busy}
              onClick={() =>
                void run(async () => {
                  const rows = await rpc<Record<string, unknown>[]>(
                    "eo_assortment_export",
                    { p_session: session },
                  );
                  const url = URL.createObjectURL(
                    new Blob([assortmentCsv(rows)], {
                      type: "text/csv;charset=utf-8",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `sortimento-${session}.csv`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
              }
            >
              Exportar sessão CSV
            </button>
          )}
          <p>
            Prefira contar fora do funcionamento da loja. Durante o atendimento,
            organize a contagem sem prejudicar o cliente.
          </p>
          {sessions.map((x) => (
            <div key={x.id}>
              <button
                disabled={!!scan}
                className={session === x.id ? "primary" : "secondary"}
                onClick={() => {
                  setSession(x.id);
                  setStore(x.store_id);
                }}
              >
                {x.title} · {x.mode === "demand" ? "Sob demanda" : "Livre"} ·{" "}
                {x.status}
              </button>
              {x.status === "draft" && (
                <button
                  onClick={() =>
                    void run(async () => {
                      await rpc("eo_assortment_session_update", {
                        p_id: x.id,
                        p_status: "submitted",
                      });
                      setRefresh((v) => v + 1);
                      setMessage("Sessão enviada para validação.");
                    })
                  }
                >
                  Enviar para validação
                </button>
              )}
              {workspace.person.role === "admin" &&
                x.status === "submitted" && (
                  <button
                    onClick={() =>
                      void run(async () => {
                        await rpc("eo_assortment_session_update", {
                          p_id: x.id,
                          p_status: "validated",
                        });
                        setRefresh((v) => v + 1);
                      })
                    }
                  >
                    Validar sessão
                  </button>
                )}
            </div>
          ))}
          {!reportOnly && (
            <button
              disabled={busy || !store}
              onClick={() =>
                void run(async () => {
                  setSession(
                    await rpc<string>("eo_assortment_session", {
                      p_store: store,
                    }),
                  );
                  setRefresh((v) => v + 1);
                })
              }
            >
              Iniciar contagem livre
            </button>
          )}
          {!reportOnly && workspace.person.role === "admin" && (
            <>
              <label>
                Título da lista
                <input
                  value={listTitle}
                  onChange={(e) => setListTitle(e.target.value)}
                />
              </label>
              <label>
                Códigos autorizados, um por linha
                <textarea
                  value={listCodes}
                  onChange={(e) => setListCodes(e.target.value)}
                />
              </label>
              <button
                disabled={
                  busy || !store || !listTitle.trim() || !listCodes.trim()
                }
                onClick={() =>
                  void run(async () => {
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
              >
                Autorizar lista sob demanda
              </button>
            </>
          )}
        </div>
      )}
      {!report && mode === "product" && (
        <div className="panel commercial-form">
          <label>
            {dictated
              ? "Texto transcrito, revise e edite"
              : "O que o cliente está procurando?"}
            <textarea
              value={note}
              maxLength={4000}
              onChange={(e) => {
                setNote(e.target.value);
                setReviewed(false);
              }}
              placeholder="Não tenho blusa branca masculina, tamanho 44, e há muita procura."
            />
          </label>
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
            <label className="commercial-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              Revisei o texto ditado antes de enviar.
            </label>
          )}
          <button
            className="secondary"
            disabled={busy || dictating || !store || note.trim().length < 2}
            onClick={() =>
              void run(async () => {
                const result = await invoke("organize-product", {
                  store,
                  text: note,
                });
                setDetails(result.details);
                setMessage(
                  "Sugestão de categorias pronta. Confira os campos antes de enviar.",
                );
              })
            }
          >
            Organizar descrição com IA
          </button>
          <div className="form-grid">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={details[key]}
                  maxLength={120}
                  onChange={(e) =>
                    setDetails({ ...details, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <p className="field-hint">
            As categorias são sugestões editáveis. Este registro sinaliza
            demanda; não cria uma compra ou reposição automática.
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              dictating ||
              !store ||
              note.trim().length < 2 ||
              (dictated && !reviewed)
            }
            onClick={() => void run(send)}
          >
            Enviar pedido de produto
          </button>
        </div>
      )}
      {!report && mode === "assortment" && (
        <div className="panel commercial-form">
          {!scan ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(begin);
              }}
            >
              <label>
                Código de barras
                <input
                  value={code}
                  maxLength={128}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  placeholder="Digite ou use um leitor conectado"
                />
              </label>
              <p>
                No aplicativo iOS e Android, use a câmera para bipar o código.
              </p>
              <button
                className="primary"
                disabled={busy || !store || code.trim().length < 2}
              >
                Registrar código e contar tamanhos
              </button>
            </form>
          ) : (
            <>
              <h3>Código {code}</h3>
              <p>
                Quantos produtos há em cada tamanho? Registre zero quando o
                tamanho foi contado e está em falta.
              </p>
              <div className="form-grid">
                <label>
                  Tamanho
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    {sizes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  if (!/^\d+$/.test(quantity) || Number(quantity) > 100000) {
                    setError("Informe uma quantidade inteira de 0 a 100000.");
                    return;
                  }
                  setCounts({ ...counts, [size]: Number(quantity) });
                  setQuantity("");
                  setError("");
                }}
              >
                Adicionar ou atualizar tamanho
              </button>
              {Object.entries(counts).map(([s, q]) => (
                <div className="commercial-count" key={s}>
                  <strong>{s}</strong>
                  <span>{q} unidades</span>
                  <button
                    onClick={() =>
                      setCounts((old) =>
                        Object.fromEntries(
                          Object.entries(old).filter(([key]) => key !== s),
                        ),
                      )
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                className="primary"
                disabled={busy || !Object.keys(counts).length}
                onClick={() =>
                  void run(async () => {
                    await rpc("eo_save_assortment", {
                      p_id: scan,
                      p_sizes: counts,
                    });
                    setScan("");
                    setCode("");
                    setCounts({});
                    scanRequest.current = crypto.randomUUID();
                    setMessage(
                      "Contagem salva no rascunho da sessão. Leia o próximo produto ou envie para validação.",
                    );
                    setRefresh((v) => v + 1);
                  })
                }
              >
                Salvar contagem
              </button>
              <button
                onClick={() => {
                  setScan("");
                  setCode("");
                  scanRequest.current = crypto.randomUUID();
                }}
              >
                Deixar como pendente e ler outro
              </button>
            </>
          )}
        </div>
      )}
      {report && (
        <>
          {mode === "product" && (
            <label className="commercial-check">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Incluir arquivados da unidade
            </label>
          )}
          <div className="form-grid">
            <label>
              De
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <p>{rows?.total ?? 0} registros no período</p>
          {leader && (
            <div className="commercial-groups">
              {rows?.groups.map((g) => (
                <div className="panel" key={g.region}>
                  <strong>{g.region || "Sem regional"}</strong>
                  <p>{g.total} registros</p>
                </div>
              ))}
            </div>
          )}
          {leader && mode === "product" && !!rows?.top_products?.length && (
            <div className="panel">
              <h3>20 agrupamentos mais frequentes</h3>
              <p>
                Contagens de relatos, não quantidades de produtos vendidas ou
                solicitadas.
              </p>
              {rows.top_products.map((p, i) => (
                <p key={i}>
                  <strong>{p.requests} relatos</strong> · {p.region} ·{" "}
                  {p.category || "Sem categoria"} ·{" "}
                  {p.product || "Não informado"} ·{" "}
                  {p.color || "Cor não informada"} ·{" "}
                  {p.size || "Tamanho não informado"}
                </p>
              ))}
            </div>
          )}
          {rows?.items
            .filter(
              (row) =>
                mode !== "product" || showArchived || !row.payload.archived,
            )
            .map((row) => (
              <article className="panel" key={row.id}>
                <h3>
                  {row.store_code} · {row.store_name}
                </h3>
                <p>
                  {row.region} ·{" "}
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </p>
                <p>{row.person_name}</p>
                {mode === "product" ? (
                  <>
                    <p>{row.payload.note}</p>
                    <p>
                      <strong>{row.payload.status || "Enviado"}</strong>
                      {row.payload.archived
                        ? " · Arquivado para toda unidade"
                        : ""}
                    </p>
                    {row.payload.response && (
                      <p>Resposta ao solicitante: {row.payload.response}</p>
                    )}
                    <button
                      onClick={() =>
                        void run(async () => {
                          await rpc("eo_product_update", {
                            p_id: row.id,
                            p_archived: !row.payload.archived,
                          });
                          setRefresh((v) => v + 1);
                        })
                      }
                    >
                      {row.payload.archived
                        ? "Restaurar na unidade"
                        : "Arquivar para toda unidade"}
                    </button>
                    {workspace.person.role === "admin" && (
                      <>
                        <label>
                          Resposta ou justificativa
                          <textarea
                            value={response[row.id] ?? ""}
                            maxLength={4000}
                            onChange={(e) =>
                              setResponse({
                                ...response,
                                [row.id]: e.target.value,
                              })
                            }
                          />
                        </label>
                        {requestStatuses.map((status) => (
                          <button
                            key={status}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await rpc("eo_product_update", {
                                  p_id: row.id,
                                  p_status: status,
                                  p_response: response[row.id] || "",
                                });
                                setRefresh((v) => v + 1);
                              })
                            }
                          >
                            {status}
                          </button>
                        ))}
                      </>
                    )}
                    <dl>
                      {fields.map(([key, label]) => (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            {row.payload.details?.[key] || "Não informado"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <>
                    <strong>Código {row.payload.barcode}</strong>
                    <p>
                      {row.payload.status === "draft"
                        ? "Contagem pendente"
                        : "Contagem concluída"}
                    </p>
                    {row.payload.status === "draft" && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setStore(row.store_id);
                          setCode(row.payload.barcode || "");
                          setSession(row.payload.session_id || "");
                          setScan(row.id);
                          setCounts(row.payload.sizes || {});
                          setReport(false);
                        }}
                      >
                        Retomar contagem
                      </button>
                    )}
                    <p>
                      {Object.entries(row.payload.sizes ?? {})
                        .map(([s, q]) => `${s}: ${q}`)
                        .join(" · ")}
                    </p>
                  </>
                )}
              </article>
            ))}
          <nav className="pagination" aria-label="Páginas dos registros">
            <button
              className="secondary"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              className="secondary"
              disabled={(page + 1) * 30 >= (rows?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
