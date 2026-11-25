// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors";
import { memoryJournal, unsettledOrders, type JournalEntry } from "./journal";
import { DEFAULT_LIMITS } from "./limits";
import type { ActaSession } from "./session";
import { getOrder, placeTrade, settleJournal, type AgentContext } from "./trade";

const NOW = 2_000_000;
const WALLET = "wallet";
const ORDER = "ab".repeat(32);

function entry(over: Partial<JournalEntry>): JournalEntry {
  return { orderId: ORDER, rfqId: "r", state: "signed", at: NOW - 30, wallet: WALLET, asset: "BTC", side: "sell", notionalUsd: 58, ...over };
}

/** A context whose venue answers `getOrderStatus` from `statuses` and nothing else. */
async function context(lines: JournalEntry[], statuses: Record<string, unknown>, signer: { address: string } | null = { address: WALLET }) {
  const journal = memoryJournal();
  for (const line of lines) await journal.append(line);
  const getOrderStatusAsync = vi.fn(async (id: string) => {
    const status = statuses[id];
    if (!status) throw new Error("offline");
    return status;
  });
  const session = {
    signer,
    config: { network: "devnet" },
    nowSec: () => NOW,
    connect: async () => ({ getOrderStatusAsync }),
  } as unknown as ActaSession;
  const ctx: AgentContext = { session, limits: DEFAULT_LIMITS, journal, placing: false };
  return { ctx, journal, getOrderStatusAsync };
}
const stateOf = async (journal: ReturnType<typeof memoryJournal>) => (await journal.read()).at(-1)?.state;

describe("settleJournal: what a restart finds", () => {
  it("an order the venue confirmed is confirmed, with its position", async () => {
    const { ctx, journal } = await context([entry({ state: "signed" })], { [ORDER]: { type: "confirmed", position_pda: "pos" } });
    expect(await settleJournal(ctx, WALLET)).toEqual([]);
    expect((await journal.read()).at(-1)).toMatchObject({ state: "confirmed", positionPda: "pos" });
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
});
