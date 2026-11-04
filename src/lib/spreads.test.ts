import { describe, expect, it } from "vitest";
import { exactAtoms, quoteMatchesProduct, spreadCollateralCheck, spreadPnl, spreadPreview, spreadTerms, strikeTicksByMint, requireStrikeTick, spreadName, validSpreadPremium, wireInteger } from "./spreads";

const TICK = 10_000_000n;
const call = spreadTerms("call_spread", 100e9, 120e9, 1_000_000n, 6, 6, TICK);
const put = spreadTerms("put_spread", 100e9, 120e9, 1_000_000n, 6, 6, TICK);
describe("spread economics", () => {
  it.each([[90, 2, -18], [100, 2, -18], [110, -8, -8], [120, -18, 2], [130, -18, 2]])("cash P&L at %s", (spot, c, p) => {
    expect(spreadPnl(call, 2_000_000n, BigInt(spot) * 1_000_000_000n)).toBe(BigInt(c) * 1_000_000n);
    expect(spreadPnl(put, 2_000_000n, BigInt(spot) * 1_000_000_000n)).toBe(BigInt(p) * 1_000_000n);
  });
  it("uses net premium, width fees and the upper short put strike", () => {
    expect(spreadPreview(call, 2_000_000_000n, 100, 100)).toMatchObject({ collateral: 20_000_000n, netPremium: 1_980_000n, maxLoss: 18_020_000n, breakeven: 101.98 });
    expect(spreadPreview(put, 2_000_000_000n, 100, 100).breakeven).toBe(118.02);
  });
  it("requires full ceil collateral before requesting, including tiny fractional liabilities", () => {
    const tiny = spreadTerms("call_spread", 100e9, 100.01e9, 1n, 9, 6, TICK);
    expect(spreadCollateralCheck(tiny, 0n)).toEqual({ required: 1n, sufficient: false });
    expect(spreadCollateralCheck(tiny, 1n).sufficient).toBe(true);
    expect(spreadCollateralCheck(call, null).sufficient).toBe(false);
    expect(spreadCollateralCheck(call, 19_999_999n).sufficient).toBe(false);
    expect(spreadCollateralCheck(call, 20_000_000n).sufficient).toBe(true);
  });
  it("filters non-executable premiums before ranking quotes", () => {
    expect(validSpreadPremium(call, 1e9)).toBe(true);
    for (const price of [0, 1, 20e9, 21e9, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validSpreadPremium(call, price)).toBe(false);
    }
    const tiny = spreadTerms("call_spread", 100e9, 120e9, 1n, 9, 6, TICK);
    expect(validSpreadPremium(tiny, 1)).toBe(false);
  });
  it("rejects invalid pairs, premium and lossy input", () => {
    expect(() => spreadTerms("put_spread", 120e9, 100e9, 1n, 6, 6, TICK)).toThrow();
    expect(() => spreadTerms("call_spread", 100e9 + 1, 120e9, 1n, 6, 6, TICK)).toThrow();
    expect(spreadTerms("call_spread", 100e9 + 1, 120e9 + 3, 1n, 6, 6, 1n).upperStrike).toBe(120_000_000_003n);
    expect(spreadTerms("call_spread", 1e9, 9_000_000e9, 1n, 6, 6, 1_000_000_000n).lowerStrike).toBe(1_000_000_000n);
    expect(() => spreadTerms("call_spread", 100e9, 120e9, 1n, 6, 6, 0n)).toThrow();
    expect(() => spreadTerms("call_spread", 100e9, 120.5e9, 1n, 6, 6, 1_000_000_000n)).toThrow();
    expect(() => spreadPreview(call, 20_000_000_000n, 0, 0)).toThrow();
    expect(exactAtoms("0.000001", 6)).toBe(1n);
    expect(() => exactAtoms("0.0000001", 6)).toThrow();
    expect(() => wireInteger(9_007_199_254_740_992n)).toThrow();
  });
});
describe("server strike ticks", () => {
  it("maps positive ticks by mint and requires one for spreads", () => {
    const role = { type: "underlying" as const, size_rule: { min_size: 1, max_size: 100, step: 1 }, quote_mints: [] };
    const ticks = strikeTicksByMint([{ mint: "A", role: { ...role, strike_tick: 500_000_000 } }, { mint: "B", role: { type: "quote" } }, { mint: "C", role: { ...role, strike_tick: 0 } }]);
    expect([...ticks]).toEqual([["A", 500_000_000n]]);
    expect(requireStrikeTick(ticks, "A")).toBe(500_000_000n);
    expect(() => requireStrikeTick(ticks, "B")).toThrow();
  });
});
describe("product and pair identity", () => {
  const terms = { type: "call_spread" as const, lower_strike: 100e9, upper_strike: 120e9 };
  const quote = { side: "sell", terms };
  it("requires the complete spread pair, sell side and explicit product", () => {
    expect(quoteMatchesProduct(quote, terms)).toBe(true);
    for (const changed of [
      { side: undefined }, { side: "buy" }, { terms: undefined },
      { terms: { type: "covered_call", strike: 100e9 } },
      { terms: { ...terms, type: "put_spread" } },
      { terms: { ...terms, upper_strike: undefined } },
      { terms: { ...terms, upper_strike: 130e9 } },
      { terms: { ...terms, lower_strike: 90e9 } },
    ]) {
      expect(quoteMatchesProduct({ ...quote, ...changed } as unknown as Parameters<typeof quoteMatchesProduct>[0], terms)).toBe(false);
    }
  });
  it("requires physical terms and rejects spread legs or mismatched products", () => {
    const physical = { type: "covered_call" as const, strike: 100e9 };
    expect(quoteMatchesProduct({ side: "sell", terms: physical }, physical)).toBe(true);
    expect(quoteMatchesProduct(quote, physical)).toBe(false);
    const extraLeg = { side: "sell", terms: { ...physical, upper_strike: 120e9 } };
    expect(quoteMatchesProduct(extraLeg, physical)).toBe(false);
    expect(quoteMatchesProduct({ side: "sell", terms: { type: "cash_secured_put", strike: 100e9 } }, physical)).toBe(false);
  });
  it("matches the requested side both ways", () => {
    const physical = { type: "covered_call" as const, strike: 100e9 };
    expect(quoteMatchesProduct({ side: "buy", terms: physical }, physical, "buy")).toBe(true);
    expect(quoteMatchesProduct({ side: "sell", terms: physical }, physical, "buy")).toBe(false);
    expect(quoteMatchesProduct({ side: "buy", terms: physical }, physical, "sell")).toBe(false);
  });
});

describe("spread names", () => {
  it("reads strikes as prices and drops an unknown symbol", () => {
    expect(spreadName("SOL", "call_spread", 180e9, 200e9)).toBe("SOL 180/200 call");
    expect(spreadName(null, "put_spread", 1_500_500_000_000, 1_600e9)).toBe("1,500.5/1,600 put");
  });
});
