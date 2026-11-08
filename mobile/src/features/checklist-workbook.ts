import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type ChecklistQuestion = { prompt: string; type: "acceptance" | "photo" | "text" | "yes_no"; required: boolean };
export const checklistTypeLabels = { acceptance: "Aceite", photo: "Foto", text: "Texto", yes_no: "Sim ou não" };
const columns = ["ORDEM", "PERGUNTA", "TIPO", "OBRIGATORIO"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const decode = (value: string) => value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g), (match) => [match[1], decode(match[2] ?? match[3])]));
}
function elements(xml: string, tag: string) {
  return Array.from(xml.matchAll(new RegExp(`<(?:(?:[\\w.-]+):)?${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${tag}\\s*>)`, "g")), (match) => ({ attrs: attributes(match[1]), body: match[2] ?? "" }));
}
function text(xml: string) { return elements(xml, "t").map((node) => decode(node.body)).join(""); }
function validateXml(xml: string) {
  const stack: string[] = [];
  let cursor = 0;
  for (const match of xml.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    if (xml.slice(cursor, match.index).includes("<")) throw new Error("Estrutura XML inválida.");
    cursor = (match.index ?? 0) + match[0].length;
    const tag = match[0];
    if (tag.startsWith("<!--") || tag.startsWith("<?")) continue;
    const name = tag.match(/^<\/?([\w:.-]+)/)?.[1];
    if (!name || /<!/i.test(tag)) throw new Error("Estrutura XML não suportada.");
    if (tag.startsWith("</")) { if (stack.pop() !== name) throw new Error("Estrutura XML inválida."); }
    else if (!tag.endsWith("/>")) stack.push(name);
  }
  if (stack.length || xml.slice(cursor).includes("<")) throw new Error("Estrutura XML incompleta.");
}

