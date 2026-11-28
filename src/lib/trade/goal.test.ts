import { describe, expect, it } from "vitest";
import { defaultGoal, formatProfit, goalOptions, pickGoal } from "./goal";

describe("a buyer's goals", () => {
  it("are round prices past the strike, about 1% of today's price apart, then wider", () => {
    const goals = goalOptions({ direction: "above", strike: 61_000, spot: 60_449, premiumUsd: null, units: null });
    // 1% of $60,449 rounds down to a $500 step; the strike itself is never a goal
    expect(goals.slice(0, 4).map((g) => g.price)).toEqual([61_500, 62_000, 62_500, 63_000]);
    expect(goals.at(-1)!.price).toBe(61_500 + 49 * 500);
    expect(goals.every((g) => g.profit === null)).toBe(true);
  });

  it("run downwards for a belief that the price ends below, and never reach zero", () => {
    const goals = goalOptions({ direction: "below", strike: 150, spot: 152, premiumUsd: null, units: null });
    expect(goals.slice(0, 3).map((g) => g.price)).toEqual([149, 148, 147]);
    expect(goals.every((g) => g.price > 0)).toBe(true);
  });

  it("start past a strike that sits between round prices", () => {
    const goals = goalOptions({ direction: "above", strike: 61_250, spot: 60_449, premiumUsd: null, units: null });
    expect(goals[0].price).toBe(61_500);
    const down = goalOptions({ direction: "below", strike: 61_250, spot: 60_449, premiumUsd: null, units: null });
    expect(down[0].price).toBe(61_000);
  });

  it("carry what the trade makes there, and leave out the ones that lose", () => {
    // 0.1 BTC for $60: $61,500 makes 0.1 × 500 − 60 = −10 (left out), $62,000 makes +40
    const goals = goalOptions({ direction: "above", strike: 61_000, spot: 60_449, premiumUsd: 60, units: 0.1 });
    expect(goals[0]).toEqual({ price: 62_000, profit: 40 });
    expect(goals[1]).toEqual({ price: 62_500, profit: 90 });
    // a put is paid by the fall
    const puts = goalOptions({ direction: "below", strike: 150, spot: 152, premiumUsd: 1, units: 2 });
    expect(puts[0]).toEqual({ price: 149, profit: 1 });
  });

  it("is empty without a price to measure from", () => {
    expect(goalOptions({ direction: "above", strike: 61_000, spot: 0, premiumUsd: null, units: null })).toEqual([]);
  });
});

describe("the goal the page opens on", () => {
  const goals = goalOptions({ direction: "above", strike: 61_000, spot: 60_449, premiumUsd: 60, units: 0.1 });

  it("is a far one: the nearest that makes at least five times what was paid", () => {
    // $60 paid, so $300: $64,500 makes +$290 and falls short, $65,000 makes +$340
    expect(defaultGoal(goals, 60)!.price).toBe(65_000);
  });

  it("is the furthest when none goes that far, and well out along the list when unpriced", () => {
    const short = goals.slice(0, 1);
    expect(defaultGoal(short, 60)!.price).toBe(62_000);
    const unpriced = goalOptions({ direction: "above", strike: 61_000, spot: 60_449, premiumUsd: null, units: null });
    // the eleventh goal: eleven steps of $500 past the first
    expect(defaultGoal(unpriced, null)!.price).toBe(67_000);
    expect(defaultGoal([], 60)).toBeNull();
  });

  it("keeps a chosen goal, or moves to the nearest one still on offer", () => {
    expect(pickGoal(goals, 64_000, 60)!.price).toBe(64_000);
    // $61,500 no longer makes money at this price: the nearest that does takes its place
    expect(pickGoal(goals, 61_500, 60)!.price).toBe(62_000);
    expect(pickGoal(goals, null, 60)!.price).toBe(65_000);
  });
});

describe("a profit, written", () => {
  it("has cents below $100 and none from there up", () => {
    expect(formatProfit(28.4)).toBe("+$28.40");
    expect(formatProfit(1234.4)).toBe("+$1,234");
  });
});
