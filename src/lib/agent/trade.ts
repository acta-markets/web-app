import {
  ALL_POSITIONS,
  previewFill,
  totalPremiumQuoteAtoms,
  type ActaWsClient,
  type MarketDescriptorInfo,
  type OptionTerms,
  type OrderExecutionState,
  type QuoteReceivedMessage,
  type QuoteTokenFees,
  type TokenMarketsInfoData,
} from "@acta-markets/ts-sdk/ws";
import { address, signature as toSignature } from "@solana/kit";
import { quoteMatchesProduct } from "@/lib/spreads";
import { readFillParties, signTakerFill, takerFillRfq } from "@/lib/trade/fill";
import { bestQuote, isFillable } from "@/lib/trade/quotes";
import { indicativesFor, spotFromSnapshot, tradableExpiries } from "@/lib/trade/strikes";
import { explorerUrl } from "./config";
import { AgentError, plainSymbol, plainText, toAgentError } from "./errors";
import { latestByOrder, unsettledOrders, type Journal, type JournalEntry, type JournalState } from "./journal";
import { checkSpend, checkTrade, reserveSpend, type Limits } from "./limits";
import { findAsset, isoDay, isoTime, marketSnapshot, strategyFor, type Asset, type Side, type Strategy, type View } from "./markets";
import type { ActaSession } from "./session";

const PRICE_SCALE = 1_000_000_000;
/** How long an RFQ stays open for quotes. Long enough to quote, sign and submit inside one call. */
const RFQ_TIMEOUT_SECONDS = 30;
/** After the first quote, how long to wait for a better one. */
const SETTLE_MS = 1_500;
const MAX_QUOTE_WAIT_MS = 10_000;
/** A quote is only taken with this much life left: accepting, signing and submitting take time. */
const SIGN_MARGIN_SECONDS = 5;
const SERVED_TX_TIMEOUT_MS = 35_000;
const CONFIRM_TIMEOUT_MS = 75_000;
/** Once the venue says the RFQ ended, how much longer to wait for word on the order itself. */
const AFTER_RFQ_ENDED_MS = 15_000;
/** A position is looked for from this long before the order's last journal line: clocks differ, and the line is written after the wait. */
const POSITION_MATCH_SLACK_SECONDS = 300;
/**
 * A signed fill carries a recent blockhash and cannot land once it has aged out (about a
 * minute and a half). Past this an order can no longer execute; whether it already did is
 * then looked up on chain (`traceOrder`).
 */
const SIGNED_ORDER_DEAD_SECONDS = 600;

export type TradeInput = {
  asset: string;
  side: Side;
  view: View;
  /** the price in the sentence, in dollars: must be a listed strike */
  strike: number;
  /** the date in the sentence: YYYY-MM-DD, or the expiry's Unix seconds */
  expiry: string;
  /** how much of the asset the option is on, in whole units of it */
  size: number;
};

export type AgentContext = {
  session: ActaSession;
  limits: Limits;
  journal: Journal;
  /** one trade at a time in this process: an order with no final state blocks the next */
  placing: boolean;
  /** set once a status has waited for devnet to fund a new wallet, so only the first one waits */
  fundingAwaited?: boolean;
};

type ResolvedTrade = {
  asset: Asset;
  strategy: Strategy;
  data: TokenMarketsInfoData;
  descriptor: MarketDescriptorInfo;
  terms: OptionTerms;
  strike: number;
  expiryTs: number;
  /** underlying atoms */
  quantity: bigint;
  size: number;
  fees: QuoteTokenFees | null;
  quoteSymbol: string;
  notionalUsd: number;
};

function atomsToUnits(atoms: bigint, decimals: number): number {
  return Number(atoms) / 10 ** decimals;
}

