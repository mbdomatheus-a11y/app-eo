import { it, expect } from "vitest";
import { reportCsv } from "./model";
it("exporta dados escapados e neutraliza fórmulas", () => {
  const csv = reportCsv([{ name: "=HYPERLINK(1)", label: "A;B", value: 0 }]);
  expect(csv).toContain("'" + "=HYPERLINK(1)");
  expect(csv).toContain('"A;B"');
  expect(csv).toContain('"0"');
});
