import { spreadCollateral, spreadPayoff, SpreadType } from "@acta-markets/ts-sdk/chain";
import { intrinsicValue1e9 } from "@acta-markets/ts-sdk/ws";
import type { PositionInfo } from "@/lib/rfq-client";
import { executionTerms, isCashSettled, isSpreadTerms, lowerStrike } from "@/lib/spreads";

const PRICE_SCALE = 1_000_000_000;

/** A mark older than this is shown as stale (e.g. an equity/commodity outside its session). */
export const UNDERLYING_STALE_AFTER_MS = 5 * 60 * 1000;

export type PositionDirection = {
  /** true when the taker bought the option (side === "buy") */
  long: boolean;
  /** call for covered call / call spread, put otherwise */
  type: "call" | "put";
  /** physical (covered call / cash-secured put) vs cash-settled (spread / cash put) */
  settlement: "physical" | "cash";
};

export function positionDirection(p: PositionInfo): PositionDirection {
  const type: PositionDirection["type"] =
    p.terms.type === "covered_call" || p.terms.type === "call_spread" ? "call" : "put";
  return {
    long: p.side === "buy",
    type,
    settlement: isCashSettled(p.terms.type) ? "cash" : "physical",
  };
}

/** The position's size in whole underlying units (not atoms). */
export function positionQuantity(p: PositionInfo): number {
  return Number(p.quantity) / 10 ** p.underlying_decimals;
}

/**
 * Entry premium in quote units (USD): a buyer paid the gross price, a writer received
 * the net premium already on chain. Null when the row cannot be priced.
 */
export function entryPremiumUsd(p: PositionInfo): number | null {
  const quantity = positionQuantity(p);
  if (!Number.isFinite(quantity)) return null;
  if (p.side === "buy") {
    if (!Number.isFinite(Number(p.price))) return null;
    return (Number(p.price) / PRICE_SCALE) * quantity;
  }
  if (Number.isFinite(Number(p.total_premium))) {
    return Number(p.total_premium) / 10 ** p.quote_decimals;
  }
  if (!Number.isFinite(Number(p.price))) return null;
  return (Number(p.price) / PRICE_SCALE) * quantity;
}

/**
 * Realised P&L in quote units (USD) for a settled position, or null while the outcome
 * is not yet on chain (open, funded, settling) or not computable (liquidated). Matches
 * the settlement math already shown in the history table.
 */
export function realizedPnlUsd(p: PositionInfo): number | null {
  const entry = entryPremiumUsd(p);
  if (entry == null || p.state !== "settled") return null;
  const dir = positionDirection(p);
  const settlement = p.settlement;

  if (dir.settlement === "physical") {
    if (settlement.type === "not_exercised") return dir.long ? -entry : entry;
    if (settlement.type !== "physical") return null;
    if (settlement.is_otm) return dir.long ? -entry : entry;
    const settle = Number(settlement.settlement_price) / PRICE_SCALE;
    const strike = Number(lowerStrike(p.terms)) / PRICE_SCALE;
    const moved = Math.abs(settle - strike) * positionQuantity(p);
    return dir.long ? moved - entry : entry - moved;
  }

  // cash-settled (spread / cash put): the holder collects the payoff, the writer keeps premium less payoff
  if (settlement.type !== "cash") return null;
  const payoff = Number(settlement.holder_payoff) / 10 ** p.quote_decimals;
  return dir.long ? payoff - entry : entry - payoff;
}

/**
 * Unrealised P&L for an open position: its value "if you executed now" at the current
 * underlying price, less the entry premium. The mark is the underlying's oracle price
 * (`underlying_price`), so the option is valued at intrinsic value (spot vs strike) — it
 * carries no time value. Null when the mark is unavailable or the row cannot be priced.
 */
export function unrealizedPnlUsd(p: PositionInfo): number | null {
  if (p.underlying_price?.type !== "available") return null;
  if (p.state !== "open" && p.state !== "funded") return null;
  const entry = entryPremiumUsd(p);
  if (entry == null) return null;
  const payoff = payoffAtSpotUsd(p, Number(p.underlying_price.price));
  if (payoff == null) return null;
  return positionDirection(p).long ? payoff - entry : entry - payoff;
}

/**
 * The option's intrinsic payoff at `spot1e9` (the underlying, 1e9-scaled), in quote units.
 * Physical legs use spot vs strike; cash-settled legs use the on-chain spread payoff.
 */
