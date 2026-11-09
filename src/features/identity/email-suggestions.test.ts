import { describe, expect, it } from "vitest";
import { emailSuggestions } from "./email-suggestions";
describe("sugestões de e-mail", () => {
  it("prioriza o padrão pessoal sem duplicar a lista da organização", () =>
    expect(
      emailSuggestions(
        "matheus",
        ["pernambucanas.com.br", "pefisa.com.br"],
        "pefisa.com.br",
      ),
    ).toEqual(["matheus@pefisa.com.br", "matheus@pernambucanas.com.br"]));
  it("respeita o domínio parcialmente digitado sem inventar opções", () =>
    expect(
      emailSuggestions("matheus@pefi", [
        "pernambucanas.com.br",
        "pefisa.com.br",
      ]),
    ).toEqual(["matheus@pefisa.com.br"]));
  it("não sugere local vazio ou sintaxe com múltiplas arrobas", () => {
    expect(emailSuggestions("", ["empresa.com"])).toEqual([]);
    expect(emailSuggestions("a@@b", ["empresa.com"])).toEqual([]);
  });
});
