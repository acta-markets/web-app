import type { PositionInfo } from "@/lib/rfq-client";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import { isCashSettled, isCashSettledTerms, isSpreadTerms, strikeText } from "@/lib/spreads";
import { numberFormat } from "@/lib/number-format";
import { displayQuoteSymbol } from "@/lib/tokens";
import { exerciseDepositText } from "@/lib/trade/thesis";
import {
  entryPremiumUsd,
  positionQuantity,
  realizedPnlUsd,
  unrealizedPnlUsd,
  underlyingMark,
  formatSignedUsd,
} from "@/lib/portfolio-pnl";

/** The thesis's direction word: the belief the position expresses. */
export type DirectionWord = "above" | "below";

/** Put-flavoured products: cash-secured put, put spread, cash put. */
export function isPutPosition(p: PositionInfo): boolean {
  return (
    p.terms.type === "cash_secured_put" ||
    p.terms.type === "put_spread" ||
    p.terms.type === "cash_put"
  );
}

/**
 * The belief a position expresses, in the trade surface's sentence language:
 * a long call / short put bets "above", a short call / long put bets "below".
 */
export function directionWord(p: PositionInfo): DirectionWord {
  const long = p.side === "buy";
  const isPut = isPutPosition(p);
  return long === isPut ? "below" : "above";
}

/** The single strike the thesis sentence names: the near leg for a spread. */
export function thesisStrike1e9(p: PositionInfo): number {
  if (p.terms.type === "call_spread") return Number(p.terms.lower_strike);
  if (p.terms.type === "put_spread") return Number(p.terms.upper_strike);
  return Number(p.terms.strike);
}

