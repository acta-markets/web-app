// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors";
import { memoryJournal, spentSince } from "./journal";
import { DEFAULT_LIMITS, type Limits } from "./limits";
import type { ActaSession } from "./session";
import type { AgentContext } from "./trade";

// Nothing is built from chain and nothing is sent: every transaction ends at `sent`. What is
// under test is what is refused before that, and what the limits count.
const sent = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => "signature"));
vi.mock("@/lib/trade/buy-deposit", () => ({
  buildBuyDepositInstructions: async () => [{ kind: "fund" }],
  buildBuyWithdrawInstructions: async () => [{ kind: "take_back" }],
}));
vi.mock("./send", async (original) => ({ ...(await original<typeof import("./send")>()), sendFromWallet: (...args: unknown[]) => sent(...args) }));

const { fundPosition, withdrawFunding } = await import("./exercise");

const WALLET = "EfcqYtynLJGC4KMD4nifZ3mz3z52SqF97NEj79ENAxpa";

beforeEach(() => {
  sent.mockClear();
  sent.mockImplementation(async () => "signature");
});

const NOW = 2_000_000;
const PDA = "9Naq889bx9AMHNcvdpMn48ZJasFQ3yUSBfsaXBtGoepE";

function position(over: Record<string, unknown> = {}) {
  return {
    pda: PDA,
    market_pda: "iUBW1FecuRAN2r8QhrM7cTVD9gcfxivxF5WL6w1j5qg",
    state: "open",
    side: "buy",
    terms: { type: "covered_call", strike: "1700000000000" },
    quantity: "10000000",
    underlying_symbol: "ETH",
    underlying_decimals: 9,
    quote_symbol: "USDC-Dev",
    quote_decimals: 6,
    expiry_ts: NOW + 3_600,
    ...over,
  };
}

/** A context whose venue lists `positions`; reaching the chain would throw, so a refusal must come first. */
function context(positions: unknown[], limits: Limits = DEFAULT_LIMITS): { ctx: AgentContext; chain: ReturnType<typeof vi.fn> } {
  const chain = vi.fn(() => {
    throw new Error("the chain was read");
  });
  const session = {
    signer: { address: WALLET, signMessage: vi.fn() },
    config: { network: "devnet" },
    nowSec: () => NOW,
    rpc: new Proxy({}, { get: () => chain }),
    connect: async () => ({ getPositionsPageAsync: async () => ({ positions, next_cursor: null }) }),
  } as unknown as ActaSession;
  return { ctx: { session, limits, journal: memoryJournal(), placing: false }, chain };
}
const code = (promise: Promise<unknown>) => promise.then(() => null, (error) => (error instanceof AgentError ? error.code : `threw: ${error}`));

describe("fundPosition refuses before anything is read from chain or signed", () => {
  it.each([
    ["an address that is not one", [position()], { position: "nope" }, "invalid_position"],
    ["a position the wallet does not hold", [], { position: PDA }, "unknown_position"],
    ["a sold option", [position({ side: "sell" })], { position: PDA }, "not_fundable"],
    ["a spread", [position({ terms: { type: "call_spread", lower_strike: "1", upper_strike: "2" } })], { position: PDA }, "not_fundable"],
    ["one already funded", [position({ state: "funded" })], { position: PDA }, "already_funded"],
    ["one past its expiry", [position({ expiry_ts: NOW - 1 })], { position: PDA }, "expired"],
  ])("%s", async (_name, positions, input, expected) => {
    const { ctx, chain } = context(positions);
    expect(await code(fundPosition(ctx, input))).toBe(expected);
    expect(chain).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    expect(await ctx.journal.read()).toEqual([]);
    expect(ctx.session.signer!.signMessage).not.toHaveBeenCalled();
  });

  it("when read only, whatever is asked", async () => {
    const { ctx } = context([position()], { ...DEFAULT_LIMITS, readOnly: true });
    expect(await code(fundPosition(ctx, { position: PDA }))).toBe("read_only");
    expect(await code(withdrawFunding(ctx, { position: PDA }))).toBe("read_only");
  });

  it("an asset it is not allowed, and an amount above the per-trade limit", async () => {
    expect(await code(fundPosition(context([position()], { ...DEFAULT_LIMITS, allowedAssets: ["BTC"] }).ctx, { position: PDA }))).toBe("asset_not_allowed");
    // 0.01 ETH at 1700 is $17 to fund
    expect(await code(fundPosition(context([position()], { ...DEFAULT_LIMITS, maxTradeUsd: 16 }).ctx, { position: PDA }))).toBe("over_trade_limit");
  });
});

