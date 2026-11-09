import { strFromU8, strToU8, unzipSync } from "fflate";

const MAX_ENTRIES = 100;
const tagPattern = /<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const imageMime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};
type Attribute = { name: string; value: string };
export type PreparedSalesPackage = {
  html: string;
  bytes: Uint8Array;
  fileCount: number;
  hasScripts: boolean;
};

function attrs(tag: string): Attribute[] {
  const content = tag.replace(/^<\s*[^\s/>]+/, "").replace(/\/?>$/, "");
  return Array.from(
    content.matchAll(
      /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
    ),
    (match) => ({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? "",
    }),
  );
}
function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
function decodeReference(value: string) {
  return value
    .replace(/&#(x[\da-f]+|\d+);?/gi, (_, code: string) => {
      const number =
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : "";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
function resolveReference(from: string, reference: string): string | null {
  const value = decodeReference(reference).trim();
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(value)
  )
    return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.split(/[?#]/)[0]);
  } catch {
    throw new Error("O pacote contém um caminho de arquivo inválido.");
  }
  if (decoded.includes("\\") || decoded.includes("\0"))
    throw new Error("O pacote contém um caminho de arquivo inválido.");
  const segments = decoded.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!segments.length)
        throw new Error("Uma referência sai da pasta do pacote.");
      segments.pop();
    } else segments.push(part);
  }
  return segments.join("/");
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

