// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors";
import { memoryJournal, spentSince, unsettledOrders, type JournalEntry } from "./journal";
import { DEFAULT_LIMITS, type Limits } from "./limits";
import type { ActaSession } from "./session";
import type { TradeOutcome, TradeRfqArgs } from "@acta-markets/ts-sdk/ws";
import type { AgentContext } from "./trade";

// The market is whatever `MARKET_DATA` says and a fill is signed without a chain: what is under
// test is what the limits refuse, what the journal records and what a trade is said to be once
// its transaction has been sent.
const MARKET = "iUBW1FecuRAN2r8QhrM7cTVD9gcfxivxF5WL6w1j5qg";
const EXPIRY = Date.UTC(2026, 10, 27, 8) / 1000;
const STRIKE = "58000000000000";
const tables = vi.hoisted(() => ({ read: vi.fn(async () => ({})) }));
vi.mock("./markets", async (original) => ({
  ...(await original<typeof import("./markets")>()),
  findAsset: async () => ({ symbol: "BTC", mint: "mint", decimals: 8, token: {} }),
  marketSnapshot: async () => ({ underlying_decimals: 8, quote_decimals: 6, quote_symbol: "USDC-Dev", size_rule: { min_size: "100000", max_size: "100000000000", step: "100000" } }),
}));
vi.mock("@/lib/trade/strikes", async (original) => ({
  ...(await original<typeof import("@/lib/trade/strikes")>()),
  tradableExpiries: () => [{ expiryTs: EXPIRY, pda: MARKET }],
  indicativesFor: () => ({ strikes: [{ strike: STRIKE }] }),
  spotFromSnapshot: () => 60_000,
}));
vi.mock("@/lib/trade/fill", () => ({
  takerFill: async (_rpc: unknown, signer: { address: string }, onSigned: () => Promise<void>) => ({
    keeper: "keeper",
    taker: signer.address,
    bounds: {},
    signer: { address: signer.address, signMessage: async () => (await onSigned(), new Uint8Array(64)) },
    makerVault: async () => null,
    lookupTables: () => tables.read(),
  }),
}));

const { getOrder, placeTrade, previewTrade, settleJournal } = await import("./trade");

const NOW = 2_000_000;
const WALLET = "wallet";
const ORDER = "ab".repeat(32);
/** A signature shaped like one: 64 bytes, in base58. */
const SIGNATURE = "1".repeat(64);

function entry(over: Partial<JournalEntry>): JournalEntry {
  return { orderId: ORDER, rfqId: "r", state: "signed", at: NOW - 30, wallet: WALLET, asset: "BTC", side: "sell", notionalUsd: 58, ...over };
}

/**
 * A context whose venue answers `getOrderStatus` from `statuses`. `found` is what looking for an
 * order turns up: the wallet's positions, and what the chain says of a signature (an `Error`
 * for either means it could not be read).
 */
async function context(
  lines: JournalEntry[],
  statuses: Record<string, unknown>,
  signer: { address: string } | null = { address: WALLET },
  found: { positions?: unknown[] | Error; onChain?: unknown } = {},
) {
  const journal = memoryJournal();
  for (const line of lines) await journal.append(line);
  const getOrderStatusAsync = vi.fn(async (id: string) => {
    const status = statuses[id];
    if (!status) throw new Error("offline");
    return status;
  });
  const getPositionsPageAsync = vi.fn(async (_args: { market_pda: unknown; cursor: unknown }): Promise<{ positions: unknown[]; next_cursor: string | null }> => {
    if (found.positions instanceof Error) throw found.positions;
    return { positions: found.positions ?? [], next_cursor: null };
  });
  const getSignatureStatuses = vi.fn(() => ({
    send: async () => {
      if (found.onChain instanceof Error) throw found.onChain;
      return { value: [found.onChain ?? null] };
    },
  }));
  const session = {
    signer,
    config: { network: "devnet" },
    nowSec: () => NOW,
    rpc: { getSignatureStatuses },
    connect: async () => ({ getOrderStatusAsync, getPositionsPageAsync, cancelRfq: async () => "req" }),
  } as unknown as ActaSession;
  const ctx: AgentContext = { session, limits: DEFAULT_LIMITS, journal, placing: false };
  return { ctx, journal, getOrderStatusAsync, getPositionsPageAsync, getSignatureStatuses };
}
const stateOf = async (journal: ReturnType<typeof memoryJournal>) => (await journal.read()).at(-1)?.state;

