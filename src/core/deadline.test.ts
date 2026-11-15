import { describe, it, expect, vi, afterEach } from "vitest";
import {
  withDeadline,
  createTimedFetch,
} from "../../mobile/src/services/deadline";
afterEach(() => vi.useRealTimers());
describe("operações limitadas", () => {
  it("aborta trabalho pendente e libera o chamador", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const promise = withDeadline(
      (s) => {
        signal = s;
        return new Promise(() => {});
      },
      100,
      "Tempo esgotado",
    );
    const check = expect(promise).rejects.toThrow("Tempo esgotado");
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(signal?.aborted).toBe(true);
  });
  it("não aborta sucesso nem mantém timer", async () => {
    vi.useFakeTimers();
    expect(await withDeadline(async () => 42, 100, "fim")).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("repassa cancelamento do chamador para fetch pendente", async () => {
    const input = new AbortController();
    let signal: AbortSignal | undefined;
    const base = vi.fn(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new Error("abortado")));
        }),
    ) as unknown as typeof fetch;
    const promise = createTimedFetch(base)("https://example.invalid", {
      signal: input.signal,
    });
    const check = expect(promise).rejects.toThrow("abortado");
    input.abort();
    await check;
    expect(signal?.aborted).toBe(true);
  });
});
