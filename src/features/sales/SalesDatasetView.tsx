import { salesMetrics, percent } from "./sales-data";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { rpc } from "../../services/supabase";
import type { SalesReport } from "./sales-html";

type Row = Record<string, string | number | null>;
type Data = {
  items: Row[];
  total: number;
  regions: string[];
  stores: { code: string; name: string }[];
  departments: string[];
  totals: Record<string, number | null>;
  status: string;
  states?: string[];
  clusters?: string[];
};
const money = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })
    : "—";
const levels = {
  LOJA_TOTAL: "Por loja",
  DEP_TOTAL: "Departamentos",
  SEC_TOTAL: "Seções",
  LMPA: "Linhas de produto",
};
const columns: [string, string][] = [
  ["codigo_loja", "COD"],
  ["nome_loja", "Loja"],
  ["regional", "Regional"],
  ["departamento", "Departamento"],
  ["nome_secao", "Seção"],
  ["lmpa", "Linha"],
  ["real", "Venda"],
  ["meta", "Meta"],
  ["real_ly", "Ano anterior"],
  ["estoque_d1", "Estoque"],
  ["itens", "Itens"],
  ["secao", "Código seção"],
  ["estoque_2025", "Estoque 2025"],
  ["estoque_2026", "Estoque 2026"],
  ["estoque_d364", "Estoque D-364"],
  ["ly_estoque_atual", "Estoque atual vs. LY (%)"],
  ["estoque_vermelho_d1", "Estoque vermelho D-1"],
  ["estoque_branco_d1", "Estoque branco D-1"],
  ["estoque_transito", "Estoque em trânsito"],
  ["estoque_esperado_alocado", "Estoque esperado alocado"],
  ["cupons_2026", "Cupons 2026"],
  ["cupons_2025", "Cupons 2025"],
  ["itens_ly", "Itens ano anterior"],
  ["venda_custo", "Venda a custo"],
  ["venda_custo_ly", "Venda a custo ano anterior"],
];

