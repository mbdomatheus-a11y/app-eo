import { describe, expect, it, vi } from "vitest";
vi.mock("../../services/supabase", () => ({ supabase: null }));
import { normalizeStoreUser, storePasswordRules } from "./store-access";

describe("contas de loja", () => {
  it("normaliza usuário com ou sem domínio e zeros", () => {
    expect(normalizeStoreUser("ger6")).toBe("ger006");
    expect(normalizeStoreUser("GER060@pernambucanas.com.br")).toBe("ger060");
    expect(normalizeStoreUser(" ger100 ")).toBe("ger100");
    expect(normalizeStoreUser("123456")).toBeNull();
    expect(normalizeStoreUser("gerente")).toBeNull();
  });
  it("recusa senha padrão e aceita senha forte", () => {
    const fail = storePasswordRules("ger006", "Ger006!Senha2026").filter((r) => !r.ok);
    expect(fail.map((r) => r.id)).toContain("default");
    expect(storePasswordRules("ger006", "Loja!Forte2027x").every((r) => r.ok)).toBe(true);
    expect(storePasswordRules("ger006", "aaaaAAAA1111!!").find((r) => r.id === "repeat")?.ok).toBe(false);
  });
});
