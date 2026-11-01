import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { spreadPositionAmounts, spreadRowView } from "./spread-positions";
import type { PositionInfo, MarketDescriptorInfo } from "@/lib/rfq-client";
const position = { side: "sell", terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 }, quantity: 1_000_000, total_premium: 1_980_000, state: "settled", underlying_decimals: 6, quote_decimals: 6, settlement: { type: "cash", settlement_price: 110e9, maker_payoff: 10_000_000, taker_return: 10_000_000 } } as PositionInfo;
const descriptor = { underlying_decimals: 6, quote_decimals: 6, underlying_symbol: "TEST", quote_symbol: "USDC" } as MarketDescriptorInfo;
describe("spread portfolio cash results", () => {
  it("uses token decimals and finalized cash payouts, not physical exercise notional", () => {
    expect(spreadPositionAmounts(position, descriptor)).toMatchObject({ quantity: 1, collateral: 20_000_000n, payout: 10_000_000n, returned: 10_000_000n, pnl: -8_020_000n });
  });
  it("keeps absent settlement receipts unknown and accepts a known zero payout", () => {
    expect(spreadPositionAmounts({ ...position, state: "open" }, descriptor)).toMatchObject({ payout: null, returned: null, pnl: null });
    expect(spreadPositionAmounts({ ...position, state: "settled", settlement: { type: "cash", settlement_price: 120e9, maker_payoff: 0, taker_return: 20_000_000 } }, descriptor)).toMatchObject({ payout: 0n, pnl: 1_980_000n });
    expect(spreadPositionAmounts({ ...position, state: "open" }, descriptor)?.payout).toBeNull();
  });
  it("uses row decimals without a descriptor and rejects incomplete terms", () => {
    expect(spreadPositionAmounts({ ...position, terms: { type: "put_spread", lower_strike: 100e9 } } as unknown as PositionInfo, descriptor)).toBeNull();
    expect(spreadPositionAmounts(position)).toMatchObject({ collateral: 20_000_000n, payout: 10_000_000n });
  });
});

describe("spread positions table", () => {
  afterEach(cleanup);
  it("annualizes premium on the locked collateral", () => {
    const open = { ...position, pda: "a", market: "m", state: "open", created_at: 1_793_000_000, expiry_ts: 1_793_000_000 + 365 * 86_400 } as PositionInfo;
    const amounts = spreadPositionAmounts(open, descriptor);
    const expected = (Number(amounts?.premium) / Number(amounts?.collateral)) * 100;
    expect(spreadRowView(open, [])?.apr).toBe(`${expected.toFixed(2)}%`);
  });
  it("never shows a mint address as the symbol", () => {
    const mint = "Mint111111111111111111111111111111111111111";
    const view = spreadRowView({ ...position, pda: "a", market: "m", underlying_mint: mint, state: "open", expiry_ts: 1_793_000_000 } as PositionInfo, []);
    expect(view?.label).toBe("100/120 put");
    expect(view?.status).toBe("Open");
    expect(JSON.stringify(view)).not.toContain("Mint1");
  });
  it("names a cash put as a put spread from zero with full-width collateral", () => {
    const cashPut = { ...position, pda: "cash", market: "m", terms: { type: "cash_put", strike: 120e9 }, expiry_ts: 1_793_000_000 } as PositionInfo;
    expect(spreadPositionAmounts(cashPut, descriptor)?.collateral).toBe(120_000_000n);
    expect(spreadRowView(cashPut, [{ ...descriptor, market: { market_pda: "m" } } as MarketDescriptorInfo])?.label).toBe("TEST 0/120 put");
  });
  it("shows a settled spread's signed cash result", () => {
    const view = spreadRowView({ ...position, pda: "a", market: "m", expiry_ts: 1_793_000_000 } as PositionInfo, [{ ...descriptor, market: { market_pda: "m" } } as MarketDescriptorInfo]);
    expect(view?.label).toBe("TEST 100/120 put");
    expect([view?.result, view?.negative]).toEqual(["-8.02 USDC", true]);
  });
});
