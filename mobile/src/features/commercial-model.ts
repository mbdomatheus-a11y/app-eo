export const sizes = [
  "PP",
  "P",
  "M",
  "G",
  "GG",
  "XG",
  "EXG",
  ...Array.from({ length: 21 }, (_, i) => String(i + 34)),
];

export const fields = [
  ["category", "Departamento"],
  ["product", "Produto"],
  ["color", "Cor"],
  ["gender", "Público"],
  ["size", "Tamanho procurado"],
  ["fabric", "Tecido ou composição"],
  ["demand", "Motivo da solicitação"],
] as const;

export type Details = Record<string, string>;

export type CommercialRow = {
  id: string;
  store_id: string;
  person_id: string;
  store_code: string;
  store_name: string;
  region: string;
  person_name: string;
  created_at: string;
  payload: {
    note?: string;
    details?: Details;
    barcode?: string;
    sizes?: Record<string, number>;
    status?: string;
    response?: string;
    archived?: boolean;
    session_id?: string;
    audio_path?: string;
    transcript?: string;
  };
};

export type CommercialPage = {
  items: CommercialRow[];
  total: number;
  groups: { region: string; total: number }[];
  top_products?: {
    region: string;
    category: string;
    product: string;
    color: string;
    size: string;
    requests: number;
  }[];
};

export const emptyDetails = (): Details =>
  Object.fromEntries(fields.map(([key]) => [key, "Não informado"]));

export const today = () => new Date().toLocaleDateString("en-CA");

export const requestStatuses = [
  "Enviado",
  "Em análise",
  "Aguardando informação",
  "Atendido",
  "Não atendido",
] as const;

export type AssortmentSession = {
  id: string;
  store_id: string;
  mode: string;
  status: string;
  title: string;
  allowed_codes: string[];
  created_at: string;
};

export function assortmentCsv(rows: Record<string, unknown>[]) {
  const keys = [
    "session_id",
    "store_code",
    "barcode",
    "size",
    "quantity",
    "status",
    "scan_id",
    "scanned_at",
    "saved_at",
    "session_submitted_at",
    "timezone",
    "started_warning",
    "saved_warning",
  ];
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return (
    "\ufeff" +
    [
      keys.join(";"),
      ...rows.map((row) => keys.map((key) => cell(row[key])).join(";")),
    ].join("\r\n")
  );
}
