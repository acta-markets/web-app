import { describe, expect, it } from "vitest";
import { buildProfitLadder, tablePrice } from "./profit-ladder";

describe("table price", () => {
  it("uses one format per table, picked from today's price", () => {
    expect(tablePrice(103, 80)).toBe("$103.00");
    expect(tablePrice(89.18, 80)).toBe("$89.18");
    expect(tablePrice(70441.6, 68000)).toBe("$70,442");
    expect(tablePrice(0.0017, 0.002)).toBe("$0.0017");
  });
});

describe("profit ladder", () => {
  const call = { direction: "above" as const, strike: 105, spot: 100, breakeven: 106, premiumUsd: 1, units: 1 };

  it("opens with the breakeven as a move, then climbs in even 5% steps to 50%", () => {
    const ladder = buildProfitLadder(call);
    expect(ladder.breakeven).toEqual({ move: "+6.0%", price: "$106.00", result: "breakeven" });
    expect(ladder.steps.map((s) => s.move)).toEqual(["+10%", "+15%", "+20%", "+25%", "+30%", "+35%", "+40%", "+45%", "+50%"]);
    expect(ladder.steps[0]).toEqual({ move: "+10%", price: "$110.00", result: "+$4.00" });
  });

  it("mirrors for a put, and drops the cents from $100 up", () => {
    const ladder = buildProfitLadder({ direction: "below", strike: 95, spot: 100, breakeven: 94, premiumUsd: 100, units: 100 });
    expect(ladder.breakeven?.move).toBe("\u22126.0%");
    expect(ladder.steps[0]).toEqual({ move: "\u221210%", price: "$90.00", result: "+$400" });
    expect(ladder.steps.at(-1)?.move).toBe("\u221250%");
  });

  it("rounds a far breakeven to a whole percent and still gives three steps past 50%", () => {
    const ladder = buildProfitLadder({ ...call, strike: 150, breakeven: 152 });
    expect(ladder.breakeven?.move).toBe("+52%");
    expect(ladder.steps.map((s) => s.move)).toEqual(["+55%", "+60%", "+65%"]);
  });

  it("lists the buyer's goal as a line of its own, in the order of the prices, and marks it", () => {
    const ladder = buildProfitLadder({ ...call, goalPrice: 118 });
    expect(ladder.steps.map((s) => s.move).slice(0, 4)).toEqual(["+10%", "+15%", "+18.0%", "+20%"]);
    // $118 on a $105 call that cost $1: $12 made
    expect(ladder.steps[2]).toEqual({ move: "+18.0%", price: "$118.00", result: "+$12.00", goal: true });
    expect(ladder.steps.filter((s) => s.goal)).toHaveLength(1);
  });

  it("marks the step itself when the goal is at a step's price, and leaves out a goal that makes nothing", () => {
    const onStep = buildProfitLadder({ ...call, goalPrice: 120 });
    expect(onStep.steps.map((s) => s.move)).toEqual(["+10%", "+15%", "+20%", "+25%", "+30%", "+35%", "+40%", "+45%", "+50%"]);
    expect(onStep.steps[2]).toEqual({ move: "+20%", price: "$120.00", result: "+$14.00", goal: true });
    // $105.50 is past the strike but short of the $106 breakeven
    expect(buildProfitLadder({ ...call, goalPrice: 105.5 }).steps.some((s) => s.goal)).toBe(false);
    // no goal, or one on the wrong side of today's price: the ladder as it was
    expect(buildProfitLadder(call).steps.some((s) => s.goal)).toBe(false);
    expect(buildProfitLadder({ ...call, goalPrice: 90 }).steps.some((s) => s.goal)).toBe(false);
  });

  it("puts a put's goal among its downward steps", () => {
    const ladder = buildProfitLadder({ direction: "below", strike: 95, spot: 100, breakeven: 94, premiumUsd: 100, units: 100, goalPrice: 83 });
    expect(ladder.steps.map((s) => s.move).slice(0, 4)).toEqual(["\u221210%", "\u221215%", "\u221217.0%", "\u221220%"]);
    expect(ladder.steps[2]).toMatchObject({ price: "$83.00", result: "+$1,100", goal: true });
  });

  it("keeps the breakeven but lists no steps until the trade is priced and sized", () => {
    expect(buildProfitLadder({ ...call, premiumUsd: null }).steps).toEqual([]);
    expect(buildProfitLadder({ ...call, units: null }).breakeven?.price).toBe("$106.00");
    expect(buildProfitLadder({ ...call, spot: 0 })).toEqual({ breakeven: null, steps: [] });
  });
});
