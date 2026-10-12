import { describe, expect, it } from "vitest";
import {
  DAY_SECS,
  cumulativeReturnPct,
  cumulativeReturnSeries,
  finishedCycles,
  maxDrawdownPct,
  sharpeRatio,
  trailingApr,
  tvlSeries,
  windowSeries,
  type FinishedCycle,
} from "./metrics";
import type { VaultCycle } from "./types";

const WEEK = 7 * DAY_SECS;
const NOW = 1_800_000_000;

function cycle(overrides: Partial<VaultCycle> = {}): VaultCycle {
  return {
    cycle_number: "0",
    capital_generation: "0",
    expiry: "0",
    started_at: "0",
    finished_at: "100",
    share_price_start: "1000000000",
    share_price_end: "1010000000",
    equity_start: "1000000000",
    equity_end: "1010000000",
    positions_opened: 1,
    positions_settled: 1,
    return_pct: 1,
    performance_fee_assessed: "0",
    management_fee_assessed: "0",
    ...overrides,
  };
}

/** Back-to-back weekly cycles, the last one finishing `lastEndsDaysAgo` days before NOW. */
function weekly(returns: number[], lastEndsDaysAgo = 7): FinishedCycle[] {
  const lastEnd = NOW - lastEndsDaysAgo * DAY_SECS;
  return returns.map((returnPct, i) => {
    const finishedAt = lastEnd - (returns.length - 1 - i) * WEEK;
    return { cycleNumber: i, startedAt: finishedAt - WEEK, finishedAt, returnPct };
  });
}

describe("finishedCycles", () => {
  it("drops the running cycle even when its return is already filled in", () => {
    const cycles = finishedCycles([
      cycle({ cycle_number: "1", started_at: "200", finished_at: null, return_pct: 0.4 }),
      cycle({ cycle_number: "0", started_at: "0", finished_at: "100", return_pct: 1 }),
    ]);
    expect(cycles).toEqual([{ cycleNumber: 0, startedAt: 0, finishedAt: 100, returnPct: 1 }]);
  });

  it("derives the return from share prices when the backend leaves it out", () => {
    const [only] = finishedCycles([
      cycle({ return_pct: null, share_price_start: "1000000000", share_price_end: "1025000000" }),
    ]);
    expect(only.returnPct).toBeCloseTo(2.5, 10);
  });

  it("sorts by finish time and drops duplicate pages", () => {
    const a = cycle({ cycle_number: "0", started_at: "0", finished_at: "100" });
    const b = cycle({ cycle_number: "1", started_at: "100", finished_at: "200" });
    expect(finishedCycles([b, a, b]).map((c) => c.cycleNumber)).toEqual([0, 1]);
  });
});

describe("cumulative return", () => {
  it("compounds per-cycle returns, so a share price reset does not distort it", () => {
    const cycles = finishedCycles([
      cycle({ cycle_number: "0", started_at: "0", finished_at: "100", share_price_start: "1000000000", share_price_end: "1100000000", return_pct: 10 }),
      // new capital generation: the share price restarts at 1
      cycle({ cycle_number: "1", started_at: "100", finished_at: "200", share_price_start: "1000000000", share_price_end: "900000000", return_pct: -10 }),
    ]);
    expect(cumulativeReturnPct(cycles)).toBeCloseTo(-1, 10);
  });

  it("starts the series at zero when the first cycle starts", () => {
    const series = cumulativeReturnSeries(weekly([1, 2]));
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({ t: NOW - 21 * DAY_SECS, v: 0 });
    expect(series[1].v).toBeCloseTo(1, 10);
    expect(series[2].v).toBeCloseTo(3.02, 10);
  });

  it("rebases a range to the return earned inside it", () => {
    const cycles = weekly([10, 10, 10]);
    const since = cycles[1].finishedAt;
    const series = cumulativeReturnSeries(cycles, { since });
    expect(series[0]).toEqual({ t: since, v: 0 });
    expect(series[1].v).toBeCloseTo(10, 10);
  });

  it("returns nothing without completed cycles", () => {
    expect(cumulativeReturnPct([])).toBeNull();
    expect(cumulativeReturnSeries([])).toEqual([]);
  });
});

describe("tvlSeries", () => {
  it("plots equity at each boundary in whole tokens, including the running cycle's start", () => {
    const series = tvlSeries(
      [
        cycle({ cycle_number: "1", started_at: "100", finished_at: null, equity_start: "3000000000", equity_end: null }),
        cycle({ cycle_number: "0", started_at: "0", finished_at: "100", equity_start: "1000000000", equity_end: "1100000000" }),
      ],
      9,
    );
    // the next cycle's start (after deposits) replaces the previous end at the same instant
    expect(series).toEqual([
      { t: 0, v: 1 },
      { t: 100, v: 3 },
    ]);
  });

  it("keeps one point before a window so the line enters it", () => {
    const points = [
      { t: 0, v: 1 },
      { t: 10, v: 2 },
      { t: 20, v: 3 },
    ];
    expect(windowSeries(points, 15)).toEqual(points.slice(1));
    expect(windowSeries(points, null)).toEqual(points);
  });
});

describe("trailingApr", () => {
  it("annualizes the compounded return of the last 30 days over the time it spans", () => {
    // four weekly cycles ending 28, 21, 14 and 7 days ago; span 28 days
    const result = trailingApr(weekly([1, 1, -0.5, 1]), NOW);
    expect(result?.cycles).toBe(4);
    expect(result?.spanSecs).toBe(28 * DAY_SECS);
    expect(result?.aprPct).toBeCloseTo(32.78, 1);
  });

  it("ignores cycles that finished before the window", () => {
    const cycles = weekly([50, 1], 7);
    expect(trailingApr(cycles, NOW)?.cycles).toBe(2);
    expect(trailingApr(cycles, NOW + 20 * DAY_SECS)?.cycles).toBe(1);
  });

  it("has no value without a cycle in the window or with under a day of history", () => {
    expect(trailingApr(weekly([1], 40), NOW)).toBeNull();
    expect(trailingApr([{ cycleNumber: 0, startedAt: NOW - 3600, finishedAt: NOW - 60, returnPct: 1 }], NOW)).toBeNull();
  });
});

describe("sharpeRatio", () => {
  it("annualizes mean over sample deviation by the vault's cadence", () => {
    const result = sharpeRatio(weekly([1, 1, -0.5, 1, 2, 0, 1, 1]));
    expect(result.value).not.toBeNull();
    expect(result.value).toBeCloseTo(7.79, 2);
    expect(result.cycles).toBe(8);
  });

  it("needs enough cycles and some variation", () => {
    expect(sharpeRatio(weekly([1, 1, 1, 1, 1, 1, 2]))).toMatchObject({ value: null, reason: "too_few" });
    expect(sharpeRatio(weekly([1, 1, 1, 1, 1, 1, 1, 1]))).toMatchObject({ value: null, reason: "no_variance" });
  });
});

describe("maxDrawdownPct", () => {
  it("measures the worst fall from a peak at cycle ends", () => {
    expect(maxDrawdownPct(weekly([10, -20, 5]))).toBeCloseTo(-20, 10);
    expect(maxDrawdownPct(weekly([1, 2]))).toBe(0);
    expect(maxDrawdownPct([])).toBeNull();
  });
});
