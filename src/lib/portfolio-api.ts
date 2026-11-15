import type { ActaWsClient, PositionInfo } from "@/lib/rfq-client";
import { ALL_POSITIONS } from "@acta-markets/ts-sdk/ws";

export interface WalletPositionsPage {
  positions: PositionInfo[];
  next_cursor: string | null;
}

export interface WalletPositionSummary {
  quote_mint: string;
  quote_decimals: number;
  premium_all_time: string;
  premium_30d: string;
  open_positions: number;
  daily: { day: string; premium: string }[];
}

type PortfolioReader = Pick<ActaWsClient, "getPositionsPageAsync" | "getPositionSummaryAsync">;

export async function fetchWalletPositions(client: PortfolioReader, query: { settled?: boolean; limit?: number; cursor?: string } = {}, signal?: AbortSignal): Promise<WalletPositionsPage> {
  signal?.throwIfAborted();
  const page = await client.getPositionsPageAsync({
    ...ALL_POSITIONS,
    status: query.settled === undefined ? [] : query.settled ? ["settled", "liquidated"] : ["open", "funded"],
    limit: query.limit ?? 50,
    cursor: query.cursor ? { type: "after", id: query.cursor } : { type: "start" },
  }, { applyToState: false });
  signal?.throwIfAborted();
  return page;
}

export async function fetchWalletPositionSummary(client: PortfolioReader, signal?: AbortSignal): Promise<WalletPositionSummary[]> {
  signal?.throwIfAborted();
  const response = await client.getPositionSummaryAsync();
  signal?.throwIfAborted();
  return response.summaries;
}

/** Two decimals for display, from exact atoms even above Number.MAX_SAFE_INTEGER. */
export function formatPortfolioPremium(atoms: string, decimals: number, currency: string): string {
  const scale = 10n ** BigInt(decimals);
  const cents = (BigInt(atoms) * 100n) / scale;
  const whole = (cents / 100n).toLocaleString("en-US");
  const value = `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
  return currency === "USDC" ? `$${value}` : `${value} ${currency}`;
}

/**
 * Premium collected in the last `days` days, in atoms, added up from the daily buckets. The
 * window is the chart's: a bucket counts when its day starts within `days` of now, which makes
 * it today and the six days before for a week. The summary only carries a ready total for
 * thirty days, so any shorter range is counted here.
 */
export function portfolioPremiumInLastDays(summary: WalletPositionSummary, days: number, nowSec: number): string {
  const start = nowSec - days * 24 * 60 * 60;
  let total = 0n;
  for (const { day, premium } of summary.daily) {
    const t = Date.parse(`${day}T00:00:00Z`) / 1000;
    if (t >= start && t <= nowSec) total += BigInt(premium);
  }
  return total.toString();
}

/** The chart library accepts numbers; do not silently round large atom totals. */
export function portfolioIncomeSeries(summary: WalletPositionSummary): { t: number; v: number }[] | null {
  const allTime = BigInt(summary.premium_all_time);
  const recent = BigInt(summary.premium_30d);
  const safe = (value: bigint) => value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER);
  if (!safe(allTime) || !safe(recent)) return null;
  let accumulated = allTime - recent;
  const points = [];
  for (const { day, premium } of summary.daily) {
    const delta = BigInt(premium);
    if (!safe(delta)) return null;
    accumulated += delta;
    if (!safe(accumulated)) return null;
    points.push({ t: Date.parse(`${day}T00:00:00Z`) / 1000, v: Number(accumulated) / 10 ** summary.quote_decimals });
  }
  return points;
}
