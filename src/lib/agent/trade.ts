import {
  ALL_POSITIONS,
  previewFill,
  reconcileTrade,
  totalPremiumQuoteAtoms,
  TRADE_RFQ_TIMEOUTS,
  type ActaWsClient,
  type MarketDescriptorInfo,
  type NotTradedReason,
  type OptionTerms,
  type OrderExecutionState,
  type QuoteReceivedMessage,
  type QuoteTokenFees,
  type RfqUpdateMessage,
  type TokenMarketsInfoData,
  type TradeTransaction,
} from "@acta-markets/ts-sdk/ws";
import { address, signature as toSignature } from "@solana/kit";
import { quoteMatchesProduct } from "@/lib/spreads";
import { takerFill } from "@/lib/trade/fill";
import { bestQuote, isFillable } from "@/lib/trade/quotes";
import { indicativesFor, spotFromSnapshot, tradableExpiries } from "@/lib/trade/strikes";
import { explorerUrl } from "./config";
import { AgentError, plainSymbol, plainText, serverErrorCode, toAgentError } from "./errors";
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
/**
 * A signed fill carries a recent blockhash and cannot land once it has aged out (about a
 * minute and a half). Past this an order the venue cannot place can no longer execute; whether
 * it already did is then looked up on chain (`traceOrder`).
 */
const SIGNED_ORDER_DEAD_SECONDS = 600;
/** A position is looked for from this long before the order's last journal line: clocks differ, and the line is written after the wait. */
const POSITION_MATCH_SLACK_SECONDS = 300;

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

function fillPreview(trade: ResolvedTrade, quote: QuoteReceivedMessage) {
  const { strategy, data } = trade;
  const ud = data.underlying_decimals;
  const qd = data.quote_decimals;
  const preview = trade.fees
    ? previewFill({ terms: trade.terms, side: strategy.side, quantity: trade.quantity, price1e9: quote.price, fees: trade.fees, underlyingDecimals: ud, quoteDecimals: qd })
    : null;
  const premiumAtoms = preview
    ? preview.premium.netAtoms
    : totalPremiumQuoteAtoms(strategy.side === "sell" ? quote.net_price : quote.price, trade.quantity, ud, qd);
  return { preview, premiumAtoms };
}

/** What a fill at this quote means for the taker, in whole tokens. */
function describeFill(trade: ResolvedTrade, quote: QuoteReceivedMessage) {
  const { asset, strategy, data, quoteSymbol, strike, size } = trade;
  const qd = data.quote_decimals;
  const { preview, premiumAtoms } = fillPreview(trade, quote);
  const premium = atomsToUnits(premiumAtoms, qd);
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
    premiumAtoms,
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
  const onRfq = (u: RfqUpdateMessage) => {
    if (u.rfq_id !== rfqId || u.state.type !== "closed") return;
    closed = u.state.reason;
    wake();
  };
  client.on("rfqCreated", onCreated);
  client.on("quoteReceived", onQuote);
  client.on("quotesUpdate", onUpdate);
  client.on("rfqUpdate", onRfq);
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
    client.off("rfqUpdate", onRfq);
  }
  return { rfqId: rfqId ?? requestId, best: bestQuote(quotes.values(), fillable), seen: quotes.size, closed };
}

/** Ends an RFQ the caller will not accept on. The venue answers the cancel; nothing waits for it. */
function cancelRound(client: ActaWsClient, round: QuoteRound): void {
  if (!round.closed) void client.cancelRfq(round.rfqId).catch(() => undefined);
}

function noQuote(round: Pick<QuoteRound, "closed">): AgentError {
  return round.closed === "no_eligible_makers"
    ? new AgentError("no_makers", "No trading desk can take this trade right now. Try another strike, date or a smaller size.", "fix_request")
    : new AgentError("no_quote", "No desk quoted in time. Try again, or try another strike or size.", "retry");
}

