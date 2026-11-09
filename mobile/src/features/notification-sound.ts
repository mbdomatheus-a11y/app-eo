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
        sound: option.value,
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
