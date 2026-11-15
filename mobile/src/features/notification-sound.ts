import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
export const soundOptions = [
  { value: "default", label: "Padrão do aparelho" },
  { value: "eo-soft.wav", label: "Suave" },
  { value: "eo-bell.wav", label: "Sino" },
  { value: "eo-alert.wav", label: "Alerta" },
] as const;
export const soundChannel = (sound: string, enabled = true) =>
  !enabled
    ? "eo-alerts-quiet"
    : sound === "default"
      ? "eo-alerts"
      : soundOptions.some((s) => s.value === sound)
        ? `eo-alerts-${sound.slice(3, -4)}`
        : "eo-alerts";
export async function createSoundChannels() {
  if (Platform.OS !== "android") return;
  for (const option of soundOptions)
    await Notifications.setNotificationChannelAsync(
      soundChannel(option.value),
      {
        name: `EO · ${option.label}`,
        importance: Notifications.AndroidImportance.MAX,
        // Android só aceita nome de recurso com sublinhado (eo_soft); o valor salvo continua eo-soft.wav.
        sound:
          option.value === "default"
            ? "default"
            : option.value.replace("eo-", "eo_"),
        vibrationPattern: [0, 250, 200, 250],
      },
    );
  await Notifications.setNotificationChannelAsync("eo-alerts-quiet", {
    name: "EO · Sem som",
    importance: Notifications.AndroidImportance.MAX,
    sound: null,
    vibrationPattern: [],
  });
}

export function nativeSoundBundle(): "legacy" | "underscore" {
  if (Platform.OS === "android") return "underscore";
  const plugins = Constants.expoConfig?.plugins ?? [];
  const entry = plugins.find(
    (item) => Array.isArray(item) && item[0] === "expo-notifications",
  );
  const files = Array.isArray(entry)
    ? (entry[1] as { sounds?: unknown })?.sounds
    : null;
  return Array.isArray(files) &&
    files.some(
      (file) => typeof file === "string" && file.includes("eo_soft.wav"),
    )
    ? "underscore"
    : "legacy";
}
export const nativeSoundName = (sound: string) =>
  nativeSoundBundle() === "underscore" ? sound.replace("eo-", "eo_") : sound;