/** Turns the sentence into the exact market, strike and quantity the venue trades, or says what is not on offer. */
export async function resolveTrade(session: ActaSession, input: TradeInput): Promise<ResolvedTrade> {
  const asset = await findAsset(session, input.asset);
  const strategy = strategyFor(input.side, input.view);
  const data = await marketSnapshot(session, asset);
  const now = session.nowSec();

  const expiries = tradableExpiries(data, strategy.isPut, strategy.product, strategy.side, now);
  const wanted = input.expiry.trim();
  const expiry = expiries.find((e) => isoDay(e.expiryTs) === wanted || String(e.expiryTs) === wanted);
  if (!expiry) {
    throw new AgentError("unknown_expiry", `${asset.symbol} has no ${strategy.name.toLowerCase()} expiring on ${plainText(wanted, 20)}.`, "fix_request", {
      expiries: expiries.map((e) => isoDay(e.expiryTs)),
    });
  }

  const listed = indicativesFor(data, expiry.pda, strategy.product, strategy.side)?.strikes ?? [];
  const tolerance = Math.max(1, Math.abs(input.strike)) * 1e-9;
  const strikeEntry = listed.find((s) => Math.abs(Number(s.strike) / PRICE_SCALE - input.strike) <= tolerance);
  if (!strikeEntry) {
    const nearest = listed
      .map((s) => Number(s.strike) / PRICE_SCALE)
      .sort((a, b) => Math.abs(a - input.strike) - Math.abs(b - input.strike))
      .slice(0, 8)
      .sort((a, b) => a - b);
    throw new AgentError("unknown_strike", `${input.strike} is not a listed strike for that date.`, "fix_request", { nearest_strikes: nearest });
  }
  const strike = Number(strikeEntry.strike) / PRICE_SCALE;

  if (!(input.size > 0) || !Number.isFinite(input.size)) throw new AgentError("invalid_size", "size must be a positive number.");
  const scale = 10 ** data.underlying_decimals;
  const quantity = BigInt(Math.round(input.size * scale));
  const min = BigInt(data.size_rule.min_size);
  const max = BigInt(data.size_rule.max_size);
  const step = BigInt(data.size_rule.step);
  if (quantity < min || quantity > max || (step > 0n && (quantity - min) % step !== 0n)) {
    throw new AgentError("invalid_size", `size must be between ${Number(min) / scale} and ${Number(max) / scale} ${asset.symbol}, in steps of ${Number(step) / scale}.`, "fix_request", {
      min: Number(min) / scale,
      max: Number(max) / scale,
      step: Number(step) / scale,
    });
  }

  const descriptor = (await session.descriptors()).find((d) => d.market_descriptor.market_pda === expiry.pda);
  if (!descriptor || !descriptor.products.includes(strategy.product) || descriptor.market_descriptor.is_put !== strategy.isPut) {
    throw new AgentError("market_unavailable", "That market is not open for this trade right now.", "retry");
  }
  const quoteToken = (await session.tokens()).find((t) => t.mint === descriptor.market_descriptor.quote_mint);
  const fees = quoteToken?.protocol_fees.type === "quote" ? quoteToken.protocol_fees : null;

  return {
    asset,
    strategy,
    data,
    descriptor,
    terms: { type: strategy.product, strike: strikeEntry.strike },
    strike,
    expiryTs: expiry.expiryTs,
    quantity,
    size: Number(quantity) / scale,
    fees,
    quoteSymbol: plainSymbol(data.quote_symbol) ?? "quote token",
    notionalUsd: (Number(quantity) / scale) * strike,
  };
}