export function thesisExpiryTs(p: PositionInfo): number | null {
  const t = Number(p.expiry_ts);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * The position as a sentence in the product's own language:
 * "SOL ends below $150 by Nov 28". With an empty symbol the subject is dropped,
 * leaving "ends below $150 by Nov 28" so the asset column can supply it.
 */
export function positionSentence(symbol: string, p: PositionInfo): string {
  const body = `ends ${directionWord(p)} ${formatStrikePrice(thesisStrike1e9(p) / 1e9)}`;
  const expiry = thesisExpiryTs(p);
  const full = expiry != null ? `${body} by ${formatExpiryDay(expiry * 1000)}` : body;
  return symbol ? `${symbol} ${full}` : full;
}

/**
 * User-facing state. "expired" and "redeemed" are not distinct on-chain states — they
 * are settlement outcomes folded into `settled`: an OTM / unexercised option shows as
 * Expired, an ITM or cash-settled one as Settled.
 */
export function stateLabel(p: PositionInfo): string {
  switch (p.state) {
    case "open":
      return "Open";
    case "funded":
      return "Funded";
    case "liquidated":
      return "Liquidated";
    case "terminal_pending":
      return "Settling";
    case "settled": {
      const s = p.settlement;
      if (s.type === "not_exercised") return "Expired";
      if (s.type === "physical" && s.is_otm) return "Expired";
      return "Settled";
    }
  }
}

/**
 * How a closed position ended, in the product's words. A sold option that finished in the money
 * "converted" (the deposit was swapped at the strike, as the trade page puts it); a bought one
 * was "exercised". Null while the position is still open.
 */
export function outcomeLabel(p: PositionInfo): string | null {
  if (p.state === "liquidated") return "Liquidated";
  if (p.state === "terminal_pending") return "Settling";
  if (p.state !== "settled") return null;
  const s = p.settlement;
  if (s.type === "not_exercised") return "Not exercised";
  if (s.type === "physical") return s.is_otm ? "Expired" : p.side === "buy" ? "Exercised" : "Converted";
  return Number(s.holder_payoff) > 0 ? "Paid out" : "Expired";
}

/** Both strikes of a two-leg product, "100/120"; null for a single-strike option. */
export function legsTextFor(p: PositionInfo): string | null {
  if (isSpreadTerms(p.terms)) return `${strikeText(Number(p.terms.lower_strike))}/${strikeText(Number(p.terms.upper_strike))}`;
  if (p.terms.type === "cash_put") return `0/${strikeText(Number(p.terms.strike))}`;
  return null;
}

export type PositionsTableRow = {
  id: string;
  symbol: string;
  /** "ends below $150 by Nov 28" — the sentence without the leading asset symbol. */
  sentenceBody: string;
  /** "SOL ends below $150 by Nov 28" — the full sentence, for a11y/title. */
  sentence: string;
  /** The product as a thing, not a lifecycle stage: "Covered call", "Call", "Secured put". */
  productLabel: string;
  /** Both strikes of a spread, "100/120"; null for a single-strike option. */
  legsText: string | null;
  /** How a closed position ended: "Expired", "Converted", "Exercised"...; null while open. */
  outcome: string | null;
  /** What funding the exercise costs (strike for a call, underlying for a put); null when it does not apply. */
  exerciseText: string | null;
  /** The strike as displayed, so copy can name the delivery price without parsing a sentence. */
  strikeText: string;
  /** The underlying mark the uPnL was valued at, when there is one. */
  markText: string | null;
  direction: DirectionWord;
  side: "buy" | "sell";
  sizeNum: number;
  sizeText: string;
  premiumNum: number | null;
  premiumLabel: "collected" | "paid" | null;
  /** Unrealised P&L while open, realised once settled; null when it cannot be priced. */
  pnlNum: number | null;
  pnlText: string;
  expiryTs: number | null;
  isOpen: boolean;
  state: string;
  createdTs: number;
  /** Present for a bought physical position that can still be exercised (deposit action). */
  buy: { pda: string; market: string } | null;
  /**
   * The deposit that exercises a bought physical option, in one token: the quote at the strike
   * for a call, the asset itself for a put. `usd` values it in dollars: the quote at one
   * dollar, the asset at the current price (null without one). Null when the position takes
   * no deposit.
   */
  fund: { amount: number; symbol: string; usd: number | null } | null;
  /** Whether a bought physical option would be exercised at the current price; null without a price. */
  inTheMoney: boolean | null;
};

/** What it costs to take delivery: the strike for a call, the underlying for a put. */
export function exerciseTextFor(p: PositionInfo): string | null {
  if (p.side !== "buy" || isSpreadTerms(p.terms) || isCashSettledTerms(p.terms)) return null;
  const isPut = p.terms.type === "cash_secured_put";
  const quantity = positionQuantity(p);
  const strike = thesisStrike1e9(p) / 1e9;
  return exerciseDepositText(isPut, quantity, strike, "");
}

/** What the position is, in the same words the trade page uses. */
export function productLabelFor(p: PositionInfo): string {
  // Two-leg products are their own thing: a put spread is not a secured put.
  if (p.terms.type === "call_spread") return "Call spread";
  if (p.terms.type === "put_spread") return "Put spread";
  if (p.terms.type === "cash_put") return "Cash put";
  // Buying is long by definition: a bought call is just a call. Selling is the case that needs
  // naming, since the writer is the secured party. "Secured put" keeps the full name in the
  // cell title.
  if (p.terms.type === "cash_secured_put") return p.side === "buy" ? "Put" : "Secured put";
  return p.side === "buy" ? "Call" : "Covered call";
}

export function buildPositionRows(
  positions: readonly PositionInfo[],
  symbolFor: (p: PositionInfo) => string,
  nowMs: number,
  liveSpot1e9?: (p: PositionInfo) => number | undefined,
): PositionsTableRow[] {
  return positions.map((p) => {
    const symbol = symbolFor(p);
    const quantity = positionQuantity(p);
    const premium = entryPremiumUsd(p);
    const isOpen = p.state === "open" || p.state === "funded";
    // Open positions carry the live unrealised mark; settled ones carry the realised outcome.
    const liveSpot = isOpen ? liveSpot1e9?.(p) : undefined;
    const pnl = isOpen ? unrealizedPnlUsd(p, liveSpot) : realizedPnlUsd(p);
    const markPrice = liveSpot != null ? liveSpot / 1e9 : underlyingMark(p, nowMs)?.priceUsd ?? null;
    const markText = markPrice != null ? formatUsdSmart(markPrice) : null;
    const physicalBuy = p.side === "buy" && !isCashSettled(p.terms.type);
    const isPut = p.terms.type === "cash_secured_put";
    const strike = thesisStrike1e9(p) / 1e9;
    return {
      id: p.pda,
      symbol,
      sentenceBody: positionSentence("", p),
      sentence: positionSentence(symbol, p),
      direction: directionWord(p),
      side: p.side,
      productLabel: productLabelFor(p),
      legsText: legsTextFor(p),
      outcome: outcomeLabel(p),
      exerciseText: exerciseTextFor(p),
      strikeText: formatStrikePrice(thesisStrike1e9(p) / 1e9),
      markText,

      sizeNum: quantity,
      sizeText: `${numberFormat({ maximumFractionDigits: 4 }).format(quantity)} ${symbol}`,
      premiumNum: premium,
      premiumLabel: premium == null ? null : p.side === "buy" ? "paid" : "collected",
      pnlNum: pnl,
      pnlText: pnl == null ? "\u2014" : formatSignedUsd(pnl),
      expiryTs: thesisExpiryTs(p),
      isOpen,
      state: stateLabel(p),
      createdTs: Number(p.created_at),
      buy: physicalBuy && isOpen ? { pda: p.pda, market: p.market_pda } : null,
      fund: !physicalBuy
        ? null
        : isPut
          ? { amount: quantity, symbol, usd: markPrice != null ? quantity * markPrice : null }
          : { amount: quantity * strike, symbol: displayQuoteSymbol(), usd: quantity * strike },
      inTheMoney: physicalBuy && markPrice != null ? (isPut ? markPrice < strike : markPrice > strike) : null,
    };
  });
}

/** Funded on chain, or deposited in this session and not yet reported back as funded. */
export function isRowFunded(row: PositionsTableRow, funded?: ReadonlySet<string>): boolean {
  return row.state === "Funded" || (row.buy != null && !!funded?.has(row.buy.pda));
}

/** A bought physical option that still takes its deposit: open, unfunded and before expiry. */
export function canFundRow(row: PositionsTableRow, nowMs: number, funded?: ReadonlySet<string>): boolean {
  return row.buy != null && !isRowFunded(row, funded) && row.state === "Open" && row.expiryTs != null && row.expiryTs * 1000 > nowMs;
}

/** A funded bought option whose deposit can still be taken back: only before expiry. */
export function canWithdrawRow(row: PositionsTableRow, nowMs: number, funded?: ReadonlySet<string>): boolean {
  return row.buy != null && isRowFunded(row, funded) && row.expiryTs != null && row.expiryTs * 1000 > nowMs;
}

/**
 * A deposit withdrawn in this session reads as Open until the listener reports it: the mirror
 * of the `funded` set, which covers a deposit the listener has not reported yet.
 */
export function markWithdrawn(rows: readonly PositionsTableRow[], withdrawn: ReadonlySet<string>): PositionsTableRow[] {
  return rows.map((row) => (row.buy != null && row.state === "Funded" && withdrawn.has(row.buy.pda) ? { ...row, state: "Open" } : row));
}

/**
 * A bought option worth exercising right now: one that delivers (not a spread), is in the
 * money at the current price, and has not expired. Funded or not: a funded one is already
 * set to exercise, an unfunded one is the one to fund. Without a price the answer is no,
 * because nothing says it is.
 */
export function isWorthExercising(row: PositionsTableRow, nowMs: number): boolean {
  return row.buy != null && row.inTheMoney === true && row.expiryTs != null && row.expiryTs * 1000 > nowMs;
}

/** Everything about the bought options that still need their deposit, taken together. */
export type FundingSummary = {
  /** What to fund, soonest expiry first, so a balance that runs short covers the urgent ones. */
  positions: Array<{ pda: string; market: string }>;
  count: number;
  /**
   * The deposits added up per token, in the order they fall due: a call takes the quote, a put
   * the asset. `usd` is that token's total in dollars; null when a position in it has no price.
   */
  totals: Array<{ symbol: string; amount: number; usd: number | null }>;
  /** Everything in dollars, for one headline figure; null when any token has no price. */
  totalUsd: number | null;
  /** The first expiry among them, Unix seconds: the nearest deadline. */
  firstExpiryTs: number;
  /** How many would be exercised at the current price, out of the `priced` that have one. */
  inTheMoney: number;
  priced: number;
  /** Premium already paid for them, which is what is lost if none is funded; null when unknown. */
  premiumPaid: number | null;
};

export function fundingSummary(rows: readonly PositionsTableRow[], nowMs: number, funded?: ReadonlySet<string>): FundingSummary | null {
  const open = rows
    .filter((row) => canFundRow(row, nowMs, funded))
    .sort((a, b) => (a.expiryTs ?? 0) - (b.expiryTs ?? 0));
  if (open.length === 0) return null;
  const bySymbol = new Map<string, { amount: number; usd: number | null }>();
  for (const row of open) {
    if (!row.fund) continue;
    const sum = bySymbol.get(row.fund.symbol) ?? { amount: 0, usd: 0 };
    bySymbol.set(row.fund.symbol, {
      amount: sum.amount + row.fund.amount,
      usd: sum.usd != null && row.fund.usd != null ? sum.usd + row.fund.usd : null,
    });
  }
  const totals = [...bySymbol].map(([symbol, sum]) => ({ symbol, ...sum }));
  const priced = open.filter((row) => row.inTheMoney != null);
  const premiums = open.map((row) => row.premiumNum).filter((n): n is number => n != null);
  return {
    positions: open.map((row) => row.buy!),
    count: open.length,
    totals,
    totalUsd: totals.every((t) => t.usd != null) ? totals.reduce((sum, t) => sum + (t.usd ?? 0), 0) : null,
    firstExpiryTs: open[0].expiryTs!,
    inTheMoney: priced.filter((row) => row.inTheMoney).length,
    priced: priced.length,
    premiumPaid: premiums.length === open.length ? premiums.reduce((sum, n) => sum + n, 0) : null,
  };
}

export type SortKey = "risk" | "expiry" | "size" | "premium" | "pnl";
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir };

