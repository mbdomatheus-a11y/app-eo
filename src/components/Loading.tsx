// Estados de carregamento do portal (21/11/2026), pela regra da Nielsen Norman Group pedida por Matheus:
// menos de 1 s nada; 2 a 10 s num pedaço da tela, Spinner; página inteira abaixo de 10 s, Skeleton com a
// forma do conteúdo; acima de 10 s, upload ou importação, BarraProgresso com tempo restante e cancelar.
import { useEffect, useState } from "react";

// Só aparece se a espera passar de ~1 s, para não piscar em respostas rápidas.
function useAtraso(ms = 900) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return visivel;
}

export function Spinner({ rotulo, imediato = false }: { rotulo?: string; imediato?: boolean }) {
  const visivel = useAtraso(imediato ? 0 : 900);
  if (!visivel) return null;
  return (
    <span className="eo-spinner-wrap" role="status">
      <span className="eo-spinner" aria-hidden="true" />
      {rotulo && <span>{rotulo}</span>}
    </span>
  );
}

// Esqueleto com a forma do conteúdo: linhas de lista (título + detalhe) ou cartões.
export function Skeleton({ variante = "lista", quantidade = 4, rotulo = "Carregando" }: { variante?: "lista" | "cartoes"; quantidade?: number; rotulo?: string }) {
  const visivel = useAtraso(300);
  if (!visivel) return null;
  return (
    <div className={`eo-skeleton eo-skeleton-${variante}`} role="status" aria-label={rotulo}>
      {Array.from({ length: quantidade }, (_, i) =>
        variante === "lista" ? (
          <div className="eo-sk-linha" key={i}>
            <span className="eo-sk eo-sk-icone" />
            <span className="eo-sk-texto">
              <span className="eo-sk eo-sk-titulo" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
              <span className="eo-sk eo-sk-detalhe" style={{ width: `${35 + ((i * 23) % 25)}%` }} />
            </span>
          </div>
        ) : (
          <div className="eo-sk-cartao" key={i}>
            <span className="eo-sk eo-sk-icone" />
            <span className="eo-sk eo-sk-titulo" style={{ width: "70%" }} />
            <span className="eo-sk eo-sk-detalhe" style={{ width: "45%" }} />
          </div>
        ),
      )}
    </div>
  );
}

export type Progresso = { atual: number; total: number; unidade: string; inicio: number };

const tempoRestante = (p: Progresso) => {
  if (p.atual < 1 || p.atual >= p.total) return "";
  const porItem = (Date.now() - p.inicio) / p.atual;
  const s = Math.round((porItem * (p.total - p.atual)) / 1000);
  if (s < 60) return "menos de 1 min";
  return `cerca de ${Math.ceil(s / 60)} min`;
};

// Barra para esperas longas: "lote 3 de 144 · faltam cerca de 2 min" e botão de cancelar.
export function BarraProgresso({ progresso, titulo, onCancelar }: { progresso: Progresso; titulo: string; onCancelar?: () => void }) {
  const pct = progresso.total ? Math.min(100, Math.round((progresso.atual / progresso.total) * 100)) : 0;
  const resto = tempoRestante(progresso);
  return (
    <div className="eo-progresso" role="status" aria-live="polite">
      <div className="eo-progresso-topo">
        <strong>{titulo}</strong>
        {onCancelar && (
          <button type="button" className="secondary" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      <div className="eo-progresso-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <small>
        {progresso.unidade} {progresso.atual.toLocaleString("pt-BR")} de {progresso.total.toLocaleString("pt-BR")} · {pct}%
        {resto ? ` · faltam ${resto}` : ""}
      </small>
    </div>
  );
}