/** What a fill at this quote means for the taker, in whole tokens. */
function describeFill(trade: ResolvedTrade, quote: QuoteReceivedMessage) {
  const { asset, strategy, data, quoteSymbol, strike, size } = trade;
  const ud = data.underlying_decimals;
  const qd = data.quote_decimals;
  const premiumAtoms = totalPremiumQuoteAtoms(strategy.side === "sell" ? quote.net_price : quote.price, trade.quantity, ud, qd);
  const preview = trade.fees
    ? previewFill({ terms: trade.terms, side: strategy.side, quantity: trade.quantity, price1e9: quote.price, fees: trade.fees, underlyingDecimals: ud, quoteDecimals: qd })
    : null;
  const premium = atomsToUnits(preview ? preview.premium.netAtoms : premiumAtoms, qd);
  const cash = Number((size * strike).toFixed(qd));
  const days = Math.max(0, trade.expiryTs - Date.now() / 1000) / 86_400;
  const basis = strategy.isPut ? cash : size * (spotFromSnapshot(data) ?? strike);

  const outcomes = strategy.side === "sell"
    ? strategy.isPut
      ? {
          if_right: `${asset.symbol} ends at or above ${strike}: your ${cash} ${quoteSymbol} comes back and you keep the premium.`,
          if_wrong: `${asset.symbol} ends below ${strike}: your ${cash} ${quoteSymbol} buys ${size} ${asset.symbol} at ${strike}. You keep the premium.`,
        }
      : {
          if_right: `${asset.symbol} ends at or below ${strike}: your ${size} ${asset.symbol} comes back and you keep the premium.`,
          if_wrong: `${asset.symbol} ends above ${strike}: your ${size} ${asset.symbol} is sold at ${strike} for ${cash} ${quoteSymbol}. You keep the premium.`,
        }
    : strategy.isPut
      ? {
          if_right: `${asset.symbol} ends below ${strike}: you may sell ${size} ${asset.symbol} at ${strike}. To use that right, fund the position with ${size} ${asset.symbol} before expiry.`,
          if_wrong: `${asset.symbol} ends at or above ${strike}: the option expires and the premium is lost.`,
        }
      : {
          if_right: `${asset.symbol} ends above ${strike}: you may buy ${size} ${asset.symbol} at ${strike}. To use that right, fund the position with ${cash} ${quoteSymbol} before expiry.`,
          if_wrong: `${asset.symbol} ends at or below ${strike}: the option expires and the premium is lost.`,
        };

  return {
    premiumAtoms: preview ? preview.premium.netAtoms : premiumAtoms,
    summary: {
      option: strategy.name,
      asset: asset.symbol,
      strike,
      expiry: isoTime(trade.expiryTs),
      size,
      premium: { amount: premium, token: quoteSymbol, direction: strategy.side === "sell" ? "you receive" : "you pay" },
      // The protocol fee comes out of the seller's premium. A buyer pays the price and no fee on top.
      ...(strategy.side === "sell" && preview
        ? { fee: { amount: atomsToUnits(preview.premium.feeAtoms, qd), token: quoteSymbol, note: "already taken out of what you receive" } }
        : {}),
      deposit: strategy.side === "sell"
        ? strategy.isPut ? { amount: cash, token: quoteSymbol } : { amount: size, token: asset.symbol }
        : null,
      ...(strategy.side === "sell" && days > 0 && basis > 0 ? { apr_pct: Number(((premium / basis) * (365 / days) * 100).toFixed(2)) } : {}),
      break_even: preview ? Number(preview.breakeven1e9) / PRICE_SCALE : null,
      ...outcomes,
    },
  };
}

type QuoteRound = { rfqId: string; best: QuoteReceivedMessage | null; seen: number; closed: string | null };

/**
 * Opens an RFQ and gathers quotes: until one has had time to be beaten, the RFQ closes, or the
 * wait runs out. The RFQ is left open for the caller to accept on or cancel.
 */
async function requestQuotes(session: ActaSession, client: ActaWsClient, trade: ResolvedTrade): Promise<QuoteRound> {
  const requestId = crypto.randomUUID();
  // The venue names the RFQ in `RfqCreated`; quotes carry that id, not the request's.
  let rfqId: string | null = null;
  let closed: string | null = null;
  let wake = () => {};
  const quotes = new Map<string, QuoteReceivedMessage>();
  const matches = (q: QuoteReceivedMessage) => q.rfq_id === rfqId && quoteMatchesProduct(q, trade.terms, trade.strategy.side);
  const fillable = (q: QuoteReceivedMessage) => isFillable(q, session.nowSec(), session.settlementBufferSeconds, SIGN_MARGIN_SECONDS);

  const onCreated = (m: { rfq_id: string; request_id: string }) => {
    if (m.request_id === requestId) rfqId = m.rfq_id;
    wake();
  };
  const onQuote = (q: QuoteReceivedMessage) => {
    if (!matches(q)) return;
    quotes.set(q.maker_owner, q);
    wake();
  };
  const onUpdate = (u: { rfq_id: string; quotes: QuoteReceivedMessage[] }) => {
    if (u.rfq_id !== rfqId) return;
    quotes.clear();
    for (const q of u.quotes) if (matches(q)) quotes.set(q.maker_owner, q);
    wake();
  };
  const onClosed = (m: { rfq_id: string; reason: string }) => {
    if (m.rfq_id !== rfqId) return;
    closed = m.reason;
    wake();
  };
  client.on("rfqCreated", onCreated);
  client.on("quoteReceived", onQuote);
  client.on("quotesUpdate", onUpdate);
  client.on("rfqClosed", onClosed);
  try {
    await client.createRfqOnce({
      request_id: requestId,
      market_pda: address(trade.descriptor.market_descriptor.market_pda),
      terms: trade.terms,
      side: trade.strategy.side,
      quantity: trade.quantity.toString(),
      timeout_seconds: RFQ_TIMEOUT_SECONDS,
    });
    const deadline = Date.now() + MAX_QUOTE_WAIT_MS;
    let firstAt: number | null = null;
    for (;;) {
      const now = Date.now();
      if (firstAt == null && [...quotes.values()].some(fillable)) firstAt = now;
      if (closed || now >= deadline || (firstAt != null && now - firstAt >= SETTLE_MS)) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 200);
      });
    }
  } catch (error) {
    throw toAgentError(error);
  } finally {
    client.off("rfqCreated", onCreated);
    client.off("quoteReceived", onQuote);
    client.off("quotesUpdate", onUpdate);
    client.off("rfqClosed", onClosed);
  }
  return { rfqId: rfqId ?? requestId, best: bestQuote(quotes.values(), fillable), seen: quotes.size, closed };
}

