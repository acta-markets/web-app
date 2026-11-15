import { describe, expect, it } from "vitest";
import type { PositionInfo } from "@/lib/rfq-client";
import {
  entryPremiumUsd,
  formatSignedUsd,
  openWrittenApr,
  positionDirection,
  realizedPnlUsd,
  summarizePnl,
  tradingStats,
  unrealizedPnlUsd,
} from "./portfolio-pnl";

// SOL: 9 underlying decimals, USDC: 6 quote decimals
const base = {
  pda: "p",
  market: "m",
  underlying_mint: "sol",
  quote_mint: "usdc",
  underlying_decimals: 9,
  quote_decimals: 6,
  quantity: "1000000000", // 1 SOL
  created_at: 1_793_000_000,
  expiry_ts: 1_793_086_400,
} as const;

function pos(over: Record<string, unknown>): PositionInfo {
  return { ...base, ...over } as unknown as PositionInfo;
}

describe("positionDirection", () => {
  it("classifies the four physical/option strategies by side and leg", () => {
    expect(positionDirection(pos({ side: "sell", terms: { type: "covered_call", strike: "150000000000" } }))).toMatchObject({ long: false, type: "call", settlement: "physical" });
    expect(positionDirection(pos({ side: "sell", terms: { type: "cash_secured_put", strike: "150000000000" } }))).toMatchObject({ long: false, type: "put", settlement: "physical" });
    expect(positionDirection(pos({ side: "buy", terms: { type: "covered_call", strike: "150000000000" } }))).toMatchObject({ long: true, type: "call" });
    expect(positionDirection(pos({ side: "buy", terms: { type: "cash_secured_put", strike: "150000000000" } }))).toMatchObject({ long: true, type: "put" });
  });

  it("marks spreads and cash puts as cash-settled", () => {
    expect(positionDirection(pos({ terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" } }))).toMatchObject({ settlement: "cash", type: "put" });
    expect(positionDirection(pos({ terms: { type: "call_spread", lower_strike: "150000000000", upper_strike: "160000000000" } }))).toMatchObject({ type: "call" });
    expect(positionDirection(pos({ terms: { type: "cash_put", strike: "120000000000" } }))).toMatchObject({ settlement: "cash", type: "put" });
  });
});

describe("entryPremiumUsd", () => {
  it("a writer's entry premium is the net premium on chain", () => {
    expect(entryPremiumUsd(pos({ side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2500000" }))).toBe(2.5);
  });

  it("a buyer's entry premium is the gross price paid", () => {
    // price 5e9 per unit * 1 SOL = $5
    expect(entryPremiumUsd(pos({ side: "buy", terms: { type: "covered_call", strike: "150000000000" }, price: "5000000000", total_premium: "9000000" }))).toBe(5);
  });

  it("falls back to price when a writer's net premium is absent", () => {
    expect(entryPremiumUsd(pos({ side: "sell", terms: { type: "covered_call", strike: "150000000000" }, price: "3000000000" }))).toBe(3);
  });
});

describe("realizedPnlUsd", () => {
  it("is null for open, funded and liquidated positions", () => {
    expect(realizedPnlUsd(pos({ side: "sell", state: "open", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000" }))).toBeNull();
    expect(realizedPnlUsd(pos({ side: "sell", state: "funded", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000" }))).toBeNull();
    expect(realizedPnlUsd(pos({ side: "sell", state: "liquidated", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000" }))).toBeNull();
  });

  it("a not-exercised or OTM writer keeps the premium", () => {
    const p = pos({ side: "sell", state: "settled", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000" });
    expect(realizedPnlUsd(pos({ ...p, settlement: { type: "physical", is_otm: true } }))).toBe(2);
    expect(realizedPnlUsd(pos({ ...p, settlement: { type: "not_exercised" } }))).toBe(2);
  });

  it("a not-exercised or OTM buyer loses the premium", () => {
    const p = pos({ side: "buy", state: "settled", terms: { type: "covered_call", strike: "150000000000" }, price: "4000000000" });
    expect(realizedPnlUsd(pos({ ...p, settlement: { type: "physical", is_otm: true } }))).toBe(-4);
    expect(realizedPnlUsd(pos({ ...p, settlement: { type: "not_exercised" } }))).toBe(-4);
  });

  it("an ITM assigned call costs the writer the move past the strike, less the premium", () => {
    // settlement 160, strike 150, 1 SOL → moved 10, premium 2 → loss 8
    const p = pos({ side: "sell", state: "settled", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000", settlement: { type: "physical", is_otm: false, settlement_price: "160000000000" } });
    expect(realizedPnlUsd(p)).toBe(-8);
  });

  it("an ITM exercised call pays the buyer the move past the strike, less the premium", () => {
    const p = pos({ side: "buy", state: "settled", terms: { type: "covered_call", strike: "150000000000" }, price: "2000000000", settlement: { type: "physical", is_otm: false, settlement_price: "160000000000" } });
    expect(realizedPnlUsd(p)).toBe(8);
  });

  it("a cash-settled spread settles holder payoff less premium", () => {
    const written = pos({ side: "sell", state: "settled", terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" }, total_premium: "1980000", settlement: { type: "cash", settlement_price: "110000000000", holder_payoff: "10000000", writer_return: "10000000" } });
    expect(realizedPnlUsd(written)).toBe(1.98 - 10);
    const bought = pos({ side: "buy", state: "settled", terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" }, price: "2000000000", settlement: { type: "cash", settlement_price: "110000000000", holder_payoff: "10000000", writer_return: "10000000" } });
    expect(realizedPnlUsd(bought)).toBe(10 - 2);
  });
});

describe("unrealizedPnlUsd", () => {
  const mark = (price: number) => ({ type: "available" as const, price: price * 1e9, published_at: 1_800_000_000 });

  it("is null without an available underlying price", () => {
    expect(unrealizedPnlUsd(pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, underlying_price: { type: "unavailable" } }))).toBeNull();
    // a legacy row without the field also stays null
    expect(unrealizedPnlUsd(pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" } }))).toBeNull();
  });

  it("marks a short call at intrinsic value (spot past strike) less the premium", () => {
    const p = pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000", underlying_price: mark(160) });
    expect(unrealizedPnlUsd(p)).toBeCloseTo(-8);
  });

  it("marks a bought call at intrinsic value less the premium", () => {
    const p = pos({ state: "open", side: "buy", terms: { type: "covered_call", strike: "150000000000" }, price: "2000000000", underlying_price: mark(160) });
    expect(unrealizedPnlUsd(p)).toBeCloseTo(8);
  });

  it("marks a bought cash-secured put at intrinsic value", () => {
    const p = pos({ state: "open", side: "buy", terms: { type: "cash_secured_put", strike: "150000000000" }, price: "3000000000", underlying_price: mark(140) });
    expect(unrealizedPnlUsd(p)).toBeCloseTo(7);
  });

  it("is null for settled positions", () => {
    const p = pos({ state: "settled", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000", underlying_price: mark(160), settlement: { type: "physical", is_otm: false, settlement_price: "160000000000" } });
    expect(unrealizedPnlUsd(p)).toBeNull();
  });
});

describe("summarizePnl", () => {
  it("totals realised P&L and win/loss counts over settled positions only", () => {
    const settled = [
      pos({ state: "settled", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "5000000", settlement: { type: "physical", is_otm: true } }),
      pos({ state: "settled", side: "buy", terms: { type: "covered_call", strike: "150000000000" }, price: "2000000000", settlement: { type: "physical", is_otm: true } }),
      pos({ state: "settled", side: "sell", terms: { type: "cash_secured_put", strike: "150000000000" }, total_premium: "1000000", settlement: { type: "physical", is_otm: false, settlement_price: "140000000000" } }),
    ];
    const open = pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "9000000" });
    const summary = summarizePnl([...settled, open]);
    // +5 - 2 + (1 - 10) = -6
    expect(summary.realized).toBeCloseTo(-6);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(2);
    expect(summary.settledCount).toBe(3);
    expect(summary.unrealized).toBeNull();
    expect(summary.hasUnrealizedMark).toBe(false);
  });

  it("totals unrealised P&L over open positions that carry a mark", () => {
    const shortCall = pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000", underlying_price: { type: "available", price: "160000000000", published_at: 1_800_000_000 } }); // -8
    const longPut = pos({ state: "open", side: "buy", terms: { type: "cash_secured_put", strike: "150000000000" }, price: "3000000000", underlying_price: { type: "available", price: "140000000000", published_at: 1_800_000_000 } }); // +7
    const noMark = pos({ state: "open", side: "sell", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "1000000", underlying_price: { type: "unavailable" } });
    const summary = summarizePnl([shortCall, longPut, noMark]);
    expect(summary.unrealized).toBeCloseTo(-1);
    expect(summary.hasUnrealizedMark).toBe(true);
  });
});

describe("formatSignedUsd", () => {
  it("signs and formats money", () => {
    expect(formatSignedUsd(12)).toBe("+$12.00");
    expect(formatSignedUsd(-12)).toBe("-$12.00");
    expect(formatSignedUsd(0)).toBe("$0.00");
  });
});

describe("openWrittenApr", () => {
  const YEAR = 365 * 24 * 60 * 60;
  const sell = (over: Record<string, unknown>) =>
    pos({ side: "sell", state: "open", terms: { type: "covered_call", strike: "100000000000" }, total_premium: "1000000", created_at: 1_700_000_000, expiry_ts: 1_700_000_000 + YEAR, ...over });

  it("weights annualised premium-over-collateral across written positions", () => {
    // A: $1 premium on $100 collateral, 1 year → 1%; B: $4 on $200, 1 year → 2%
    const a = sell({});
    const b = sell({ terms: { type: "covered_call", strike: "200000000000" }, total_premium: "4000000" });
    const result = openWrittenApr([a, b]);
    expect(result.writtenCount).toBe(2);
    expect(result.collateralUsd).toBeCloseTo(300);
    // (1% * 100 + 2% * 200) / 300
    expect(result.aprPct).toBeCloseTo(500 / 300);
  });

  it("uses the on-chain spread collateral for written spreads", () => {
    const spread = pos({ side: "sell", state: "open", terms: { type: "call_spread", lower_strike: "100000000000", upper_strike: "120000000000" }, total_premium: "2000000", created_at: 1_700_000_000, expiry_ts: 1_700_000_000 + YEAR });
    const result = openWrittenApr([spread]);
    expect(result.writtenCount).toBe(1);
    expect(result.collateralUsd).toBeCloseTo(20);
    expect(result.aprPct).toBeGreaterThan(0);
  });

  it("skips buys, settled positions and zero-duration rows rather than guessing", () => {
    const buy = pos({ side: "buy", state: "open", terms: { type: "covered_call", strike: "100000000000" }, price: "1000000000", created_at: 1_700_000_000, expiry_ts: 1_700_000_000 + YEAR });
    const settled = pos({ side: "sell", state: "settled", terms: { type: "covered_call", strike: "100000000000" }, total_premium: "1000000", settlement: { type: "physical", is_otm: true } });
    const zeroDur = sell({ expiry_ts: 1_700_000_000 });
    expect(openWrittenApr([buy, settled, zeroDur])).toEqual({ aprPct: null, collateralUsd: 0, writtenCount: 0 });
  });
});

describe("tradingStats", () => {
  it("splits collected vs paid premium and counts the open book", () => {
    const openSell = pos({ side: "sell", state: "open", terms: { type: "covered_call", strike: "150000000000" }, total_premium: "2000000" });
    const openBuy = pos({ side: "buy", state: "open", terms: { type: "covered_call", strike: "150000000000" }, price: "5000000000" });
    const settledBuy = pos({ side: "buy", state: "settled", terms: { type: "covered_call", strike: "150000000000" }, price: "2000000000", settlement: { type: "physical", is_otm: true } });
    const stats = tradingStats([openSell, openBuy, settledBuy]);
    expect(stats.collectedUsd).toBeCloseTo(2);
    expect(stats.paidUsd).toBeCloseTo(7); // 5 + 2
    expect(stats.openSells).toBe(1);
    expect(stats.openBuys).toBe(1);
    expect(stats.sellCount).toBe(1);
    expect(stats.buyCount).toBe(2);
  });

  it("reports zero positions honestly via the counts, not as collected figures", () => {
    expect(tradingStats([])).toEqual({ collectedUsd: 0, paidUsd: 0, openSells: 0, openBuys: 0, sellCount: 0, buyCount: 0 });
  });
});