export function prepareSalesPackage(
  name: string,
  input: Uint8Array,
): PreparedSalesPackage {
  if (!input.length) throw new Error("O arquivo deve ter conteúdo.");
  if (/\.html?$/i.test(name)) {
    const html = strFromU8(input);
    if (!html.trim()) throw new Error("O arquivo HTML está vazio.");
    return {
      html,
      bytes: input,
      fileCount: 1,
      hasScripts: /<script\b/i.test(html),
    };
  }
  if (!/\.zip$/i.test(name))
    throw new Error(
      "Escolha um HTML ou ZIP com o HTML e os arquivos auxiliares.",
    );
  let count = 0;
  let expanded = 0;
  const names = new Set<string>();
  // Primeiro passe apenas lê o diretório do ZIP, sem descomprimir entradas.
  unzipSync(input, {
    filter(entry) {
      count++;
      if (count > MAX_ENTRIES)
        throw new Error("O ZIP pode ter no máximo 100 arquivos e pastas.");
      if (
        !entry.name ||
        entry.name.includes("\\") ||
        entry.name.includes("\0") ||
        entry.name.startsWith("/") ||
        /^[a-z]:/i.test(entry.name) ||
        entry.name.split("/").some((part) => part === ".." || part === ".")
      )
        throw new Error("O ZIP contém um caminho de arquivo não permitido.");
      if (names.has(entry.name))
        throw new Error("O ZIP contém nomes de arquivo repetidos.");
      names.add(entry.name);
      expanded += entry.originalSize;
      if (
        !Number.isSafeInteger(entry.originalSize) ||
        entry.originalSize < 0 ||
        !Number.isSafeInteger(expanded)
      )
        throw new Error("O ZIP informa um tamanho descompactado inválido.");
      return false;
    },
  });
  const files = unzipSync(input);
  const htmlFiles = Object.keys(files).filter((path) => /\.html?$/i.test(path));
  const indexes = htmlFiles.filter((path) => /(^|\/)index\.html?$/i.test(path));
  const entry =
    htmlFiles.find((path) => /^index\.html?$/i.test(path)) ??
    (indexes.length === 1
      ? indexes[0]
      : htmlFiles.length === 1
        ? htmlFiles[0]
        : undefined);
  if (!entry)
    throw new Error(
      "Inclua um index.html principal no ZIP, ou deixe apenas um arquivo HTML.",
    );
  const cachedAssets = new Map<string, string>();
  function asset(from: string, reference: string): string {
    if (/^data:/i.test(reference.trim())) {
      return reference;
    }
    const path = resolveReference(from, reference);
    if (!path) return "";
    const bytes = files[path];
    if (!bytes) throw new Error(`Arquivo auxiliar ausente no ZIP: ${path}`);
    const mime = imageMime[path.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime)
      throw new Error(
        `Formato auxiliar não suportado: ${path}. Use imagens, fontes e CSS locais.`,
      );
    let data = cachedAssets.get(path);
    if (!data) {
      data = `data:${mime};base64,${base64(bytes)}`;
      cachedAssets.set(path, data);
    }
    return data;
  }
  function css(source: string, path: string, ancestors: string[] = []): string {
    if (ancestors.length > 10 || ancestors.includes(path))
      throw new Error(
        "O CSS contém importações circulares ou profundas demais.",
      );
    const importedBlocks: string[] = [];
    const rewritten = source.replace(
      /@import\s+(?:url\(\s*["']?([^"')]+)["']?\s*\)|["']([^"']+)["'])\s*([^;]*);/gi,
      (_, a: string, b: string, media: string) => {
        const imported = resolveReference(path, a ?? b ?? "");
        if (!imported) return "";
        if (!/\.css$/i.test(imported) || !files[imported])
          throw new Error(`CSS ausente ou inválido: ${imported}`);
        const importedCss = css(strFromU8(files[imported]), imported, [
          ...ancestors,
          path,
        ]);
        const block = media.trim()
          ? `@media ${media.trim()}{${importedCss}}`
          : importedCss;
        return `/*eo-css-import-${importedBlocks.push(block) - 1}*/`;
      },
    );
    const result = rewritten.replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
      (_, a: string, b: string, c: string) => {
        const reference = a ?? b ?? c ?? "";
        if (reference.trim().startsWith("#"))
          return `url("${reference.trim()}")`;
        return `url("${asset(path, reference)}")`;
      },
    );
    return result.replace(
      /\/\*eo-css-import-(\d+)\*\//g,
      (_, index: string) => importedBlocks[Number(index)],
    );
  }
  // Blocos de script são mantidos como dados, mas nunca executados no visualizador.
  const rawBlocks: string[] = [];
  let html = strFromU8(files[entry]).replace(
    /<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi,
    (script) => {
      const index = rawBlocks.push(script) - 1;
      return `<!--eo-script-${index}-->`;
    },
  );
  html = html.replace(
    /<style\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/style\s*>/gi,
    (_, source: string) =>
      `<style>${css(source, entry).replace(/<\/style/gi, "<\\/style")}</style>`,
  );
  html = html.replace(tagPattern, (tag) => {
    if (/^<!--|^<\s*\//.test(tag)) return tag;
    const tagName = /^<\s*([^\s/>]+)/.exec(tag)?.[1].toLowerCase();
    if (!tagName) return tag;
    const attributes = attrs(tag);
    const get = (key: string) =>
      attributes.find((attribute) => attribute.name.toLowerCase() === key)
        ?.value ?? "";
    if (
      tagName === "link" &&
      get("rel").toLowerCase().split(/\s+/).includes("stylesheet")
    ) {
      const path = resolveReference(entry, get("href"));
      if (!path) return "";
      if (!/\.css$/i.test(path) || !files[path])
        throw new Error(`CSS ausente ou inválido: ${path}`);
      return `<style>${css(strFromU8(files[path]), path).replace(/<\/style/gi, "<\\/style")}</style>`;
    }
    for (const attribute of attributes) {
      const key = attribute.name.toLowerCase();
      if (key === "style")
        attribute.value = css(decodeReference(attribute.value), entry);
      else if (
        (tagName === "img" && key === "src") ||
        (tagName === "image" && (key === "href" || key === "xlink:href")) ||
        key === "poster" ||
        key === "background"
      )
        attribute.value = asset(entry, attribute.value);
      else if (
        (tagName === "img" || tagName === "source") &&
        key === "srcset"
      ) {
        if (!attribute.value.trim().startsWith("data:"))
          attribute.value = attribute.value
            .split(",")
            .map((candidate) => {
              const [reference, ...descriptor] = candidate.trim().split(/\s+/);
              const data = asset(entry, reference);
              return data ? [data, ...descriptor].join(" ") : "";
            })
            .filter(Boolean)
            .join(", ");
      }
    }
    return `<${tagName}${attributes.map((attribute) => ` ${attribute.name}="${escapeAttribute(decodeReference(attribute.value))}"`).join("")}${/\/\s*>$/.test(tag) ? "/" : ""}>`;
  });
  html = html.replace(
    /<!--eo-script-(\d+)-->/g,
    (_, index: string) => rawBlocks[Number(index)],
  );
  const bytes = strToU8(html);
  return {
    html,
    bytes,
    fileCount: Object.keys(files).filter((path) => !path.endsWith("/")).length,
    hasScripts: /<script\b/i.test(html),
  };
}
