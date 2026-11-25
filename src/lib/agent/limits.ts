import { AgentError } from "./errors";
import { spentSince, type Journal, type JournalEntry } from "./journal";

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

/** Something that takes funds out of the wallet: a trade, a vault deposit, an option's funding. */
export type Spend = {
  wallet: string;
  asset: string;
  /** what the limits count: strike times size, or the deposit's dollar value */
  usd: number;
  nowSec: number;
  what: "trade" | "deposit" | "funding";
};

const SIZE_OF: Record<Spend["what"], (usd: string) => string> = {
  trade: (usd) => `This trade is $${usd} of notional`,
  deposit: (usd) => `This deposit is about $${usd}`,
  funding: (usd) => `Funding this takes $${usd}`,
};

/**
 * The limits are a ceiling the owner set, not a size to aim for. An agent told only "too big"
 * will shrink the trade until it fits; it is told to report it instead.
 */
const OWNERS: Record<Spend["what"], string> = {
  trade: "The owner set this limit: say what was refused, and use a different size only if the owner asked for one.",
  deposit: "The owner set this limit: say what was refused, and use a different amount only if the owner asked for one.",
  // a funding is one fixed amount: there is nothing smaller to try
  funding: "The owner set this limit: say what was refused.",
};

/**
 * Whether the limits allow a spend, given what the journal already counts. Reads only: a dry
 * run and a preview run it too, so neither approves what the real call refuses.
 */
export function checkSpend(limits: Limits, entries: JournalEntry[], spend: Spend): void {
  if (limits.allowedAssets && !limits.allowedAssets.includes(spend.asset.toUpperCase())) {
    throw new AgentError("asset_not_allowed", `This agent may only use ${limits.allowedAssets.join(", ")}.`, "stop");
  }
  if (!(spend.usd > 0) || !Number.isFinite(spend.usd)) {
    throw new AgentError("invalid_size", "The trade has no size.");
  }
  const size = SIZE_OF[spend.what](spend.usd.toFixed(2));
  if (spend.usd > limits.maxTradeUsd) {
    // A funding is one fixed amount: there is no smaller one to ask for.
    throw new AgentError("over_trade_limit", `${size}; the limit per trade is $${limits.maxTradeUsd}. ${OWNERS[spend.what]}`, spend.what === "funding" ? "stop" : "fix_request", {
      limit_usd: limits.maxTradeUsd,
    });
  }
  const left = remainingToday(limits, entries, spend.wallet, spend.nowSec);
  if (spend.usd > left) {
    throw new AgentError("over_daily_limit", `${size}; $${left.toFixed(2)} is left of the $${limits.dailyUsd} allowed in 24 hours. ${OWNERS[spend.what]}`, "stop", {
      remaining_usd: left,
    });
  }
}

export function checkTrade(
  limits: Limits,
  entries: JournalEntry[],
  trade: { wallet: string; asset: string; notionalUsd: number; nowSec: number },
): void {
  if (limits.readOnly) {
    throw new AgentError("read_only", "This agent is set to read only: it cannot place trades.", "stop");
  }
  checkSpend(limits, entries, { wallet: trade.wallet, asset: trade.asset, usd: trade.notionalUsd, nowSec: trade.nowSec, what: "trade" });
}

/**
 * Admits a spend: checks it against the limits and writes it in the journal, as one step no
 * other spend can come between. Every tool that takes funds out of the wallet goes through
 * here right before the step it cannot take back, so calls in flight together (two deposits, a
 * deposit and a trade, two servers on one wallet) are counted one after the other.
 */
export async function reserveSpend(ctx: { limits: Limits; journal: Journal }, spend: Spend, entry: JournalEntry): Promise<void> {
  const { limits, journal } = ctx;
  if (limits.readOnly) throw new AgentError("read_only", "This agent is set to read only: it cannot move funds.", "stop");
  await journal.lock(async () => {
    checkSpend(limits, await journal.read(), spend);
    await journal.append(entry);
  });
}
