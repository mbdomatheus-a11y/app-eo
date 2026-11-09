export type SalesPeriod = "week" | "month" | "year";
export type SalesReport = {
  id: string;
  title: string;
  period: SalesPeriod;
  published_at: string;
  store_ids: string[];
  object_path: string;
  structured?: boolean;
  import_state?: string;
  archived_at?: string | null;
};
export const SALES_BUCKET = "eo-sales-html";
export const periodLabels: Record<SalesPeriod, string> = {
  week: "Semana",
  month: "Mês",
  year: "Ano",
};
export const salesPeriods: SalesPeriod[] = ["week", "month", "year"];
export const STATIC_HTML_NOTICE =
  "Relatórios no formato reconhecido são convertidos em tabelas com filtros de loja, regional e departamento. Outros HTMLs abrem em prévia estática isolada. Envie HTML único ou ZIP com arquivos locais.";
const policy =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";

export function validateHtmlFile(name: string, size: number) {
  if (!/\.(html?|zip)$/i.test(name))
    throw new Error("Escolha um arquivo HTML ou ZIP.");
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error("O arquivo deve ter conteúdo.");
}

export function prepareSalesHtml(source: string): string {
  // A política precede qualquer conteúdo recebido. O WebView também desativa
  // JavaScript, arquivos locais, novas janelas e todas as navegações externas.
  const content = source.replace(
    /<(?:meta|base)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
    "",
  );
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{overflow:auto;max-width:100%}body{margin:12px;overflow:auto;min-width:0;overflow-wrap:anywhere}img,video,svg{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${content}</body></html>`;
}

export function readHtmlBlob(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("O conteúdo recebido não é um HTML válido."));
    reader.onerror = () =>
      reject(new Error("Não foi possível ler o HTML recebido."));
    reader.readAsText(blob, "UTF-8");
  });
}
