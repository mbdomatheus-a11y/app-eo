import { salesMetrics, percent } from "./sales-data";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { rpc } from "../services/supabase";
import { d } from "../design";
import { Badge, Button, C, Card, Choice, Field, Heading, Page, s } from "../ui";
import { periodLabels, type SalesReport } from "./sales-html";

type SalesDataRow = Record<string, string | number | null>;
type DatasetPage = {
  items: SalesDataRow[];
  total: number;
  regions: string[];
  stores: { code: string; name: string }[];
  departments: string[];
  totals: Record<string, number | null>;
  status?: string;
  states?: string[];
  clusters?: string[];
};
type Filters = {
  level: string;
  query: string;
  region: string;
  store: string;
  department: string;
  sort: string;
  desc: boolean;
  page: number;
};
const initialFilters: Filters = {
  level: "LOJA_TOTAL",
  query: "",
  region: "",
  store: "",
  department: "",
  sort: "real",
  desc: true,
  page: 0,
};
const levels = [
  { value: "LOJA_TOTAL", label: "Lojas" },
  { value: "DEP_TOTAL", label: "Departamentos" },
  { value: "SEC_TOTAL", label: "Seções" },
  { value: "LMPA", label: "LMPA" },
];
const sorts = [
  { value: "real", label: "Realizado" },
  { value: "meta", label: "Meta" },
  { value: "real_ly", label: "Ano anterior" },
  { value: "codigo_loja", label: "Código da loja" },
  { value: "nome_loja", label: "Nome da loja" },
  { value: "regional", label: "Regional" },
  { value: "departamento", label: "Departamento" },
  { value: "secao", label: "Seção" },
  { value: "lmpa", label: "LMPA" },
  { value: "estoque_d1", label: "Estoque D-1" },
  { value: "itens", label: "Itens" },
];
const PAGE_SIZE = 30;
const moneyFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const indicators = [
  { key: "codigo_loja", label: "Código da loja", kind: "text" },
  { key: "nome_loja", label: "Nome da loja", kind: "text" },
  { key: "regional", label: "Regional", kind: "text" },
  { key: "departamento", label: "Departamento", kind: "text" },
  { key: "secao", label: "Código da seção", kind: "text" },
  { key: "nome_secao", label: "Nome da seção", kind: "text" },
  { key: "lmpa", label: "LMPA", kind: "text" },
  { key: "nivel", label: "Nível de detalhe", kind: "text" },
  { key: "real", label: "Realizado", kind: "money" },
  { key: "meta", label: "Meta", kind: "money" },
  { key: "real_ly", label: "Realizado no ano anterior", kind: "money" },
  { key: "estoque_2025", label: "Estoque de 2025", kind: "number" },
  { key: "estoque_2026", label: "Estoque de 2026", kind: "number" },
  { key: "estoque_d1", label: "Estoque D-1", kind: "number" },
  { key: "estoque_d364", label: "Estoque D-364", kind: "number" },
  {
    key: "ly_estoque_atual",
    label: "Estoque atual vs. LY (%)",
    kind: "percent",
  },
  { key: "estoque_vermelho_d1", label: "Estoque vermelho D-1", kind: "number" },
  { key: "estoque_branco_d1", label: "Estoque branco D-1", kind: "number" },
  { key: "estoque_transito", label: "Estoque em trânsito", kind: "number" },
  {
    key: "estoque_esperado_alocado",
    label: "Estoque esperado alocado",
    kind: "number",
  },
  { key: "cupons_2026", label: "Cupons de 2026", kind: "number" },
  { key: "cupons_2025", label: "Cupons de 2025", kind: "number" },
  { key: "itens", label: "Itens", kind: "number" },
  { key: "itens_ly", label: "Itens no ano anterior", kind: "number" },
  { key: "venda_custo", label: "Venda a custo", kind: "money" },
  {
    key: "venda_custo_ly",
    label: "Venda a custo no ano anterior",
    kind: "money",
  },
] as const;
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function money(value: unknown) {
  const parsed = numeric(value);
  return parsed === null ? "Não informado" : moneyFormat.format(parsed);
}
function quantity(value: unknown) {
  const parsed = numeric(value);
  return parsed === null ? "Não informado" : numberFormat.format(parsed);
}
function comparison(real: unknown, baseline: unknown, growth = false) {
  const a = numeric(real),
    b = numeric(baseline);
  if (a === null || b === null || b <= 0) return "Sem base de comparação";
  const percent = (a / b - (growth ? 1 : 0)) * 100;
  return `${growth && percent > 0 ? "+" : ""}${numberFormat.format(percent)}%${growth ? " vs. ano anterior" : " da meta"}`;
}

