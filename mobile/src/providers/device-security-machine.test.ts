import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  DeviceSecurityMachine,
  AUTH_TIMEOUT_MS,
  BACKGROUND_GRACE_MS,
  type SecurityDependencies,
} from "./device-security-machine";
vi.mock("./native-interactions", () => ({
  beginNativeInteraction: () => () => {},
  nativeInteractionDeadline: () => 0,
}));
function setup(overrides: Partial<SecurityDependencies> = {}) {
  const deps: SecurityDependencies = {
    readEnabled: vi.fn().mockResolvedValue(true),
    readSecret: vi.fn().mockResolvedValue("A"),
    writeSecret: vi.fn().mockResolvedValue(undefined),
    writeEnabled: vi.fn().mockResolvedValue(undefined),
    canUseBiometry: () => true,
    signout: vi.fn().mockResolvedValue({ ok: true }),
    report: vi.fn(),
    ...overrides,
  };
  return { deps, machine: new DeviceSecurityMachine(deps) };
}
describe("proteção do aparelho", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("libera botão após prazo, não aceita resultado biométrico tardio", async () => {
    let resolve!: (v: string) => void;
    const { machine } = setup({
      readSecret: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await machine.setUser("A");
    const unlock = machine.unlock();
    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);
    await unlock;
    expect(machine.snapshot()).toMatchObject({ locked: true, phase: "idle" });
    resolve("A");
    await Promise.resolve();
    expect(machine.snapshot().locked).toBe(true);
    machine.dispose();
  });
  it("senha interrompe a confirmação sem desligar a biometria", async () => {
    let resolve!: (v: string) => void;
    const { machine, deps } = setup({
      readSecret: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await machine.setUser("A");
    const unlock = machine.unlock();
    await machine.passwordLogin();
    await unlock;
    resolve("A");
    await Promise.resolve();
    expect(machine.snapshot().locked).toBe(true);
    expect(deps.writeEnabled).not.toHaveBeenCalled();
    await machine.setUser("");
    await machine.setUser("A");
    expect(machine.snapshot()).toMatchObject({ locked: false, enabled: true });
    machine.dispose();
  });
  it("cancelamento não cria ciclo de prompts automáticos", async () => {
    const { machine, deps } = setup({
      readSecret: vi.fn().mockRejectedValue(new Error("cancelado")),
    });
    await machine.setUser("A");
    await vi.advanceTimersByTimeAsync(1000);
    machine.onAppState("inactive");
    machine.onAppState("active");
    await vi.advanceTimersByTimeAsync(30000);
    expect(deps.readSecret).toHaveBeenCalledTimes(1);
    expect(machine.snapshot().locked).toBe(true);
    machine.dispose();
  });
  it("inactive de prompt não religa bloqueio, saída real religa", async () => {
    const { machine } = setup();
    await machine.setUser("A");
    await machine.unlock();
    machine.onAppState("inactive");
    machine.onAppState("active");
    expect(machine.snapshot().locked).toBe(false);
    machine.onAppState("background");
    await vi.advanceTimersByTimeAsync(BACKGROUND_GRACE_MS + 1000);
    expect(machine.snapshot().locked).toBe(true);
    machine.dispose();
  });
  it("resultado da conta A nunca desbloqueia B", async () => {
    let resolve!: (v: string) => void;
    const { machine } = setup({
      readSecret: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await machine.setUser("A");
    const unlock = machine.unlock();
    await machine.setUser("B");
    await unlock;
    resolve("A");
    await Promise.resolve();
    expect(machine.snapshot()).toMatchObject({ owner: "B", locked: true });
    machine.dispose();
  });
});