function noQuote(round: QuoteRound): AgentError {
  return round.closed === "no_eligible_makers"
    ? new AgentError("no_makers", "No trading desk can take this trade right now. Try another strike, date or a smaller size.", "fix_request")
    : new AgentError("no_quote", "No desk quoted in time. Try again, or try another strike or size.", "retry");
}

/** A live quote for the exact trade, and what it would mean. Nothing is accepted. */
export async function previewTrade(ctx: AgentContext, input: TradeInput) {
  const { session, limits, journal } = ctx;
  const trade = await resolveTrade(session, input);
  // A preview is of a trade this agent could place: over the owner's limits it is refused here,
  // as the real call would refuse it, and no desk is asked. Read only places nothing, so there
  // a preview is information and the limits do not apply.
  if (session.signer && !limits.readOnly) {
    checkSpend(limits, await journal.read(), { wallet: session.signer.address, asset: trade.asset.symbol, usd: trade.notionalUsd, nowSec: session.nowSec(), what: "trade" });
  }
  const client = await session.connect();
  const round = await requestQuotes(session, client, trade);
  if (!round.closed) client.cancelRfq(round.rfqId);
  if (!round.best) throw noQuote(round);
  const fill = describeFill(trade, round.best);
  return {
    network: session.config.network,
    ...fill.summary,
    quotes_received: round.seen,
    limit_premium_hint: fill.summary.premium.amount,
    note: "This quote is gone once you read it. To trade, call acta_place_trade with limit_premium: the least you accept when selling, the most you pay when buying. It asks for fresh quotes and fills only at that or better.",
  };
}

