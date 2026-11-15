import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({
  events: {} as Record<string, (event?: any) => void>,
  appState: null as null | ((state: string) => void),
  cleanups: [] as (() => void)[],
  requestPermissions: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  available: vi.fn(),
  onDevice: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => () => void) => {
    harness.cleanups.push(effect());
  },
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: () => () => void) => {
    harness.cleanups.push(effect());
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      harness.appState = listener;
      return { remove: vi.fn() };
    },
  },
  Text: "Text",
  View: "View",
}));
vi.mock("../ui", () => ({ Button: "Button", s: { small: {} } }));
vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: harness.requestPermissions,
    start: harness.start,
    stop: harness.stop,
    abort: harness.abort,
    isRecognitionAvailable: harness.available,
    supportsOnDeviceRecognition: harness.onDevice,
  },
  useSpeechRecognitionEvent: (name: string, handler: (event?: any) => void) => {
    harness.events[name] = handler;
  },
}));
import { VoiceInput } from "./VoiceInput";

function setup() {
  const onText = vi.fn(),
    onListeningChange = vi.fn();
  const element = VoiceInput({ onText, onListeningChange }) as ReactElement<{
    children: ReactElement[];
  }>;
  const button = element.props.children[0] as ReactElement<{
    onPress: () => void;
  }>;
  return { press: button.props.onPress, onText, onListeningChange };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.events = {};
  harness.cleanups = [];
  harness.available.mockReturnValue(true);
  harness.onDevice.mockReturnValue(true);
  harness.requestPermissions.mockResolvedValue({ granted: true });
});
afterEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
});
describe("ditado local, permissões e ciclo de vida", () => {
  it("não solicita permissão nem inicia serviço quando não há reconhecimento local", () => {
    harness.onDevice.mockReturnValue(false);
    setup().press();
    expect(harness.requestPermissions).not.toHaveBeenCalled();
    expect(harness.start).not.toHaveBeenCalled();
  });
  it("libera a tela após timeout e ignora permissão concedida tarde", async () => {
    let resolve!: (value: { granted: boolean }) => void;
    harness.requestPermissions.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const ui = setup();
    ui.press();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(20000);
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
    resolve({ granted: true });
    await flush();
    expect(harness.start).not.toHaveBeenCalled();
  });
  it("cancela toque duplicado sem abrir duas solicitações", async () => {
    const ui = setup();
    ui.press();
    ui.press();
    await flush();
    expect(harness.requestPermissions).toHaveBeenCalledTimes(1);
    expect(harness.start).not.toHaveBeenCalled();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
  });
  it("mantém a autorização no diálogo inativo e exige reconhecimento no aparelho", async () => {
    const ui = setup();
    ui.press();
    harness.appState?.("inactive");
    await flush();
    expect(harness.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        lang: "pt-BR",
      }),
    );
  });
  it("reseta o pai e ignora permissão pendente ao sair da tela", async () => {
    const ui = setup();
    ui.press();
    harness.cleanups[0]();
    await flush();
    expect(harness.start).not.toHaveBeenCalled();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
  });
  it("recupera erro nativo antes do evento start e limita a sessão a um minuto", async () => {
    const ui = setup();
    ui.press();
    await flush();
    harness.events.error({ error: "not-allowed" });
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
    ui.press();
    await flush();
    harness.events.start();
    harness.events.result({ results: [{ transcript: "Texto para revisar" }] });
    expect(ui.onText).toHaveBeenCalledWith("Texto para revisar");
    vi.advanceTimersByTime(60000);
    expect(harness.stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(harness.abort).toHaveBeenCalled();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
  });
  it("aborta e ignora resultado tardio ao ir para segundo plano", async () => {
    const ui = setup();
    ui.press();
    await flush();
    harness.events.start();
    harness.appState?.("background");
    harness.events.result({ results: [{ transcript: "Não aplicar" }] });
    expect(harness.abort).toHaveBeenCalled();
    expect(ui.onText).not.toHaveBeenCalled();
    expect(ui.onListeningChange).toHaveBeenLastCalledWith(false);
  });
});
