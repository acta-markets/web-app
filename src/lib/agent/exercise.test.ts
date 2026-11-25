// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors";
import { fundPosition, withdrawFunding } from "./exercise";
import { memoryJournal } from "./journal";
import { DEFAULT_LIMITS, type Limits } from "./limits";
import type { ActaSession } from "./session";
import type { AgentContext } from "./trade";

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
    signer: { address: "EfcqYtynLJGC4KMD4nifZ3mz3z52SqF97NEj79ENAxpa", signMessage: vi.fn() },
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
