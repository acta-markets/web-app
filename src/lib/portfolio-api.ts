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

/** Keep aggregate quote atoms exact, even above Number.MAX_SAFE_INTEGER. */
export function formatPortfolioPremium(atoms: string, decimals: number, currency: string): string {
  const amount = BigInt(atoms);
  const scale = 10n ** BigInt(decimals);
  const whole = (amount / scale).toLocaleString("en-US");
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const value = fraction ? `${whole}.${fraction}` : whole;
  return currency === "USDC" ? `$${value}` : `${value} ${currency}`;
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
