import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Button, s } from "../ui";

export function VoiceInput({
  onText,
  disabled = false,
  onListeningChange,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  onListeningChange?: (active: boolean) => void;
}) {
  const [listening, setListening] = useState(false);
  const active = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const result = useRef(onText);
  result.current = onText;
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (active.current) ExpoSpeechRecognitionModule.stop();
  }
  useSpeechRecognitionEvent("start", () => {
    active.current = true;
    setListening(true);
    listeningChange.current?.(true);
  });
  useSpeechRecognitionEvent("end", () => {
    active.current = false;
    setListening(false);
    listeningChange.current?.(false);
    if (timer.current) clearTimeout(timer.current);
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (active.current && event.results[0]?.transcript)
      result.current(event.results[0].transcript);
  });
  useSpeechRecognitionEvent("error", (event) => {
    const wasActive = active.current;
    active.current = false;
    setListening(false);
    listeningChange.current?.(false);
    if (timer.current) clearTimeout(timer.current);
    if (wasActive)
      Alert.alert(
        "Ditado",
        `${event.message || "Reconhecimento indisponível."} Você pode escrever ou usar o microfone do teclado.`,
      );
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
      if (active.current) ExpoSpeechRecognitionModule.abort();
    };
  }, []);
  async function start() {
    if (listening) {
      stop();
      return;
    }
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permissão necessária",
          "Autorize microfone e reconhecimento de fala nos ajustes ou escreva o texto.",
        );
        return;
      }
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        Alert.alert(
          "Ditado local indisponível",
          "Este aparelho não oferece o reconhecimento local necessário. Use o microfone do teclado ou digite seu relato.",
        );
        return;
      }
      active.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true,
      });
      timer.current = setTimeout(stop, 60000);
    } catch {
      active.current = false;
      setListening(false);
      listeningChange.current?.(false);
      Alert.alert(
        "Ditado indisponível",
        "Use o microfone do teclado ou digite o relato.",
      );
    }
  }
  return (
    <View style={{ gap: 6 }}>
      <Button
        title={listening ? "Concluir ditado" : "Ditar texto · até 1 minuto"}
        secondary
        disabled={disabled}
        onPress={() => void start()}
      />
      <Text style={s.small}>
        Revise o texto antes de salvar. Reconhecimento local quando disponível;
        a Anthropic recebe apenas o texto que você escolher interpretar.
      </Text>
    </View>
  );
}