/** Watches one order's events from before it is accepted, so none is missed. */
function watchOrder(client: ActaWsClient, orderId: string, rfqId: string) {
  type Event =
    | { type: "served"; txBase64: string; deadline: number }
    | { type: "submitted"; signature: string }
    | { type: "confirmed"; positionPda: string }
    // `order`: the venue says this order failed. `rfq`: the RFQ ended or reopened, which is
    // final only while nothing has been sent.
    | { type: "failed"; reason: string; source: "order" | "rfq" };
  const events: Event[] = [];
  let wake = () => {};
  const push = (event: Event) => {
    events.push(event);
    wake();
  };
  const onServed = (id: string, txBase64: string, deadline: number) => {
    if (id === orderId) push({ type: "served", txBase64, deadline });
  };
  const onSubmitted = (id: string, signature: string) => {
    if (id === orderId) push({ type: "submitted", signature });
  };
  const onConfirmed = (id: string, positionPda: string) => {
    if (id === orderId) push({ type: "confirmed", positionPda });
  };
  const onFailed = (id: string, reason: string) => {
    if (id === orderId) push({ type: "failed", reason, source: "order" });
  };
  const onAgain = (m: { rfq_id: string; reason: string }) => {
    if (m.rfq_id === rfqId) push({ type: "failed", reason: m.reason, source: "rfq" });
  };
  const onClosed = (m: { rfq_id: string; reason: string }) => {
    if (m.rfq_id === rfqId && m.reason !== "filled") push({ type: "failed", reason: m.reason, source: "rfq" });
  };
  client.on("sponsoredTxToSign", onServed);
  client.on("orderSubmitted", onSubmitted);
  client.on("orderConfirmed", onConfirmed);
  client.on("orderFailed", onFailed);
  client.on("rfqAvailableAgain", onAgain);
  client.on("rfqClosed", onClosed);
  return {
    /** The first event of one of `types` (or a failure), or null after `timeoutMs`. */
    async next<T extends Event["type"]>(types: readonly T[], timeoutMs: number): Promise<Extract<Event, { type: T | "failed" }> | null> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = events.findIndex((e) => e.type === "failed" || (types as readonly string[]).includes(e.type));
        if (index !== -1) return events.splice(index, 1)[0] as Extract<Event, { type: T | "failed" }>;
        const left = deadline - Date.now();
        if (left <= 0) return null;
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, Math.min(left, 500));
        });
      }
    },
    signature(): string | undefined {
      return events.find((e): e is Extract<Event, { type: "submitted" }> => e.type === "submitted")?.signature;
    },
    stop() {
      client.off("sponsoredTxToSign", onServed);
      client.off("orderSubmitted", onSubmitted);
      client.off("orderConfirmed", onConfirmed);
      client.off("orderFailed", onFailed);
      client.off("rfqAvailableAgain", onAgain);
      client.off("rfqClosed", onClosed);
    },
  };
}

type OrderWatch = ReturnType<typeof watchOrder>;

export type OrderOutcome =
  | { state: "confirmed"; positionPda: string }
  | { state: "failed"; reason: string }
  /** `venueSaid`: why the venue ended the RFQ, when it did. Not a verdict on the order. */
  | { state: "unknown"; venueSaid: string | null };

/**
 * What became of an order once its signed transaction was handed to the venue. From here on
 * only two things are final: the venue confirming it, and the venue saying the order itself
 * failed. The RFQ closing or reopening is neither, because the transaction may already be on
 * its way: it shortens the wait and the order is then reported as unknown, to be looked up.
 */
export async function awaitOutcome(
  watch: Pick<OrderWatch, "next">,
  lookUp: () => Promise<OrderExecutionState | null>,
  timeoutMs: number = CONFIRM_TIMEOUT_MS,
  afterRfqEndedMs: number = AFTER_RFQ_ENDED_MS,
): Promise<OrderOutcome> {
  let deadline = Date.now() + timeoutMs;
  let venueSaid: string | null = null;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { state: "unknown", venueSaid };
    const event = await watch.next(["confirmed"], Math.min(5_000, left));
    if (event?.type === "confirmed") return { state: "confirmed", positionPda: event.positionPda };
    // After any other word from the venue, and every few seconds without one, ask it directly.
    const status = await lookUp();
    if (status?.type === "confirmed") return { state: "confirmed", positionPda: status.position_pda };
    if (event?.type !== "failed") continue;
    if (event.source === "order") return { state: "failed", reason: event.reason };
    venueSaid ??= event.reason;
    deadline = Math.min(deadline, Date.now() + afterRfqEndedMs);
  }
}

type Trace = { state: "confirmed"; positionPda?: string } | { state: "failed" } | { state: "unreadable" };

/**
 * Looks for an order the venue has no answer for, once its transaction is too old to land:
 * first the transaction itself on chain, by the signature the venue reported, then the wallet's
 * positions for one this order would have opened. Found in neither, it did not execute. If
 * either cannot be read, nothing is concluded.
 */
