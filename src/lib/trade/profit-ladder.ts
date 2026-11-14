import { formatUsdSmart } from "@/lib/markets";
import { numberFormat } from "@/lib/number-format";
import { formatUsdAmount } from "@/lib/trade/format";
import type { Direction } from "@/lib/trade/thesis";

/** One line of the profit table: a move from today's price, the price there, and what the trade makes. */
export type ProfitRow = { move: string; price: string; result: string };

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
 */
export function buildProfitLadder({
  direction,
  strike,
  spot,
  breakeven,
  premiumUsd,
  units,
}: {
  direction: Direction;
  strike: number;
  spot: number;
  breakeven: number;
  premiumUsd: number | null;
  units: number | null;
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
  const steps = Array.from({ length: (last - first) / 5 + 1 }, (_, i) => first + i * 5)
    .map((pct) => ({ pct, price: spot * (1 + (up ? pct : -pct) / 100) }))
    .filter(({ price }) => price > 0)
    .map(({ pct, price }) => ({ pct, price, profit: Math.abs(price - strike) * units - premiumUsd }))
    .filter(({ profit }) => profit > 0)
    .map(({ pct, price, profit }) => ({
      move: `${up ? "+" : MINUS}${pct}%`,
      price: tablePrice(price, spot),
      // cents stop mattering past $100, and dropping them keeps the row on one line
      result: profit >= 100 ? `+$${numberFormat({}).format(Math.round(profit))}` : `+${formatUsdAmount(profit)}`,
    }));
  return { breakeven: breakevenRow, steps };
}
