import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const harness = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => () => void) => {
    harness.cleanups.push(effect());
  },
}));
import { VoiceInput } from "./VoiceInput";
class LocalRecognition {
  processLocally = false;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null =
    null;
}
function setup() {
  const onText = vi.fn(),
    onListeningChange = vi.fn();
  const element = VoiceInput({ onText, onListeningChange }) as ReactElement<{
    children: ReactElement[];
  }>;
  const button = element.props.children[0] as ReactElement<{
    onClick: () => void;
  }>;
  return { press: button.props.onClick, onText, onListeningChange };
}
beforeEach(() => {
  vi.useFakeTimers();
  harness.cleanups = [];
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("ditado web local", () => {
  it("recusa reconhecimento sem garantia de processamento local", () => {
    const instance = { start: vi.fn() };
    window.SpeechRecognition = function () {
      return instance;
    } as any;
    setup().press();
    expect(instance.start).not.toHaveBeenCalled();
  });
  it("exige modo local e ignora callback pendente após sair", () => {
    const instance = new LocalRecognition();
    window.SpeechRecognition = function () {
      return instance;
    } as any;
    const ui = setup();
    ui.press();
    expect(instance.processLocally).toBe(true);
    expect(instance.start).toHaveBeenCalledOnce();
    const lateResult = instance.onresult!;
    harness.cleanups[0]();
    lateResult({ results: [[{ transcript: "Resultado antigo" }]] });
    expect(ui.onText).not.toHaveBeenCalled();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
    expect(instance.abort).toHaveBeenCalledOnce();
  });
  it("limita espera de permissão e não deixa o formulário bloqueado", () => {
    const instance = new LocalRecognition();
    window.SpeechRecognition = function () {
      return instance;
    } as any;
    const ui = setup();
    ui.press();
    vi.advanceTimersByTime(20000);
    expect(instance.abort).toHaveBeenCalledOnce();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
    expect(instance.onresult).toBeNull();
  });
});
