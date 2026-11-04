import { computeApyFromScaledPrices } from "@acta-markets/ts-sdk/ws";
import type { TokenMarketIndicatives, TokenMarketsInfoData } from "@/lib/rfq-client";

const PRICE_SCALE = 1_000_000_000;

export type ExpiryOption = { pda: string; expiryTs: number; isPut: boolean };

export type StrikeOption = {
  strike: number;
  /** the strike exactly as the server sent it; RFQs and quote matching use this value */
  strike1e9: number;
  /** annualized, as a fraction; null when the premium is stale or missing */
  apr: number | null;
  /** indicative net premium per underlying unit, 1e9-scaled */
  bestPrice: number | null;
};

export function spotFromSnapshot(data: TokenMarketsInfoData | null | undefined): number | null {
  const reference = data?.reference_price;
  return reference != null && Number(reference) > 0 ? Number(reference) / PRICE_SCALE : null;
}

/** One side's markets, nearest expiry first. With `nowSec`, expired markets are dropped. */
export function expiriesForSide(
  data: TokenMarketsInfoData | null | undefined,
  isPut: boolean,
  nowSec?: number
): ExpiryOption[] {
  if (!data?.markets) return [];
  return data.markets
    .filter((m) => m.is_put === isPut && (nowSec == null || Number(m.expiry_ts) > nowSec))
    .map((m) => ({ pda: m.market_pda, expiryTs: Number(m.expiry_ts), isPut: m.is_put }))
    .sort((a, b) => a.expiryTs - b.expiryTs);
}

/**
 * One side's dates that list at least one strike, nearest first. A market past its
 * trading cutoff can still be listed with no strikes; it has nothing to trade.
 */
export function tradableExpiries(
  data: TokenMarketsInfoData | null | undefined,
  isPut: boolean,
  positionType: string,
  nowSec: number
): ExpiryOption[] {
  return expiriesForSide(data, isPut, nowSec).filter(
    (e) => (indicativesFor(data, e.pda, positionType)?.strikes.length ?? 0) > 0
  );
}

/** Every strike listed on one side across its unexpired dates, as 1e9 wire values, low to high. */
export function strikesForSide(
  data: TokenMarketsInfoData | null | undefined,
  isPut: boolean,
  positionType: string,
  nowSec: number
): number[] {
  const strikes = new Set<number>();
  for (const m of data?.markets ?? []) {
    if (m.is_put !== isPut || Number(m.expiry_ts) <= nowSec) continue;
    for (const ind of m.indicatives) {
      if (ind.position_type === positionType) ind.strikes.forEach((s) => strikes.add(Number(s.strike)));
    }
  }
  return [...strikes].sort((a, b) => a - b);
}

export function indicativesFor(
  data: TokenMarketsInfoData | null | undefined,
  marketPda: string | null | undefined,
  positionType: string
): TokenMarketIndicatives | undefined {
  return data?.markets
    .find((m) => m.market_pda === marketPda)?.indicatives
    .find((i) => i.position_type === positionType);
}

/**
 * Strike choices with APR from the snapshot's indicative premiums. Calls ascend and
 * puts descend, so the list starts at the strike nearest the money.
 */
export function buildStrikeOptions(
  indicatives: TokenMarketIndicatives | null | undefined,
  {
    referencePrice1e9,
    secondsToExpiry,
    isPut,
  }: { referencePrice1e9: number | null; secondsToExpiry: number; isPut: boolean }
): StrikeOption[] {
  if (!indicatives?.strikes?.length) return [];
  const hasSpot = referencePrice1e9 != null && referencePrice1e9 > 0;
  const options = indicatives.strikes.map((s) => {
    const bestPrice = !indicatives.is_stale && s.best_price != null ? Number(s.best_price) : null;
    let apr: number | null = null;
    if (bestPrice != null && hasSpot && secondsToExpiry > 0) {
      try {
        apr = computeApyFromScaledPrices({
          underlyingAmount: 1,
          grossPremiumPerUnit1e9: bestPrice,
          spotPrice1e9: referencePrice1e9,
          secondsToExpiry,
        }).apr;
      } catch {
        apr = null;
      }
    }
    return { strike: Number(s.strike) / PRICE_SCALE, strike1e9: Number(s.strike), apr, bestPrice };
  });
  return options.sort((a, b) => (isPut ? b.strike - a.strike : a.strike - b.strike));
}

/**
 * The nearest priced strike on the out-of-the-money side of spot (below it for a put,
 * above it for a call); else the first priced strike. With nothing priced, the nearest
 * out-of-the-money strike, else the first one. -1 when empty.
 */
export function defaultStrikeIndex(options: StrikeOption[], spot: number | null, isPut: boolean): number {
  if (options.length === 0) return -1;
  const outOfTheMoney = (o: StrikeOption) => spot == null || (isPut ? o.strike < spot : o.strike > spot);
  const nearestOtm = options.findIndex((o) => o.apr != null && outOfTheMoney(o));
  if (nearestOtm !== -1) return nearestOtm;
  const firstPriced = options.findIndex((o) => o.apr != null);
  if (firstPriced !== -1) return firstPriced;
  return Math.max(0, options.findIndex(outOfTheMoney));
}
