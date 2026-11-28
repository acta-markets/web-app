import { formatUsdSmart } from "@/lib/markets";
import { numberFormat } from "@/lib/number-format";
import { formatUsdAmount } from "@/lib/trade/format";
import type { Direction } from "@/lib/trade/thesis";

/** One line of the profit table: a move from today's price, the price there, and what the trade
    makes. `goal` marks the line that is the buyer's own goal. */
export type ProfitRow = { move: string; price: string; result: string; goal?: boolean };

/** A bought option's outlook: where it breaks even, then what it makes at even steps past that. */
export type ProfitLadder = { breakeven: ProfitRow | null; steps: ProfitRow[] };

const MINUS = "\u2212";
const EMPTY: ProfitLadder = { breakeven: null, steps: [] };

/**
 * One price format for a whole table, chosen from today's price, so "$103" never sits under
 * "$89.18": whole dollars from $1,000 up, cents below that, the smart format for sub-dollar assets.
 */
export function tablePrice(price: number, spot: number): string {
  if (!(spot >= 1)) return formatUsdSmart(price);
  const format = numberFormat(spot >= 1000 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${format.format(price)}`;
}

/**
 * The breakeven as a move from today's price, then every 5% step past it out to a 50% move (or
 * three steps, when the breakeven is already that far). `premiumUsd` and `units` are null until
 * the trade is priced and sized; the breakeven row stands without them, the steps do not.
 *
 * The buyer's goal (`goalPrice`), where it makes money, is a line of its own among the steps, in
 * the order of the prices: it is the price the page is headlined with, so the table says what
 * the trade makes there and not only at round moves. `goal` says which line it is; the table
 * sets it in a quiet green. A goal that falls on a step's own price is that step.
 */
export function buildProfitLadder({
  direction,
  strike,
  spot,
  breakeven,
  premiumUsd,
  units,
  goalPrice = null,
}: {
  direction: Direction;
  strike: number;
  spot: number;
  breakeven: number;
  premiumUsd: number | null;
  units: number | null;
  goalPrice?: number | null;
}): ProfitLadder {
  if (!(spot > 0)) return EMPTY;
  const up = direction === "above";
  const breakevenPct = Math.abs((breakeven / spot - 1) * 100);
  const breakevenRow: ProfitRow = {
    // a whole percent from 10% up, one decimal below that
    move: `${breakeven >= spot ? "+" : MINUS}${breakevenPct >= 10 ? Math.round(breakevenPct) : breakevenPct.toFixed(1)}%`,
    price: tablePrice(breakeven, spot),
    result: "breakeven",
  };
  if (premiumUsd == null || units == null) return { breakeven: breakevenRow, steps: [] };

  const first = (Math.floor(breakevenPct / 5) + 1) * 5;
  const last = Math.max(50, first + 10);
  const profitAt = (price: number) => Math.abs(price - strike) * units - premiumUsd;
  const points: Array<{ pct: number; price: number; goal: boolean }> = Array.from({ length: (last - first) / 5 + 1 }, (_, i) => first + i * 5)
    .map((pct) => ({ pct, price: spot * (1 + (up ? pct : -pct) / 100), goal: false }));
  // the goal, if it is on the belief's side of today's price
  if (goalPrice != null && goalPrice > 0 && (up ? goalPrice > spot : goalPrice < spot)) {
    const same = points.find((p) => tablePrice(p.price, spot) === tablePrice(goalPrice, spot));
    if (same) same.goal = true;
    else points.push({ pct: Math.abs((goalPrice / spot - 1) * 100), price: goalPrice, goal: true });
  }
  const steps = points
    .sort((p, q) => p.pct - q.pct)
    .filter(({ price }) => price > 0)
    .map((point) => ({ ...point, profit: profitAt(point.price) }))
    .filter(({ profit }) => profit > 0)
    .map(({ pct, price, profit, goal }) => ({
      // a step is a whole percent by construction; the goal says its own, to one decimal
      move: `${up ? "+" : MINUS}${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`,
      price: tablePrice(price, spot),
      // cents stop mattering past $100, and dropping them keeps the row on one line
      result: profit >= 100 ? `+$${numberFormat({}).format(Math.round(profit))}` : `+${formatUsdAmount(profit)}`,
      ...(goal ? { goal: true } : null),
    }));
  return { breakeven: breakevenRow, steps };
}
