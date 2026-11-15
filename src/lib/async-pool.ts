/**
 * Runs `fn` over `items` with at most `limit` in flight and returns the results in order.
 * Like `Promise.all`, the first failure rejects; nothing new is started after it.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/**
 * Calls `fn` again when it throws, waiting a little longer before each new try. For requests
 * that can be dropped or refused in passing (a busy RPC), never for anything a person approves.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { tries = 3, delayMs = 400, signal }: { tries?: number; delayMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries || signal?.aborted) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
