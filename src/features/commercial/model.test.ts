import { describe, it, expect } from "vitest";
import { assortmentCsv, emptyDetails, fields, sizes } from "./model";
describe("comercial", () => {
  it("preserva ausência e composição revisável", () => {
    expect(emptyDetails().fabric).toBe("Não informado");
    expect(fields.map((x) => x[0])).toContain("fabric");
  });
  it("inclui toda grade de 34 a 54", () => {
    expect(sizes.filter((x) => /^\d+$/.test(x))).toHaveLength(21);
    expect(sizes).toContain("54");
  });
  it("exporta CSV escapado e protege fórmula", () => {
    const csv = assortmentCsv([
      { barcode: "=1+1", store_code: "A;B", size: "M", quantity: 0 },
    ]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"A;B"');
    expect(csv).toContain('"0"');
  });
});