describe("settleJournal: what a restart finds", () => {
  it("an order the venue confirmed is confirmed, with its position", async () => {
    const { ctx, journal } = await context([entry({ state: "signed" })], { [ORDER]: { type: "confirmed", position_pda: "pos" } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect((await journal.read()).at(-1)).toMatchObject({ state: "confirmed", positionPda: "pos" });
  });

  it("an order the venue proved expired is failed", async () => {
    const { ctx, journal } = await context([entry({ state: "unknown" })], { [ORDER]: { type: "expired" } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("failed");
  });

  it("an order accepted and never signed is let go: nothing of ours reached the chain", async () => {
    const { ctx, journal } = await context([entry({ state: "accepted" })], { [ORDER]: { type: "unknown" } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("abandoned");
  });

  it("a freshly signed order with no result stays open, and blocks the next trade", async () => {
    const { ctx, journal } = await context([entry({ state: "signed", at: NOW - 30 })], { [ORDER]: { type: "unknown" } });
    expect((await settleJournal(ctx, WALLET)).map((e) => e.orderId)).toEqual([ORDER]);
    expect(await stateOf(journal)).toBe("signed");
  });

  it("a signed order too old for its blockhash is closed as not executed", async () => {
    const { ctx, journal } = await context([entry({ state: "signed", at: NOW - 601 })], { [ORDER]: { type: "unknown" } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("failed");
  });

  // What the order would have opened, as the journal keeps it since the terms are recorded.
  const terms = { market: MARKET, strike: STRIKE, quantity: "100000" };
  const opened = (over: Record<string, unknown> = {}) => ({
    pda: "pos",
    market_pda: MARKET,
    side: "sell",
    quantity: "100000",
    terms: { type: "cash_secured_put", strike: STRIKE },
    created_at: NOW - 650,
    ...over,
  });
  const old = (over: Partial<JournalEntry> = {}) => entry({ state: "unknown", at: NOW - 601, ...terms, ...over });
  const unknown = { [ORDER]: { type: "unknown" } };

  it("an old order whose transaction is on chain is confirmed, not closed as failed", async () => {
    const { ctx, journal } = await context([old({ txSignature: SIGNATURE })], unknown, undefined, { onChain: { err: null }, positions: [opened()] });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect((await journal.read()).at(-1)).toMatchObject({ state: "confirmed", positionPda: "pos" });
  });

  it("an old order whose transaction failed on chain is closed as failed", async () => {
    const { ctx, journal } = await context([old({ txSignature: SIGNATURE })], unknown, undefined, { onChain: { err: { InstructionError: [0, "Custom"] } } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("failed");
  });

  it("with no signature to look up, a position the order would have opened confirms it", async () => {
    const { ctx, journal, getSignatureStatuses } = await context([old()], unknown, undefined, { positions: [opened()] });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect((await journal.read()).at(-1)).toMatchObject({ state: "confirmed", positionPda: "pos" });
    expect(getSignatureStatuses).not.toHaveBeenCalled();
  });

  it.each([
    ["on another market", { market_pda: "other" }],
    ["of another size", { quantity: "200000" }],
    ["at another strike", { terms: { type: "cash_secured_put", strike: "59000000000000" } }],
    ["bought, not sold", { side: "buy" }],
    ["opened long before the order", { created_at: NOW - 5_000 }],
  ])("a position %s is not this order's: it is closed as failed", async (_name, over) => {
    const { ctx, journal } = await context([old()], unknown, undefined, { positions: [opened(over)] });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("failed");
  });

  it("looks through every page of the order's market, not the wallet's first page", async () => {
    const { ctx, journal, getPositionsPageAsync } = await context([old()], unknown);
    getPositionsPageAsync
      .mockResolvedValueOnce({ positions: [], next_cursor: "p2" })
      .mockResolvedValueOnce({ positions: [opened()], next_cursor: null });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("confirmed");
    expect(getPositionsPageAsync.mock.calls.map(([args]) => [args.market_pda, args.cursor])).toEqual([
      [{ type: "only", value: MARKET }, { type: "start" }],
      [{ type: "only", value: MARKET }, { type: "after", id: "p2" }],
    ]);
  });

  it("a position another order in the journal already opened is not counted twice", async () => {
    const earlier = entry({ orderId: "cd".repeat(32), state: "confirmed", at: NOW - 700, positionPda: "pos", ...terms });
    const { ctx, journal } = await context([earlier, old()], unknown, undefined, { positions: [opened()] });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(await stateOf(journal)).toBe("failed");
  });

  it.each([
    ["the chain", { onChain: new Error("rpc down") }, { txSignature: SIGNATURE }],
    ["the wallet's positions", { positions: new Error("venue down") }, {}],
  ])("concludes nothing while %s cannot be read: the order stays open", async (_name, found, over) => {
    const { ctx, journal } = await context([old(over)], unknown, undefined, found);
    expect((await settleJournal(ctx, WALLET)).map((e) => e.orderId)).toEqual([ORDER]);
    expect(await stateOf(journal)).toBe("unknown");
  });

  it("a deposit or a funding is never looked up as an order", async () => {
    const lines = [
      entry({ orderId: "vault:v:1", side: "deposit", state: "reserved" }),
      entry({ orderId: "fund:p:1", side: "fund", state: "reserved" }),
    ];
    const { ctx, getOrderStatusAsync } = await context(lines, {});
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(getOrderStatusAsync).not.toHaveBeenCalled();
  });

  it("an order still pending at the venue stays open", async () => {
    const { ctx } = await context([entry({ state: "unknown", at: NOW - 5_000 })], { [ORDER]: { type: "pending" } });
    expect(await settleJournal(ctx, WALLET)).toHaveLength(1);
  });

  it("an unreachable venue settles nothing", async () => {
    const { ctx, journal } = await context([entry({ state: "signed", at: NOW - 5_000 })], {});
    expect(await settleJournal(ctx, WALLET)).toHaveLength(1);
    expect(unsettledOrders(await journal.read(), WALLET)).toHaveLength(1);
  });

  it("asks the venue nothing when nothing is open", async () => {
    const { ctx, getOrderStatusAsync } = await context([entry({ state: "confirmed" })], {});
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect(getOrderStatusAsync).not.toHaveBeenCalled();
  });
});

describe("placeTrade: refusals before anything is quoted", () => {
  const trade = { asset: "BTC", side: "sell" as const, view: "above" as const, strike: 58000, expiry: "2026-11-27", size: 0.001, limit_premium: 0.5 };
  const code = (promise: Promise<unknown>) => promise.then(() => null, (error) => (error instanceof AgentError ? error.code : String(error)));

  it("does not trade without a wallet", async () => {
    const { ctx } = await context([], {}, null);
    expect(await code(placeTrade(ctx, trade))).toBe("no_wallet");
  });

  it("does not place two trades at once", async () => {
    const { ctx } = await context([], {});
    ctx.placing = true;
    expect(await code(placeTrade(ctx, trade))).toBe("busy");
    expect(ctx.placing).toBe(true);
  });

  it("refuses a limit that is not a number", async () => {
    const { ctx } = await context([], {});
    expect(await code(placeTrade(ctx, { ...trade, limit_premium: Number.NaN }))).toBe("invalid_limit");
    expect(ctx.placing).toBe(false);
  });
});

describe("getOrder", () => {
  it("refuses an id that is not an order id before asking the venue", async () => {
    const { ctx, getOrderStatusAsync } = await context([], {});
    await expect(getOrder(ctx, "DROP TABLE")).rejects.toMatchObject({ code: "invalid_order_id" });
    expect(getOrderStatusAsync).not.toHaveBeenCalled();
  });

  it("says an unknown result is not proof the order did not execute", async () => {
    const { ctx } = await context([], { [ORDER]: { type: "unknown" } });
    const result = await getOrder(ctx, ORDER);
    expect(result.status).toBe("unknown");
    expect(result.note).toMatch(/not proof/);
  });

  it("an order the venue proved expired did not execute", async () => {
    const { ctx } = await context([], { [ORDER]: { type: "expired" } });
    expect(await getOrder(ctx, ORDER)).toMatchObject({ status: "not_executed", position: null });
  });

  it("reports what looking the order up on chain concluded, when the venue has no answer", async () => {
    const line = entry({ state: "unknown", at: NOW - 601, txSignature: SIGNATURE });
    const landed = await context([line], { [ORDER]: { type: "unknown" } }, undefined, { onChain: { err: null } });
    expect(await getOrder(landed.ctx, ORDER)).toMatchObject({ status: "confirmed" });
    const failed = await context([line], { [ORDER]: { type: "unknown" } }, undefined, { onChain: { err: "failed" } });
    expect(await getOrder(failed.ctx, ORDER)).toMatchObject({ status: "not_executed", position: null });
  });
});

describe("placeTrade and previewTrade against a venue", () => {
  const trade = { asset: "BTC", side: "sell" as const, view: "above" as const, strike: 58_000, expiry: "2026-11-27", size: 0.001 };
  const QUOTE = { rfq_id: "rfq", maker_owner: "maker", order_id: ORDER, side: "sell", terms: { type: "cash_secured_put", strike: STRIKE }, price: "500000000000", net_price: "490000000000", valid_until: NOW + 1_000 };

  /** A venue that quotes at once, serves the transaction when a quote is accepted and takes what is submitted. */
  function venue(limits: Limits = DEFAULT_LIMITS) {
    const handlers = new Map<string, Set<(...args: never[]) => void>>();
    const emit = (name: string, ...args: unknown[]) => handlers.get(name)?.forEach((handler) => (handler as (...a: unknown[]) => void)(...args));
    const later = (run: () => void) => void Promise.resolve().then(run);
    const client = {
      on: (name: string, handler: (...args: never[]) => void) => void (handlers.get(name) ?? handlers.set(name, new Set()).get(name)!).add(handler),
      off: (name: string, handler: (...args: never[]) => void) => void handlers.get(name)?.delete(handler),
      createRfqOnce: vi.fn(async (request: { request_id: string }) => {
        later(() => {
          emit("rfqCreated", { rfq_id: "rfq", request_id: request.request_id });
          emit("quoteReceived", QUOTE);
        });
        return { rfqId: "rfq", created: "now" };
      }),
      cancelRfq: vi.fn(async () => "req"),
      getOrderStatusAsync: vi.fn(async () => ({ type: "unknown" }) as unknown),
      /** What the order comes to once it was signed and submitted. */
      submitted: vi.fn(async (): Promise<TradeOutcome> => ({ type: "unknown", rfq_id: "rfq", order_id: ORDER, transaction: { type: "unreported" } })),
      /** What the SDK does with this agent's hooks; the SDK's own tests hold the protocol. */
      tradeRfq: vi.fn(async (args: TradeRfqArgs): Promise<TradeOutcome> => {
        if (args.selection.type !== "best" || !args.selection.acceptable(QUOTE as never)) {
          return { type: "not_traded", reason: { type: "no_acceptable_quote", quotes_seen: 1 } };
        }
        emit("sponsoredTxToSign", ORDER, "dHg=", 0);
        try {
          await args.fill.lookupTables("dHg=");
          if ("signMessage" in args.fill.signer) await args.fill.signer.signMessage(new Uint8Array());
        } catch (error) {
          return { type: "not_traded", reason: { type: "not_signed", message: String(error) } };
        }
        return client.submitted();
      }),
    };
    const journal = memoryJournal();
    const session = {
      signer: { address: WALLET },
      config: { network: "devnet" },
      nowSec: () => NOW,
      settlementBufferSeconds: 0,
      rpc: {},
      connect: async () => client,
      descriptors: async () => [{ market_descriptor: { market_pda: MARKET, is_put: true, quote_mint: "quote" }, products: ["cash_secured_put"] }],
      tokens: async () => [],
    } as unknown as ActaSession;
    const ctx: AgentContext = { session, limits, journal, placing: false };
    return { ctx, journal, client, emit, later };
  }
  /** Runs a call to its end with the clock moved for it: a trade waits on the venue for up to minutes. */
  async function finish<T>(call: Promise<T>): Promise<{ result?: T; code?: string }> {
    const settled = call.then((result) => ({ result }), (error) => ({ code: error instanceof AgentError ? error.code : `threw: ${error}` }));
    await vi.advanceTimersByTimeAsync(180_000);
    return settled;
  }
  const states = async (journal: ReturnType<typeof memoryJournal>) => (await journal.read()).map((e) => e.state);

  beforeEach(() => {
    vi.useFakeTimers();
    tables.read.mockClear();
    tables.read.mockImplementation(async () => ({}));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a dry run over the limit is refused as the real call is, before any desk is asked", async () => {
    // 0.05 BTC at 58,000 is $2,900 of notional; the limit per trade is $2,500
    const big = { ...trade, size: 0.05, limit_premium: 0 };
    const dry = venue();
    expect(await finish(placeTrade(dry.ctx, { ...big, dry_run: true }))).toEqual({ code: "over_trade_limit" });
    const real = venue();
    expect(await finish(placeTrade(real.ctx, big))).toEqual({ code: "over_trade_limit" });
    expect(dry.client.createRfqOnce).not.toHaveBeenCalled();
    expect(await dry.journal.read()).toEqual([]);
  });

  it("a dry run with no room left in the day is refused too", async () => {
    const { ctx, journal, client } = venue({ ...DEFAULT_LIMITS, dailyUsd: 100 });
    await journal.append(entry({ orderId: "cd".repeat(32), state: "confirmed", at: NOW - 60, notionalUsd: 60 }));
    expect(await finish(placeTrade(ctx, { ...trade, limit_premium: 0, dry_run: true }))).toEqual({ code: "over_daily_limit" });
    expect(client.createRfqOnce).not.toHaveBeenCalled();
  });

  it("a dry run inside the limits quotes, trades nothing and counts nothing", async () => {
    const { ctx, journal, client } = venue();
    const { result } = await finish(placeTrade(ctx, { ...trade, limit_premium: 0, dry_run: true }));
    expect(result).toMatchObject({ status: "dry_run" });
    expect(client.tradeRfq).not.toHaveBeenCalled();
    expect(await journal.read()).toEqual([]);
  });

  it("a preview over the limit is refused before any desk is asked", async () => {
    const { ctx, client } = venue();
    expect(await finish(previewTrade(ctx, { ...trade, size: 0.05 }))).toEqual({ code: "over_trade_limit" });
    expect(client.createRfqOnce).not.toHaveBeenCalled();
  });

  it("read only places nothing, so there a preview of any size is only information", async () => {
    const { ctx, client } = venue({ ...DEFAULT_LIMITS, readOnly: true });
    const { result } = await finish(previewTrade(ctx, { ...trade, size: 0.05 }));
    expect(result).toMatchObject({ size: 0.05 });
    expect(client.createRfqOnce).toHaveBeenCalledTimes(1);
  });

  it("a trade that confirms is counted once", async () => {
    const { ctx, journal, client } = venue();
    client.submitted.mockResolvedValue({ type: "filled", rfq_id: "rfq", order_id: ORDER, position_pda: "pos" as never, transaction: { type: "unreported" } });
    const { result } = await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }));
    expect(result).toMatchObject({ status: "confirmed", position: "pos", order_id: ORDER });
    expect(await states(journal)).toEqual(["accepted", "signed", "confirmed"]);
    expect((await journal.read()).at(-1)).toMatchObject({ market: MARKET, strike: STRIKE, quantity: "100000" });
    expect(spentSince(await journal.read(), WALLET, NOW - 10)).toBe(58);
  });

  it("room taken while the desks were quoting: the trade is refused at the last step, and nothing is signed", async () => {
    const { ctx, journal, client } = venue({ ...DEFAULT_LIMITS, dailyUsd: 100 });
    // another call's deposit lands between this trade's first check and its signing
    tables.read.mockImplementation(async () => {
      await journal.append(entry({ orderId: "vault:v:1", side: "deposit", state: "reserved", at: NOW, notionalUsd: 60 }));
      return {};
    });
    expect(await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }))).toEqual({ code: "over_daily_limit" });
    expect(client.submitted).not.toHaveBeenCalled();
    expect(await states(journal)).toEqual(["reserved"]);
  });

  it("the RFQ closing before anything is served ends the attempt: nothing was traded or counted", async () => {
    const { ctx, journal, client } = venue();
    client.tradeRfq.mockResolvedValueOnce({ type: "not_traded", reason: { type: "rfq_closed", reason: "expired" } });
    expect(await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }))).toEqual({ code: "no_quote" });
    expect(await journal.read()).toEqual([]);
  });

  it("an order sent with no final word is unknown, counted, never 'nothing was traded'", async () => {
    const { ctx, journal } = venue();
    const { result, code } = await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }));
    expect(code).toBeUndefined();
    expect(result).toMatchObject({ status: "unknown", order_id: ORDER });
    expect(JSON.stringify(result)).not.toMatch(/nothing was traded/i);
    expect(await states(journal)).toEqual(["accepted", "signed", "unknown"]);
    expect(spentSince(await journal.read(), WALLET, NOW - 10)).toBe(58);
    // and the next trade waits for it to be settled
    expect(await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }))).toEqual({ code: "unsettled_order" });
  });

  it("the venue failing the order after it was sent is final: failed, and no longer counted", async () => {
    const { ctx, journal, client } = venue();
    client.submitted.mockResolvedValue({ type: "not_traded", reason: { type: "order_failed", reason: "tx_failed" } });
    expect(await finish(placeTrade(ctx, { ...trade, limit_premium: 0 }))).toEqual({ code: "order_failed" });
    expect(await states(journal)).toEqual(["accepted", "signed", "failed"]);
    expect(spentSince(await journal.read(), WALLET, NOW - 10)).toBe(0);
  });
});
