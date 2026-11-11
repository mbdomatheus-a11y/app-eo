// Preparação do HTML da Escala para o portal e regras puras do módulo (testáveis).
export const ESCALA_STORAGE_KEY = "escalaColaboradores.v1";
export const STORE_DATA_PLACEHOLDER = "var STORE_DATA = (window.__EO && window.__EO.storeData) || {};";
const STORE_DATA_RE = /^var STORE_DATA = (\{.*\});[ \t]*$/m;

export type LinhaColaborador = {
  loja_codigo: string;
  chapa: string;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  jornada_diaria_min: number | null;
  situacao: string | null;
};

export function prepararEscalaHtml(fonte: string) {
  if (!/<html[\s>]/i.test(fonte)) throw new Error("O arquivo não parece um HTML da escala.");
  const m = STORE_DATA_RE.exec(fonte);
  if (!m) {
    if (!fonte.includes(STORE_DATA_PLACEHOLDER))
      throw new Error("Não encontrei a base de colaboradores (STORE_DATA) neste HTML.");
    return { html: fonte, linhas: [] as LinhaColaborador[], lojas: 0 };
  }
  const dados = JSON.parse(m[1]) as Record<string, unknown[][]>;
  const linhas: LinhaColaborador[] = [];
  for (const [chave, rows] of Object.entries(dados)) {
    const codigo = chave.split(" - ")[0].trim();
    if (!/^[0-9]{1,4}$/.test(codigo)) continue;
    for (const r of rows) {
      const chapa = String(r[0] ?? "").trim();
      const nome = String(r[1] ?? "").trim();
      if (!/^[0-9]{1,20}$/.test(chapa) || nome.length < 2) continue;
      const jornada = Number(r[4]);
      linhas.push({
        loja_codigo: codigo,
        chapa,
        nome,
        cargo: r[2] ? String(r[2]) : null,
        departamento: r[3] ? String(r[3]) : null,
        jornada_diaria_min: Number.isFinite(jornada) && jornada > 0 && jornada <= 720 ? jornada : null,
        situacao: r[5] ? String(r[5]) : null,
      });
    }
  }
  return { html: fonte.replace(m[0], STORE_DATA_PLACEHOLDER), linhas, lojas: Object.keys(dados).length };
}

// Lotes sem dividir uma loja entre dois lotes (a importação desativa quem não veio, por loja).
export function lotesPorLoja(linhas: LinhaColaborador[], maximo = 4000) {
  const porLoja = new Map<string, LinhaColaborador[]>();
  for (const l of linhas) porLoja.set(l.loja_codigo, [...(porLoja.get(l.loja_codigo) ?? []), l]);
  const lotes: LinhaColaborador[][] = [];
  let atual: LinhaColaborador[] = [];
  for (const grupo of porLoja.values()) {
    if (atual.length && atual.length + grupo.length > maximo) {
      lotes.push(atual);
      atual = [];
    }
    atual = atual.concat(grupo);
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

export const chaveLoja = (codigo: string, nome: string) => `${codigo.padStart(4, "0")} - ${nome}`;

export function segundaDaSemana(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dia - 1));
  return d.toISOString().slice(0, 10);
}

export type Periodo = "week" | "month" | "year";
export function filtrarPorPeriodo<T extends { semana_inicio: string }>(itens: T[], periodo: Periodo, hoje = new Date()) {
  const iso = hoje.toISOString().slice(0, 10);
  const seg = segundaDaSemana(iso) ?? iso;
  return itens.filter((x) =>
    periodo === "week"
      ? x.semana_inicio >= seg
      : periodo === "month"
        ? x.semana_inicio.slice(0, 7) === iso.slice(0, 7)
        : x.semana_inicio.slice(0, 4) === iso.slice(0, 4),
  );
}

export type EstadoEscala = { settings?: { semanaInicio?: string; modeloEscala?: string; statusEscala?: string } };
export function resumoDoEstado(estado: EstadoEscala) {
  const s = estado.settings ?? {};
  return {
    semana: segundaDaSemana(s.semanaInicio ?? ""),
    modelo: s.modeloEscala === "5X2" ? "5X2" : "6X1",
    status: s.statusEscala === "finalizada" ? "finalizada" : "rascunho",
  } as const;
}
