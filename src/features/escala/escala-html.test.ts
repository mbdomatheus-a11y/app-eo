import { describe, expect, it } from "vitest";
import { chaveArmazenamento, filtrarPorPeriodo, lotesPorLoja, prepararEscalaHtml, resumoDoEstado, segundaDaSemana, STORE_DATA_PLACEHOLDER } from "./escala-html";

const html = `<!doctype html><html><head></head><body><script>
var X = 1;
var STORE_DATA = {"0006 - Praca Da Arvore":[[933800,"Ana Teste","Fiscal","FISCAL",440,""],[1,"B","Caixa","CAIXA",220,""]],"0100 - Santos":[[555,"Carla Souza","Vendedor","LAR",440,"FERIAS"]]};
var STORE_KEYS = Object.keys(STORE_DATA);
</script></body></html>`;

describe("escala no portal", () => {
  it("retira a base embutida e extrai colaboradores válidos", () => {
    const r = prepararEscalaHtml(html);
    expect(r.html).toContain(STORE_DATA_PLACEHOLDER);
    expect(r.html).not.toContain("Ana Teste");
    expect(r.lojas).toBe(2);
    expect(r.linhas.map((l) => l.chapa)).toEqual(["933800", "555"]);
    expect(r.linhas[1]).toMatchObject({ loja_codigo: "0100", situacao: "FERIAS", jornada_diaria_min: 440 });
  });
  it("aceita HTML já preparado e recusa arquivo sem base", () => {
    expect(prepararEscalaHtml(prepararEscalaHtml(html).html).linhas).toEqual([]);
    expect(() => prepararEscalaHtml("<html><body>x</body></html>")).toThrow();
  });
  it("usa a chave de armazenamento declarada no HTML", () => {
    expect(chaveArmazenamento('var STORAGE_KEY = "escalaColaboradores.v2";')).toBe("escalaColaboradores.v2");
    expect(chaveArmazenamento("sem chave")).toBe("escalaColaboradores.v1");
  });
  it("não divide loja entre lotes", () => {
    const linhas = [..."aaab"].map((c, i) => ({ loja_codigo: c, chapa: String(i), nome: "Nome", cargo: null, departamento: null, jornada_diaria_min: null, situacao: null }));
    expect(lotesPorLoja(linhas, 2).map((l) => l.length)).toEqual([3, 1]);
  });
  it("normaliza semana e período", () => {
    expect(segundaDaSemana("2026-11-15")).toBe("2026-11-09");
    expect(segundaDaSemana("2026-11-16")).toBe("2026-11-16");
    expect(resumoDoEstado({ settings: { semanaInicio: "2026-11-18", modeloEscala: "5X2", statusEscala: "finalizada" } })).toEqual({ semana: "2026-11-16", modelo: "5X2", status: "finalizada" });
    const itens = [{ semana_inicio: "2026-11-16" }, { semana_inicio: "2026-10-05" }, { semana_inicio: "2025-12-29" }];
    const hoje = new Date("2026-11-11T12:00:00Z");
    expect(filtrarPorPeriodo(itens, "week", hoje)).toHaveLength(1);
    expect(filtrarPorPeriodo(itens, "month", hoje)).toHaveLength(1);
    expect(filtrarPorPeriodo(itens, "year", hoje)).toHaveLength(2);
  });
});
