import { describe, expect, it } from "vitest";
import { validateOrganizationEmail } from "../../../supabase/functions/admin-identity/policy";
describe("preferências de e-mail da organização", () => {
  it("permite contato opcional e exige somente quando configurado", () => {
    expect(validateOrganizationEmail("", [], false)).toBeNull();
    expect(validateOrganizationEmail("", [], true)).toBeTruthy();
  });
  it("domínios sugeridos não bloqueiam outros contatos válidos", () => {
    expect(
      validateOrganizationEmail(
        "nome@EMPRESA.com.br",
        ["empresa.com.br"],
        true,
      ),
    ).toBeNull();
    expect(
      validateOrganizationEmail("nome@pessoal.com", ["empresa.com.br"], true),
    ).toBeNull();
  });
  it("rejeita e-mail malformado inclusive com múltiplos arrobas", () => {
    for (const email of [
      "nome@@empresa.com.br",
      "nome @empresa.com.br",
      "nome@empresa",
    ])
      expect(validateOrganizationEmail(email, [], false)).toBeTruthy();
  });
  it("lista vazia aceita qualquer domínio válido", () =>
    expect(validateOrganizationEmail("nome@pessoal.com", [], true)).toBeNull());
});
