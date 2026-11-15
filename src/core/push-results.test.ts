import { describe, it, expect } from "vitest";
import {
  pushResults,
  pushFailureNote,
} from "../../supabase/functions/_shared/push-results";
import { notificationDelivery } from "../../supabase/functions/_shared/notification-sound";
describe("resultado do provedor push", () => {
  it("conta recusas sem gravar token ou mensagem arbitrária", () => {
    expect(
      pushResults([
        { status: "ok", id: "ticket" },
        {
          status: "error",
          details: { error: "InvalidCredentials" },
          message: "token secreto",
        },
      ]),
    ).toEqual({ accepted: 1, failures: { InvalidCredentials: 1 } });
  });
  it("não transforma corpo inválido em sucesso", () => {
    expect(pushResults(null).accepted).toBe(0);
    expect(
      pushResults([{ status: "error", details: { error: "arbitrario" } }])
        .failures,
    ).toEqual({ Unknown: 1 });
  });
  it("orienta a causa sem retornar dados do aparelho", () =>
    expect(pushFailureNote({ InvalidCredentials: 1 })).toContain("credencial"));
  it("usa o recurso de som empacotado e respeita silenciar", () => {
    expect(
      notificationDelivery("eo-soft.wav", true, "underscore"),
    ).toMatchObject({ sound: "eo_soft.wav", channelId: "eo-alerts-soft" });
    expect(notificationDelivery("eo-soft.wav", true).sound).toBe("eo-soft.wav");
    expect(notificationDelivery("eo-soft.wav", false)).toMatchObject({
      sound: null,
      channelId: "eo-alerts-quiet",
    });
  });
});
