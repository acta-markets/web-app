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

/** The server said "too many requests" (HTTP 429): asking again at once only gets the same answer. */
export function isRateLimited(err: unknown): boolean {
  const status = (err as { context?: { statusCode?: unknown } } | null)?.context?.statusCode;
  return status === 429 || /\b429\b|too many requests/i.test(err instanceof Error ? err.message : String(err));
}

/**
 * A request that never got an answer from the program it was for: refused for rate, an HTTP
 * error, or a connection that failed. An answer that says no (a failed simulation, a rejected
 * transaction) is not one of these and is the same however often it is asked.
 */
export function isTransportError(err: unknown): boolean {
  if (isRateLimited(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /^HTTP error|fetch failed|failed to fetch|network ?error|load failed|timed? ?out|ECONNRESET|UND_ERR/i.test(message);
}

/** A public RPC counts requests over ten seconds, so a refusal for rate is waited out, not hurried. */
const RATE_LIMIT_TRIES = 7;
const RATE_LIMIT_DELAY_MS = 1_000;

/**
 * Calls `fn` again when it throws, waiting a little longer before each new try. For requests
 * that can be dropped or refused in passing (a busy RPC), never for anything a person approves.
 *
 * A refusal for rate gets more tries and longer waits than a dropped request, up to about
 * twenty seconds in all: the limit it ran into only lifts with time. `when` narrows what is
 * tried again; without it everything is.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    tries = 3,
    delayMs = 400,
    rateLimitDelayMs = RATE_LIMIT_DELAY_MS,
    when,
    signal,
  }: { tries?: number; delayMs?: number; rateLimitDelayMs?: number; when?: (err: unknown) => boolean; signal?: AbortSignal } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const limited = isRateLimited(err);
      const allowed = limited ? Math.max(tries, RATE_LIMIT_TRIES) : tries;
      if (attempt >= allowed || signal?.aborted || (when && !when(err))) throw err;
      await new Promise((resolve) => setTimeout(resolve, limited ? rateLimitDelayMs * Math.min(attempt, 5) : delayMs * attempt));
    }
  }
}
