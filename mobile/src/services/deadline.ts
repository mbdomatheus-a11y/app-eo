export async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(message));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function ensureActive(signal: AbortSignal) {
  if (signal.aborted)
    throw new Error(
      "Operação encerrada. Tente novamente quando a conexão estiver disponível.",
    );
}
export function createTimedFetch(
  baseFetch: typeof fetch,
  ms = 20000,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const caller = init?.signal;
    const abort = () => controller.abort();
    if (caller?.aborted) controller.abort();
    else caller?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, ms);
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut && !caller?.aborted)
        throw Object.assign(new Error("Tempo limite de conexão."), {
          name: "TimeoutError",
          code: "ETIMEDOUT",
        });
      throw error;
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener("abort", abort);
    }
  };
}