/** A live quote for the exact trade, and what it would mean. Nothing is accepted. */
export async function previewTrade(ctx: AgentContext, input: TradeInput) {
  const { session, limits, journal } = ctx;
  const trade = await resolveTrade(session, input);
  // A preview is of a trade this agent could place: over the owner's limits it is refused here,
  // as the real call would refuse it. Read only places nothing, so there the limits do not apply.
  if (session.signer && !limits.readOnly) {
    checkSpend(limits, await journal.read(), { wallet: session.signer.address, asset: trade.asset.symbol, usd: trade.notionalUsd, nowSec: session.nowSec(), what: "trade" });
  }
  const client = await session.connect();
  const round = await requestQuotes(session, client, trade);
  cancelRound(client, round);
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

type Trace = { state: "confirmed"; positionPda?: string } | { state: "failed" } | { state: "unreadable" };

/**
 * Looks for an order the venue can neither confirm nor prove expired, once its transaction is
 * too old to land: first the transaction on chain by the signature the venue reported, then the
 * wallet's positions for one this order would have opened. Found in neither, it did not execute.
 * If either cannot be read, nothing is concluded.
 */
async function traceOrder(ctx: AgentContext, client: ActaWsClient, entry: JournalEntry, claimed: ReadonlySet<string>): Promise<Trace> {
  const { session } = ctx;
  let landed = false;
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
 * `unknown` from the venue is not proof that nothing executed. An order is closed as failed
 * only when the venue proves it expired, when it was never signed, or when its transaction is
 * too old to land and was looked for and not found.
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
    // `reconcileTrade` keeps `pending` and `unknown` alike open; only `unknown` may age out.
    let status = null as OrderExecutionState["type"] | null;
    const venue = {
      getOrderStatusAsync: async (orderId: string) => {
        const state = await client.getOrderStatusAsync(orderId);
        status = state.type;
        return state;
      },
      cancelRfq: (rfqId: string) => client.cancelRfq(rfqId),
    };
    const outcome = await reconcileTrade(venue, {
      type: "unknown",
      rfq_id: entry.rfqId,
      order_id: entry.orderId,
      transaction: entry.txSignature ? { type: "reported", signature: entry.txSignature } : { type: "unreported" },
    }).catch(() => null);
    const at = Math.floor(session.nowSec());
    if (outcome?.type === "filled") {
      await journal.append({ ...entry, state: "confirmed", at, positionPda: outcome.position_pda });
      claimed.add(outcome.position_pda);
    } else if (outcome?.type === "not_traded") {
      // `expired`: the venue proved it never executed and never can
      await journal.append({ ...entry, state: "failed", at });
    } else if (status === "unknown" && entry.state === "accepted") {
      // accepted but never signed: nothing of ours could have reached the chain
      await journal.append({ ...entry, state: "abandoned", at });
    } else if (status === "unknown" && at - entry.at > SIGNED_ORDER_DEAD_SECONDS) {
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
    // On a dry run too: a dry run that skipped this would approve a trade the real call refuses.
    checkTrade(limits, await journal.read(), { wallet, asset: trade.asset.symbol, notionalUsd: trade.notionalUsd, nowSec: session.nowSec() });

    const limitAtoms = BigInt(Math.round(input.limit_premium * 10 ** trade.data.quote_decimals));
    const meets = (quote: QuoteReceivedMessage) => {
      const { premiumAtoms } = fillPreview(trade, quote);
      return trade.strategy.side === "sell" ? premiumAtoms >= limitAtoms : premiumAtoms <= limitAtoms;
    };
    const unfilled = (quote: QuoteReceivedMessage, met: boolean) => ({
      status: met ? "dry_run" : "limit_not_met",
      network: session.config.network,
      ...describeFill(trade, quote).summary,
      limit_premium: input.limit_premium,
      note: met
        ? "Nothing was traded. The same call without dry_run places it."
        : `Nothing was traded: the best quote ${trade.strategy.side === "sell" ? "pays less" : "costs more"} than limit_premium.`,
    });

    if (input.dry_run) {
      const round = await requestQuotes(session, client, trade);
      cancelRound(client, round);
      if (!round.best) throw noQuote(round);
      return unfilled(round.best, meets(round.best));
    }

    const fillable = (q: QuoteReceivedMessage) => isFillable(q, session.nowSec(), session.settlementBufferSeconds, SIGN_MARGIN_SECONDS);
    // Every quote for this trade with time left, by order id: the one taken, or the best one missed.
    const quotes = new Map<string, QuoteReceivedMessage>();
    // The served transaction names no order; the venue's `SponsoredTxToSign` does.
    const servedOrder = new Map<string, string>();
    const onServed = (orderId: string, txBase64: string) => {
      servedOrder.set(txBase64, orderId);
    };
    let taken = null as QuoteReceivedMessage | null;
    // Set when the limits refuse the trade at the last check; nothing was signed then.
    let overLimit = null as AgentError | null;
    const line = (ids: { order_id: string; rfq_id: string }, state: JournalState, extra: Partial<JournalEntry> = {}): JournalEntry => ({
      orderId: ids.order_id,
      rfqId: ids.rfq_id,
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
    const record = (ids: { order_id: string; rfq_id: string }, state: JournalState, extra: Partial<JournalEntry> = {}) =>
      journal.append(line(ids, state, extra));

    const fill = await takerFill(session.rpc, signer, async () => {
      if (taken) await record(taken, "signed");
    }).catch((error) => {
      throw new AgentError("chain_unreadable", plainText(error instanceof Error ? error.message : error), "retry");
    });
    client.on("sponsoredTxToSign", onServed);
    let outcome: Awaited<ReturnType<ActaWsClient["tradeRfq"]>>;
    try {
      outcome = await client.tradeRfq({
        market: trade.descriptor,
        terms: trade.terms,
        side: trade.strategy.side,
        quantity: trade.quantity.toString(),
        timeoutSeconds: RFQ_TIMEOUT_SECONDS,
        selection: {
          type: "best",
          settleMs: SETTLE_MS,
          acceptable: (quote) => {
            if (!quoteMatchesProduct(quote, trade.terms, trade.strategy.side) || !fillable(quote)) return false;
            quotes.set(quote.order_id, quote);
            return meets(quote);
          },
        },
        fill: {
          ...fill,
          lookupTables: async (txBase64) => {
            const tables = await fill.lookupTables(txBase64);
            const orderId = servedOrder.get(txBase64);
            taken = orderId ? quotes.get(orderId) ?? null : null;
            if (!taken) throw new Error("the served transaction is not for a quote this trade took");
            // The check that counts, right before signing: against the journal as it is now and
            // written in the same step, so nothing else in flight can use the same room.
            const spend = { wallet, asset: trade.asset.symbol, usd: trade.notionalUsd, nowSec: session.nowSec(), what: "trade" } as const;
            await reserveSpend(ctx, spend, line(taken, "accepted")).catch((error) => {
              overLimit = toAgentError(error);
              throw error;
            });
            return tables;
          },
        },
        timeouts: { ...TRADE_RFQ_TIMEOUTS, quoteMs: MAX_QUOTE_WAIT_MS },
        signal: new AbortController().signal,
      });
    } catch (error) {
      throw toAgentError(error);
    } finally {
      client.off("sponsoredTxToSign", onServed);
    }

    if (outcome.type === "filled" || outcome.type === "unknown") {
      const quote = quotes.get(outcome.order_id);
      const summary = quote ? describeFill(trade, quote).summary : {};
      const txSignature = signatureOf(outcome.transaction);
      if (outcome.type === "filled") {
        await record(outcome, "confirmed", { positionPda: outcome.position_pda, txSignature });
        return {
          status: "confirmed",
          network: session.config.network,
          ...summary,
          order_id: outcome.order_id,
          position: outcome.position_pda,
          transaction: txSignature ? explorerUrl(session.config, "tx", txSignature) : null,
        };
      }
      await record(outcome, "unknown", { txSignature });
      return {
        status: "unknown",
        network: session.config.network,
        ...summary,
        order_id: outcome.order_id,
        note: "The order was sent and its result has not arrived. Do not place it again. Check acta_get_order with this order_id, or acta_list_positions.",
      };
    }

    const { reason } = outcome;
    if (overLimit) throw overLimit;
    if (taken) await record(taken, endedState(reason));
    if (reason.type === "no_acceptable_quote") {
      const best = bestQuote(quotes.values());
      if (best) return unfilled(best, false);
      throw noQuote({ closed: null });
    }
    if (reason.type === "rfq_closed" && !taken) throw noQuote({ closed: reason.reason });
    throw notTradedError(reason, taken !== null);
  } finally {
    ctx.placing = false;
  }
}

function signatureOf(transaction: TradeTransaction): string | undefined {
  return transaction.type === "reported" ? transaction.signature : undefined;
}

/** `failed`: the venue had the order and ended it. `abandoned`: nothing was submitted. */
function endedState(reason: NotTradedReason): JournalState {
  switch (reason.type) {
    case "order_failed":
    case "expired":
      return "failed";
    case "refused":
      return reason.stage === "submit" ? "failed" : "abandoned";
    default:
      return "abandoned";
  }
}

/** `signing`: the served transaction was verified and handed to the signer. */
function notTradedError(reason: NotTradedReason, signing: boolean): AgentError {
  switch (reason.type) {
    case "order_failed":
      return new AgentError("order_failed", `The order was not executed (${plainText(reason.reason, 80)}). Nothing was traded.`, "retry");
    case "expired":
      return new AgentError("order_failed", "The order expired without executing. Nothing was traded.", "retry");
    case "refused":
      return reason.stage === "submit"
        ? new AgentError("not_submitted", `The venue did not take the signed transaction (${plainText(serverErrorCode(reason.error), 60)}). Nothing was traded.`, "retry")
        : new AgentError(plainText(serverErrorCode(reason.error), 60) || "refused", `The venue refused the trade (${plainText(serverErrorCode(reason.error), 60)}). Nothing was traded.`, "retry");
    case "verification_failed":
      return new AgentError(
        "fill_not_signed",
        `The transaction the venue sent was not signed: ${plainText(reason.error.message)}. Nothing was traded.`,
        "stop",
      );
    case "not_signed":
      return signing
        ? new AgentError("fill_not_signed", `The transaction the venue sent was not signed: ${plainText(reason.message)}. Nothing was traded.`, "stop")
        : new AgentError("chain_unreadable", `${plainText(reason.message)}. Nothing was traded.`, "retry");
    case "rfq_closed":
    case "released":
    case "not_served":
      return new AgentError(
        "not_served",
        `The venue did not send the transaction to sign${"reason" in reason ? ` (${plainText(reason.reason, 60)})` : ""}. Nothing was traded.`,
        "retry",
      );
    case "no_response":
    case "aborted":
      return new AgentError("not_connected", "The connection to the venue dropped before anything was submitted. Nothing was traded.", "retry");
    case "selection_failed":
    case "no_acceptable_quote":
      return new AgentError("no_quote", "No desk quoted in time. Try again, or try another strike or size.", "retry");
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
  const network = session.config.network;
  if (status.type === "expired") {
    return { network, order_id: orderId, status: "not_executed", position: null, note: "The order expired without executing: nothing was traded." };
  }
  if (status.type !== "unknown") {
    return { network, order_id: orderId, status: status.type, position: status.type === "confirmed" ? status.position_pda : null };
  }
  // The venue has no answer. This server's own record may: it looks an old order up on chain.
  const signer = session.signer;
  const own = signer
    ? latestByOrder(await ctx.journal.read()).find((e) => e.orderId.toLowerCase() === orderId.toLowerCase() && e.wallet === signer.address)
    : undefined;
  if (own?.state === "confirmed") {
    return { network, order_id: orderId, status: "confirmed", position: own.positionPda ?? null, note: "The venue has no result for this order; it was found on chain." };
  }
  if (own?.state === "failed" || own?.state === "abandoned") {
    return { network, order_id: orderId, status: "not_executed", position: null, note: "The order did not execute: nothing was traded." };
  }
  return {
    network,
    order_id: orderId,
    status: "unknown",
    position: null,
    note: "The venue has no result for this order. That is not proof it did not execute: check acta_list_positions before trading again.",
  };
}
