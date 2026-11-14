import type { EarnAssetSummary } from "@/lib/rfq-client";
import { normalizeTokenSymbol } from "@/lib/tokens";

export type TradeAsset = {
  symbol: string;
  /** the server's mint for this underlying; snapshots are requested with it */
  mint: string;
  hasPut: boolean;
  hasCall: boolean;
  /** best APR across both sides, as a fraction */
  maxApr: number | null;
};

const PREFERRED = ["SOL", "JITOSOL", "JLP", "ZBTC", "ETH", "PUMP", "BONK"];

/**
 * Tradable underlyings from the earn summary, one per mint. Every underlying the venue
 * reports is kept — the earn summary is the source of truth for what is tradable. The
 * static token list only supplies logos and canonical display names via
 * `normalizeTokenSymbol`; it never gates a mint out.
 */
export function tradeAssets(summary: EarnAssetSummary[] | null): TradeAsset[] {
  if (!summary) return [];
  const byMint = new Map<string, TradeAsset>();
  for (const row of summary) {
    const symbol = normalizeTokenSymbol(row.underlying_symbol);
    if (!row.underlying_mint) continue;
    const entry = byMint.get(row.underlying_mint) ??
      { symbol, mint: row.underlying_mint, hasPut: false, hasCall: false, maxApr: null };
    if (row.position_type === "cash_secured_put") entry.hasPut = true;
    if (row.position_type === "covered_call") entry.hasCall = true;
    if (row.apr.type === "available") entry.maxApr = Math.max(entry.maxApr ?? 0, row.apr.max);
    byMint.set(row.underlying_mint, entry);
  }
  const rank = (symbol: string) => {
    const i = PREFERRED.indexOf(symbol.toUpperCase());
    return i === -1 ? PREFERRED.length : i;
  };
  return [...byMint.values()].sort((a, b) => rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol));
}

/** The requested asset if it is tradable, else the first in display order. */
/** The picker's two shelves. Anything the venue lists that is not named here is crypto. */
export type AssetGroup = "Crypto" | "Stocks & gold";
const STOCKS_AND_GOLD = new Set(["QQQ", "TSLA", "SPY", "SPYX", "NVDA", "NVDAX", "XAU"]);
/** Crypto's opening order in the picker; the rest follow alphabetically. */
const CRYPTO_LEAD = ["BTC", "ZBTC", "ETH", "SOL", "JITOSOL"];

export function assetGroup(symbol: string): AssetGroup {
  return STOCKS_AND_GOLD.has(symbol.trim().toUpperCase()) ? "Stocks & gold" : "Crypto";
}

/**
 * The assets as the picker lists them: crypto first, led by BTC, ETH and SOL, then stocks and
 * gold; alphabetical within each shelf after that. The page's own order (`tradeAssets`) is unchanged.
 */
export function assetsForMenu(assets: TradeAsset[]): Array<TradeAsset & { group: AssetGroup }> {
  const lead = (symbol: string) => {
    const i = CRYPTO_LEAD.indexOf(symbol.toUpperCase());
    return i === -1 ? CRYPTO_LEAD.length : i;
  };
  return assets
    .map((a) => ({ ...a, group: assetGroup(a.symbol) }))
    .sort(
      (a, b) =>
        Number(a.group !== "Crypto") - Number(b.group !== "Crypto") ||
        lead(a.symbol) - lead(b.symbol) ||
        a.symbol.localeCompare(b.symbol),
    );
}

/** The market the trade page lands on when the link names none: Bitcoin, under either of its tickers. */
const LANDING_ASSETS = ["BTC", "ZBTC"];

/** The requested asset; without a request (or when it is not listed) Bitcoin, else the first listed. */
export function pickAsset(assets: TradeAsset[], requested: string | null | undefined): TradeAsset | null {
  const wanted = requested?.trim().toUpperCase();
  const bySymbol = (symbol: string) => assets.find((a) => a.symbol.toUpperCase() === symbol);
  return (
    (wanted ? bySymbol(wanted) : undefined) ??
    LANDING_ASSETS.map(bySymbol).find((a) => a != null) ??
    assets[0] ??
    null
  );
}

/** Starting size in the asset's own units, where one is set; other assets start at about $100. */
export const DEFAULT_SIZE_UNITS: Readonly<Record<string, number>> = { BTC: 0.1, ZBTC: 0.1 };
