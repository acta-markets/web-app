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
export function pickAsset(assets: TradeAsset[], requested: string | null | undefined): TradeAsset | null {
  const wanted = requested?.trim().toUpperCase();
  return (wanted ? assets.find((a) => a.symbol.toUpperCase() === wanted) : undefined) ?? assets[0] ?? null;
}