export function SalesDatasetView({ report }: { report: SalesReport }) {
  const [data, setData] = useState<Data | null>(null);
  const [uf, setUf] = useState("");
  const [cluster, setCluster] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [level, setLevel] = useState("LOJA_TOTAL");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [store, setStore] = useState("");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("real");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [allColumns, setAllColumns] = useState(false);
  const [filters, setFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void rpc<Data>("eo_sales_dataset_page_v2", {
        p_id: report.id,
        p_uf: uf,
        p_cluster: cluster,
        p_stores: compare,
        p_level: level,
        p_query: query,
        p_region: region,
        p_store: store,
        p_department: department,
        p_sort: sort,
        p_desc: descending,
        p_limit: 50,
        p_offset: page * 50,
      })
        .then((value) => {
          if (current === generation.current) setData(value);
        })
        .catch((cause: unknown) => {
          if (current === generation.current)
            setError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar os dados.",
            );
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    }, 180);
    return () => {
      generation.current++;
      window.clearTimeout(timer);
    };
  }, [
    report.id,
    level,
    query,
    region,
    store,
    department,
    sort,
    descending,
    page,
    retry,
    uf,
    cluster,
    compare,
  ]);
  const filtered = Boolean(
    region || store || department || query || uf || cluster || compare.length,
  );
  const metrics = salesMetrics(data?.totals ?? {});
  const visibleColumns = columns
    .filter((_, index) => allColumns || index < 11)
    .filter(
      ([key]) =>
        level !== "LOJA_TOTAL" ||
        !["departamento", "nome_secao", "lmpa"].includes(key),
    )
    .filter(
      ([key]) => level !== "DEP_TOTAL" || !["nome_secao", "lmpa"].includes(key),
    )
    .filter(([key]) => level !== "SEC_TOTAL" || key !== "lmpa");
  return (
    <div className="sales-dataset" aria-busy={loading}>
      <div className="sales-toolbar">
        <div className="sales-periods">
          {Object.entries(levels).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={level === key ? "is-active" : ""}
              aria-pressed={level === key}
              onClick={() => {
                setLevel(key);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="secondary"
          type="button"
          aria-expanded={filters}
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={16} /> Filtros{filtered ? " ativos" : ""}
        </button>
      </div>
      <label className="sales-search">
        <input
          type="search"
          placeholder="Buscar código, loja, seção ou produto"
          aria-label="Buscar nos dados de vendas"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      {filters && (
        <div className="sales-data-filters">
          <label>
            Regional
            <select
              value={region}
              onChange={(event) => {
                setRegion(event.target.value);
                setStore("");
                setDepartment("");
                setPage(0);
              }}
            >
              <option value="">Todas as regionais</option>
              {data?.regions.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Loja
            <select
              value={store}
              onChange={(event) => {
                setStore(event.target.value);
                setDepartment("");
                setPage(0);
              }}
            >
              <option value="">Todas as lojas elegíveis</option>
              {data?.stores.map((value) => (
                <option key={value.code} value={value.code}>
                  {value.code} · {value.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Departamento
            <select
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos os departamentos</option>
              {data?.departments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setRegion("");
              setStore("");
              setDepartment("");
              setQuery("");
              setPage(0);
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
      {filters && (
        <div className="sales-data-filters">
          <label>
            Estado / UF
            <select
              value={uf}
              onChange={(e) => {
                setUf(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              {data?.states?.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Cluster vestuário
            <select
              value={cluster}
              onChange={(e) => {
                setCluster(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              {data?.clusters?.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Comparar lojas
            <select
              multiple
              value={compare}
              onChange={(e) => {
                setCompare(
                  Array.from(e.target.selectedOptions, (x) => x.value),
                );
                setStore("");
                setLevel("LOJA_TOTAL");
                setPage(0);
              }}
            >
              {data?.stores.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.code} · {x.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setUf("");
              setCluster("");
              setCompare([]);
              setPage(0);
            }}
          >
            Limpar segmentação e comparação
          </button>
        </div>
      )}
      <label className="sales-checkbox">
        <input
          type="checkbox"
          checked={allColumns}
          onChange={(event) => setAllColumns(event.target.checked)}
        />
        Mostrar todos os indicadores
      </label>
      <div className="sales-kpis">
        {[
          ["Venda realizada", money(data?.totals.real)],
          ["Meta", money(data?.totals.meta)],
          ["Ano anterior", money(data?.totals.real_ly)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="sales-kpis">
        {[
          ["Atingimento", percent(metrics.atingimento)],
          ["Vendas vs. LY", percent(metrics.ly_pct)],
          ["Estoque médio vs. LY", percent(metrics.ly_estoque)],
          [
            "Spread (p.p.)",
            metrics.spread === null
              ? "Não informado"
              : (metrics.spread * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                }) + " p.p.",
          ],
          ["Estoque atual vs. LY", percent(metrics.ly_estoque_atual)],
          ["Saldo vermelho", percent(metrics.saldo_estoque)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="sales-preview-note">
        Totais do nível e dos filtros selecionados. Os subtotais de loja,
        departamento, seção e linha nunca são somados entre si.
      </p>
      {error ? (
        <div role="alert" className="sales-feedback sales-error">
          {error}{" "}
          <button type="button" onClick={() => setRetry(retry + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="sales-data-table">
            <table>
              <thead>
                <tr>
                  {[
                    ["atingimento", "Atingimento"],
                    ["ly_pct", "Vendas LY %"],
                    ["spread", "Spread p.p."],
                  ].map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                  {visibleColumns.map(([key, label]) => (
                    <th key={key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort(key);
                          setDescending(sort === key ? !descending : false);
                          setPage(0);
                        }}
                      >
                        {label}
                        {sort === key && (
                          <ArrowDownWideNarrow
                            size={13}
                            style={{
                              transform: descending
                                ? undefined
                                : "rotate(180deg)",
                            }}
                          />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((row, index) => (
                  <tr key={`${page}-${index}`}>
                    {[
                      ["atingimento", "Atingimento"],
                      ["ly_pct", "Vendas LY %"],
                      ["spread", "Spread"],
                    ].map(([key]) => {
                      const value =
                        salesMetrics(row)[
                          key as keyof ReturnType<typeof salesMetrics>
                        ];
                      return (
                        <td
                          key={key}
                          style={{
                            color:
                              value === null
                                ? undefined
                                : key === "atingimento"
                                  ? value >= 1
                                    ? "#28784a"
                                    : "#b33838"
                                  : value >= 0
                                    ? "#28784a"
                                    : "#b33838",
                            fontWeight: 700,
                          }}
                        >
                          {key === "spread"
                            ? value === null
                              ? "Não informado"
                              : (value * 100).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 2,
                                }) + " p.p."
                            : percent(value)}
                        </td>
                      );
                    })}
                    {visibleColumns.map(([key]) => (
                      <td key={key}>
                        {key === "ly_estoque_atual"
                          ? percent(row[key])
                          : [
                                "real",
                                "meta",
                                "real_ly",
                                "venda_custo",
                                "venda_custo_ly",
                              ].includes(key)
                            ? money(row[key])
                            : typeof row[key] === "number"
                              ? row[key].toLocaleString("pt-BR", {
                                  maximumFractionDigits: 2,
                                })
                              : String(row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <p role="status">Carregando dados…</p>}
          {!loading && !data?.total && (
            <p>Nenhum registro para os filtros selecionados.</p>
          )}
          <div className="sales-actions">
            <span>
              {data?.total.toLocaleString("pt-BR") ?? 0} registros · Página{" "}
              {page + 1} de {Math.max(1, Math.ceil((data?.total ?? 0) / 50))}
            </span>
            <button
              className="secondary"
              type="button"
              disabled={loading || page === 0}
              aria-label="Página anterior"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="secondary"
              type="button"
              disabled={loading || (page + 1) * 50 >= (data?.total ?? 0)}
              aria-label="Próxima página"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
