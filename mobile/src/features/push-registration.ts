export function pushFailureKind(
  cause: unknown,
): "signature" | "firebase" | "network" | "other" {
  const text = cause instanceof Error ? cause.message : String(cause);
  if (/aps[-_ ]?environment|aps[-_ ]?enviroment|entitlement/i.test(text))
    return "signature";
  if (/firebase|fcm|google.services/i.test(text)) return "firebase";
  if (/network|fetch failed|connection.*lost|timed? ?out|offline/i.test(text))
    return "network";
  return "other";
}
export async function retryPushToken<T>(
  read: () => Promise<T>,
  pause: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 1200)),
): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (pushFailureKind(cause) !== "network") throw cause;
    await pause();
    return read();
  }
}
