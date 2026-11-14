import { describe, expect, it } from "vitest";
import type { EarnAssetSummary } from "@/lib/rfq-client";
import { pickAsset, tradeAssets, assetsForMenu, type TradeAsset } from "./assets";

function row(symbol: string, mint: string, positionType: string, maxApr: number | null): EarnAssetSummary {
  const apr = maxApr == null ? { type: "unavailable" } : { type: "available", min: maxApr, max: maxApr };
  return {
    underlying_mint: mint, underlying_symbol: symbol, quote_mint: "usdc", quote_symbol: "USDC",
    position_type: positionType, apr, cap_filled_pct: 0, cap_total: 0, cap_used: 0,
    strikes_count: 3, nearest_market_pda: "pda", markets_count: 1, nearest_expiry_ts: 0,
  } as unknown as EarnAssetSummary;
}

describe("tradable assets", () => {
  const summary = [
    row("BONK", "bonk-mint", "covered_call", 0.4),
    row("WSOL", "sol-mint", "cash_secured_put", 0.3),
    row("SOL", "sol-mint", "covered_call", 0.5),
    row("MYSTERY", "unknown-mint", "covered_call", 2),
  ];

  it("merges both sides per mint, keeps every underlying (including unknown symbols) and lists SOL first", () => {
    expect(tradeAssets(summary)).toEqual([
      { symbol: "SOL", mint: "sol-mint", hasPut: true, hasCall: true, maxApr: 0.5 },
      { symbol: "BONK", mint: "bonk-mint", hasPut: false, hasCall: true, maxApr: 0.4 },
      { symbol: "MYSTERY", mint: "unknown-mint", hasPut: false, hasCall: true, maxApr: 2 },
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

  it("surfaces every devnet underlying, including XAU and TSLA absent from the static list", () => {
    const devnet = [
      row("JITOSOL", "4Q2yMuF3wBzMu36NFLmJSN2oq9Rzq7PKpqvj6pkoicw7", "covered_call", 0.1),
      row("HYPE", "PGQzFYGdDBA8XfjB25vHzPjXzTmCdo8U8kvsssr4VAz", "cash_secured_put", 0.2),
      row("SOL", "So11111111111111111111111111111111111111112", "covered_call", 0.3),
      row("TSLA", "HspdNpCTPsY9SuKqB24MzXoHaPXB2ZsqiFmsDYQjZbR2", "covered_call", 0.4),
      row("XAU", "CYpoVKVcxbBY29TPXp7wQYhNKrgswDghsdDo63RG9rNQ", "cash_secured_put", 0.5),
    ];
    const symbols = tradeAssets(devnet).map((a) => a.symbol).sort();
    // TSLA and XAU are not in the static token list, yet must still be tradable.
    expect(symbols).toEqual(["HYPE", "TSLA", "XAU", "jitoSOL", "SOL"].sort());
  });
});

describe("asset picker order", () => {
  const asset = (symbol: string): TradeAsset => ({ symbol, mint: symbol, hasPut: true, hasCall: true, maxApr: null });

  it("lists crypto first, led by BTC, ETH and SOL, then stocks and gold", () => {
    const menu = assetsForMenu(["SOL", "jitoSOL", "ETH", "BTC", "HYPE", "QQQ", "TSLA", "XAU"].map(asset));
    expect(menu.map((a) => a.symbol)).toEqual(["BTC", "ETH", "SOL", "jitoSOL", "HYPE", "QQQ", "TSLA", "XAU"]);
    expect(menu.map((a) => a.group)).toEqual(["Crypto", "Crypto", "Crypto", "Crypto", "Crypto", "Stocks & gold", "Stocks & gold", "Stocks & gold"]);
  });

  it("files an unknown ticker under crypto, alphabetically after the leaders", () => {
    expect(assetsForMenu(["PUMP", "BONK", "SOL"].map(asset)).map((a) => a.symbol)).toEqual(["SOL", "BONK", "PUMP"]);
  });
});
