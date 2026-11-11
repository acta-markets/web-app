import type { PositionInfo } from "@/lib/rfq-client";
import { formatStrikePrice } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import { isCashSettled } from "@/lib/spreads";
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

export type PositionsTableRow = {
  id: string;
  symbol: string;
  /** "ends below $150 by Nov 28" — the sentence without the leading asset symbol. */
  sentenceBody: string;
  /** "SOL ends below $150 by Nov 28" — the full sentence, for a11y/title. */
  sentence: string;
  /** The product as a thing, not a lifecycle stage: "Covered call", "Call", "Secured put". */
  productLabel: string;
  direction: DirectionWord;
  side: "buy" | "sell";
  sizeNum: number;
  sizeText: string;
  premiumNum: number | null;
  premiumLabel: "collected" | "paid" | null;
  pnlNum: number | null;
  pnlText: string;
  pnlStale: boolean;
  expiryTs: number | null;
  isOpen: boolean;
  state: string;
  createdTs: number;
  /** Present for a bought physical position that can still be exercised (deposit action). */
  buy: { pda: string; market: string } | null;
};

/** What the position is, in the same words the trade page uses. */
export function productLabelFor(p: PositionInfo): string {
  const isPut = p.terms.type === "cash_secured_put" || p.terms.type === "put_spread" || p.terms.type === "cash_put";
  // Buying is long by definition, so the side badge already says it: a bought call is just a
  // call. Selling is the case that needs naming, since the writer is the secured party.
  // "Secured put" keeps the full name in the cell title.
  if (isPut) return p.side === "buy" ? "Put" : "Secured put";
  return p.side === "buy" ? "Call" : "Covered call";
}

export function buildPositionRows(
  positions: readonly PositionInfo[],
  symbolFor: (p: PositionInfo) => string,
  nowMs: number,
): PositionsTableRow[] {
  return positions.map((p) => {
    const symbol = symbolFor(p);
    const quantity = positionQuantity(p);
    const premium = entryPremiumUsd(p);
    const isOpen = p.state === "open" || p.state === "funded";
    // Open positions carry the live unrealised mark; settled ones carry the realised outcome.
    const pnl = isOpen ? unrealizedPnlUsd(p) : realizedPnlUsd(p);
    const stale = isOpen ? (underlyingMark(p, nowMs)?.stale ?? false) : false;
    return {
      id: p.pda,
      symbol,
      sentenceBody: positionSentence("", p),
      sentence: positionSentence(symbol, p),
      direction: directionWord(p),
      side: p.side,
      productLabel: productLabelFor(p),
      sizeNum: quantity,
      sizeText: `${quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}`,
      premiumNum: premium,
      premiumLabel: premium == null ? null : p.side === "buy" ? "paid" : "collected",
      pnlNum: pnl,
      pnlText: pnl == null ? "\u2014" : formatSignedUsd(pnl),
      pnlStale: stale,
      expiryTs: thesisExpiryTs(p),
      isOpen,
      state: stateLabel(p),
      createdTs: Number(p.created_at),
      buy: p.side === "buy" && !isCashSettled(p.terms.type) && isOpen ? { pda: p.pda, market: p.market } : null,
    };
  });
}

export type SortKey = "risk" | "expiry" | "size" | "premium" | "pnl";
export type SortDir = "asc" | "desc";

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
