import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, zipSync } from "fflate";
import { prepareSalesPackage } from "./sales-package";

describe("pacotes estáticos de relatórios de vendas", () => {
  it("incorpora CSS relativo, importação, imagem e fonte preservando dados", () => {
    const input = zipSync({
      "relatorio/index.html": strToU8('<!doctype html><html><head><link rel="stylesheet" href="css/main.css"></head><body><h1>Vendas São Paulo</h1><img src="img/loja.png"><table><tr><td>123,45</td></tr></table><script src="js/filtros.js"></script></body></html>'),
      "relatorio/css/main.css": strToU8('@import url("theme.css"); body { background: url("../img/loja.png"); }'),
      "relatorio/css/theme.css": strToU8('@font-face { font-family: EO; src: url("../fonts/eo.woff2"); } h1{color:blue}'),
      "relatorio/img/loja.png": new Uint8Array([137, 80, 78, 71]),
      "relatorio/fonts/eo.woff2": new Uint8Array([119, 79, 70, 50]),
      "relatorio/js/filtros.js": strToU8("window.test = true"),
    });
    const result = prepareSalesPackage("vendas.zip", input);
    expect(result.html).toContain("Vendas São Paulo");
    expect(result.html).toContain("123,45");
    expect(result.html).toContain("data:image/png;base64,iVBORw==");
    expect(result.html).toContain("data:font/woff2;base64,d09GMg==");
    expect(result.html).toContain("h1{color:blue}");
    expect(result.html).not.toContain("@import");
    expect(result.html).not.toContain('<link rel="stylesheet"');
    expect(strFromU8(result.bytes)).toBe(result.html);
    expect(result.hasScripts).toBe(true);
    expect(result.fileCount).toBe(6);
  });

  it("rejeita caminhos que saem do pacote e referências ausentes", () => {
    expect(() => prepareSalesPackage("a.zip", zipSync({ "../index.html": strToU8("Vendas") }))).toThrow(/caminho/);
    expect(() => prepareSalesPackage("a.zip", zipSync({ "index.html": strToU8('<img src="../privado.png">') }))).toThrow(/sai da pasta/);
    expect(() => prepareSalesPackage("a.zip", zipSync({ "index.html": strToU8('<img src="faltando.png">') }))).toThrow(/ausente/);
  });

  it("exige entrada principal quando há vários HTMLs", () => {
    expect(() => prepareSalesPackage("a.zip", zipSync({ "semana.html": strToU8("Semana"), "mes.html": strToU8("Mês") }))).toThrow(/index.html/);
  });

  it("rejeita ZIP pequeno cujo conteúdo expandido excede 10 MB", () => {
    const input = zipSync({ "index.html": new Uint8Array(10 * 1024 * 1024 + 1).fill(65) });
    expect(input.length).toBeLessThan(100_000);
    expect(() => prepareSalesPackage("a.zip", input)).toThrow(/descompactados/);
  });

  it("rejeita mais de 100 entradas e importações de CSS circulares", () => {
    const entries = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`${index}.html`, strToU8("Vendas")]));
    expect(() => prepareSalesPackage("a.zip", zipSync(entries))).toThrow(/100 arquivos/);
    expect(() => prepareSalesPackage("a.zip", zipSync({ "index.html": strToU8('<link rel="stylesheet" href="a.css">'), "a.css": strToU8('@import "b.css";'), "b.css": strToU8('@import "a.css";') }))).toThrow(/circulares/);
  });

  it("preserva HTML único e não incorpora dependências externas", () => {
    const html = '<h1>Mês de ação</h1><img src="https://example.test/loja.png">';
    expect(prepareSalesPackage("mes.html", strToU8(html)).html).toBe(html);
    const zipped = prepareSalesPackage("mes.zip", zipSync({ "index.html": strToU8('<link rel="stylesheet" href="https://example.test/style.css"><img src="https://example.test/loja.png">') }));
    expect(zipped.html).not.toContain("https://");
  });
});