async function traceOrder(ctx: AgentContext, client: ActaWsClient, entry: JournalEntry, claimed: ReadonlySet<string>): Promise<Trace> {
  const { session } = ctx;
  let landed = false;
  // What the venue reported as the signature; text that is not one is treated as none.
  const reported = (() => {
    try {
      return entry.txSignature ? toSignature(entry.txSignature) : null;
    } catch {
      return null;
    }
  })();
  if (reported) {
    try {
      const { value } = await session.rpc.getSignatureStatuses([reported], { searchTransactionHistory: true }).send();
      const status = value[0];
      if (status?.err) return { state: "failed" };
      landed = status != null;
    } catch {
      return { state: "unreadable" };
    }
  }
  // Lines written before the order's terms were kept have nothing to match a position on.
  if (!entry.market || !entry.strike || !entry.quantity) return landed ? { state: "confirmed" } : { state: "failed" };
  try {
    const page = await client.getPositionsPageAsync({ ...ALL_POSITIONS, status: [], limit: 200 }, { applyToState: false });
    const position = page.positions.find(
      (p) =>
        p.market_pda === entry.market
        && p.side === entry.side
        && p.quantity === entry.quantity
        && "strike" in p.terms
        && p.terms.strike === entry.strike
        && Number(p.created_at) >= entry.at - POSITION_MATCH_SLACK_SECONDS
        // not one another order in the journal already opened
        && !claimed.has(p.pda),
    );
    if (position) return { state: "confirmed", positionPda: position.pda };
    return landed ? { state: "confirmed" } : { state: "failed" };
  } catch {
    return landed ? { state: "confirmed" } : { state: "unreadable" };
  }
}

/**
 * Brings the journal's open orders up to date from the venue. An order still open afterwards
 * blocks new trades: its funds may yet move, and the limits must count it.
 *
 * The venue's lookup answers pending, confirmed or unknown, and unknown is not proof that
 * nothing executed. So an order is closed as failed only when it was never signed, or when its
 * transaction is too old to land and was looked for and not found.
 */
export async function settleJournal(ctx: AgentContext, wallet: string): Promise<JournalEntry[]> {
  const { session, journal } = ctx;
  const entries = await journal.read();
  const open = unsettledOrders(entries, wallet);
  if (open.length === 0) return [];
  const client = await session.connect();
  const claimed = new Set(latestByOrder(entries).flatMap((e) => (e.positionPda ? [e.positionPda] : [])));
  const still: JournalEntry[] = [];
  for (const entry of open) {
    const status = await client.getOrderStatusAsync(entry.orderId).catch(() => null);
    const at = Math.floor(session.nowSec());
    if (status?.type === "confirmed") {
      await journal.append({ ...entry, state: "confirmed", at, positionPda: status.position_pda });
      claimed.add(status.position_pda);
    } else if (status?.type === "unknown" && entry.state === "accepted") {
      // accepted but never signed: nothing of ours could have reached the chain
      await journal.append({ ...entry, state: "abandoned", at });
    } else if (status?.type === "unknown" && at - entry.at > SIGNED_ORDER_DEAD_SECONDS) {
      const trace = await traceOrder(ctx, client, entry, claimed);
      if (trace.state === "unreadable") {
        still.push(entry);
      } else if (trace.state === "confirmed") {
        await journal.append({ ...entry, state: "confirmed", at, ...(trace.positionPda ? { positionPda: trace.positionPda } : {}) });
        if (trace.positionPda) claimed.add(trace.positionPda);
      } else {
        await journal.append({ ...entry, state: "failed", at });
      }
    } else {
      still.push(entry);
    }
  }
  return still;
}

export type PlaceInput = TradeInput & {
  /** in the quote token, for the whole trade: the least to receive when selling, the most to pay when buying */
  limit_premium: number;
  /** true: quote and check the limit, accept nothing */
  dry_run?: boolean;
};

/**
 * Places the trade in one call: fresh quotes, the best one that meets the limit, the sponsored
 * transaction verified and signed, submitted once, and its confirmation awaited. A quote lives
 * for seconds, so there is no handle to bring back in a later call.
 */
