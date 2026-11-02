import type { VaultCycle } from "./types";

/**
 * Chart series from the cycles route. Headline figures come from the backend's
 * `performance`; these only plot cycles, compounding per-cycle returns because
 * the share price resets on a new capital generation.
 */

export const DAY_SECS = 86_400;

export type FinishedCycle = {
  cycleNumber: number;
  /** Null when the cycle's opening event is not retained. */
  capitalGeneration: string | null;
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
      capitalGeneration: cycle.capital_generation,
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
