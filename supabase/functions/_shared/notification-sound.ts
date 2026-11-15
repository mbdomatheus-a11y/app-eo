export const notificationSounds = [
  "default",
  "eo-soft.wav",
  "eo-bell.wav",
  "eo-alert.wav",
] as const;
export type NotificationSound = (typeof notificationSounds)[number];
export function notificationDelivery(
  value: unknown,
  enabled: boolean,
  bundle: string = "legacy",
) {
  const sound =
    notificationSounds.find((sound) => sound === value) ?? "default";
  return {
    // Compatibilidade com os arquivos realmente empacotados em cada instalação.
    sound: enabled
      ? bundle === "underscore"
        ? sound.replace("eo-", "eo_")
        : sound
      : null,
    channelId: !enabled
      ? "eo-alerts-quiet"
      : sound === "default"
        ? "eo-alerts"
        : `eo-alerts-${sound.slice(3, -4)}`,
  };
}
