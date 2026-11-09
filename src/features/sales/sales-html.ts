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
  // Conteúdo de template é inerte, inclusive antes da remoção de recursos.
  const template = document.createElement("template");
  template.innerHTML = source;
  const content = template.content;
  content
    .querySelectorAll(
      "script,iframe,frame,object,embed,base,link,meta,template,animate,animateMotion,animateTransform,set,discard",
    )
    .forEach((node) => node.remove());
  // O iframe sem scripts interpreta noscript de forma diferente do documento
  // principal. Texto simples preserva os dados sem reativar marcação oculta.
  content
    .querySelectorAll("noscript")
    .forEach((node) =>
      node.replaceWith(document.createTextNode(node.textContent ?? "")),
    );
  content.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const linkAttribute = /^(href|xlink:href)$/i.test(attribute.name);
      const safeImageReference =
        ["image", "use"].includes(node.localName) &&
        /^(data:|#)/i.test(attribute.value);
      if (
        /^(on|action$|formaction$|target$|download$)/i.test(attribute.name) ||
        (linkAttribute && !safeImageReference)
      )
        node.removeAttribute(attribute.name);
    }
  });
  content.querySelectorAll("form").forEach((form) => {
    const container = document.createElement("div");
    while (form.firstChild) container.append(form.firstChild);
    form.replaceWith(container);
  });
  const safeRootAttributes = (name: "html" | "body") => {
    const match = new RegExp(
      `<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`,
      "i",
    ).exec(source);
    if (!match) return "";
    const holder = document.createElement("template");
    holder.innerHTML = `<div${match[1]}></div>`;
    const node = holder.content.firstElementChild;
    if (!node) return "";
    return ["class", "style", "lang", "dir"]
      .filter((attribute) => node.hasAttribute(attribute))
      .map((attribute) => {
        const value = (node.getAttribute(attribute) ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");
        return ` ${attribute}="${value}"`;
      })
      .join("");
  };
  return `<!doctype html><html${safeRootAttributes("html")}><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{overflow:auto;max-width:100%}body{margin:12px;overflow:auto;min-width:0;overflow-wrap:anywhere}img,video,svg{max-width:100%;height:auto}table{max-width:100%}</style></head><body${safeRootAttributes("body")}>${template.innerHTML}</body></html>`;
}
