import { describe, expect, it } from "vitest";
import type { TokenMarketsInfoData } from "@/lib/rfq-client";
import {
  buildStrikeOptions,
  defaultStrikeIndex,
  expiriesForSide,
  indicativesFor,
  spotFromSnapshot,
  strikesForSide,
  tradableExpiries,
  type StrikeOption,
} from "./strikes";

const now = 1_800_000_000;
const year = 365 * 86400;

function snapshot(): TokenMarketsInfoData {
  const indicatives = (positionType: string, strikes: Array<[number, number | null]>, stale = false, side: "sell" | "buy" = "sell") => ({
    position_type: positionType, side, freshness: { type: stale ? "stale" as const : "fresh" as const, updated_at: now },
    strikes: strikes.map(([strike, price]) => ({ strike: strike * 1e9, price: price == null ? { type: "none" as const } : { type: "quoted" as const, price: price * 1e9 } })),
  });
  return {
    request_id: "r", underlying_symbol: "SOL", underlying_decimals: 9, quote_symbol: "USDC", quote_decimals: 6,
    reference_price: 100e9, size_rule: { min_size: 1e8, max_size: 1e10, step: 1e8 },
    markets: [
      { market_pda: "put-late", expiry_ts: now + 2 * year, is_put: true, indicatives: [indicatives("cash_secured_put", [[90, 4]])] },
      { market_pda: "put-soon", expiry_ts: now + year, is_put: true, indicatives: [indicatives("cash_secured_put", [[80, 1], [95, 5], [90, 3]])] },
      { market_pda: "put-expired", expiry_ts: now - 60, is_put: true, indicatives: [] },
      { market_pda: "call-soon", expiry_ts: now + year, is_put: false, indicatives: [indicatives("covered_call", [[120, 2], [110, 10]])] },
    ],
  } as unknown as TokenMarketsInfoData;
}

describe("expiries", () => {
  it("lists one side, nearest first, without expired markets", () => {
    expect(expiriesForSide(snapshot(), true, now).map((e) => e.pda)).toEqual(["put-soon", "put-late"]);
    expect(expiriesForSide(snapshot(), false, now).map((e) => e.pda)).toEqual(["call-soon"]);
    expect(expiriesForSide(snapshot(), true).map((e) => e.pda)).toEqual(["put-expired", "put-soon", "put-late"]);
    expect(expiriesForSide(null, true, now)).toEqual([]);
  });

  it("offers only dates that list a strike", () => {
    const data = snapshot();
    data.markets[0].indicatives = [];
    expect(tradableExpiries(data, true, "cash_secured_put", "sell", now).map((e) => e.pda)).toEqual(["put-soon"]);
    expect(tradableExpiries(data, false, "covered_call", "sell", now).map((e) => e.pda)).toEqual(["call-soon"]);
  });

  it("collects one side's strikes across its unexpired dates", () => {
    expect(strikesForSide(snapshot(), true, "cash_secured_put", "sell", now)).toEqual([80e9, 90e9, 95e9]);
    expect(strikesForSide(snapshot(), false, "covered_call", "sell", now)).toEqual([110e9, 120e9]);
    expect(strikesForSide(null, true, "cash_secured_put", "sell", now)).toEqual([]);
  });

  it("reads spot from the reference price", () => {
    expect(spotFromSnapshot(snapshot())).toBe(100);
    expect(spotFromSnapshot({ ...snapshot(), reference_price: 0 })).toBeNull();
    expect(spotFromSnapshot(null)).toBeNull();
  });
});

describe("strike options", () => {
  const options = (pda: string, positionType: string, isPut: boolean, data = snapshot()) =>
    buildStrikeOptions(indicativesFor(data, pda, positionType, "sell"), {
      referencePrice1e9: Number(data.reference_price),
      secondsToExpiry: year,
      isPut,
    });

  it("orders puts down and calls up from the money, keeping exact wire strikes", () => {
    expect(options("put-soon", "cash_secured_put", true).map((o) => o.strike)).toEqual([95, 90, 80]);
    expect(options("call-soon", "covered_call", false).map((o) => o.strike1e9)).toEqual([110e9, 120e9]);
  });

  it("annualizes the premium against spot", () => {
    // 10 USDC on a $100 spot over one year
    expect(options("call-soon", "covered_call", false)[0].apr).toBeCloseTo(0.1);
  });

  it("has no APR for stale, missing or expired prices", () => {
    const data = snapshot();
    data.markets[1].indicatives[0].freshness = { type: "stale", updated_at: now };
    expect(options("put-soon", "cash_secured_put", true, data).every((o) => o.apr == null && o.bestPrice == null)).toBe(true);

    data.markets[3].indicatives[0].strikes[0].price = { type: "none" };
    expect(options("call-soon", "covered_call", false, data).find((o) => o.strike === 120)?.apr).toBeNull();

    const expired = buildStrikeOptions(indicativesFor(snapshot(), "call-soon", "covered_call", "sell"), {
      referencePrice1e9: 100e9, secondsToExpiry: 0, isPut: false,
    });
    expect(expired.every((o) => o.apr == null)).toBe(true);
    expect(buildStrikeOptions(undefined, { referencePrice1e9: 100e9, secondsToExpiry: year, isPut: true })).toEqual([]);
  });
});

