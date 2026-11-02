"use client";

import type { MarketDescriptorInfo, PositionInfo } from "@/lib/rfq-client";
import { executionTerms, isSpreadTerms, spreadName, strikeText } from "@/lib/spreads";
import { NONE } from "@/lib/vaults/format";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { spreadCollateral } from "@acta-markets/ts-sdk/chain";

export function spreadPositionAmounts(position: PositionInfo, descriptor?: MarketDescriptorInfo) {
  const terms = executionTerms(position.terms);
  if (!isSpreadTerms(terms) || !Number.isSafeInteger(terms.upper_strike)
    || !Number.isSafeInteger(terms.lower_strike) || !Number.isSafeInteger(position.quantity)
    || terms.upper_strike! <= terms.lower_strike) return null;
  const network = getNetwork();
  const underlying = Object.values(TOKENS).find(token => token.mint[network] === position.underlying_mint);
  const quote = Object.values(TOKENS).find(token => token.mint[network] === position.quote_mint);
  const underlyingDecimals = position.underlying_decimals;
  const quoteDecimals = position.quote_decimals;
  if (underlyingDecimals == null || quoteDecimals == null) return null;
  let collateral: bigint;
  try { collateral = spreadCollateral({ positionType: position.terms.type === "call_spread" ? 2 : 3,
    lowerStrike: BigInt(terms.lower_strike), upperStrike: BigInt(terms.upper_strike!), quantity: BigInt(position.quantity), underlyingDecimals, quoteDecimals }); } catch { return null; }
  const payout = position.state === "settled" && position.settlement.type === "cash" ? BigInt(position.settlement.maker_payoff) : null;
  const returned = position.state === "settled" && position.settlement.type === "cash" ? BigInt(position.settlement.taker_return) : null;
  const bought = position.side === "buy";
  // a buyer's cost is the gross premium; the position only stores the writer's net
  const paid = Number.isSafeInteger(position.price)
    ? BigInt(position.price) * BigInt(position.quantity) * 10n ** BigInt(quoteDecimals) / (10n ** 9n * 10n ** BigInt(underlyingDecimals))
    : null;
  const net = Number.isSafeInteger(position.total_premium) ? BigInt(position.total_premium) : null;
  const premium = bought ? paid : net;
  const pnl = premium == null || payout == null ? null : bought ? payout - premium : premium - payout;
  return { collateral, payout, returned, premium, bought, pnl,
    quantity: Number(position.quantity) / 10 ** underlyingDecimals, quoteDecimals,
    // never a mint address in place of a symbol
    quoteSymbol: descriptor?.quote_symbol ?? quote?.symbol ?? null,
    symbol: descriptor?.underlying_symbol ?? underlying?.symbol ?? null };
}

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const STATUS: Record<string, string> = { open: "Open", funded: "Open", liquidated: "Liquidated", settled: "Settled" };

export type SpreadRowView = {
  label: string;
  status: string;
  expiryTs: number | null;
  size: string;
  premium: string;
  apr: string;
  aprPct: number;
  collateralUsd: number;
  result: string;
  negative: boolean;
};

export function spreadRowView(position: PositionInfo, descriptors: MarketDescriptorInfo[]): SpreadRowView | null {
  const terms = executionTerms(position.terms);
  if (!isSpreadTerms(terms)) return null;
  const amounts = spreadPositionAmounts(position, descriptors.find(d => d.market.market_pda === position.market));
  const symbol = amounts?.symbol ?? null;
  const cash = (value: bigint | null, signed = false) => value == null || !amounts
    ? NONE
    : `${signed && value > 0n ? "+" : ""}${value < 0n ? "-" : ""}$${(Math.abs(Number(value)) / 10 ** amounts.quoteDecimals).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const pnl = amounts?.pnl ?? null;
  const expiry = Number(position.expiry_ts);
  const settled = position.state === "settled" && pnl != null;
  const secondsToExpiry = expiry - Number(position.created_at);
  const aprPct = !amounts?.bought && amounts?.premium != null && amounts.collateral > 0n && secondsToExpiry > 0
    ? (Number(amounts.premium) / Number(amounts.collateral)) * (SECONDS_PER_YEAR / secondsToExpiry) * 100
    : 0;
  return {
    label: terms.upper_strike == null ? NONE : position.terms.type === "cash_put"
      ? `${symbol ? `${symbol} ` : ""}0/${strikeText(terms.upper_strike)} put`
      : spreadName(symbol, terms.type, terms.lower_strike, terms.upper_strike),
    status: STATUS[position.state] ?? NONE,
    expiryTs: expiry > 0 ? expiry : null,
    size: amounts ? `${amounts.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}${symbol ? ` ${symbol}` : ""}` : NONE,
    premium: cash(amounts?.premium ?? null),
    apr: aprPct > 0 ? `${aprPct.toFixed(2)}%` : NONE,
    aprPct,
    collateralUsd: amounts && !amounts.bought ? Number(amounts.collateral) / 10 ** amounts.quoteDecimals : 0,
    result: settled ? cash(pnl, true) : NONE,
    negative: settled && pnl < 0n,
  };
}
