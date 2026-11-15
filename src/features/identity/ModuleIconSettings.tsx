import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Archive,
  AudioLines,
  Barcode,
  Bell,
  CalendarDays,
  ChartColumn,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileChartColumn,
  FileText,
  Package,
  ShieldCheck,
  Smile,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  APP_ICONS,
  APP_ICON_CHOICES,
  MODULE_ICON_DEFAULTS,
  isIconModuleId,
  isModuleIconName,
  normalizeModuleIcons,
  resolveModuleIcon,
  type IconModuleId,
  type ModuleIconName,
  type ModuleIconOverrides,
} from "../../core/app-icons";
import { rpc } from "../../services/supabase";
import { SuccessToast } from "../../components/SuccessToast";

const previews: Record<ModuleIconName, LucideIcon> = {
  "chart.bar.fill": ChartColumn,
  calendar: CalendarDays,
  "chart.line.uptrend.xyaxis": ChartNoAxesCombined,
  "shippingbox.fill": Package,
  "barcode.viewfinder": Barcode,
  "mic.fill": AudioLines,
  "face.smiling": Smile,
  "person.2.fill": Users,
  "doc.text.fill": FileText,
  checklist: ClipboardCheck,
  "chart.bar.doc.horizontal": FileChartColumn,
  "bell.fill": Bell,
  "building.2.fill": Store,
  "checkmark.shield.fill": ShieldCheck,
  "archivebox.fill": Archive,
  "square.grid.2x2.fill": AppWindow,
};

export function ModuleIconPreview({
  moduleId,
  icons,
  size = 21,
}: {
  moduleId: string;
  icons: ModuleIconOverrides;
  size?: number;
}) {
  const icon = resolveModuleIcon(moduleId, icons);
  const Icon = isModuleIconName(icon) ? previews[icon] : AppWindow;
  return <Icon aria-hidden="true" size={size} />;
}

export function ModuleIconSettings({
  onChanged,
}: {
  onChanged?: (icons: ModuleIconOverrides) => void;
}) {
  const [icons, setIcons] = useState<ModuleIconOverrides>({});
  const [moduleId, setModuleId] = useState<IconModuleId>("notices");
  const [choice, setChoice] = useState<ModuleIconName>(
    MODULE_ICON_DEFAULTS.notices.icon,
  );
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const saveLock = useRef(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void rpc<unknown>("eo_module_icons")
      .then((result) => {
        if (!alive) return;
        const next = normalizeModuleIcons(result);
        setIcons(next);
        setModuleId("notices");
        setChoice(next.notices ?? MODULE_ICON_DEFAULTS.notices.icon);
        setLoaded(true);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar os ícones.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  function pickModule(value: string) {
    if (!isIconModuleId(value)) return;
    setModuleId(value);
    setChoice(icons[value] ?? MODULE_ICON_DEFAULTS[value].icon);
    setMessage("");
  }
  async function save() {
    if (saveLock.current || !loaded || !isModuleIconName(choice)) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await rpc("eo_admin_set_module_icon", {
        p_module: moduleId,
        p_icon: choice,
      });
      const next = { ...icons, [moduleId]: choice };
      setIcons(next);
      setMessage(`Ícone de ${MODULE_ICON_DEFAULTS[moduleId].label} salvo.`);
      onChanged?.(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar o ícone.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const Preview = previews[choice];
  return (
    <section className="form" aria-labelledby="module-icons-title">
      <h3 id="module-icons-title">Ícones dos aplicativos</h3>
      <p>
        Escolha o símbolo de cada aplicativo. A seleção vale para toda a
        organização.
      </p>
      <SuccessToast message={message} />
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Carregando ícones…</p>}
      {!loading && !loaded && (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Tentar novamente
        </button>
      )}
      <fieldset
        disabled={loading || saving || !loaded}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <label>
          Aplicativo
          <select
            value={moduleId}
            onChange={(event) => pickModule(event.target.value)}
          >
            {Object.entries(MODULE_ICON_DEFAULTS).map(([id, module]) => (
              <option value={id} key={id}>
                {module.label}
              </option>
            ))}
          </select>
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0",
          }}
        >
          <Preview aria-hidden="true" size={30} />
          <span>
            {MODULE_ICON_DEFAULTS[moduleId].label}: {APP_ICONS[choice].label}
          </span>
        </div>
        <fieldset
          style={{ border: 0, padding: 0, margin: "0 0 16px", minWidth: 0 }}
        >
          <legend style={{ marginBottom: 8 }}>Escolher ícone</legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
              gap: 8,
            }}
          >
            {APP_ICON_CHOICES.map((icon) => {
              const Icon = previews[icon];
              return (
                <label
                  key={icon}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    border: `1px solid ${choice === icon ? "var(--ink, #282B31)" : "var(--line, #E4E1DB)"}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    minWidth: 0,
                  }}
                >
                  <input
                    type="radio"
                    name="module-icon"
                    value={icon}
                    checked={choice === icon}
                    onChange={() => {
                      setChoice(icon);
                      setMessage("");
                    }}
                    style={{ width: "auto", margin: 0, flexShrink: 0 }}
                  />
                  <Icon
                    aria-hidden="true"
                    size={21}
                    style={{ flexShrink: 0 }}
                  />
                  <span>{APP_ICONS[icon].label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="selection-actions">
          <button
            type="button"
            onClick={() => void save()}
            disabled={
              choice ===
              (icons[moduleId] ?? MODULE_ICON_DEFAULTS[moduleId].icon)
            }
          >
            {saving ? "Salvando…" : "Salvar ícone"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={choice === MODULE_ICON_DEFAULTS[moduleId].icon}
            onClick={() => {
              setChoice(MODULE_ICON_DEFAULTS[moduleId].icon);
              setMessage("");
            }}
          >
            Usar ícone padrão
          </button>
        </div>
      </fieldset>
    </section>
  );
}
