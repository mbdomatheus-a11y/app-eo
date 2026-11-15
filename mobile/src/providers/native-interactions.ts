// Coordena apenas prompts do SO iniciados pelo EO. Não autentica nem libera sessão.
const pending = new Map<symbol, number>();
let settlingUntil = 0;
export const NATIVE_RETURN_GRACE_MS = 700;
export const NATIVE_INTERACTION_MAX_MS = 30_000;

export function beginNativeInteraction(
  kind: string,
  timeoutMs = NATIVE_INTERACTION_MAX_MS,
): () => void {
  const token = Symbol(kind);
  const deadline =
    Date.now() + Math.min(Math.max(timeoutMs, 0), NATIVE_INTERACTION_MAX_MS);
  pending.set(token, deadline);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending.delete(token);
    settlingUntil = Math.max(
      settlingUntil,
      Math.min(deadline, Date.now() + NATIVE_RETURN_GRACE_MS),
    );
  };
}

export function nativeInteractionDeadline(): number {
  const now = Date.now();
  let deadline = settlingUntil;
  for (const [token, until] of pending) {
    if (until <= now) pending.delete(token);
    else deadline = Math.max(deadline, until);
  }
  return deadline;
}