function payoffAtSpotUsd(p: PositionInfo, spot1e9: number): number | null {
  const dir = positionDirection(p);
  const qty = positionQuantity(p);
  if (dir.settlement === "cash") {
    const terms = executionTerms(p.terms);
    if (!isSpreadTerms(terms)) return null;
    try {
      const payoff = spreadPayoff(
        {
          positionType: terms.type === "call_spread" ? SpreadType.CallSpread : SpreadType.PutSpread,
          lowerStrike: BigInt(terms.lower_strike),
          upperStrike: BigInt(terms.upper_strike),
          quantity: BigInt(p.quantity),
          quoteDecimals: p.quote_decimals,
          underlyingDecimals: p.underlying_decimals,
        },
        BigInt(Math.round(spot1e9)),
      );
      return Number(payoff) / 10 ** p.quote_decimals;
    } catch {
      return null;
    }
  }
  // Intrinsic value comes from the SDK so physical and cash-settled legs follow the same
  // definition the program uses, instead of a second copy of the payoff maths.
  try {
    const terms = executionTerms(p.terms);
    const perUnit = intrinsicValue1e9(terms, BigInt(Math.round(spot1e9)));
    return (Number(perUnit) / PRICE_SCALE) * qty;
  } catch {
    const strike = Number(lowerStrike(p.terms)) / PRICE_SCALE;
    const spot = spot1e9 / PRICE_SCALE;
    const intrinsic = dir.type === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    return intrinsic * qty;
  }
}

export type UnderlyingMark = {
  /** Underlying price in quote units (USD). */
  priceUsd: number;
  /** When the oracle last published this price, ms epoch. */
  publishedAtMs: number;
  /** True when the price predates the current session and should be shown as stale. */
  stale: boolean;
};

/** The position's underlying mark, or null when the server has none. */
export function underlyingMark(p: PositionInfo, nowMs: number = Date.now()): UnderlyingMark | null {
  if (p.underlying_price?.type !== "available") return null;
  // `published_at` is Unix seconds, matching `created_at` / `expiry_ts` on the same row.
  const publishedAtMs = Number(p.underlying_price.published_at) * 1000;
  return {
    priceUsd: Number(p.underlying_price.price) / PRICE_SCALE,
    publishedAtMs,
    stale: nowMs - publishedAtMs > UNDERLYING_STALE_AFTER_MS,
  };
}

export type PnlSummary = {
  /** Net realised P&L across settled positions, in quote units (USD). */
  realized: number;
  /** Net unrealised P&L across open positions with a mark, or null when none have one. */
  unrealized: number | null;
  /** True when at least one open position carries an underlying mark (unrealised is real). */
  hasUnrealizedMark: boolean;
  wins: number;
  losses: number;
  breakEven: number;
  /** Settled positions with a computable outcome, the basis of realised P&L. */
  settledCount: number;
};

export function summarizePnl(positions: readonly PositionInfo[]): PnlSummary {
  let realized = 0;
  let unrealized = 0;
  let markedOpen = 0;
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let settledCount = 0;
  for (const p of positions) {
    if (p.state === "settled") {
      const pnl = realizedPnlUsd(p);
      if (pnl == null) continue;
      settledCount += 1;
      realized += pnl;
      if (pnl > 0) wins += 1;
      else if (pnl < 0) losses += 1;
      else breakEven += 1;
    } else if (p.state === "open" || p.state === "funded") {
      const pnl = unrealizedPnlUsd(p);
      if (pnl != null) {
        unrealized += pnl;
        markedOpen += 1;
      }
    }
  }
  return {
    realized,
    unrealized: markedOpen > 0 ? unrealized : null,
    hasUnrealizedMark: markedOpen > 0,
    wins,
    losses,
    breakEven,
    settledCount,
  };
}

