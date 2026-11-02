import { describe, expect, it } from "vitest";
import type { EarnAssetSummary } from "@/lib/rfq-client";
import { pickAsset, tradeAssets } from "./assets";

function row(symbol: string, mint: string, positionType: string, maxApr: number | null): EarnAssetSummary {
  return {
    underlying_mint: mint, underlying_symbol: symbol, quote_mint: "usdc", quote_symbol: "USDC",
    position_type: positionType, min_apr: null, max_apr: maxApr, cap_filled_pct: 0, cap_total: 0, cap_used: 0,
    strikes_count: 3, nearest_market_pda: "pda", markets_count: 1, nearest_expiry_ts: 0,
  };
}

describe("tradable assets", () => {
  const summary = [
    row("BONK", "bonk-mint", "covered_call", 0.4),
    row("WSOL", "sol-mint", "cash_secured_put", 0.3),
    row("SOL", "sol-mint", "covered_call", 0.5),
    row("MYSTERY", "unknown-mint", "covered_call", 2),
  ];

  it("merges both sides per mint, keeps known tokens only and lists SOL first", () => {
    expect(tradeAssets(summary)).toEqual([
      { symbol: "SOL", mint: "sol-mint", hasPut: true, hasCall: true, maxApr: 0.5 },
      { symbol: "BONK", mint: "bonk-mint", hasPut: false, hasCall: true, maxApr: 0.4 },
    ]);
    expect(tradeAssets(null)).toEqual([]);
  });

  it("picks the requested asset in any case, else the first", () => {
    const assets = tradeAssets(summary);
    expect(pickAsset(assets, "bonk")?.symbol).toBe("BONK");
    expect(pickAsset(assets, "JLP")?.symbol).toBe("SOL");
    expect(pickAsset(assets, null)?.symbol).toBe("SOL");
    expect(pickAsset([], "SOL")).toBeNull();
  });
});
