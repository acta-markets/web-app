import { numberFormat } from "@/lib/number-format";
import { formatUsdAmount } from "@/lib/trade/format";
import type { Direction } from "@/lib/trade/thesis";

/**
 * A buyer's goal: the price they think the asset reaches by the expiry. It is not the strike.
 * The strike is where the option starts to be worth something; the goal is where the buyer
 * expects the price to be, and so the one point at which "what do I make" has an answer.
 */
export type Goal = {
  price: number;
  /** what the trade makes with the price exactly at the goal, in USDC; null until priced and sized */
  profit: number | null;
};

/** How far the goals reach from the first one, in steps: every step at first, then wider apart. */
const REACH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 19, 24, 29, 39, 49];

/** The largest of 1, 2 or 5 times a power of ten that is not above `x`: a round step for prices. */
function roundStep(x: number): number {
  if (!(x > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(x));
  const lead = x / power;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * power;
}

/**
 * The goals a buyer can pick: round prices past the strike, in the direction of the belief,
 * about 1% of today's price apart at first and wider further out, to roughly half as far again
 * as today's price. Once the trade is priced and sized, only the goals where it makes money.
 */
export function goalOptions({
  direction,
  strike,
  spot,
  premiumUsd,
  units,
}: {
  direction: Direction;
  strike: number;
  spot: number;
  /** what the option costs at the current size, USDC; null before it is priced */
  premiumUsd: number | null;
  /** the size in units of the asset; null before a size is set */
  units: number | null;
}): Goal[] {
  if (!(spot > 0) || !(strike > 0)) return [];
  const up = direction === "above";
  const step = roundStep(spot * 0.01);
  // the first round price strictly past the strike (a hair of tolerance for a strike on the grid)
  const edge = strike / step;
  const first = up ? Math.floor(edge + 1e-9) + 1 : Math.ceil(edge - 1e-9) - 1;
  const priced = premiumUsd != null && units != null;
  return REACH.map((n) => (up ? first + n : first - n) * step)
    .filter((price) => price > 0)
    .map((price) => ({ price, profit: priced ? Math.abs(price - strike) * units - premiumUsd : null }))
    .filter((goal) => goal.profit == null || goal.profit > 0);
}

/** How many times what was paid the opening goal makes, and how far out it opens before the
    option is priced (the eleventh goal, about 12% of today's price past the first). */
const OPENING_MULTIPLE = 5;
const OPENING_UNPRICED = 10;

/**
 * The goal the page opens on: a far one (Tim, 28 Nov 2026), the nearest where the trade makes
 * at least five times what was paid, so the default scales with what the option costs (a
 * dearer, longer-dated option needs a bigger move) and the page opens on a move worth making.
 * With no goal that far, the furthest; unpriced, well out along the list.
 */
export function defaultGoal(goals: ReadonlyArray<Goal>, premiumUsd: number | null): Goal | null {
  if (goals.length === 0) return null;
  if (premiumUsd == null) return goals[Math.min(OPENING_UNPRICED, goals.length - 1)];
  return goals.find((g) => g.profit != null && g.profit >= OPENING_MULTIPLE * premiumUsd) ?? goals[goals.length - 1];
}

/** The chosen goal if it is still on offer, else the nearest one to it, else the default. */
export function pickGoal(goals: ReadonlyArray<Goal>, choice: number | null, premiumUsd: number | null): Goal | null {
  if (choice == null || goals.length === 0) return defaultGoal(goals, premiumUsd);
  return goals.reduce((best, g) => (Math.abs(g.price - choice) < Math.abs(best.price - choice) ? g : best));
}

/** A profit as the page writes it: "+$28.40", and whole dollars from $100 up ("+$1,234"). */
export function formatProfit(profit: number): string {
  return profit >= 100 ? `+$${numberFormat({}).format(Math.round(profit))}` : `+${formatUsdAmount(profit)}`;
}
