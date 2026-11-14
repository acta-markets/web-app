export type HistoryPoint = { t: number; v: number };
export type HistoryRange = "1d" | "1w" | "1m" | "3m";

/** Waits between attempts while the price source is rate-limited; its limit resets within a minute. */
export const HISTORY_RETRY_DELAYS_MS: ReadonlyArray<number> = [3_000, 8_000, 20_000];

type HistoryResponse = { points?: Array<[number, number]>; retry?: boolean };

/** Resolves after `ms`, or at once when the signal aborts. */
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/**
 * A price series from `/api/market/history`, oldest first, in seconds. A passing failure (the
 * route's `retry` flag, or a failed request) is retried quietly, so the chart keeps loading
 * instead of flashing "unavailable". Resolves to an empty series when the asset has no history
 * or the retries run out; never rejects. Aborting the signal stops the retries.
 */
export async function loadPriceHistory(
  symbol: string,
  range: HistoryRange,
  signal: AbortSignal,
  delays: ReadonlyArray<number> = HISTORY_RETRY_DELAYS_MS
): Promise<HistoryPoint[]> {
  const url = `/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`;
  for (let attempt = 0; ; attempt++) {
    let data: HistoryResponse | null = null;
    try {
      data = (await (await fetch(url)).json()) as HistoryResponse;
    } catch {
      // a failed request is a passing failure too
    }
    const points = (data?.points ?? [])
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([ms, v]) => ({ t: ms / 1000, v }))
      .sort((a, b) => a.t - b.t);
    const passing = data == null || (points.length === 0 && data.retry === true);
    if (!passing || attempt >= delays.length || signal.aborted) return points;
    await wait(delays[attempt], signal);
    if (signal.aborted) return points;
  }
}
