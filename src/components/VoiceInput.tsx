import { useEffect, useRef, useState } from "react";
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
export function VoiceInput({
  onText,
  disabled = false,
  onListeningChange,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  onListeningChange?: (active: boolean) => void;
}) {
  const [listening, setListening] = useState(false),
    [message, setMessage] = useState("");
  const recognition = useRef<Recognition | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = useRef(onText);
  text.current = onText;
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;
  useEffect(() => {
    const stop = () => {
      if (document.hidden) recognition.current?.stop();
    };
    document.addEventListener("visibilitychange", stop);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      recognition.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function start() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) {
      setMessage(
        "Use o microfone do teclado do celular ou digite o texto. Este navegador não oferece ditado integrado.",
      );
      return;
    }
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = "pt-BR";
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = (event) =>
      text.current(
        Array.from(event.results, (item) => item[0]?.transcript ?? "").join(
          " ",
        ),
      );
    instance.onend = () => {
      setListening(false);
      listeningChange.current?.(false);
      if (timer.current) clearTimeout(timer.current);
    };
    instance.onerror = () => {
      setMessage(
        "Não foi possível reconhecer a fala. Seu texto foi preservado; tente novamente ou digite.",
      );
      setListening(false);
      listeningChange.current?.(false);
    };
    try {
      setMessage("");
      instance.start();
      setListening(true);
      listeningChange.current?.(true);
      timer.current = setTimeout(() => instance.stop(), 60000);
    } catch {
      setMessage("Permita o microfone ou use o ditado do teclado.");
    }
  }
  return (
    <div>
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={start}
      >
        {listening ? "Concluir ditado" : "Ditar texto · até 1 minuto"}
      </button>
      <small style={{ display: "block", marginTop: 6 }}>
        O ditado utiliza o serviço de voz do navegador. Revise o texto antes de
        enviar à Anthropic.
      </small>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