function IndicatorDetails({ row }: { row: SalesDataRow }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Button
        title={open ? "Recolher indicadores" : "Todos os indicadores"}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <View style={styles.indicators}>
          {indicators.map((indicator) => {
            const value = row[indicator.key];
            const label =
              value === null || value === undefined || value === ""
                ? "Não informado"
                : indicator.kind === "percent"
                  ? percent(row[indicator.key])
                  : indicator.kind === "money"
                    ? money(value)
                    : indicator.kind === "number"
                      ? quantity(value)
                      : indicator.key === "nivel"
                        ? (levels.find((level) => level.value === value)
                            ?.label ?? String(value))
                        : String(value);
            return (
              <View key={indicator.key} style={styles.indicator}>
                <Text style={s.label}>{indicator.label}</Text>
                <Text selectable style={s.small}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = options.filter((option) =>
    option.label
      .toLocaleLowerCase("pt-BR")
      .includes(query.trim().toLocaleLowerCase("pt-BR")),
  );
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 8) - 1),
  );
  const selected =
    options.find((option) => option.value === value)?.label || value || "Todos";
  return (
    <View style={styles.stack}>
      <Button
        title={`${label}: ${selected} ${open ? "▴" : "▾"}`}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <View style={styles.options}>
          <Field
            label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setPage(0);
            }}
            placeholder="Digite para encontrar"
          />
          <Choice
            label="Todos"
            selected={!value}
            onPress={() => {
              onChange("");
              setOpen(false);
            }}
          />
          {filtered.slice(current * 8, current * 8 + 8).map((option) => (
            <Choice
              key={option.value}
              label={option.label}
              selected={value === option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
          <Text style={s.small}>
            {filtered.length
              ? `${current * 8 + 1} a ${Math.min(current * 8 + 8, filtered.length)} de ${filtered.length}`
              : "Nenhuma opção encontrada."}
          </Text>
          {filtered.length > 8 && (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  title="Anterior"
                  secondary
                  disabled={!current}
                  onPress={() => setPage(current - 1)}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  title="Próxima"
                  secondary
                  disabled={(current + 1) * 8 >= filtered.length}
                  onPress={() => setPage(current + 1)}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function SalesDatasetScreen({
  report,
  onBack,
}: {
  report: SalesReport;
  onBack: () => void;
}) {
  const [uf, setUf] = useState("");
  const [cluster, setCluster] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [expanded, setExpanded] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [data, setData] = useState<DatasetPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  function change(values: Partial<Filters>) {
    setFilters((previous) => ({ ...previous, ...values, page: 0 }));
  }
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        void rpc<DatasetPage>("eo_sales_dataset_page_v2", {
          p_id: report.id,
          p_uf: uf,
          p_cluster: cluster,
          p_stores: compare,
          p_level: filters.level,
          p_query: filters.query.trim(),
          p_region: filters.region,
          p_store: filters.store,
          p_department: filters.department,
          p_sort: filters.sort,
          p_desc: filters.desc,
          p_limit: PAGE_SIZE,
          p_offset: filters.page * PAGE_SIZE,
        })
          .then((result) => {
            if (generation.current !== current) return;
            if (!result || !Array.isArray(result.items) || !result.totals)
              throw new Error(
                "O relatório retornou dados incompletos. Tente novamente.",
              );
            setData(result);
          })
          .catch((cause: unknown) => {
            if (generation.current === current)
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível carregar os dados do relatório.",
              );
          })
          .finally(() => {
            if (generation.current === current) setLoading(false);
          });
      },
      filters.query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [report.id, filters, retry, uf, cluster, compare]);
  const total = data?.total ?? 0;
  const activeCount =
    [filters.region, filters.store, filters.department].filter(Boolean).length +
    (filters.level !== "LOJA_TOTAL" ? 1 : 0);
  const levelLabel =
    levels.find((level) => level.value === filters.level)?.label ??
    filters.level;
  const date = new Date(report.published_at);
  return (
    <View style={s.screen}>
      <View style={s.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar aos relatórios"
          onPress={onBack}
          style={s.back}
        >
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <View style={s.topText}>
          <Text style={s.topEyebrow}>RESULTADOS DE VENDAS</Text>
          <Text style={s.topTitle}>{periodLabels[report.period]}</Text>
        </View>
      </View>
      <Page>
        <Heading
          eyebrow="Relatório de vendas"
          title={report.title}
          detail={
            Number.isNaN(date.getTime())
              ? undefined
              : `Publicado em ${date.toLocaleDateString("pt-BR")}`
          }
        />
        <Field
          label="Buscar no relatório"
          value={filters.query}
          onChangeText={(query) => change({ query })}
          placeholder="Loja, departamento, seção ou LMPA"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Button
          title={`${expanded ? "Recolher" : "Abrir"} filtros${activeCount ? ` · ${activeCount} ativos` : ""}`}
          secondary
          onPress={() => setExpanded(!expanded)}
        />
        {expanded && (
          <Card>
            <Text style={s.strong}>Nível de detalhe</Text>
            <View style={styles.wrap}>
              {levels.map((level) => (
                <Choice
                  key={level.value}
                  label={level.label}
                  selected={filters.level === level.value}
                  onPress={() => change({ level: level.value })}
                />
              ))}
            </View>
            <Text style={d.sectionNote}>
              Cada consulta usa um único nível para evitar somar totais e
              detalhes juntos.
            </Text>
            <FilterSelect
              label="Regional"
              value={filters.region}
              options={(data?.regions ?? []).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(region) => change({ region, store: "" })}
            />
            <FilterSelect
              label="Loja"
              value={filters.store}
              options={(data?.stores ?? []).map((store) => ({
                value: store.code,
                label: `${store.code} · ${store.name}`,
              }))}
              onChange={(store) => change({ store })}
            />
            <FilterSelect
              label="Departamento"
              value={filters.department}
              options={(data?.departments ?? []).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(department) => change({ department })}
            />
            <FilterSelect
              label="Estado / UF"
              value={uf}
              options={(data?.states ?? []).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => {
                setUf(value);
                change({});
              }}
            />
            <FilterSelect
              label="Cluster vestuário"
              value={cluster}
              options={(data?.clusters ?? []).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => {
                setCluster(value);
                change({});
              }}
            />
            <FilterSelect
              label="Adicionar loja à comparação"
              value=""
              options={(data?.stores ?? []).map((x) => ({
                value: x.code,
                label: x.code + " · " + x.name,
              }))}
              onChange={(value) => {
                if (value)
                  setCompare((old) => Array.from(new Set([...old, value])));
                change({ store: "", level: "LOJA_TOTAL" });
              }}
            />
            {!!compare.length && (
              <Button
                title={`Limpar comparação: ${compare.join(", ")}`}
                secondary
                onPress={() => {
                  setCompare([]);
                  change({});
                }}
              />
            )}
            <Button
              title="Limpar filtros e busca"
              secondary
              onPress={() => {
                setFilters({ ...initialFilters });
                setUf("");
                setCluster("");
                setCompare([]);
              }}
            />
          </Card>
        )}
        {loading ? (
          <Card>
            <ActivityIndicator color={C.dark} />
            <Text accessibilityLiveRegion="polite" style={s.small}>
              Carregando resultados…
            </Text>
          </Card>
        ) : error ? (
          <Card>
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
            <Button
              title="Tentar novamente"
              onPress={() => setRetry((value) => value + 1)}
            />
          </Card>
        ) : (
          data && (
            <>
              <View style={d.summary}>
                <View style={d.summaryTop}>
                  <Text style={d.summaryEyebrow}>Realizado</Text>
                  <Badge>{levelLabel}</Badge>
                </View>
                <Text
                  style={styles.heroValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {money(data.totals.real)}
                </Text>
                <Text style={d.summaryCaption}>
                  {comparison(data.totals.real, data.totals.meta)}
                </Text>
                <View style={d.summaryStats}>
                  <View style={d.stat}>
                    <Text style={d.statLabel}>Meta</Text>
                    <Text style={styles.summaryAmount}>
                      {money(data.totals.meta)}
                    </Text>
                  </View>
                  <View style={d.stat}>
                    <Text style={d.statLabel}>Ano anterior</Text>
                    <Text style={styles.summaryAmount}>
                      {money(data.totals.real_ly)}
                    </Text>
                  </View>
                </View>
                <Text style={d.summaryCaption}>
                  {comparison(data.totals.real, data.totals.real_ly, true)}
                </Text>
              </View>
              <Card>
                <Heading title="Percentuais e spread" />
                {[
                  ["Atingimento", salesMetrics(data.totals).atingimento],
                  ["Vendas vs. LY", salesMetrics(data.totals).ly_pct],
                  [
                    "Estoque médio vs. LY",
                    salesMetrics(data.totals).ly_estoque,
                  ],
                  [
                    "Estoque atual vs. LY",
                    salesMetrics(data.totals).ly_estoque_atual,
                  ],
                ].map(([label, value]) => (
                  <Text key={String(label)} style={s.body}>
                    {label}: {percent(value)}
                  </Text>
                ))}
                <Text style={s.strong}>
                  Spread:{" "}
                  {salesMetrics(data.totals).spread === null
                    ? "Não informado"
                    : (salesMetrics(data.totals).spread! * 100).toLocaleString(
                        "pt-BR",
                        { maximumFractionDigits: 2 },
                      ) + " p.p."}
                </Text>
              </Card>
              <Text style={d.sectionNote}>
                Indicadores calculados no servidor para todo o resultado
                filtrado, incluindo as outras páginas.
              </Text>
              {data.status &&
                !["ready", "complete", "completed", "published"].includes(
                  data.status.toLowerCase(),
                ) && (
                  <Card>
                    <Text style={s.small}>
                      Situação dos dados: {data.status}
                    </Text>
                    <Button
                      title="Atualizar dados"
                      secondary
                      onPress={() => setRetry((value) => value + 1)}
                    />
                  </Card>
                )}
              <View style={styles.section}>
                <Text style={s.sectionTitle}>{levelLabel}</Text>
                <Badge>{total} registros</Badge>
              </View>
              <Button
                title={`Ordenar: ${sorts.find((sort) => sort.value === filters.sort)?.label ?? filters.sort} · ${filters.desc ? "maior primeiro" : "menor primeiro"}`}
                secondary
                onPress={() => setOrderOpen(!orderOpen)}
              />
              {orderOpen && (
                <Card>
                  <Text style={s.strong}>Coluna de ordenação</Text>
                  <View style={styles.wrap}>
                    {sorts.map((sort) => (
                      <Choice
                        key={sort.value}
                        label={sort.label}
                        selected={filters.sort === sort.value}
                        onPress={() => change({ sort: sort.value })}
                      />
                    ))}
                  </View>
                  <View style={styles.wrap}>
                    <Choice
                      label="Maior para menor"
                      selected={filters.desc}
                      onPress={() => change({ desc: true })}
                    />
                    <Choice
                      label="Menor para maior"
                      selected={!filters.desc}
                      onPress={() => change({ desc: false })}
                    />
                  </View>
                </Card>
              )}
              {!data.items.length && (
                <Card>
                  <Text style={s.strong}>Nenhum resultado</Text>
                  <Text style={s.small}>
                    Ajuste a busca ou os filtros para consultar outros
                    registros.
                  </Text>
                  {filters.page > 0 && (
                    <Button
                      title="Voltar à primeira página"
                      secondary
                      onPress={() => change({})}
                    />
                  )}
                </Card>
              )}
              {data.items.map((row, index) => (
                <Card key={`${filters.page}-${index}`}>
                  <Text style={s.eyebrow}>
                    {[row.regional, row.codigo_loja]
                      .filter((value) => value !== null && value !== "")
                      .join(" · ")}
                  </Text>
                  <Text style={s.strong}>
                    {String(
                      row.nome_loja || row.codigo_loja || "Loja não informada",
                    )}
                  </Text>
                  {filters.level !== "LOJA_TOTAL" && (
                    <Text style={s.small}>
                      {[
                        row.departamento,
                        filters.level !== "DEP_TOTAL" && row.secao,
                        filters.level !== "DEP_TOTAL" && row.nome_secao,
                        filters.level === "LMPA" && row.lmpa,
                      ]
                        .filter(Boolean)
                        .join(" · ") || levelLabel}
                    </Text>
                  )}
                  <View style={styles.divider} />
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={s.label}>Realizado</Text>
                      <Text style={styles.amount}>{money(row.real)}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={s.label}>Meta</Text>
                      <Text style={styles.amount}>{money(row.meta)}</Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={s.label}>Ano anterior</Text>
                      <Text style={styles.amount}>{money(row.real_ly)}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={s.label}>Atingimento</Text>
                      <Text style={s.small}>
                        {comparison(row.real, row.meta)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.small}>
                    {comparison(row.real, row.real_ly, true)}
                  </Text>
                  {((row.estoque_d1 !== null && row.estoque_d1 !== undefined) ||
                    (row.itens !== null && row.itens !== undefined)) && (
                    <Text style={d.sectionNote}>
                      Estoque D-1: {quantity(row.estoque_d1)} · Itens:{" "}
                      {quantity(row.itens)}
                    </Text>
                  )}
                  <Text
                    style={{
                      color:
                        (salesMetrics(row).spread ?? 0) >= 0 ? C.green : C.red,
                    }}
                  >
                    Spread:{" "}
                    {salesMetrics(row).spread === null
                      ? "Não informado"
                      : (salesMetrics(row).spread! * 100).toLocaleString(
                          "pt-BR",
                          { maximumFractionDigits: 2 },
                        ) + " p.p."}
                  </Text>
                  <IndicatorDetails row={row} />
                </Card>
              ))}
              {total > 0 && (
                <Text accessibilityLiveRegion="polite" style={s.small}>
                  {filters.page * PAGE_SIZE + 1} a{" "}
                  {Math.min(
                    filters.page * PAGE_SIZE + data.items.length,
                    total,
                  )}{" "}
                  de {total} registros · Página {filters.page + 1} de{" "}
                  {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </Text>
              )}
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Anterior"
                    secondary
                    disabled={!filters.page}
                    onPress={() =>
                      setFilters((previous) => ({
                        ...previous,
                        page: Math.max(0, previous.page - 1),
                      }))
                    }
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title="Próxima"
                    secondary
                    disabled={(filters.page + 1) * PAGE_SIZE >= total}
                    onPress={() =>
                      setFilters((previous) => ({
                        ...previous,
                        page: previous.page + 1,
                      }))
                    }
                  />
                </View>
              </View>
            </>
          )
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  options: { gap: 8, padding: 10, borderRadius: 14, backgroundColor: C.soft },
  row: { flexDirection: "row", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flex: { flex: 1, minWidth: 0, gap: 5 },
  section: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  error: { color: C.red, fontSize: 14, lineHeight: 21 },
  heroValue: {
    color: C.paper,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  summaryAmount: { color: C.paper, fontSize: 18, fontWeight: "700" },
  amount: { color: C.ink, fontSize: 16, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  indicators: {
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  indicator: { gap: 4 },
});