describe("withdrawFunding", () => {
  it("takes back only what is funded, and only before expiry", async () => {
    expect(await code(withdrawFunding(context([position({ state: "open" })]).ctx, { position: PDA }))).toBe("not_funded");
    expect(await code(withdrawFunding(context([position({ state: "funded", expiry_ts: NOW - 1 })]).ctx, { position: PDA }))).toBe("expired");
  });
});

// 0.01 ETH at 1700: funding it takes $17 out of the wallet
describe("funding counts against the owner's limits", () => {
  const spent = async (ctx: AgentContext) => spentSince(await ctx.journal.read(), WALLET, NOW - 10);

  it("is counted by strike times size once it is paid in", async () => {
    const { ctx } = context([position()]);
    expect(await fundPosition(ctx, { position: PDA })).toMatchObject({ status: "funded", paid_in: { amount: 17, token: "USDC-Dev" } });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(await spent(ctx)).toBe(17);
    expect((await ctx.journal.read()).at(-1)).toMatchObject({ side: "fund", state: "confirmed", txSignature: "signature" });
  });

  it("is refused when the day has no room for it, and nothing is sent", async () => {
    const { ctx } = context([position()], { ...DEFAULT_LIMITS, dailyUsd: 20 });
    await ctx.journal.append({ orderId: "ab".repeat(32), rfqId: "r", state: "confirmed", at: NOW - 5, wallet: WALLET, asset: "ETH", side: "buy", notionalUsd: 17 });
    expect(await code(fundPosition(ctx, { position: PDA }))).toBe("over_daily_limit");
    expect(sent).not.toHaveBeenCalled();
    expect(await spent(ctx)).toBe(17);
  });

  it("two at once cannot both use the last of the day", async () => {
    const other = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";
    const { ctx } = context([position(), position({ pda: other })], { ...DEFAULT_LIMITS, dailyUsd: 20 });
    const results = await Promise.all([code(fundPosition(ctx, { position: PDA })), code(fundPosition(ctx, { position: other }))]);
    expect(results.sort()).toEqual(["over_daily_limit", null].sort());
    expect(sent).toHaveBeenCalledTimes(1);
    expect(await spent(ctx)).toBe(17);
  });

  it("is not counted when the chain refuses it, and stays counted when the send has no answer", async () => {
    const refused = context([position()]).ctx;
    sent.mockRejectedValueOnce(new AgentError("would_fail", "refused", "fix_request"));
    expect(await code(fundPosition(refused, { position: PDA }))).toBe("would_fail");
    expect(await spent(refused)).toBe(0);

    const silent = context([position()]).ctx;
    sent.mockRejectedValueOnce(new AgentError("send_failed", "no answer", "retry"));
    expect(await code(fundPosition(silent, { position: PDA }))).toBe("send_failed");
    expect(await spent(silent)).toBe(17);
  });

  it("stops counting once it is taken back", async () => {
    const positions = [position()];
    const { ctx } = context(positions);
    await fundPosition(ctx, { position: PDA });
    positions[0] = position({ state: "funded" });
    expect(await withdrawFunding(ctx, { position: PDA })).toMatchObject({ status: "withdrawn", returned: { amount: 17 } });
    expect(await spent(ctx)).toBe(0);
  });
});
