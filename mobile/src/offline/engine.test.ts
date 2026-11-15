import { describe, it, expect, vi } from "vitest";
import {
  OfflineEngine,
  isTransportError,
  type OfflineStorage,
  type OfflineState,
  type RemoteRpc,
} from "./engine";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
function setup() {
  const disk = new Map<string, OfflineState>();
  let id = 10,
    now = 1_800_000_000_000;
  const storage: OfflineStorage = {
    load: async (u) => structuredClone(disk.get(u) ?? null),
    save: async (u, s) => {
      disk.set(u, structuredClone(s));
    },
    remove: async (u) => {
      disk.delete(u);
    },
  };
  const remote = vi.fn<RemoteRpc>().mockResolvedValue("confirmed");
  const engine = new OfflineEngine({
    storage,
    remote: remote as RemoteRpc,
    now: () => now,
    requestId: () =>
      `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
  });
  return {
    engine,
    remote,
    disk,
    storage,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("fila offline por identidade", () => {
  it("guarda antes de transmitir e reutiliza UUID quando a resposta se perde", async () => {
    const { engine, remote, disk } = setup();
    await engine.setIdentity(A);
    await engine.revalidate(A);
    remote.mockRejectedValueOnce(new TypeError("Network request failed"));
    const result = await engine.rpc("eo_save_product_request", {
      p_note: "blusa branca",
      p_store: A,
    });
    expect(disk.get(A)?.queue[0].id).toBe(result);
    expect(engine.status.pending).toBe(1);
    await engine.revalidate(A);
    await engine.sync();
    expect(engine.status.pending).toBe(0);
    expect(remote.mock.calls[0]).toEqual(remote.mock.calls[1]);
  });
  it("não transmite sem revalidar e preserva fila ao sair, escondendo leituras", async () => {
    const { engine, remote, disk } = setup();
    await engine.setIdentity(A);
    await engine.remember("eo_feed", {}, ["privado"]);
    await engine.rpc("eo_save_mood", { p_mood: "happy", p_store: A });
    expect(remote).not.toHaveBeenCalled();
    await engine.logout();
    expect(engine.status.userId).toBe(null);
    expect(disk.get(A)?.cache).toEqual([]);
    await engine.setIdentity(B);
    expect(engine.status.pending).toBe(0);
    expect(engine.cached("eo_feed")).toBe(null);
    await engine.setIdentity(A);
    expect(engine.status.pending).toBe(1);
    await engine.sync();
    expect(remote).not.toHaveBeenCalled();
  });
  it("não transforma uma negação de acesso em sucesso de cache", async () => {
    const { engine, remote } = setup();
    await engine.setIdentity(A);
    await engine.revalidate(A);
    await engine.remember("eo_feed", {}, ["privado"]);
    remote.mockRejectedValue(
      Object.assign(new Error("negado"), { code: "42501", status: 403 }),
    );
    await expect(engine.rpc("eo_feed")).rejects.toThrow("negado");
    expect(engine.cached("eo_feed")).toBe(null);
    expect(engine.status.revalidated).toBe(false);
  });
  it("consulta cópia offline rapidamente, expira e invalida ao mudar abrangência", async () => {
    const { engine, remote, advance } = setup();
    await engine.setIdentity(A);
    await engine.setScope("loja1");
    await engine.remember("eo_feed", {}, [1]);
    engine.markOffline();
    expect(await engine.rpc("eo_feed")).toEqual([1]);
    expect(remote).not.toHaveBeenCalled();
    advance(25 * 60 * 60 * 1000);
    await expect(engine.rpc("eo_feed")).rejects.toThrow("não foi carregada");
    await engine.setScope("loja2");
    expect(engine.cached("eo_feed")).toBe(null);
  });
  it("erro permanente bloqueia FIFO, com data original e descarte explícito", async () => {
    const { engine, remote, disk } = setup();
    await engine.setIdentity(A);
    engine.markOffline();
    await engine.rpc("eo_save_mood", { p_mood: "happy", p_store: A });
    await engine.rpc("eo_save_day_entry", { p_note: "dia", p_store: A });
    const first = disk.get(A)!.queue[0];
    await engine.revalidate(A);
    remote.mockRejectedValueOnce(
      Object.assign(new Error("data encerrada"), { code: "P0001" }),
    );
    await engine.sync();
    expect(engine.status.failed).toHaveLength(1);
    expect(remote).toHaveBeenCalledTimes(1);
    await engine.retry(first.id);
    expect(remote.mock.calls[1][1]?.p_recorded_at).toBe(
      new Date(first.createdAt).toISOString(),
    );
    expect(engine.status.pending).toBe(0);
  });
  it("não enfileira mídia, administração ou escrita disfarçada de leitura", async () => {
    const { engine, remote } = setup();
    await engine.setIdentity(A);
    engine.markOffline();
    remote.mockRejectedValue(new TypeError("Failed to fetch"));
    for (const [method, args] of [
      ["eo_checklist_save", { p_answer: { path: "foto" } }],
      ["eo_save_day_entry", { p_audio_path: "audio" }],
      ["eo_admin_delete_person", {}],
      ["eo_profile_preferences", { p_value: { font: "a" } }],
    ] as const) {
      await expect(engine.rpc(method, args)).rejects.toThrow(
        "precisa de conexão",
      );
    }
    expect(engine.status.pending).toBe(0);
  });
  it("operação antiga nunca muda para a conta nova durante requisição", async () => {
    const { engine, remote } = setup();
    await engine.setIdentity(A);
    await engine.revalidate(A);
    let resolve!: (v: unknown) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = engine.rpc("eo_feed");
    await vi.waitFor(() => expect(remote).toHaveBeenCalled());
    const changed = engine.setIdentity(B);
    resolve(["A"]);
    await expect(pending).rejects.toThrow("sessão mudou");
    await changed;
    expect(engine.cached("eo_feed")).toBe(null);
  });
  it("classifica somente falhas de rede, sem encobrir SQL e HTTP", () => {
    expect(isTransportError(new TypeError("Network request failed"))).toBe(
      true,
    );
    expect(isTransportError({ code: "ETIMEDOUT", message: "timeout" })).toBe(
      true,
    );
    for (const error of [
      { status: 401, message: "timeout" },
      { status: 500, message: "fetch failed" },
      { code: "P0001", message: "timeout" },
    ])
      expect(isTransportError(error)).toBe(false);
  });
});
