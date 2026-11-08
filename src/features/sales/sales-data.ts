export type SalesDataValue = string | number | null;
export type SalesDataRow = Record<string, SalesDataValue>;
export type SalesDataset = { rows: SalesDataRow[]; columns: string[]; metadata: { title: string; warnings: string[] } };
export type SalesDataFilters = { level?: string; query?: string; regionals?: string[]; stores?: string[]; departments?: string[]; sections?: string[] };

const textKeys = ["regional", "departamento", "secao", "nome_secao", "lmpa", "codigo_loja", "nome_loja", "nivel"];
const numberKeys = ["real", "meta", "real_ly", "estoque_2025", "estoque_2026", "estoque_d1", "estoque_d364", "ly_estoque_atual", "estoque_vermelho_d1", "estoque_branco_d1", "estoque_transito", "estoque_esperado_alocado", "cupons_2026", "cupons_2025", "itens", "itens_ly", "venda_custo", "venda_custo_ly"];
const allowedKeys = [...textKeys, ...numberKeys];
const levels = new Set(["LOJA_TOTAL", "DEP_TOTAL", "SEC_TOTAL", "LMPA"]);

// Lê apenas o literal JSON de uma declaração RAW. Não interpreta JavaScript.
function rawLiteral(source: string): string | null {
  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let script: RegExpExecArray | null;
  while ((script = scripts.exec(source))) {
    const code = script[1];
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        for (i++; i < code.length; i++) {
          if (code[i] === "\\") i++;
          else if (code[i] === quote) break;
        }
        continue;
      }
      if (c === "/" && code[i + 1] === "/") {
        const end = code.indexOf("\n", i + 2);
        i = end < 0 ? code.length : end;
        continue;
      }
      if (c === "/" && code[i + 1] === "*") {
        const end = code.indexOf("*/", i + 2);
        i = end < 0 ? code.length : end + 1;
        continue;
      }
      if (!/[lcv]/.test(c) || (i > 0 && /[\w$]/.test(code[i - 1]))) continue;
      const declaration = /^(?:let|const|var)\s+RAW\s*=\s*/.exec(code.slice(i, i + 160));
      if (!declaration) continue;
      const start = i + declaration[0].length;
      if (code[start] !== "[") return null;
      const stack: string[] = [];
      let quoted = false;
      for (let j = start; j < code.length; j++) {
        const token = code[j];
        if (quoted) {
          if (token === "\\") j++;
          else if (token === '"') quoted = false;
        } else if (token === '"') quoted = true;
        else if (token === "[" || token === "{") stack.push(token);
        else if (token === "]" || token === "}") {
          if (stack.pop() !== (token === "]" ? "[" : "{")) return null;
          if (!stack.length) {
            // Rejeita expressões como RAW=[...].map(...), mantendo só dados.
            const following = code.slice(j + 1).trimStart()[0];
            if (following && following !== "," && following !== ";") return null;
            return code.slice(start, j + 1);
          }
        }
      }
      return null;
    }
  }
  return null;
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&#(x[\da-f]+|\d+);/gi, (_, raw: string) => {
    const number = raw[0].toLowerCase() === "x" ? parseInt(raw.slice(1), 16) : Number(raw);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
  }).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[entity] ?? entity).trim();
}

/** null significa formato desconhecido ou literal inválido; nenhum código recebido é executado. */
export function parseSalesData(source: string): SalesDataset | null {
  const literal = rawLiteral(source);
  if (!literal) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(literal); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const rows: SalesDataRow[] = [];
  const present = new Set<string>();
  let skipped = 0, invalid = 0, unknown = 0;
  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.codigo_loja !== "string" || !value.codigo_loja.trim()
      || typeof value.nivel !== "string" || !levels.has(value.nivel)) { skipped++; continue; }
    const row: SalesDataRow = Object.fromEntries(allowedKeys.map((key) => [key, null]));
    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) { unknown++; continue; }
      const field: unknown = value[key];
      const valid = field === null || (textKeys.includes(key) ? typeof field === "string" : typeof field === "number" && Number.isFinite(field));
      row[key] = valid ? field as SalesDataValue : null;
      present.add(key);
      if (!valid) invalid++;
    }
    rows.push(row);
  }
  const warnings: string[] = [];
  if (skipped) warnings.push(`${skipped} registro(s) sem loja ou nível válido foram ignorados.`);
  if (invalid) warnings.push(`${invalid} campo(s) com tipo inválido foram substituídos por valor ausente.`);
  if (unknown) warnings.push(`${unknown} campo(s) fora do formato conhecido foram ignorados.`);
  if (!rows.length) warnings.push("A base não contém registros válidos.");
  warnings.push("Os níveis incluem subtotais: não some registros de níveis diferentes.");
  const title = plainText(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source)?.[1] ?? "Relatório de vendas");
  // Datas declaradas e rótulos alterados por scripts não provam o período da base.
  if (/\bD1_DATE\s*=/.test(source)) warnings.push("Confirme o período da base na publicação; datas e rótulos do HTML podem divergir.");
  return { rows, columns: allowedKeys.filter((key) => present.has(key)), metadata: { title, warnings } };
}

function normalized(value: SalesDataValue | undefined): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function selectSalesRows(dataset: SalesDataset, filters: SalesDataFilters = {}): SalesDataRow[] {
  const query = normalized(filters.query?.trim());
  const level = filters.level ?? "LOJA_TOTAL";
  return dataset.rows.filter((row) => (!level || row.nivel === level)
    && (!filters.regionals?.length || filters.regionals.includes(String(row.regional ?? "")))
    && (!filters.stores?.length || filters.stores.includes(String(row.codigo_loja ?? "")))
    && (!filters.departments?.length || filters.departments.includes(String(row.departamento ?? "")))
    && (!filters.sections?.length || filters.sections.includes(String(row.secao ?? "")))
    && (!query || Object.values(row).some((value) => normalized(value).includes(query))));
}

/** Página começa em 1. A UI recebe só a fatia visível e o total filtrado. */
export function paginateSalesRows(rows: SalesDataRow[], page = 1, pageSize = 25) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 25;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Number.isFinite(page) ? Math.min(pages, Math.max(1, Math.floor(page))) : 1;
  return { rows: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageSize: size, pages };
}
