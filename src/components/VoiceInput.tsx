import { useCallback, useEffect, useRef, useState } from "react";
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const fallback =
  "Use o microfone do teclado do celular ou digite o texto. Seu texto foi preservado.";
export function VoiceInput({
  onText,
  disabled = false,
  onListeningChange,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  onListeningChange?: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "starting" | "listening" | "stopping"
  >("idle");
  const [message, setMessage] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const text = useRef(onText);
  text.current = onText;
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;
  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const finish = useCallback(() => {
    const instance = recognition.current;
    recognition.current = null;
    clearTimer();
    if (instance) {
      instance.onstart = null;
      instance.onresult = null;
      instance.onend = null;
      instance.onerror = null;
    }
    if (mounted.current) setPhase("idle");
    listeningChange.current?.(false);
    return instance;
  }, [clearTimer]);
  const cancel = useCallback(() => {
    const instance = finish();
    try {
      instance?.abort();
    } catch {
      /* Já encerrado. */
    }
  }, [finish]);
  useEffect(() => {
    mounted.current = true;
    const stop = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("pagehide", cancel);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("pagehide", cancel);
      cancel();
    };
  }, [cancel]);
  function start() {
    const running = recognition.current;
    if (running) {
      if (phase === "starting") {
        cancel();
        return;
      }
      setPhase("stopping");
      clearTimer();
      timer.current = setTimeout(cancel, 3000);
      try {
        running.stop();
      } catch {
        cancel();
      }
      return;
    }
    if (disabled) return;
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    try {
      if (!Constructor) {
        setMessage(
          `Este navegador não oferece ditado local integrado. ${fallback}`,
        );
        return;
      }
      const instance = new Constructor();
      // Nunca permite que o reconhecimento integrado envie áudio a um serviço remoto.
      if (!("processLocally" in instance)) {
        setMessage(
          `Este navegador não oferece ditado local integrado. ${fallback}`,
        );
        return;
      }
      instance.processLocally = true;
      instance.lang = "pt-BR";
      instance.interimResults = true;
      instance.continuous = false;
      recognition.current = instance;
      const current = () => recognition.current === instance && mounted.current;
      instance.onstart = () => {
        if (!current()) return;
        clearTimer();
        setPhase("listening");
        timer.current = setTimeout(() => {
          if (!current()) return;
          setPhase("stopping");
          timer.current = setTimeout(cancel, 3000);
          try {
            instance.stop();
          } catch {
            cancel();
          }
        }, 60000);
      };
      instance.onresult = (event) => {
        if (current())
          text.current(
            Array.from(event.results, (item) => item[0]?.transcript ?? "").join(
              " ",
            ),
          );
      };
      instance.onend = () => {
        if (current()) finish();
      };
      instance.onerror = () => {
        if (!current()) return;
        cancel();
        setMessage(
          `Não foi possível iniciar ou concluir o ditado local. Verifique a permissão do microfone. ${fallback}`,
        );
      };
      setMessage("");
      setPhase("starting");
      listeningChange.current?.(true);
      timer.current = setTimeout(() => {
        if (!current()) return;
        cancel();
        setMessage(
          `O ditado não iniciou. Verifique a permissão do microfone e o idioma local. ${fallback}`,
        );
      }, 20000);
      instance.start();
    } catch {
      cancel();
      setMessage(`O ditado local está indisponível. ${fallback}`);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="secondary"
        disabled={(disabled && phase === "idle") || phase === "stopping"}
        onClick={start}
      >
        {phase === "starting"
          ? "Cancelar início do ditado"
          : phase === "stopping"
            ? "Concluindo ditado…"
            : phase === "listening"
              ? "Concluir ditado"
              : "Ditar texto · até 1 minuto"}
      </button>
      <small style={{ display: "block", marginTop: 6 }}>
        O ditado integrado usa reconhecimento local quando disponível. Revise o
        texto antes de enviar à Anthropic.
      </small>
      {phase !== "idle" && (
        <p role="status">
          {phase === "starting"
            ? "Aguardando microfone e reconhecimento local…"
            : phase === "stopping"
              ? "Concluindo o texto ditado…"
              : "Ouvindo. Fale e depois revise o texto."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
