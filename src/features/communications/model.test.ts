import { describe, expect, it } from "vitest";
import { safeAttachmentName } from "./model";
describe("chaves de anexos", () => {
  it("preserva a extensão e gera ASCII com acentos, espaços e barras", () => {
    const original = "Orientações São João / versão final.pdf";
    expect(safeAttachmentName(original)).toBe(
      "Orientacoes_Sao_Joao___versao_final.pdf",
    );
    expect(original).toBe("Orientações São João / versão final.pdf");
  });
  it("não permite segmentos relativos e mantém nomes exclusivamente Unicode válidos", () => {
    expect(safeAttachmentName("../資料.pdf")).toBe("___.pdf");
    expect(safeAttachmentName("...")).toBe("arquivo");
    expect(safeAttachmentName("a".repeat(200) + ".pdf")).toHaveLength(160);
  });
});
