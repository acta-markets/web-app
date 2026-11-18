import type { EarnAssetSummary, TokenMarketsInfoData } from "@/lib/rfq-client";
import { publicKey } from "@/lib/state/keys";
import { recall, restoreRemembered } from "@/lib/state/remembered";
import { pickAsset, tradeAssets } from "./assets";
import { tradeDraftStore } from "./draft";

/**
 * What Trade draws from before the socket has answered on a return visit: the market data it
 * last loaded on this device. Display only. A quote is asked for from this session's own
 * snapshot and nothing else; the page's button stays off until that has arrived.
 */

/** The longest a saved snapshot (dates, strikes, the reference price) is drawn from. */
export const SNAPSHOT_SHOW_MS = 24 * 60 * 60 * 1000;
/** Premiums and rates move faster: an indicative older than this shows as "no price". */
export const PREMIUM_SHOW_MS = 10 * 60 * 1000;

export const earnSummaryKey = () => publicKey("earn-summary");
export const marketsKey = (mint: string) => publicKey("markets", mint);
export const feesKey = () => publicKey("protocol-fees");
export const referencePricesKey = () => publicKey("reference-prices");

/** Each listed asset's reference price as last read, by mint, for the asset picker. */
export type SavedReferencePrices = Record<string, { price: number; at: number }>;

/** The saved price of one asset, or null when there is none or it is more than a day old. */
export function lastKnownPrice(saved: SavedReferencePrices | undefined, mint: string, nowMs: number = Date.now()): number | null {
  const entry = saved?.[mint];
  if (!entry || !(entry.price > 0) || !entry.at || nowMs - entry.at > SNAPSHOT_SHOW_MS) return null;
  return entry.price;
}

/**
 * The saved snapshot as it may be shown now: null once it is too old, and with every
 * indicative that has aged past `PREMIUM_SHOW_MS` marked stale, which the page already
 * shows as a missing price rather than a number.
 */
export function lastKnownSnapshot(
  saved: { data: TokenMarketsInfoData | undefined; updatedAt: number },
  nowMs: number = Date.now(),
): TokenMarketsInfoData | null {
  if (!saved.data || !saved.updatedAt || nowMs - saved.updatedAt > SNAPSHOT_SHOW_MS) return null;
  let changed = false;
  const markets = (saved.data.markets ?? []).map((market) => {
    let marketChanged = false;
    const indicatives = (market.indicatives ?? []).map((ind) => {
      if (ind.freshness.type !== "fresh") return ind;
      if (nowMs - Number(ind.freshness.updated_at) * 1000 <= PREMIUM_SHOW_MS) return ind;
      marketChanged = true;
      return { ...ind, freshness: { type: "stale" as const, updated_at: ind.freshness.updated_at } };
    });
    if (!marketChanged) return market;
    changed = true;
    return { ...market, indicatives };
  });
  return changed ? { ...saved.data, markets } : saved.data;
}

let primed = false;

/**
 * Starts reading what Trade's first screen needs from the device as soon as the page's code
 * loads, ahead of its first render: the asset list, the fee schedule, the picker's prices, and the market data of
 * the asset the page will open on (the one the address names, else the one last used).
 */
export function primeTrade(): void {
  if (primed || typeof window === "undefined") return;
  primed = true;
  void restoreRemembered(feesKey());
  void restoreRemembered(referencePricesKey());
  void restoreRemembered(earnSummaryKey()).then(() => {
    const assets = tradeAssets(recall<EarnAssetSummary[]>(earnSummaryKey()) ?? null);
    let wanted: string | null = null;
    try {
      wanted = new URLSearchParams(window.location.search).get("asset") ?? tradeDraftStore().read().asset ?? null;
    } catch {
      // an unreadable address or storage: the first listed asset is what opens
    }
    const asset = pickAsset(assets, wanted);
    if (asset) return restoreRemembered(marketsKey(asset.mint));
  });
}
