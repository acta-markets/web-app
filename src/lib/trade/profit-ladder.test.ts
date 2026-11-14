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

  it("keeps the breakeven but lists no steps until the trade is priced and sized", () => {
    expect(buildProfitLadder({ ...call, premiumUsd: null }).steps).toEqual([]);
    expect(buildProfitLadder({ ...call, units: null }).breakeven?.price).toBe("$106.00");
    expect(buildProfitLadder({ ...call, spot: 0 })).toEqual({ breakeven: null, steps: [] });
  });
});
