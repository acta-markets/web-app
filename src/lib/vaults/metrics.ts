import type { VaultCycle } from "./types";

/**
 * Vault performance metrics, computed from completed cycles only.
 *
 * Every figure compounds per-cycle returns instead of reading share prices
 * directly: the share price resets on a new capital generation, and the
 * cycles route does not say which generation a cycle belongs to.
 */

export const DAY_SECS = 86_400;
export const YEAR_SECS = 365 * DAY_SECS;
export const APR_WINDOW_SECS = 30 * DAY_SECS;
export const MIN_SHARPE_CYCLES = 8;

export type FinishedCycle = {
  cycleNumber: number;
  startedAt: number;
  finishedAt: number;
  /** 1.0 means 1% */
  returnPct: number;
};

export type SeriesPoint = { t: number; v: number };

function toNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cycleReturnPct(cycle: VaultCycle): number | null {
  if (cycle.return_pct != null) return Number.isFinite(cycle.return_pct) ? cycle.return_pct : null;
  if (cycle.share_price_end == null) return null;
  try {
    const start = BigInt(cycle.share_price_start);
    const end = BigInt(cycle.share_price_end);
    if (start === 0n) return null;
    // (end / start - 1) * 100, kept in bigint until the last step
    return Number(((end - start) * 1_000_000_000_000n) / start) / 1e10;
  } catch {
    return null;
  }
}

/**
 * Completed cycles in time order. The running cycle is excluded even when the
 * backend has already filled in its end price and return: those are not final.
 */
export function finishedCycles(cycles: readonly VaultCycle[]): FinishedCycle[] {
  const unique = new Map<string, FinishedCycle>();
  for (const cycle of cycles) {
    const finishedAt = toNumber(cycle.finished_at);
    const startedAt = toNumber(cycle.started_at);
    if (finishedAt == null || startedAt == null) continue;
    const returnPct = cycleReturnPct(cycle);
    if (returnPct == null) continue;
    unique.set(`${cycle.cycle_number}:${cycle.started_at}`, {
      cycleNumber: Number(cycle.cycle_number),
      startedAt,
      finishedAt,
      returnPct,
    });
  }
  return [...unique.values()].sort((a, b) => a.finishedAt - b.finishedAt || a.cycleNumber - b.cycleNumber);
}

function growthIndex(index: number, returnPct: number): number {
  return Math.max(0, index * (1 + returnPct / 100));
}

export function cumulativeReturnPct(cycles: readonly FinishedCycle[]): number | null {
  if (cycles.length === 0) return null;
  return (cycles.reduce((index, c) => growthIndex(index, c.returnPct), 1) - 1) * 100;
}

/**
 * Compounded return over time: 0% when the first cycle starts, then one point
 * per completed cycle. With `since`, values are rebased to the last point at or
 * before it, so a range shows the return earned inside that range.
 */
export function cumulativeReturnSeries(
  cycles: readonly FinishedCycle[],
  opts: { since?: number | null } = {},
): SeriesPoint[] {
  if (cycles.length === 0) return [];
  const points = [{ t: cycles[0].startedAt, index: 1 }];
  let index = 1;
  for (const cycle of cycles) {
    index = growthIndex(index, cycle.returnPct);
    points.push({ t: cycle.finishedAt, index });
  }

  let anchor = 0;
  if (opts.since != null) {
    for (let i = 0; i < points.length; i++) if (points[i].t <= opts.since) anchor = i;
  }
  const base = points[anchor].index;
  return points.slice(anchor).map((p) => ({ t: p.t, v: base > 0 ? (p.index / base - 1) * 100 : 0 }));
}

/** Equity at each cycle boundary, in the deposit asset. Includes the running cycle's start. */
export function tvlSeries(cycles: readonly VaultCycle[], decimals: number): SeriesPoint[] {
  const scale = 10 ** decimals;
  const ordered = [...cycles].sort((a, b) => Number(a.started_at) - Number(b.started_at));
  const byTime = new Map<number, number>();
  for (const cycle of ordered) {
    const startedAt = toNumber(cycle.started_at);
    const equityStart = toNumber(cycle.equity_start);
    if (startedAt != null && equityStart != null) byTime.set(startedAt, equityStart / scale);
    const finishedAt = toNumber(cycle.finished_at);
    const equityEnd = toNumber(cycle.equity_end);
    // a later cycle's start at the same instant overwrites this, which is the fresher value
    if (finishedAt != null && equityEnd != null) byTime.set(finishedAt, equityEnd / scale);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

/** Points from `since` on, keeping the last earlier point so the line enters the range. */
export function windowSeries(points: readonly SeriesPoint[], since: number | null): SeriesPoint[] {
  if (since == null) return [...points];
  let anchor = -1;
  for (let i = 0; i < points.length; i++) if (points[i].t <= since) anchor = i;
  return points.slice(Math.max(0, anchor));
}

export type TrailingApr = { aprPct: number; cycles: number; spanSecs: number };

/**
 * "30d avg APR": the compounded return of cycles that finished in the trailing
 * window, annualized simply over the calendar time they span (idle gaps
 * included, as in the backend's track record).
 */
export function trailingApr(
  cycles: readonly FinishedCycle[],
  nowSecs: number,
  windowSecs = APR_WINDOW_SECS,
): TrailingApr | null {
  const inWindow = cycles.filter((c) => c.finishedAt > nowSecs - windowSecs && c.finishedAt <= nowSecs);
  if (inWindow.length === 0) return null;
  const growth = inWindow.reduce((index, c) => growthIndex(index, c.returnPct), 1) - 1;
  const spanSecs =
    Math.max(...inWindow.map((c) => c.finishedAt)) - Math.min(...inWindow.map((c) => c.startedAt));
  if (spanSecs < DAY_SECS) return null;
  return { aprPct: growth * (YEAR_SECS / spanSecs) * 100, cycles: inWindow.length, spanSecs };
}

export type SharpeResult =
  | { value: number; cycles: number; periodsPerYear: number }
  | { value: null; reason: "too_few" | "no_variance" | "no_span"; cycles: number };

/**
 * Annualized Sharpe ratio of per-cycle returns with a zero risk-free rate.
 * Annualized by the vault's mean calendar cadence, so pauses between cycles
 * lower it rather than being ignored.
 */
export function sharpeRatio(cycles: readonly FinishedCycle[], minCycles = MIN_SHARPE_CYCLES): SharpeResult {
  const n = cycles.length;
  if (n < Math.max(2, minCycles)) return { value: null, reason: "too_few", cycles: n };
  const returns = cycles.map((c) => c.returnPct / 100);
  const mean = returns.reduce((sum, r) => sum + r, 0) / n;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 1e-12)) return { value: null, reason: "no_variance", cycles: n };
  const span = cycles[n - 1].finishedAt - cycles[0].startedAt;
  if (!(span > 0)) return { value: null, reason: "no_span", cycles: n };
  const periodsPerYear = (n * YEAR_SECS) / span;
  return { value: (mean / sd) * Math.sqrt(periodsPerYear), cycles: n, periodsPerYear };
}

/** Worst peak-to-trough fall of the compounded index, measured at cycle ends only. */
export function maxDrawdownPct(cycles: readonly FinishedCycle[]): number | null {
  if (cycles.length === 0) return null;
  let index = 1;
  let peak = 1;
  let worst = 0;
  for (const cycle of cycles) {
    index = growthIndex(index, cycle.returnPct);
    peak = Math.max(peak, index);
    worst = Math.min(worst, peak > 0 ? index / peak - 1 : 0);
  }
  return worst * 100;
}
