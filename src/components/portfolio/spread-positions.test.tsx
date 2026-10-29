import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpreadPositions, spreadPositionAmounts } from "./spread-positions";
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
  it("shows five single-value columns and never a mint address as the symbol", () => {
    const mint = "Mint111111111111111111111111111111111111111";
    render(<SpreadPositions history={false} descriptors={[]}
      positions={[{ ...position, pda: "a", market: "m", underlying_mint: mint, state: "open", expiry_ts: 1_793_000_000 } as PositionInfo]} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Spread", "Expiry", "Size", "Premium", "Result"]);
    expect(screen.getByText("100/120 put")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Mint1");
    expect(document.body.textContent).not.toContain("Unknown");
  });
  it("renders a cash put with its one public strike and full-width collateral", () => {
    const cashPut = { ...position, pda: "cash", market: "m", terms: { type: "cash_put", strike: 120e9 }, expiry_ts: 1_793_000_000 } as PositionInfo;
    expect(spreadPositionAmounts(cashPut, descriptor)?.collateral).toBe(120_000_000n);
    render(<SpreadPositions history descriptors={[{ ...descriptor, market: { market_pda: "m" } } as MarketDescriptorInfo]} positions={[cashPut]} />);
    expect(screen.getByText("TEST 120 cash put")).toBeTruthy();
    expect(document.body.textContent).not.toContain("0/120");
  });
  it("shows a settled spread's signed cash result", () => {
    render(<SpreadPositions history descriptors={[{ ...descriptor, market: { market_pda: "m" } } as MarketDescriptorInfo]}
      positions={[{ ...position, pda: "a", market: "m", expiry_ts: 1_793_000_000 } as PositionInfo]} />);
    expect(screen.getByText("TEST 100/120 put")).toBeTruthy();
    expect(screen.getByText("-8.02 USDC").className).toContain("text-error");
  });
});