describe("per-side indicatives", () => {
  it("picks the record for the requested side, not the other", () => {
    const data = snapshot();
    // Add a buy record for the same product/market; selling must still read the sell record.
    data.markets[1].indicatives.push({
      position_type: "cash_secured_put", side: "buy", freshness: { type: "fresh", updated_at: now },
      strikes: [{ strike: 99e9, price: { type: "quoted", price: 9e9 } }],
    });
    const sell = indicativesFor(data, "put-soon", "cash_secured_put", "sell");
    const buy = indicativesFor(data, "put-soon", "cash_secured_put", "buy");
    expect(sell?.strikes.map((s) => Number(s.strike))).toEqual([80e9, 95e9, 90e9]);
    expect(buy?.strikes.map((s) => Number(s.strike))).toEqual([99e9]);
    expect(strikesForSide(data, true, "cash_secured_put", "buy", now)).toEqual([99e9]);
  });
});

describe("default strike", () => {
  const option = (strike: number, priced = true): StrikeOption =>
    ({ strike, strike1e9: strike * 1e9, apr: priced ? 0.2 : null, bestPrice: priced ? 1e9 : null });

  it("takes the nearest priced strike out of the money", () => {
    const puts = [option(105), option(100), option(95), option(90)];
    expect(defaultStrikeIndex(puts, 98, true)).toBe(2);
    expect(defaultStrikeIndex([option(105), option(95, false), option(90)], 98, true)).toBe(2);
    expect(defaultStrikeIndex([option(95), option(105), option(110)], 100, false)).toBe(1);
  });

  it("falls back to the first priced strike", () => {
    expect(defaultStrikeIndex([option(105, false), option(102)], 100, true)).toBe(1);
    expect(defaultStrikeIndex([], 100, true)).toBe(-1);
  });

  it("with nothing priced, still starts out of the money", () => {
    expect(defaultStrikeIndex([option(105, false), option(95, false), option(90, false)], 100, true)).toBe(1);
    expect(defaultStrikeIndex([option(95, false), option(110, false)], 100, false)).toBe(1);
    expect(defaultStrikeIndex([option(105, false), option(102, false)], 100, true)).toBe(0);
  });
});

describe("QQQ market hours and Friday expiries", () => {
  const nowSec = 1_793_900_000; // 2026-11-06 ~00:33 UTC, before every fixture expiry
  const fridayA = 1793993400; // 2026-11-06 19:30 UTC (Friday)
  const fridayB = 1794598200; // 2026-11-13 19:30 UTC (Friday)
  const wednesday = 1794425400; // 2026-11-11 19:30 UTC (Wednesday)
  const fridayLate = 1794600000; // 2026-11-13 20:00 UTC (Friday, wrong time)

  function qqq(): TokenMarketsInfoData {
    const ind = (pda: string, strike: number, isPut: boolean) => ({
      market_pda: pda, is_put: isPut,
      indicatives: [{ position_type: isPut ? "cash_secured_put" : "covered_call", side: "sell", freshness: { type: "fresh", updated_at: nowSec }, strikes: [{ strike: strike * 1e9, price: { type: "quoted", price: strike * 1e9 } }] }],
    });
    return {
      request_id: "r", underlying_symbol: "QQQ", underlying_decimals: 9, quote_symbol: "USDC", quote_decimals: 6,
      reference_price: 500e9, size_rule: { min_size: 1e8, max_size: 1e10, step: 1e8 },
      markets: [
        { ...ind("put-friA", 490, true), expiry_ts: fridayA },
        { ...ind("put-friB", 480, true), expiry_ts: fridayB },
        { ...ind("put-wed", 470, true), expiry_ts: wednesday },
        { ...ind("put-late", 460, true), expiry_ts: fridayLate },
      ],
    } as unknown as TokenMarketsInfoData;
  }

  it("offers only Friday 19:30 UTC expiries", () => {
    expect(expiriesForSide(qqq(), true, nowSec).map((e) => e.pda)).toEqual(["put-friA", "put-friB"]);
  });

  it("trades the Friday expiries around the clock, since the stock tokens are 24/7", () => {
    // Sunday 2026-11-08 15:00 UTC and Friday 2026-11-06 15:00 UTC
    // Friday 15:00 UTC: both Friday slots still ahead. Sunday: only the later one survives.
    expect(tradableExpiries(qqq(), true, "cash_secured_put", "sell", 1793977200).map((e) => e.pda)).toEqual([
      "put-friA",
      "put-friB",
    ]);
    expect(tradableExpiries(qqq(), true, "cash_secured_put", "sell", 1794150000).map((e) => e.pda)).toEqual([
      "put-friB",
    ]);
  });
});
