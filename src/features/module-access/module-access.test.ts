import { it, expect } from "vitest";
import { moduleVisible } from "./ModuleAccess";
it("mantém módulo novo e administrador visíveis, respeita negativa explícita", () => {
  expect(moduleVisible([], "novo")).toBe(true);
  expect(
    moduleVisible([{ id: "sales", label: "Vendas", visible: false }], "sales"),
  ).toBe(false);
  expect(
    moduleVisible(
      [{ id: "sales", label: "Vendas", visible: false }],
      "sales",
      true,
    ),
  ).toBe(true);
});
