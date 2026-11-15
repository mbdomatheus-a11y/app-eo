import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  APP_ICONS,
  APP_ICON_CHOICES,
  MODULE_ICON_DEFAULTS,
  normalizeModuleIcons,
  resolveAppIcon,
  resolveModuleIcon,
} from "./app-icons";

describe("catálogo de ícones", () => {
  it("cobre os módulos e resolve nomes legados sem expor texto arbitrário", () => {
    for (const module of Object.values(MODULE_ICON_DEFAULTS)) {
      expect(APP_ICON_CHOICES).toContain(module.icon);
    }
    expect(resolveAppIcon("square.grid.2x2")).toBe("square.grid.2x2.fill");
    expect(resolveAppIcon("doc.fill")).toBe("doc.text.fill");
    expect(resolveAppIcon("→")).toBe("arrow.right");
    expect(resolveAppIcon("simbolo.desconhecido")).toBe("square.grid.2x2.fill");
    expect(resolveAppIcon("__proto__")).toBe("square.grid.2x2.fill");
  });
  it("aceita apenas módulos conhecidos e escolhas autorizadas", () => {
    expect(
      normalizeModuleIcons({
        sales: "calendar",
        diary: "lock.fill",
        outro: "calendar",
      }),
    ).toEqual({ sales: "calendar" });
    expect(normalizeModuleIcons(null)).toEqual({});
    expect(normalizeModuleIcons(["calendar"])).toEqual({});
    expect(
      resolveModuleIcon("sales", { sales: "calendar" }, "chart.bar.fill"),
    ).toBe("calendar");
    expect(resolveModuleIcon("sales", {}, "chart.line.uptrend.xyaxis")).toBe(
      "chart.line.uptrend.xyaxis",
    );
    expect(resolveModuleIcon("sales", {})).toBe("chart.bar.fill");
  });
  it("mantém o mesmo catálogo no nativo e no portal", () => {
    const web = readFileSync(
      new URL("./app-icons.ts", import.meta.url),
      "utf8",
    );
    const mobile = readFileSync(
      new URL("../../mobile/src/features/app-icons.ts", import.meta.url),
      "utf8",
    );
    expect(mobile).toBe(web);
  });
  const materialPath = new URL(
    "../../mobile/node_modules/expo-symbols/src/android/symbols.json",
    import.meta.url,
  );
  it.skipIf(!existsSync(materialPath))(
    "usa nomes Android compatíveis com o pacote mobile instalado",
    () => {
      const material = JSON.parse(readFileSync(materialPath, "utf8"));
      for (const icon of Object.values(APP_ICONS))
        expect(material).toHaveProperty(icon.material);
    },
  );
});
