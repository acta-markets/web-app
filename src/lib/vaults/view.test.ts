import { describe, expect, it } from "vitest";
import type * as Sdk from "@acta-markets/ts-sdk/http";
import { cycleView, exposureView, positionView } from "./view";

const cycle = (state: Sdk.VaultCycle["state"]): Sdk.VaultCycle => ({
  cycle_number: "4", capital_generation: { type: "unknown" }, expiry_ts: "2", started_at: "1", share_price_start: "1000",
  equity_start: "5", state, positions_opened: 1, positions_settled: 0, performance_fee_assessed: "0", management_fee_assessed: "0",
});

describe("vault views", () => {
  it("keeps a priced cycle's end values before it is finalized", () => {
    const priced = cycleView(cycle({ type: "priced", share_price_end: "1010", equity_end: "6", return_pct: { type: "available", value: 1 } }));
    expect(priced).toMatchObject({ capital_generation: null, finished_at: null, share_price_end: "1010", equity_end: "6", return_pct: 1 });
    expect(cycleView(cycle({ type: "running" }))).toMatchObject({ finished_at: null, share_price_end: null, return_pct: null });
  });

  it("unpacks a closed position and an unpriced exposure row", () => {
    const position = positionView({
      vault_pda: "v", position_pda: "p", order_id: "o", role: "writer", market_pda: "m", position_type: "covered_call",
      product: { type: "physical" }, strike: "1", quantity: "1", net_premium: "1", counterparty_owner: "c", status: "settled",
      funded_amount: { type: "unavailable" }, close: { type: "closed", closed_at: "9", is_otm: true },
      created_at: "1", acquired_at: "1", transaction: { type: "known", signature: "s" },
    });
    expect(position).toMatchObject({ funded_amount: null, is_otm: true, settled_at: "9", transaction_signature: "s" });
    const exposure = exposureView({
      vault_pda: "v", as_of: "1", totals: [{ quote_mint: "q", notional_at_strike: { type: "available", atoms: "5" }, outstanding_intrinsic: { type: "unavailable" } }],
      positions: [{
        position_pda: "p", market_pda: "m", position_type: "covered_call", role: "writer", status: "open", strike: "1", quantity: "1",
        expiry_ts: "2", underlying_mint: "u", quote_mint: "q", decimals: { type: "unknown" }, spot: { type: "unpriced" },
        moneyness: { type: "unavailable" }, intrinsic: { type: "unavailable" },
      }],
    });
    expect(exposure.positions[0]).toMatchObject({ underlying_decimals: null, spot: null, itm: null, intrinsic: null });
    expect(exposure.totals[0]).toEqual({ quote_mint: "q", notional_at_strike: "5", outstanding_intrinsic: null });
  });
});
