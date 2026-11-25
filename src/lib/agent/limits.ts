import { AgentError } from "./errors";
import { spentSince, type JournalEntry } from "./journal";

/**
 * What the person who started the agent allows it. Checked in the handler before a quote is
 * accepted: a tool's "moves funds" label is advice to a client, these are the rule.
 */
export type Limits = {
  /** true: nothing that moves funds runs, whatever is asked */
  readOnly: boolean;
  /** largest strike-times-size of one trade, in dollars */
  maxTradeUsd: number;
  /** most notional in any 24 hours, in dollars */
  dailyUsd: number;
  /** asset symbols the agent may trade, upper case; null allows every listed asset */
  allowedAssets: ReadonlyArray<string> | null;
};

export const DEFAULT_LIMITS: Limits = { readOnly: false, maxTradeUsd: 2_500, dailyUsd: 10_000, allowedAssets: null };

const DAY_SECONDS = 86_400;

export function remainingToday(limits: Limits, entries: JournalEntry[], wallet: string, nowSec: number): number {
  return Math.max(0, limits.dailyUsd - spentSince(entries, wallet, nowSec - DAY_SECONDS));
}

export function checkTrade(
  limits: Limits,
  entries: JournalEntry[],
  trade: { wallet: string; asset: string; notionalUsd: number; nowSec: number },
): void {
  if (limits.readOnly) {
    throw new AgentError("read_only", "This agent is set to read only: it cannot place trades.", "stop");
  }
  if (limits.allowedAssets && !limits.allowedAssets.includes(trade.asset.toUpperCase())) {
    throw new AgentError("asset_not_allowed", `This agent may only trade ${limits.allowedAssets.join(", ")}.`, "stop");
  }
  if (!(trade.notionalUsd > 0) || !Number.isFinite(trade.notionalUsd)) {
    throw new AgentError("invalid_size", "The trade has no size.");
  }
  if (trade.notionalUsd > limits.maxTradeUsd) {
    throw new AgentError(
      "over_trade_limit",
      `This trade is $${trade.notionalUsd.toFixed(2)} of notional; the limit per trade is $${limits.maxTradeUsd}.`,
      "fix_request",
      { limit_usd: limits.maxTradeUsd },
    );
  }
  const left = remainingToday(limits, entries, trade.wallet, trade.nowSec);
  if (trade.notionalUsd > left) {
    throw new AgentError(
      "over_daily_limit",
      `This trade is $${trade.notionalUsd.toFixed(2)} of notional; $${left.toFixed(2)} is left of the $${limits.dailyUsd} allowed in 24 hours.`,
      "stop",
      { remaining_usd: left },
    );
  }
}
