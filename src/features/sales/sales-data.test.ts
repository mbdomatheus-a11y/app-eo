import { describe, expect, it } from "vitest";
import {
  parseSalesData,
  selectSalesRows,
  paginateSalesRows,
  salesMetrics,
} from "./sales-data";
import { parseSalesData as parseMobile } from "../../../mobile/src/features/sales-data";

const row = {
  codigo_loja: "1",
  nome_loja: "São Paulo",
  regional: "Regional A",
  departamento: "TOTAL LOJA",
  nivel: "LOJA_TOTAL",
  real: 10,
  meta: 20,
  secao: "",
};
const html = (rows: unknown[]) =>
  `<html><head><title>Vendas &amp; metas</title></head><body><script>let RAW=${JSON.stringify(rows)}, OTHER=[]; throw new Error('não executar');</script></body></html>`;

describe("dados estruturados de vendas sem execução do HTML", () => {
  it("extrai JSON com colchetes, escapes e strings adversariais sem executar código", () => {
    const input = html([
      { ...row, nome_loja: 'Texto "]}\\ com aspas e <img onerror=alert(1)>' },
    ]);
    const result = parseSalesData(input)!;
    expect(result.rows[0].nome_loja).toContain("<img onerror=alert(1)>");
    expect(result.metadata.title).toBe("Vendas & metas");
    expect(result.rows[0].real).toBe(10);
    expect(parseMobile(input)).toEqual(result);
  });

  it("ignora declarações em comentários e strings e rejeita expressões JavaScript", () => {
    const prefix = `<script>/* let RAW=[false]; */ const text='let RAW=[false];'; // let RAW=[false];\n</script>`;
    expect(parseSalesData(prefix + html([row]))?.rows).toHaveLength(1);
    expect(
      parseSalesData(
        `<script>let RAW=[${JSON.stringify(row)}].map(x=>x);</script>`,
      ),
    ).toBeNull();
    expect(
      parseSalesData(
        `<script>let RAW=[{codigo_loja:'1',nivel:'LOJA_TOTAL'}];</script>`,
      ),
    ).toBeNull();
    expect(
      parseSalesData(`<script>let RAW=[{"codigo_loja":"1"};</script>`),
    ).toBeNull();
    expect(parseSalesData("<h1>Relatório estático</h1>")).toBeNull();
  });

  it("valida esquema e remove objetos, arrays, tipos inesperados e chaves desconhecidas", () => {
    const result = parseSalesData(
      html([
        {
          ...row,
          real: { secret: 50 },
          meta: "20",
          itens: null,
          nome_loja: ["nome"],
          extra: "ignorar",
          __proto__: { polluted: true },
        },
        null,
        12,
        { ...row, nivel: "OUTRO" },
      ]),
    )!;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      real: null,
      meta: null,
      itens: null,
      nome_loja: null,
    });
    expect(result.columns).not.toContain("extra");
    expect(result.rows[0]).not.toHaveProperty("polluted");
    expect(
      result.metadata.warnings.some((warning) =>
        warning.includes("3 registro"),
      ),
    ).toBe(true);
    expect(
      result.metadata.warnings.some((warning) => warning.includes("3 campo")),
    ).toBe(true);
    expect(
      parseSalesData(
        `<script>const RAW=[{"codigo_loja":"1","nivel":"LOJA_TOTAL","real":1e999}];</script>`,
      )?.rows[0].real,
    ).toBeNull();
  });

  it("preserva todos os níveis e seleciona apenas lojas por padrão sem misturar subtotais", () => {
    const dataset = parseSalesData(
      html([
        row,
        { ...row, codigo_loja: "2", regional: "Regional B" },
        { ...row, nivel: "DEP_TOTAL", departamento: "LAR" },
        { ...row, nivel: "SEC_TOTAL", departamento: "LAR", secao: "C1" },
        { ...row, nivel: "LMPA" },
      ]),
    )!;
    expect(dataset.rows).toHaveLength(5);
    expect(selectSalesRows(dataset)).toHaveLength(2);
    expect(
      selectSalesRows(dataset, {
        query: "sao",
        stores: ["1"],
        regionals: ["Regional A"],
      }),
    ).toHaveLength(1);
    expect(
      selectSalesRows(dataset, {
        level: "SEC_TOTAL",
        departments: ["LAR"],
        sections: ["C1"],
      }),
    ).toHaveLength(1);
    expect(selectSalesRows(dataset, { level: "" })).toHaveLength(5);
    expect(selectSalesRows(dataset, { query: "inexistente" })).toHaveLength(0);
  });

  it("pagina e normaliza páginas inválidas inclusive em base vazia", () => {
    expect(paginateSalesRows([row, row, row], 2, 2)).toMatchObject({
      rows: [row],
      page: 2,
      pages: 2,
      total: 3,
    });
    expect(paginateSalesRows([], 90, 0)).toMatchObject({
      rows: [],
      page: 1,
      pages: 1,
      total: 0,
    });
    expect(paginateSalesRows([row], NaN, Infinity)).toMatchObject({
      page: 1,
      pageSize: 25,
    });
  });

  it("importa segmentação do JSON SEG_MAP sem executar o script", () => {
    const source =
      html([row]) +
      `<script>const SEG_MAP={"1":{"ESTADO":"São Paulo","CLUSTER VESTUARIO":"C3","CLIMA":"AMENO"}};throw Error("não executar");</script>`;
    const data = parseSalesData(source)!;
    expect(data.rows[0]).toMatchObject({
      uf: "São Paulo",
      cluster: "C3",
      clima: "AMENO",
    });
    expect(
      selectSalesRows(data, { states: ["São Paulo"], clusters: ["C3"] }),
    ).toHaveLength(1);
    expect(selectSalesRows(data, { clusters: ["C1"] })).toHaveLength(0);
    expect(parseMobile(source)).toEqual(data);
  });
  it("calcula percentuais e spread pela razão dos totais, preservando bases ausentes", () => {
    const metrics = salesMetrics({
      real: 120,
      meta: 100,
      real_ly: 100,
      estoque_2026: 110,
      estoque_2025: 100,
    });
    expect(metrics.atingimento).toBeCloseTo(1.2);
    expect(metrics.ly_pct).toBeCloseTo(0.2);
    expect(metrics.spread).toBeCloseTo(0.1);
    expect(salesMetrics({ real: 120, real_ly: 0 }).ly_pct).toBeNull();
    expect(salesMetrics({ real: 120 }).spread).toBeNull();
  });

  // Amostra corporativa nunca integra o repositório. Habilite só com caminho local explícito.
  it.skipIf(!process.env.EO_SALES_SAMPLE_PATH)(
    "valida opcionalmente a amostra local sem expor valores",
    async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(process.env.EO_SALES_SAMPLE_PATH!, "utf8");
      const dataset = parseSalesData(source);
      expect(dataset).not.toBeNull();
      expect(dataset!.rows.length).toBeGreaterThan(0);
      expect(selectSalesRows(dataset!).length).toBeGreaterThan(0);
      expect(parseMobile(source)?.columns).toEqual(dataset!.columns);
    },
  );
});