export async function placeTrade(ctx: AgentContext, input: PlaceInput) {
  const { session, limits, journal } = ctx;
  const signer = session.signer;
  if (!signer) throw new AgentError("no_wallet", "This server has no wallet: it can read markets but not trade.", "stop");
  if (!(input.limit_premium >= 0) || !Number.isFinite(input.limit_premium)) {
    throw new AgentError("invalid_limit", "limit_premium must be a number of the quote token, zero or more.");
  }
  if (ctx.placing) throw new AgentError("busy", "Another trade is being placed. Wait for it to finish.", "retry");
  ctx.placing = true;
  try {
    const trade = await resolveTrade(session, input);
    const client = await session.connect();
    const wallet = signer.address;

    const unsettled = await settleJournal(ctx, wallet);
    if (unsettled.length > 0) {
      throw new AgentError(
        "unsettled_order",
        "An earlier order has no final state yet. Check it with acta_get_order before placing another.",
        "reconcile",
        { order_ids: unsettled.map((e) => e.orderId) },
      );
    }
    // Before any desk is asked, and on a dry run too: a dry run that skipped this would
    // approve a trade the real call refuses.
    checkTrade(limits, await journal.read(), { wallet, asset: trade.asset.symbol, notionalUsd: trade.notionalUsd, nowSec: session.nowSec() });

    const round = await requestQuotes(session, client, trade);
    const cancel = () => {
      if (!round.closed) client.cancelRfq(round.rfqId);
    };
    const quote = round.best;
    if (!quote) {
      cancel();
      throw noQuote(round);
    }
    const fill = describeFill(trade, quote);
    const limitAtoms = BigInt(Math.round(input.limit_premium * 10 ** trade.data.quote_decimals));
    const meets = trade.strategy.side === "sell" ? fill.premiumAtoms >= limitAtoms : fill.premiumAtoms <= limitAtoms;
    if (!meets || input.dry_run) {
      cancel();
      return {
        status: meets ? "dry_run" : "limit_not_met",
        network: session.config.network,
        ...fill.summary,
        limit_premium: input.limit_premium,
        note: meets
          ? "Nothing was traded. The same call without dry_run places it."
          : `Nothing was traded: the best quote ${trade.strategy.side === "sell" ? "pays less" : "costs more"} than limit_premium.`,
      };
    }

    // Read from chain before accepting: once accepted, the signature deadline is running.
    const parties = await readFillParties(session.rpc, quote).catch((error) => {
      cancel();
      throw new AgentError("chain_unreadable", plainText(error instanceof Error ? error.message : error), "retry");
    });
    if (!isFillable(quote, session.nowSec(), session.settlementBufferSeconds, SIGN_MARGIN_SECONDS - 2)) {
      cancel();
      throw new AgentError("quote_expired", "The quote expired before it could be accepted. Nothing was traded; try again.", "retry");
    }

    const orderId = quote.order_id;
    const line = (state: JournalState, extra: Partial<JournalEntry> = {}): JournalEntry => ({
      orderId,
      rfqId: round.rfqId,
      state,
      at: Math.floor(session.nowSec()),
      wallet,
      asset: trade.asset.symbol,
      side: trade.strategy.side,
      notionalUsd: trade.notionalUsd,
      market: trade.descriptor.market_descriptor.market_pda,
      ...("strike" in trade.terms ? { strike: String(trade.terms.strike) } : {}),
      quantity: trade.quantity.toString(),
      ...extra,
    });
    const record = (state: JournalState, extra: Partial<JournalEntry> = {}) => journal.append(line(state, extra));
    const watch = watchOrder(client, orderId, round.rfqId);
    try {
      // The check that counts: against the journal as it is now, and written in the same step,
      // so nothing else in flight (a deposit, another server on this wallet) can use the same room.
      await reserveSpend(ctx, { wallet, asset: trade.asset.symbol, usd: trade.notionalUsd, nowSec: session.nowSec(), what: "trade" }, line("accepted")).catch((error) => {
        cancel();
        throw error;
      });
      try {
        await client.acceptQuote(round.rfqId, quote.maker_owner, orderId);
      } catch (error) {
        await record("abandoned");
        throw toAgentError(error);
      }

      const served = await watch.next(["served"], SERVED_TX_TIMEOUT_MS);
      if (!served || served.type === "failed") {
        await record("abandoned");
        cancel();
        throw new AgentError("not_served", `The venue did not send the transaction to sign${served ? ` (${plainText(served.reason, 60)})` : ""}. Nothing was traded.`, "retry");
      }
      if (served.deadline && session.nowSec() >= served.deadline) {
        await record("abandoned");
        cancel();
        throw new AgentError("signature_deadline", "The signature deadline passed. Nothing was traded; try again.", "retry");
      }

      let signed: string;
      try {
        signed = await signTakerFill({
          rpc: session.rpc,
          txBase64: served.txBase64,
          quote,
          rfq: takerFillRfq({ rfqId: round.rfqId, descriptor: trade.descriptor, terms: trade.terms, side: trade.strategy.side, quantity: trade.quantity.toString() }),
          parties,
          signer,
        });
      } catch (error) {
        await record("abandoned");
        cancel();
        throw new AgentError(
          "fill_not_signed",
          `The transaction the venue sent was not signed: ${plainText(error instanceof Error ? error.message : error)}. Nothing was traded.`,
          "stop",
        );
      }
      await record("signed");

      const outcome = await client.submitOrderOnce({ orderIdHex: orderId, txBase64: signed }).catch(async () => null);
      if (outcome?.type === "rejected") {
        await record("failed");
        throw new AgentError("not_submitted", `The venue did not take the signed transaction (${plainText(outcome.error.type, 60)}). Nothing was traded.`, outcome.action === "retry" ? "retry" : "stop");
      }

      // The signed transaction is with the venue. Nothing below may say "nothing was traded"
      // unless the venue said so about this order.
      const lookUp = () => client.getOrderStatusAsync(orderId).catch(() => null);
      const result: OrderOutcome = outcome?.type === "reconciled" && outcome.state.type === "confirmed"
        ? { state: "confirmed", positionPda: outcome.state.position_pda }
        : await awaitOutcome(watch, lookUp);
      const txSignature = watch.signature();

      if (result.state === "confirmed") {
        await record("confirmed", { positionPda: result.positionPda, txSignature });
        return {
          status: "confirmed",
          network: session.config.network,
          ...fill.summary,
          order_id: orderId,
          position: result.positionPda,
          transaction: txSignature ? explorerUrl(session.config, "tx", txSignature) : null,
        };
      }
      if (result.state === "failed") {
        await record("failed", { txSignature });
        throw new AgentError("order_failed", `The venue reported that the order failed (${plainText(result.reason, 80)}). Nothing was traded.`, "retry");
      }
      await record("unknown", { txSignature });
      return {
        status: "unknown",
        network: session.config.network,
        ...fill.summary,
        order_id: orderId,
        ...(result.venueSaid ? { venue_said: plainText(result.venueSaid, 60) } : {}),
        note: `The order was sent and its result is not known${result.venueSaid ? ": the venue ended the request for quotes, which does not say whether the order executed" : ""}. Do not place it again. Check acta_get_order with this order_id, or acta_list_positions.`,
      };
    } finally {
      watch.stop();
    }
  } finally {
    ctx.placing = false;
  }
}

