import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Button, s } from "../ui";

type Phase = "idle" | "permission" | "starting" | "listening" | "stopping";
const fallback =
  "Use o microfone do teclado ou digite o texto. Seu texto foi preservado.";

export function VoiceInput({
  onText,
  disabled = false,
  onListeningChange,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  onListeningChange?: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const state = useRef<Phase>("idle");
  const generation = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const result = useRef(onText);
  result.current = onText;
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const finish = useCallback(() => {
    generation.current += 1;
    clearTimer();
    state.current = "idle";
    if (mounted.current) setPhase("idle");
    listeningChange.current?.(false);
  }, [clearTimer]);
  const cancel = useCallback(() => {
    const wasRecognizing = ["starting", "listening", "stopping"].includes(
      state.current,
    );
    finish();
    if (wasRecognizing) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* Já encerrado. */
      }
    }
  }, [finish]);
  const stop = useCallback(() => {
    if (state.current !== "listening" && state.current !== "starting") return;
    clearTimer();
    state.current = "stopping";
    setPhase("stopping");
    // Conserva o resultado final, mas não depende do evento nativo para liberar a tela.
    timer.current = setTimeout(cancel, 3000);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      cancel();
    }
  }, [cancel, clearTimer]);

  useSpeechRecognitionEvent("start", () => {
    if (state.current !== "starting") return;
    clearTimer();
    state.current = "listening";
    setPhase("listening");
    timer.current = setTimeout(stop, 60000);
  });
  useSpeechRecognitionEvent("end", () => {
    if (["starting", "listening", "stopping"].includes(state.current)) finish();
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (
      ["listening", "stopping"].includes(state.current) &&
      event.results[0]?.transcript
    )
      result.current(event.results[0].transcript);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!["starting", "listening", "stopping"].includes(state.current)) return;
    finish();
    setMessage(
      event.error === "not-allowed"
        ? `Autorize microfone e reconhecimento de fala nos ajustes. ${fallback}`
        : `O reconhecimento local não está disponível agora. ${fallback}`,
    );
  });

  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener("change", (next) => {
      // O diálogo de permissão pode deixar o iOS inativo. Apenas background o cancela.
      if (
        next === "background" ||
        (next === "inactive" && state.current !== "permission")
      )
        cancel();
    });
    return () => {
      mounted.current = false;
      sub.remove();
      cancel();
    };
  }, [cancel]);

  async function start() {
    if (state.current === "permission") {
      cancel();
      return;
    }
    if (state.current !== "idle") {
      stop();
      return;
    }
    if (disabled) return;
    const attempt = ++generation.current;
    const current = () => mounted.current && generation.current === attempt;
    setMessage("");
    try {
      if (
        !ExpoSpeechRecognitionModule.isRecognitionAvailable() ||
        !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
      ) {
        setMessage(
          `Este aparelho não oferece ditado local disponível. ${fallback}`,
        );
        return;
      }
      state.current = "permission";
      setPhase("permission");
      listeningChange.current?.(true);
      timer.current = setTimeout(() => {
        finish();
        setMessage(
          `A autorização não foi concluída. Tente novamente após autorizar nos ajustes. ${fallback}`,
        );
      }, 20000);
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!current()) return;
      clearTimer();
      if (!permission.granted) {
        finish();
        setMessage(
          `Autorize microfone e reconhecimento de fala nos ajustes. ${fallback}`,
        );
        return;
      }
      state.current = "starting";
      setPhase("starting");
      timer.current = setTimeout(() => {
        cancel();
        setMessage(`O ditado local não iniciou. ${fallback}`);
      }, 10000);
      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true,
      });
    } catch {
      if (!current()) return;
      cancel();
      setMessage(`O ditado local está indisponível. ${fallback}`);
    }
  }
  const title =
    phase === "permission"
      ? "Cancelar autorização do ditado"
      : phase === "starting"
        ? "Cancelar início do ditado"
        : phase === "stopping"
          ? "Concluindo ditado…"
          : phase === "listening"
            ? "Concluir ditado"
            : "Ditar texto · até 1 minuto";
  return (
    <View style={{ gap: 6 }}>
      <Button
        title={title}
        secondary
        disabled={(disabled && phase === "idle") || phase === "stopping"}
        onPress={() => void start()}
      />
      {phase !== "idle" && (
        <Text
          style={s.small}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {phase === "permission"
            ? "Aguardando autorização do microfone e reconhecimento de fala."
            : phase === "starting"
              ? "Iniciando reconhecimento local…"
              : phase === "stopping"
                ? "Concluindo o texto ditado…"
                : "Ouvindo. Fale e depois revise o texto."}
        </Text>
      )}
      {!!message && (
        <Text
          style={s.small}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      )}
      <Text style={s.small}>
        Revise o texto antes de salvar. O ditado integrado usa reconhecimento
        local; a Anthropic recebe apenas o texto que você escolher interpretar.
      </Text>
    </View>
  );
}