/** The order the page opens in: most at risk first. */
export const DEFAULT_SORT: SortState = { key: "risk", dir: "asc" };

/** Amounts open largest first; dates open soonest first. */
export function defaultSortDir(key: SortKey): SortDir {
  return key === "size" || key === "premium" || key === "pnl" ? "desc" : "asc";
}

/**
 * What a click on a column does: its natural order first, the reverse second, and back to the
 * default risk order third, so there is always a way out of a custom sort.
 */
export function nextSort(prev: SortState, key: SortKey): SortState {
  const first = defaultSortDir(key);
  if (prev.key !== key) return { key, dir: first };
  if (prev.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return DEFAULT_SORT;
}

function rank(r: PositionsTableRow): number {
  if (r.isOpen) return 0;
  if (r.state === "Settling") return 1;
  if (r.state === "Liquidated") return 3;
  return 2; // settled / expired
}

/** Most-at-risk first: open by nearest expiry, then settling, then closed by recency. */
function compareRisk(a: PositionsTableRow, b: PositionsTableRow): number {
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  if (a.isOpen && b.isOpen) {
    if (a.expiryTs == null && b.expiryTs == null) return b.createdTs - a.createdTs;
    if (a.expiryTs == null) return 1;
    if (b.expiryTs == null) return -1;
    return a.expiryTs - b.expiryTs;
  }
  return b.createdTs - a.createdTs;
}

function numericValue(r: PositionsTableRow, key: SortKey): number | null {
  switch (key) {
    case "expiry":
      return r.expiryTs;
    case "size":
      return r.sizeNum;
    case "premium":
      return r.premiumNum;
    case "pnl":
      return r.pnlNum;
    default:
      return null;
  }
}

export function comparePositions(
  a: PositionsTableRow,
  b: PositionsTableRow,
  key: SortKey,
  dir: SortDir,
): number {
  if (key === "risk") return compareRisk(a, b) * (dir === "asc" ? 1 : -1);
  const av = numericValue(a, key);
  const bv = numericValue(b, key);
  if (av == null && bv == null) return compareRisk(a, b);
  if (av == null) return 1;
  if (bv == null) return -1;
  if (av !== bv) return dir === "asc" ? av - bv : bv - av;
  return compareRisk(a, b);
}

export function sortPositions(
  rows: readonly PositionsTableRow[],
  key: SortKey,
  dir: SortDir,
): PositionsTableRow[] {
  return [...rows].sort((a, b) => comparePositions(a, b, key, dir));
}

export type PositionsDisplayItem =
  | { kind: "header"; symbol: string; count: number }
  | { kind: "row"; row: PositionsTableRow };

/** Sorted rows, optionally grouped by underlying (each group headed by a symbol row). */
export function buildDisplayList(
  rows: readonly PositionsTableRow[],
  key: SortKey,
  dir: SortDir,
  grouped: boolean,
): PositionsDisplayItem[] {
  if (!grouped) return sortPositions(rows, key, dir).map((row) => ({ kind: "row", row }));

  const groups = new Map<string, PositionsTableRow[]>();
  for (const r of rows) {
    const list = groups.get(r.symbol) ?? [];
    list.push(r);
    groups.set(r.symbol, list);
  }
  const ordered = [...groups.entries()]
    .map(([symbol, groupRows]) => ({ symbol, rows: sortPositions(groupRows, key, dir) }))
    .sort((a, b) => comparePositions(a.rows[0], b.rows[0], key, dir));
  return ordered.flatMap((g): PositionsDisplayItem[] => [
    { kind: "header", symbol: g.symbol, count: g.rows.length },
    ...g.rows.map((row): PositionsDisplayItem => ({ kind: "row", row })),
  ]);
}

/** Live countdown for an open position, e.g. "3d 2h 1m 5s"; "0s" once expired. */
export function formatExpiryCountdown(expiryTs: number, nowMs: number): string {
  const diff = Math.max(0, expiryTs * 1000 - nowMs);
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  // Two units at most: a ticking seconds field in a table is noise, not information.
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}