/** Where one order stands, from the venue; the journal is brought up to date with the answer. */
export async function getOrder(ctx: AgentContext, orderId: string) {
  const { session } = ctx;
  if (!/^[0-9a-f]{64}$/i.test(orderId)) throw new AgentError("invalid_order_id", "order_id is 64 hex characters.");
  const client = await session.connect();
  const status = await client.getOrderStatusAsync(orderId).catch((error) => {
    throw toAgentError(error);
  });
  if (session.signer) await settleJournal(ctx, session.signer.address);
  if (status.type !== "unknown") {
    return { network: session.config.network, order_id: orderId, status: status.type, position: status.type === "confirmed" ? status.position_pda : null };
  }
  // The venue has no answer. This server's own record may: it looks an old order up on chain.
  const own = session.signer
    ? latestByOrder(await ctx.journal.read()).find((e) => e.orderId.toLowerCase() === orderId.toLowerCase() && e.wallet === session.signer!.address)
    : undefined;
  if (own?.state === "confirmed") {
    return { network: session.config.network, order_id: orderId, status: "confirmed", position: own.positionPda ?? null, note: "The venue has no result for this order; it was found on chain." };
  }
  if (own?.state === "failed" || own?.state === "abandoned") {
    return { network: session.config.network, order_id: orderId, status: "not_executed", position: null, note: "The order did not execute: nothing was traded." };
  }
  return {
    network: session.config.network,
    order_id: orderId,
    status: "unknown",
    position: null,
    note: "The venue has no result for this order. That is not proof it did not execute: check acta_list_positions before trading again.",
  };
}
