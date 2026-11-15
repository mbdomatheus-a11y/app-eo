/** Catálogo puro espelhado em mobile/src/features/app-icons.ts. */
export const APP_ICONS = {
  "square.grid.2x2.fill": { label: "Aplicativos", material: "apps" },
  "chart.bar.fill": { label: "Gráfico de barras", material: "bar_chart" },
  calendar: { label: "Calendário", material: "calendar_today" },
  "chart.line.uptrend.xyaxis": {
    label: "Evolução de resultados",
    material: "trending_up",
  },
  "shippingbox.fill": { label: "Produtos", material: "package_2" },
  "barcode.viewfinder": {
    label: "Código de barras",
    material: "barcode_scanner",
  },
  "mic.fill": { label: "Relato de voz", material: "mic" },
  "face.smiling": { label: "Bem-estar", material: "sentiment_satisfied" },
  "person.2.fill": { label: "Equipe", material: "group" },
  "doc.text.fill": { label: "Documento", material: "description" },
  checklist: { label: "Lista de tarefas", material: "checklist" },
  "chart.bar.doc.horizontal": { label: "Relatório", material: "analytics" },
  "bell.fill": { label: "Avisos", material: "notifications_active" },
  "building.2.fill": { label: "Lojas", material: "store" },
  "checkmark.shield.fill": { label: "Conformidade", material: "verified_user" },
  "archivebox.fill": { label: "Arquivo", material: "inventory_2" },
  "house.fill": { label: "Início", material: "home" },
  "person.crop.circle.fill": { label: "Perfil", material: "account_circle" },
  "lock.fill": { label: "Segurança", material: "lock" },
  "phone.fill": { label: "Telefone", material: "phone" },
  "arrow.up.right": { label: "Abrir", material: "north_east" },
  "checkmark.circle.fill": { label: "Concluído", material: "check_circle" },
  "questionmark.circle.fill": { label: "Ajuda", material: "help" },
  "list.bullet.rectangle.fill": { label: "Lista", material: "view_list" },
  "photo.fill": { label: "Foto", material: "photo" },
  "camera.fill": { label: "Câmera", material: "photo_camera" },
  waveform: { label: "Áudio", material: "graphic_eq" },
  "paintbrush.fill": { label: "Aparência", material: "brush" },
  "person.3.fill": { label: "Pessoas", material: "groups" },
  "chevron.right": { label: "Próximo", material: "chevron_right" },
  "gearshape.fill": { label: "Configurações", material: "settings" },
  iphone: { label: "Aparelho", material: "smartphone" },
  plus: { label: "Adicionar", material: "add" },
  "arrow.right": { label: "Continuar", material: "arrow_forward" },
  "arrow.left": { label: "Voltar", material: "arrow_back" },
  "arrow.clockwise": { label: "Atualizar", material: "refresh" },
  checkmark: { label: "Confirmar", material: "check" },
} as const;

export type AppIconName = keyof typeof APP_ICONS;

/** Whitelist das escolhas administrativas. Os demais ícones são utilitários. */
export const APP_ICON_CHOICES = [
  "chart.bar.fill",
  "calendar",
  "chart.line.uptrend.xyaxis",
  "shippingbox.fill",
  "barcode.viewfinder",
  "mic.fill",
  "face.smiling",
  "person.2.fill",
  "doc.text.fill",
  "checklist",
  "chart.bar.doc.horizontal",
  "bell.fill",
  "building.2.fill",
  "checkmark.shield.fill",
  "archivebox.fill",
  "square.grid.2x2.fill",
] as const satisfies readonly AppIconName[];

export type ModuleIconName = (typeof APP_ICON_CHOICES)[number];
export const MODULE_ICON_DEFAULTS = {
  notices: { label: "Comunicados", icon: "doc.text.fill" },
  sales: { label: "Vendas", icon: "chart.bar.fill" },
  product: { label: "Pedir produto", icon: "shippingbox.fill" },
  assortment: { label: "Sortimento", icon: "barcode.viewfinder" },
  diary: { label: "Diário de vendas", icon: "mic.fill" },
  mood: { label: "Como está seu dia?", icon: "face.smiling" },
  checklists: { label: "Checklists", icon: "checklist" },
  reports: { label: "Relatórios", icon: "chart.bar.doc.horizontal" },
  agenda: { label: "Agenda de ações", icon: "calendar" },
  escala: { label: "Escala de colaboradores", icon: "person.2.fill" },
} as const satisfies Record<string, { label: string; icon: ModuleIconName }>;
export type IconModuleId = keyof typeof MODULE_ICON_DEFAULTS;
export type ModuleIconOverrides = Partial<Record<IconModuleId, ModuleIconName>>;

const aliases: Record<string, AppIconName> = {
  "square.grid.2x2": "square.grid.2x2.fill",
  "doc.fill": "doc.text.fill",
  "›": "chevron.right",
  "→": "arrow.right",
  "←": "arrow.left",
  "↻": "arrow.clockwise",
  "✓": "checkmark",
  "＋": "plus",
  "+": "plus",
};
export function isAppIconName(value: unknown): value is AppIconName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(APP_ICONS, value)
  );
}
export function isModuleIconName(value: unknown): value is ModuleIconName {
  return (
    typeof value === "string" &&
    (APP_ICON_CHOICES as readonly string[]).includes(value)
  );
}
export function isIconModuleId(value: unknown): value is IconModuleId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MODULE_ICON_DEFAULTS, value)
  );
}
export function resolveAppIcon(name?: string): AppIconName {
  if (isAppIconName(name)) return name;
  return name && Object.prototype.hasOwnProperty.call(aliases, name)
    ? aliases[name]
    : "square.grid.2x2.fill";
}
export function normalizeModuleIcons(value: unknown): ModuleIconOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([module, icon]) => isIconModuleId(module) && isModuleIconName(icon),
    ),
  ) as ModuleIconOverrides;
}
export function resolveModuleIcon(
  moduleId: string | undefined,
  overrides: ModuleIconOverrides,
  legacyName?: string,
): AppIconName {
  if (isIconModuleId(moduleId)) {
    const override = overrides[moduleId];
    if (isModuleIconName(override)) return override;
    if (!legacyName) return MODULE_ICON_DEFAULTS[moduleId].icon;
  }
  return resolveAppIcon(legacyName);
}
