import { beforeEach, describe, it, expect, vi } from "vitest";
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => disk.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    disk.set(k, v);
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    disk.delete(k);
  }),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
describe("sessão local", () => {
  beforeEach(() => {
    disk.clear();
    vi.resetModules();
  });
  it("lê fragmentos legados e grava novos sem alterar a sessão", async () => {
    disk.set("eo-auth", JSON.stringify({ eoSecureChunks: 2 }));
    disk.set("eo-auth.0", "ab");
    disk.set("eo-auth.1", "cd");
    const { sessionStorage } = await import("./session-storage");
    expect(await sessionStorage.getItem("auth")).toBe("abcd");
    await sessionStorage.setItem("auth", "nova".repeat(1500));
    expect(await sessionStorage.getItem("auth")).toBe("nova".repeat(1500));
  });
  it("saída não permite que gravação tardia restaure sessão", async () => {
    const { sessionStorage, closeStoredSession, beginSessionLogin } =
      await import("./session-storage");
    await beginSessionLogin();
    await sessionStorage.setItem("auth", "A");
    const write = sessionStorage.setItem("auth", "antiga");
    await closeStoredSession("auth");
    await write;
    expect(await sessionStorage.getItem("auth")).toBe(null);
    await sessionStorage.setItem("auth", "resposta atrasada");
    expect(await sessionStorage.getItem("auth")).toBe(null);
    await beginSessionLogin();
    await sessionStorage.setItem("auth", "B");
    expect(await sessionStorage.getItem("auth")).toBe("B");
  });
  it("tombstone persiste entre inicializações e resposta Auth antiga é rejeitada", async () => {
    disk.set("eo.session.closed.v1", "1");
    disk.set("eo-auth", "resto");
    const { sessionStorage, guardSessionFetch, beginSessionLogin } =
      await import("./session-storage");
    expect(await sessionStorage.getItem("auth")).toBe(null);
    let resolve!: (v: Response) => void;
    const guarded = guardSessionFetch(
      (() =>
        new Promise((r) => {
          resolve = r;
        })) as typeof fetch,
    );
    const response = guarded("https://example.test/auth/v1/token");
    await beginSessionLogin();
    resolve(new Response("{}"));
    await expect(response).rejects.toMatchObject({ code: "SESSION_CHANGED" });
  });
});
