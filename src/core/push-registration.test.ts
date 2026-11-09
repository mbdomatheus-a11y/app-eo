import { describe, expect, it, vi } from "vitest";
import {
  pushFailureKind,
  retryPushToken,
} from "../../mobile/src/features/push-registration";
describe("registro push", () => {
  it("não repete assinatura ausente nem confunde com falta de internet", async () => {
    const read = vi
      .fn()
      .mockRejectedValue(
        new Error("UnexpectedException: aps-environment ausente"),
      );
    expect(pushFailureKind(new Error("aps-environment ausente"))).toBe(
      "signature",
    );
    await expect(retryPushToken(read, async () => {})).rejects.toThrow(
      "aps-environment",
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("recupera uma queda transitória, sem repetir um envio de notificação", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("fetch failed: The network connection was lost"),
      )
      .mockResolvedValueOnce("token");
    expect(await retryPushToken(read, async () => {})).toBe("token");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("encerra após uma segunda falha de rede", async () => {
    const read = vi.fn().mockRejectedValue(new Error("network offline"));
    await expect(retryPushToken(read, async () => {})).rejects.toThrow(
      "offline",
    );
    expect(read).toHaveBeenCalledTimes(2);
  });
});