/** Pure Open XML reader, also used by the native implementation without DOM APIs. */
export function parseChecklistWorkbook(input: Uint8Array): ChecklistQuestion[] {
  if (!input.length || input.length > 15 * 1024 * 1024) throw new Error("Escolha uma planilha .xlsx de até 15 MB.");
  let expanded = 0, count = 0;
  let files: Record<string, Uint8Array>;
  try {
    // Validate declared sizes before inflation, including entries we do not need.
    unzipSync(input, { filter(entry) {
      count++; expanded += entry.originalSize;
      if (count > 1000 || !Number.isSafeInteger(expanded) || expanded > 50 * 1024 * 1024) throw new Error("Limite excedido");
      return false;
    } });
    files = unzipSync(input, { filter: (entry) => /\.(xml|rels)$/i.test(entry.name) });
  } catch { throw new Error("A planilha .xlsx está inválida ou excede o limite de 50 MB descompactados."); }
  const read = (path: string) => {
    if (!files[path]) return "";
    const xml = strFromU8(files[path]);
    try { validateXml(xml); } catch { throw new Error(`Planilha inválida no arquivo ${path}. Baixe o modelo novamente.`); }
    return xml;
  };
  const workbook = read("xl/workbook.xml"), rels = read("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("O arquivo não contém uma estrutura Excel compatível.");
  const sheets = elements(workbook, "sheet").filter((node) => normalize(node.attrs.name ?? "") === "CHECKLIST");
  if (sheets.length !== 1) throw new Error("Inclua exatamente uma aba chamada Checklist.");
  const sheet = sheets[0], relation = elements(rels, "Relationship").find((node) => node.attrs.Id === (sheet.attrs["r:id"] ?? sheet.attrs.id));
  const target = relation?.attrs.Target ?? "";
  if (!target || relation?.attrs.TargetMode === "External" || target.includes("..")) throw new Error("Aba Checklist: referência de arquivo inválida.");
  const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`;
  const xml = read(path);
  if (!xml) throw new Error("Não foi possível abrir a aba Checklist.");
  const shared = elements(read("xl/sharedStrings.xml"), "si").map((node) => text(node.body));
  const rows = elements(xml, "row").map((row, index) => {
    const cells: Record<number, string> = {};
    for (const cell of elements(row.body, "c")) {
      const letters = cell.attrs.r?.match(/^[a-z]+/i)?.[0]?.toUpperCase();
      if (!letters) throw new Error(`Aba Checklist, linha ${row.attrs.r ?? index + 1}: célula sem endereço.`);
      let col = 0; for (const char of letters) col = col * 26 + char.charCodeAt(0) - 64;
      const raw = decode(elements(cell.body, "v")[0]?.body ?? "");
      if (elements(cell.body, "f").length) throw new Error(`Aba Checklist, linha ${row.attrs.r ?? index + 1}: substitua fórmulas por valores.`);
      cells[col - 1] = (cell.attrs.t === "s" ? shared[Number(raw)] ?? "" : cell.attrs.t === "inlineStr" ? text(cell.body) : cell.attrs.t === "b" ? raw === "1" ? "SIM" : "NAO" : raw).trim();
    }
    return { line: Number(row.attrs.r ?? index + 1), cells };
  });
  const headerIndex = rows.findIndex((row) => Object.values(row.cells).some(Boolean));
  if (headerIndex < 0) throw new Error("Aba Checklist: não há perguntas.");
  const header = rows[headerIndex].cells;
  const indexes = columns.map((name) => {
    const matches = Object.entries(header).filter(([, value]) => normalize(value) === name);
    if (matches.length !== 1) throw new Error(`Aba Checklist, linha ${rows[headerIndex].line}: inclua uma única coluna ${name}.`);
    return Number(matches[0][0]);
  });
  const positions = new Set<number>();
  const questions: (ChecklistQuestion & { order: number })[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const [order, prompt, kind, required] = indexes.map((index) => row.cells[index] ?? "");
    if (![order, prompt, kind, required].some(Boolean)) continue;
    const fail = (message: string): never => { throw new Error(`Aba Checklist, linha ${row.line}: ${message}`); };
    if (!/^\d+$/.test(order) || Number(order) < 1 || Number(order) > 100 || positions.has(Number(order))) fail("ORDEM deve ser um número único entre 1 e 100.");
    if (prompt.length < 2 || prompt.length > 500) fail("PERGUNTA deve ter de 2 a 500 caracteres.");
    const types: Record<string, ChecklistQuestion["type"]> = { ACEITE: "acceptance", FOTO: "photo", TEXTO: "text", SIM_NAO: "yes_no" };
    const type = types[normalize(kind)];
    if (!type) fail("TIPO deve ser aceite, foto, texto ou sim_nao.");
    const flag = normalize(required);
    if (!["SIM", "NAO"].includes(flag)) fail("OBRIGATORIO deve ser SIM ou NAO.");
    positions.add(Number(order)); questions.push({ order: Number(order), prompt, type, required: flag === "SIM" });
    if (questions.length > 100) fail("o limite é de 100 perguntas.");
  }
  if (!questions.length) throw new Error("Aba Checklist: não há perguntas.");
  return questions.sort((a, b) => a.order - b.order).map(({ prompt, type, required }) => ({ prompt, type, required }));
}

export function createChecklistTemplate(): Uint8Array {
  const sheets = [
    { name: "Instrucoes", rows: [["INSTRUCAO"], ["Preencha a aba Checklist e importe o arquivo .xlsx no EO. O título e a descrição são informados no app."], ["ORDEM: número único entre 1 e 100. Máximo de 100 perguntas."], ["PERGUNTA: de 2 a 500 caracteres. Remova as perguntas de exemplo antes de enviar."], ["TIPO: aceite, foto, texto ou sim_nao."], ["OBRIGATORIO: SIM ou NAO. Linhas vazias e colunas sem título são ignoradas."], ["Use apenas valores, sem fórmulas. Revise as perguntas e lojas no app antes do envio."]] },
    { name: "Checklist", rows: [columns, ["1", "Li e compreendi a orientação da operação.", "aceite", "SIM"], ["2", "Fotografe a organização da loja.", "foto", "SIM"], ["3", "Descreva os pontos de atenção.", "texto", "NAO"], ["4", "A loja está pronta para abrir?", "sim_nao", "SIM"]] },
  ];
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, content: string) => { files[name] = strToU8(content); };
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  put("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  put("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  put("xl/workbook.xml", `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  put("xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  put("xl/styles.xml", `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF373B43"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((sheet, i) => {
    const checklist = sheet.name === "Checklist";
    const widths = checklist ? [10, 80, 18, 20] : [110];
    const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    const cols = `<cols>${widths.map((width, c) => `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`;
    const rows = sheet.rows.map((row, r) => `<row r="${r + 1}" ht="${r === 0 ? 28 : checklist ? 42 : 48}" customHeight="1">${row.map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" s="${r === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join("")}</row>`).join("");
    put(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${ns}">${views}<sheetFormatPr defaultRowHeight="20"/>${cols}<sheetData>${rows}</sheetData>${checklist ? `<autoFilter ref="A1:D${sheet.rows.length}"/>` : ""}</worksheet>`);
  });
  return zipSync(files);
}