/** Signed money string for a P&L figure: "+$12.00" / "-$12.00" / "$0.00". */
export function formatSignedUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${body}` : `${sign}${body}`;
}

export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export type OpenWrittenApr = {
  /** Weighted annualised premium-over-collateral across open written positions; null when none are computable. */
  aprPct: number | null;
  /** Collateral (USD) backing the weighted APR. */
  collateralUsd: number;
  /** Written positions included in the weighting. */
  writtenCount: number;
};

/**
 * The collateral a written (sell) position locks, in quote units (USD): the notional at the
 * strike for a covered call / cash-secured put, the on-chain spread collateral for a spread.
 * Null when the position cannot be priced.
 */
function writtenCollateralUsd(p: PositionInfo): number | null {
  const qty = positionQuantity(p);
  if (!Number.isFinite(qty)) return null;
  const terms = executionTerms(p.terms);
  if (isSpreadTerms(terms)) {
    try {
      const collateral = spreadCollateral({
        positionType: terms.type === "call_spread" ? SpreadType.CallSpread : SpreadType.PutSpread,
        lowerStrike: BigInt(terms.lower_strike),
        upperStrike: BigInt(terms.upper_strike),
        quantity: BigInt(p.quantity),
        quoteDecimals: p.quote_decimals,
        underlyingDecimals: p.underlying_decimals,
      });
      return Number(collateral) / 10 ** p.quote_decimals;
    } catch {
      return null;
    }
  }
  const strike = Number(lowerStrike(p.terms)) / PRICE_SCALE;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return qty * strike;
}

/** One written position's annualised yield: entry premium over locked collateral, or null when not computable. */
function writtenPositionYield(p: PositionInfo): { aprPct: number; collateralUsd: number } | null {
  if (p.side !== "sell") return null;
  if (p.state !== "open" && p.state !== "funded") return null;
  const premium = entryPremiumUsd(p);
  if (premium == null || !Number.isFinite(premium) || premium <= 0) return null;
  const collateral = writtenCollateralUsd(p);
  if (collateral == null || !Number.isFinite(collateral) || collateral <= 0) return null;
  const createdTs = Number(p.created_at);
  const expiryTs = Number(p.expiry_ts);
  const durationSec = expiryTs > createdTs ? expiryTs - createdTs : 0;
  if (durationSec <= 0) return null;
  const aprPct = (premium / collateral) * (SECONDS_PER_YEAR / durationSec) * 100;
  return { aprPct, collateralUsd: collateral };
}

/**
 * Weighted APR across open written positions: each position's annualised premium-over-collateral,
 * weighted by the collateral it locks. Positions without a computable yield (no premium, no
 * collateral, or a zero/negative duration) are skipped rather than counted as zero.
 */
export function openWrittenApr(positions: readonly PositionInfo[]): OpenWrittenApr {
  let weighted = 0;
  let collateralUsd = 0;
  let writtenCount = 0;
  for (const p of positions) {
    const yield_ = writtenPositionYield(p);
    if (yield_ == null) continue;
    weighted += yield_.aprPct * yield_.collateralUsd;
    collateralUsd += yield_.collateralUsd;
    writtenCount += 1;
  }
  if (writtenCount === 0 || collateralUsd <= 0) {
    return { aprPct: null, collateralUsd: 0, writtenCount: 0 };
  }
  return { aprPct: weighted / collateralUsd, collateralUsd, writtenCount };
}

export type TradingStats = {
  /** Premium collected across sell positions (loaded), USD. */
  collectedUsd: number;
  /** Premium paid across buy positions (loaded), USD. */
  paidUsd: number;
  /** Open (or funded) sell positions. */
  openSells: number;
  /** Open (or funded) buy positions. */
  openBuys: number;
  /** Total sell positions (any state), to distinguish "$0 collected" from "no sells". */
  sellCount: number;
  /** Total buy positions (any state). */
  buyCount: number;
};

/** Buy/sell trading stats over the given positions: premium collected vs paid, and the open split. */
export function tradingStats(positions: readonly PositionInfo[]): TradingStats {
  let collectedUsd = 0;
  let paidUsd = 0;
  let openSells = 0;
  let openBuys = 0;
  let sellCount = 0;
  let buyCount = 0;
  for (const p of positions) {
    const open = p.state === "open" || p.state === "funded";
    const premium = entryPremiumUsd(p);
    if (p.side === "buy") {
      buyCount += 1;
      if (premium != null && Number.isFinite(premium)) paidUsd += premium;
      if (open) openBuys += 1;
    } else {
      sellCount += 1;
      if (premium != null && Number.isFinite(premium)) collectedUsd += premium;
      if (open) openSells += 1;
    }
  }
  return { collectedUsd, paidUsd, openSells, openBuys, sellCount, buyCount };
}
