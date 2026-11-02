export type SheetRows = Record<string, string>[];

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const zipSig = 0x06054b50;

function textOf(node: Element | null | undefined): string {
  return node?.textContent?.trim() ?? "";
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

async function unzipEntries(file: File): Promise<Map<string, string>> {
  if (file.size > 15 * 1024 * 1024) throw new Error("A planilha excede o limite de 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === zipSig) { end = i; break; }
  }
  if (end < 0) throw new Error("O arquivo não parece ser uma planilha Excel .xlsx válida.");
  const entries = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const output = new Map<string, string>();
  let expanded = 0;
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("A estrutura da planilha está inválida.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name.endsWith(".xml") || name.startsWith("../") || name.startsWith("/")) continue;
    expanded += uncompressedSize;
    if (expanded > 50 * 1024 * 1024) throw new Error("A planilha descompactada excede o limite de 50 MB.");
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("A estrutura interna da planilha está inválida.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let plain: ArrayBuffer;
    if (method === 0) plain = compressed.slice().buffer;
    else if (method === 8) {
      const stream = new Blob([compressed.slice().buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      plain = await new Response(stream).arrayBuffer();
    } else continue;
    if (plain.byteLength !== uncompressedSize) throw new Error("Não foi possível validar o conteúdo da planilha.");
    output.set(name, decoder.decode(plain));
  }
  return output;
}

function parseSheet(xml: string, shared: string[]): SheetRows {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Uma aba da planilha está corrompida.");
  const rows = Array.from(document.getElementsByTagNameNS(ns, "row"));
  const matrix = rows.map((row) => {
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagNameNS(ns, "c"))) {
      const index = columnIndex(cell.getAttribute("r") ?? "A");
      const type = cell.getAttribute("t");
      const raw = textOf(cell.getElementsByTagNameNS(ns, "v")[0]);
      let value = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      if (type === "inlineStr") value = Array.from(cell.getElementsByTagNameNS(ns, "t")).map(textOf).join("");
      if (type === "b") value = raw === "1" ? "SIM" : "NÃO";
      values[index] = value;
    }
    return values;
  });
  const headerIndex = matrix.findIndex((row) => row.some((value) => value?.trim()));
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((h) => h?.trim() ?? "");
  return matrix.slice(headerIndex + 1).flatMap((row) => {
    if (!row.some((value) => value?.trim())) return [];
    const record: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) record[header] = row[index]?.trim() ?? ""; });
    return [record];
  });
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
}

export async function readOrgWorkbook(file: File): Promise<Record<string, SheetRows>> {
  const entries = await unzipEntries(file);
  const workbook = entries.get("xl/workbook.xml");
  const relationships = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships) throw new Error("O arquivo não contém uma estrutura Excel compatível.");
  const parser = new DOMParser();
  const workbookDoc = parser.parseFromString(workbook, "application/xml");
  const relationsDoc = parser.parseFromString(relationships, "application/xml");
  const relationMap = new Map<string, string>();
  for (const relation of Array.from(relationsDoc.getElementsByTagName("Relationship"))) {
    relationMap.set(relation.getAttribute("Id") ?? "", relation.getAttribute("Target") ?? "");
  }
  const sharedXml = entries.get("xl/sharedStrings.xml");
  const sharedDoc = sharedXml ? parser.parseFromString(sharedXml, "application/xml") : null;
  const shared = sharedDoc ? Array.from(sharedDoc.getElementsByTagNameNS(ns, "si")).map((si) => Array.from(si.getElementsByTagNameNS(ns, "t")).map(textOf).join("")) : [];
  const result: Record<string, SheetRows> = {};
  for (const sheet of Array.from(workbookDoc.getElementsByTagNameNS(ns, "sheet"))) {
    const name = sheet.getAttribute("name") ?? "";
    if (normalizeHeader(name) === "LEIA-ME") continue;
    const relId = sheet.getAttributeNS(relNs, "id") ?? sheet.getAttribute("r:id") ?? "";
    let target = relationMap.get(relId) ?? "";
    if (target.startsWith("/")) target = target.slice(1);
    else if (!target.startsWith("xl/")) target = `xl/${target}`;
    const xml = entries.get(target);
    if (!xml) throw new Error(`Não foi possível abrir a aba ${name}.`);
    result[name] = parseSheet(xml, shared);
  }
  const required = ["Lojas", "Gerentes", "Regionais", "Pessoas", "Vinculos"];
  const keyMap = new Map(Object.keys(result).map((name) => [normalizeHeader(name), name]));
  for (const name of required) if (!keyMap.has(normalizeHeader(name))) throw new Error(`A aba obrigatória ${name} não foi encontrada.`);
  return Object.fromEntries(required.map((name) => [name, result[keyMap.get(normalizeHeader(name))!] ?? []]));
}
