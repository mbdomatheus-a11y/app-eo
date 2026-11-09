export const notificationSounds = [
  "default",
  "eo-soft.wav",
  "eo-bell.wav",
  "eo-alert.wav",
] as const;
export type NotificationSound = (typeof notificationSounds)[number];
export function notificationDelivery(value: unknown, enabled: boolean) {
  const sound =
    notificationSounds.find((sound) => sound === value) ?? "default";
  return {
    sound: enabled ? sound : null,
    channelId: !enabled
      ? "eo-alerts-quiet"
      : sound === "default"
        ? "eo-alerts"
        : `eo-alerts-${sound.slice(3, -4)}`,
  };
}
