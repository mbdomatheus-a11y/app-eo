import { describe, it, expect, vi } from "vitest";
import {
  ensureEoPush,
  appleApiUrl,
  appleApiError,
} from "../../scripts/apple-push-capability.mjs";
const bundle = {
  data: [
    { id: "EO-ID", attributes: { identifier: "com.appeo.mobile" } },
    { id: "OTHER", attributes: { identifier: "com.other.app" } },
  ],
};
describe("pré-verificação Apple EO", () => {
  it("consulta sem limit opcional e não recria push existente", async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(bundle)
      .mockResolvedValueOnce({
        data: [{ attributes: { capabilityType: "PUSH_NOTIFICATIONS" } }],
      });
    await ensureEoPush(api);
    expect(api.mock.calls[1][0]).toBe("bundleIds/EO-ID/bundleIdCapabilities");
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("segue paginação e cria somente no identificador EO quando ausente", async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(bundle)
      .mockResolvedValueOnce({
        data: [],
        links: {
          next: "https://api.appstoreconnect.apple.com/v1/bundleIds/EO-ID/bundleIdCapabilities?cursor=next",
        },
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({});
    await ensureEoPush(api);
    expect(api.mock.calls[3][1].data.relationships.bundleId.data.id).toBe(
      "EO-ID",
    );
  });
  it("não envia autenticação para domínio externo", () => {
    expect(() => appleApiUrl("https://outside.invalid/v1/test")).toThrow(
      "fora do escopo",
    );
  });
  it("preserva parâmetro e detalhe de erro para diagnóstico", () => {
    expect(
      appleApiError(400, "bundleIds/EO/bundleIdCapabilities", {
        errors: [
          {
            code: "PARAMETER_ERROR.ILLEGAL",
            detail: "Invalid parameter",
            source: { parameter: "limit" },
          },
        ],
      }).message,
    ).toContain('"parameter":"limit"');
  });
});
