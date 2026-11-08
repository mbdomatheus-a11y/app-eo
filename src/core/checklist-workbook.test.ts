import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createChecklistTemplate, parseChecklistWorkbook } from "./checklist-workbook";
import { parseChecklistWorkbook as nativeParse, createChecklistTemplate as nativeTemplate } from "../../mobile/src/features/checklist-workbook";

function edit(change: (xml: string) => string) {
  const files = unzipSync(createChecklistTemplate());
  files["xl/worksheets/sheet2.xml"] = strToU8(change(strFromU8(files["xl/worksheets/sheet2.xml"])));
  return zipSync(files);
}
describe("checklist Excel", () => {
  it("modelo retorna as quatro perguntas com tipo, ordem e obrigatoriedade no web e nativo", () => {
    const questions = parseChecklistWorkbook(createChecklistTemplate());
    expect(questions.map((item) => item.type)).toEqual(["acceptance", "photo", "text", "yes_no"]);
    expect(questions.map((item) => item.required)).toEqual([true, true, false, true]);
    expect(nativeParse(nativeTemplate())).toEqual(questions);
  });
  it("ignora linhas vazias, colunas sem título e preserva a pergunta", () => {
    const bytes = edit((xml) => xml.replace('</sheetData>', '<row r="9"><c r="E9" t="inlineStr"><is><t>ignorar</t></is></c></row><row r="10"/></sheetData>').replace('Li e compreendi', 'Li &amp; compreendi'));
    expect(parseChecklistWorkbook(bytes)).toHaveLength(4);
    expect(parseChecklistWorkbook(bytes)[0].prompt).toContain("Li & compreendi");
  });
  it("resolve aba pelo relacionamento e shared strings, independentemente da posição", () => {
    const files = unzipSync(createChecklistTemplate());
    files["xl/sharedStrings.xml"] = strToU8('<sst><si><t>Li a orientação?</t></si></sst>');
    files["xl/worksheets/sheet2.xml"] = strToU8(strFromU8(files["xl/worksheets/sheet2.xml"]).replace(/<c r="B2"[\s\S]*?<\/c>/, '<c r="B2" t="s"><v>0</v></c>'));
    files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace(/(<sheet name="Instrucoes"[^>]*\/>)(<sheet name="Checklist"[^>]*\/>)/, '$2$1'));
    expect(parseChecklistWorkbook(zipSync(files))[0].prompt).toBe("Li a orientação?");
  });
  it.each([
    ["aceite</t>", "livre</t>", "TIPO"],
    ["NAO</t>", "talvez</t>", "OBRIGATORIO"],
    ["PERGUNTA</t>", "OUTRA</t>", "PERGUNTA"],
    [">2</t>", ">1</t>", "ORDEM"],
  ])("rejeita conteúdo inválido com aba e linha (%s)", (from, to, error) => {
    const bytes = edit((xml) => xml.replace(from, to));
    expect(() => parseChecklistWorkbook(bytes)).toThrow(new RegExp(`Aba Checklist, linha .*${error}`));
    expect(() => nativeParse(bytes)).toThrow(new RegExp(error));
  });
  it("rejeita arquivo corrompido e fórmulas", () => {
    expect(() => parseChecklistWorkbook(new Uint8Array([1, 2, 3]))).toThrow(/inválida/);
    expect(() => parseChecklistWorkbook(edit((xml) => xml.replace('aceite</t>', 'aceite</t><f>1+1</f>')))).toThrow(/linha 2.*fórmulas/);
    expect(() => parseChecklistWorkbook(edit((xml) => xml.replace('</row>', '')))).toThrow(/Planilha inválida/);
  });
});

