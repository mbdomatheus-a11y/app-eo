import { useCallback, useEffect, useRef, useState } from "react";
import { rpc, type Workspace } from "../../services/supabase";
import {
  ESCALA_STORAGE_KEY,
  chaveLoja,
  filtrarPorPeriodo,
  lotesPorLoja,
  prepararEscalaHtml,
  resumoDoEstado,
  type Periodo,
} from "./escala-html";
import "./escala.css";

type Loja = { id: string; codigo: string; nome: string; ggl: string | null; regional: string | null; modelo: string };
type Semana = { id: string; semana_inicio: string; modelo: string; status: string; versao: number; atualizado_em: string };
type Colaborador = { chapa: string; nome: string; cargo: string | null; departamento: string | null; jornada_diaria_min: number | null; situacao: string | null };
type Contexto = { loja: { id: string; codigo: string; nome: string }; pode_editar: boolean; colaboradores: Colaborador[] };
type HtmlAtivo = { id: number; titulo: string; publicado_em: string; conteudo: string } | null;

const PERIODOS: [Periodo, string][] = [
  ["week", "Semana"],
  ["month", "Mês"],
  ["year", "Ano"],
];
const SANDBOX = "allow-scripts allow-modals allow-downloads allow-popups allow-forms";
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

export function EscalaModule({ workspace }: { workspace: Workspace }) {
  const admin = workspace.person.role === "admin";
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [busca, setBusca] = useState("");
  const [loja, setLoja] = useState<Loja | null>(null);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("month");
  const [aberta, setAberta] = useState<{ estado: unknown | null; rotulo: string } | null>(null);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [cheia, setCheia] = useState(false);
  const htmlAtivo = useRef<HtmlAtivo | undefined>(undefined);
  const versoes = useRef(new Map<string, number | null>());
  const fila = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const t = setTimeout(() => {
      void rpc<Loja[]>("escala_lojas_disponiveis", { p_busca: busca.trim() || null, p_limite: 50, p_offset: 0 })
        .then((r) => {
          setLojas(r);
          if (!busca && r.length === 1) setLoja(r[0]);
        })
        .catch((e) => setErro(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const carregarLoja = useCallback(async (l: Loja) => {
    setErro("");
    setAberta(null);
    const [ctx, lista] = await Promise.all([
      rpc<Contexto>("escala_contexto", { p_loja: l.id }),
      rpc<Semana[]>("escala_listar_semanas", { p_loja: l.id, p_limite: 100 }),
    ]);
    setContexto(ctx);
    setSemanas(lista ?? []);
  }, []);

  useEffect(() => {
    if (loja) void carregarLoja(loja).catch((e) => setErro(e.message));
  }, [loja, carregarLoja]);

  async function abrir(semana?: Semana) {
    if (!loja) return;
    setBusy(true);
    setErro("");
    try {
      if (htmlAtivo.current === undefined) htmlAtivo.current = await rpc<HtmlAtivo>("escala_html_ativo");
      if (!htmlAtivo.current) throw new Error("Nenhuma versão da escala foi publicada ainda pelo administrador.");
      versoes.current = new Map();
      let estado: unknown | null = null;
      if (semana) {
        const s = await rpc<{ dados: unknown; versao: number; semana_inicio: string } | null>("escala_obter_semana", {
          p_loja: loja.id,
          p_semana: semana.semana_inicio,
        });
        if (s) {
          estado = s.dados;
          versoes.current.set(s.semana_inicio, s.versao);
        }
      }
      setStatus("");
      setAberta({ estado, rotulo: semana ? `Semana de ${dataBR(semana.semana_inicio)}` : "Novo planejamento" });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a escala.");
    } finally {
      setBusy(false);
    }
  }

  const salvar = useCallback(
    (valor: string) => {
      if (!loja) return;
      fila.current = fila.current.then(async () => {
        let estado: unknown;
        try {
          estado = JSON.parse(valor);
        } catch {
          return;
        }
        const r = resumoDoEstado(estado as never);
        if (!r.semana) return;
        if (!contexto?.pode_editar) {
          setStatus("Seu perfil só visualiza: alterações não são gravadas.");
          return;
        }
        try {
          if (!versoes.current.has(r.semana)) {
            const existente = await rpc<{ versao: number } | null>("escala_obter_semana", { p_loja: loja.id, p_semana: r.semana });
            if (existente) {
              setStatus(`Já existe escala salva para a semana de ${dataBR(r.semana)}. Abra-a pela lista para editar.`);
              return;
            }
            versoes.current.set(r.semana, null);
          }
          const res = await rpc<{ id: string; versao: number }>("escala_salvar_semana", {
            p_loja: loja.id,
            p_semana: r.semana,
            p_modelo: r.modelo,
            p_status: r.status,
            p_dados: estado,
            p_versao: versoes.current.get(r.semana) ?? null,
          });
          versoes.current.set(r.semana, res.versao);
          setStatus(`Salvo no EO às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (semana de ${dataBR(r.semana)}, versão ${res.versao}).`);
          setSemanas((await rpc<Semana[]>("escala_listar_semanas", { p_loja: loja.id, p_limite: 100 })) ?? []);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Não foi possível salvar.");
        }
      });
    },
    [loja, contexto?.pode_editar],
  );

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!frame.current || ev.source !== frame.current.contentWindow) return;
      const d = ev.data as { type?: string; key?: string; value?: string };
      if (d?.type === "eo-escala-pronto" && htmlAtivo.current && contexto && aberta) {
        const chave = chaveLoja(contexto.loja.codigo, contexto.loja.nome);
        const rows = contexto.colaboradores.map((c) => [Number(c.chapa), c.nome, c.cargo ?? "", c.departamento ?? "", c.jornada_diaria_min ?? 440, c.situacao ?? ""]);
        frame.current.contentWindow?.postMessage(
          {
            type: "eo-escala-carregar",
            html: htmlAtivo.current.conteudo,
            storeData: { [chave]: rows },
            loja: chave,
            state: aberta.estado,
            storageKey: ESCALA_STORAGE_KEY,
          },
          "*",
        );
      }
      if (d?.type === "eo-escala-salvar" && d.key === ESCALA_STORAGE_KEY && typeof d.value === "string") salvar(d.value);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [contexto, aberta, salvar]);

  useEffect(() => {
    const sair = () => {
      if (!document.fullscreenElement) setCheia(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCheia(false);
    };
    document.addEventListener("fullscreenchange", sair);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("fullscreenchange", sair);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  async function alternarTelaCheia() {
    if (cheia) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setCheia(false);
      return;
    }
    setCheia(true);
    // Tela cheia do navegador quando existir (computador e Android); no iPhone fica o modo foco.
    await area.current?.requestFullscreen?.().catch(() => undefined);
  }

  async function publicar(arquivo: File) {
    setBusy(true);
    setErro("");
    try {
      const preparado = prepararEscalaHtml(await arquivo.text());
      let gravados = 0;
      for (const lote of lotesPorLoja(preparado.linhas)) {
        const r = await rpc<{ gravados: number }>("colaboradores_importar", { p_linhas: lote });
        gravados += r.gravados;
        setStatus(`Atualizando colaboradores: ${gravados} gravados...`);
      }
      await rpc("escala_publicar_html", { p_titulo: arquivo.name.replace(/\.html?$/i, ""), p_conteudo: preparado.html });
      htmlAtivo.current = undefined;
      setStatus(
        `Versão publicada para todas as lojas com acesso ao módulo.${preparado.linhas.length ? ` ${gravados} colaboradores de ${preparado.lojas} lojas atualizados; a lista saiu do HTML.` : ""}`,
      );
      if (loja) await carregarLoja(loja);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  const lista = filtrarPorPeriodo(semanas, periodo);
  return (
    <section className="escala-module" aria-labelledby="escala-title">
      <header className="escala-head">
        <div>
          <h2 id="escala-title">Escala de colaboradores</h2>
          <p>Planejamento 5x2 e 6x1 da loja. Tudo que você altera é gravado no EO.</p>
        </div>
        {admin && (
          <label className="escala-publish">
            <span>Publicar nova versão do HTML</span>
            <input type="file" accept=".html,.htm,text/html" disabled={busy} onChange={(e) => e.target.files?.[0] && void publicar(e.target.files[0])} />
          </label>
        )}
      </header>
      {erro && <p role="alert" className="form-error">{erro}</p>}
      {status && <p role="status" className="escala-status">{status}</p>}

      {!aberta && (
        <>
          <div className="escala-lojas">
            <label>
              Loja
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código ou nome da loja" />
            </label>
            <ul>
              {lojas.map((l) => (
                <li key={l.id}>
                  <button className={loja?.id === l.id ? "selected" : ""} aria-pressed={loja?.id === l.id} onClick={() => setLoja(l)}>
                    <strong>{l.codigo}</strong> {l.nome}
                    <small>{l.modelo}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {loja && contexto && (
            <div className="escala-semanas">
              <div className="escala-semanas-top">
                <h3>
                  {contexto.loja.codigo} {contexto.loja.nome}
                  <small>{contexto.colaboradores.length} colaboradores na base</small>
                </h3>
                <button className="primary" disabled={busy} onClick={() => void abrir()}>
                  Novo planejamento
                </button>
              </div>
              <div className="sales-periods" role="group" aria-label="Período">
                {PERIODOS.map(([id, rotulo]) => (
                  <button key={id} aria-pressed={periodo === id} className={periodo === id ? "is-active" : ""} onClick={() => setPeriodo(id)}>
                    {rotulo}
                  </button>
                ))}
              </div>
              <ul className="escala-lista">
                {lista.map((s) => (
                  <li key={s.id}>
                    <button disabled={busy} onClick={() => void abrir(s)}>
                      <strong>Semana de {dataBR(s.semana_inicio)}</strong>
                      <small>
                        {s.modelo}, {s.status === "finalizada" ? "finalizada" : "rascunho"}, versão {s.versao}, salva em {new Date(s.atualizado_em).toLocaleString("pt-BR")}
                      </small>
                    </button>
                  </li>
                ))}
                {!lista.length && <li className="escala-vazio">Nenhuma escala salva neste período.</li>}
              </ul>
            </div>
          )}
        </>
      )}

      {aberta && (
        <div ref={area} className={`escala-frame-wrap${cheia ? " escala-cheia" : ""}`}>
          <div className="escala-frame-bar">
            <button
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
                setCheia(false);
                setAberta(null);
                if (loja) void carregarLoja(loja);
              }}
            >
              Voltar à lista
            </button>
            <span>{aberta.rotulo}</span>
            <button className="primary escala-cheia-botao" aria-pressed={cheia} onClick={() => void alternarTelaCheia()}>
              {cheia ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </div>
          {cheia && status && <p role="status" className="escala-status">{status}</p>}
          <iframe ref={frame} title="Escala de colaboradores" src="/ferramentas/escala.html" sandbox={SANDBOX} referrerPolicy="no-referrer" />
        </div>
      )}
    </section>
  );
}
