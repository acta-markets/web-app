// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeVault } from "@/lib/vaults/sample";
import type { VaultDepositorState } from "@/lib/vaults/depositor";
import type { Vault } from "@/lib/vaults/types";
import { AgentError } from "./errors";
import { memoryJournal, spentSince } from "./journal";
import { DEFAULT_LIMITS, type Limits } from "./limits";
import type { ActaSession } from "./session";
import type { AgentContext } from "./trade";

// The chain is not read and nothing is sent: the wallet's state in the vault is whatever a test
// says it is, and every transaction ends at `sent`. What is under test is which requests are
// refused, in what order, and what the limits count.
const chain = vi.hoisted(() => ({ state: null as VaultDepositorState | null, sent: vi.fn(async (..._args: unknown[]) => "signature") }));
vi.mock("@/lib/vaults/depositor", async (original) => ({
  ...(await original<typeof import("@/lib/vaults/depositor")>()),
  createVaultDepositor: async () => ({}),
  fetchVaultDepositorState: async () => chain.state,
  buildRequestDepositInstructions: async (...args: unknown[]) => [{ kind: "deposit", args }],
  buildRequestWithdrawInstructions: (...args: unknown[]) => [{ kind: "withdraw", args }],
  buildCancelDepositInstructions: () => [{ kind: "cancel_deposit" }],
  buildCancelWithdrawInstructions: () => [{ kind: "cancel_withdraw" }],
  buildEmergencyRefundInstructions: () => [{ kind: "refund" }],
}));
vi.mock("./send", () => ({ sendFromWallet: (...args: unknown[]) => chain.sent(...args) }));

const { listVaultPositions, vaultCancelRequest, vaultDeposit, vaultProcessRequest, vaultWithdraw } = await import("./vault-actions");

const NOW = 2_000_000;
const WALLET = "EfcqYtynLJGC4KMD4nifZ3mz3z52SqF97NEj79ENAxpa";
const PDA = "2ddNgXWaFsjLsQBsA6yA3FSYDULRFKe1EbaBqDD8omMc";
const USDC = 1_000_000n;

/** An open USDC vault mid-cycle, priced at one dollar a token. */
const openVault = (over: Partial<Vault> = {}) =>
  makeVault({ vault_pda: PDA, phase: "active", active_expiry_ts: NOW + 3_600, equity: "20000000000", tvl_usd_1e9: "20000000000000", ...over });

const holding = (over: Partial<VaultDepositorState> = {}): VaultDepositorState => ({
  depositRequest: null,
  withdrawRequest: null,
  shareBalance: 0n,
  mainTokenBalance: 1_000n * USDC,
  nativeLamports: null,
  ...over,
});

/** The vault as the API serves it: the four fields the app's view unpacks, still packed. */
function served(vault: Vault) {
  const { deposit_window_set_at: _w, created_at: _c, generation_started_at: _g, tvl_usd_1e9, price_published_at: _p, premium: _m, fees: _f, depositors_in_generation: _d, performance: _r, metadata: _n, ...rest } = vault;
  return {
    ...rest,
    deposit_window: { type: "unset" },
    tvl_usd: tvl_usd_1e9 == null ? { type: "unpriced" } : { type: "priced", value_1e9: tvl_usd_1e9, price_published_at: NOW },
    stats: { type: "not_indexed" },
    metadata: { type: "unset" },
  };
}

function context(vault: Vault | null, limits: Limits = DEFAULT_LIMITS): AgentContext {
  const session = {
    signer: { address: WALLET, signMessage: vi.fn() },
    config: { network: "devnet", explorerCluster: "devnet" },
    nowSec: () => NOW,
    rpc: {},
    http: {
      vault: async () => (vault ? served(vault) : null),
      vaults: async () => (vault ? [served(vault)] : []),
      tokens: async () => new Map([[vault?.main_mint ?? "", { symbol: "USDC-Dev" }]]),
    },
  } as unknown as ActaSession;
  return { session, limits, journal: memoryJournal(), placing: false };
}

const code = (promise: Promise<unknown>) => promise.then(() => null, (error) => (error instanceof AgentError ? error.code : `threw: ${error}`));

beforeEach(() => {
  chain.state = holding();
  chain.sent.mockClear();
  chain.sent.mockImplementation(async () => "signature");
});

describe("a deposit is refused before anything is signed", () => {
  it.each<[string, () => AgentContext, { vault: string; amount: number }, string]>([
    ["by an agent set to read only", () => context(openVault(), { ...DEFAULT_LIMITS, readOnly: true }), { vault: PDA, amount: 25 }, "read_only"],
    ["into an address that is not one", () => context(openVault()), { vault: "nope", amount: 25 }, "invalid_vault"],
    ["into a vault that is not there", () => context(null), { vault: PDA, amount: 25 }, "unknown_vault"],
    ["into a vault that is settling", () => context(openVault({ phase: "settling" })), { vault: PDA, amount: 25 }, "deposits_closed"],
    ["into a vault that only pays out", () => context(openVault({ safety: "withdraw_only" })), { vault: PDA, amount: 25 }, "deposits_closed"],
    ["of a token the owner did not allow", () => context(openVault(), { ...DEFAULT_LIMITS, allowedAssets: ["BTC"] }), { vault: PDA, amount: 25 }, "asset_not_allowed"],
    ["of more than the wallet holds", () => context(openVault()), { vault: PDA, amount: 1_001 }, "insufficient_funds"],
    ["over the limit for one trade", () => context(openVault(), { ...DEFAULT_LIMITS, maxTradeUsd: 20 }), { vault: PDA, amount: 25 }, "over_trade_limit"],
    ["over what is left of the day", () => context(openVault(), { ...DEFAULT_LIMITS, dailyUsd: 20 }), { vault: PDA, amount: 25 }, "over_daily_limit"],
    ["when the venue has no price for the token", () => context(openVault({ tvl_usd_1e9: null })), { vault: PDA, amount: 25 }, "cannot_value"],
  ])("%s", async (_name, make, input, expected) => {
    expect(await code(vaultDeposit(make(), input))).toBe(expected);
    expect(chain.sent).not.toHaveBeenCalled();
  });

  it("while another deposit of the wallet's is pending there", async () => {
    chain.state = holding({ depositRequest: { amount: 5n * USDC, createdAt: BigInt(NOW - 60) } });
    expect(await code(vaultDeposit(context(openVault()), { vault: PDA, amount: 25 }))).toBe("request_exists");
    expect(chain.sent).not.toHaveBeenCalled();
  });

  it("above the room the vault has left", async () => {
    const capped = openVault({ capacity: { type: "limited", cap_limit: "100000000", remaining: "10000000" } });
    expect(await code(vaultDeposit(context(capped), { vault: PDA, amount: 25 }))).toBe("over_capacity");
  });
});

describe("a deposit that goes through", () => {
  it("sends the amount in atoms and counts its dollar value against the day", async () => {
    const ctx = context(openVault());
    const result = (await vaultDeposit(ctx, { vault: PDA, amount: 25.5 })) as { status: string; estimated_shares: number; value_usd: number };
    expect(result).toMatchObject({ status: "requested", estimated_shares: 25.5, value_usd: 25.5 });
    const [, instructions] = chain.sent.mock.calls[0] as [unknown, Array<{ kind: string; args: unknown[] }>];
    expect(instructions[0].args.slice(1)).toEqual([25_500_000n, 0n]);
    expect(spentSince(await ctx.journal.read(), WALLET, NOW - 10)).toBe(25.5);
  });

  it("checks everything and sends nothing on a dry run", async () => {
    const ctx = context(openVault());
    expect(await vaultDeposit(ctx, { vault: PDA, amount: 25, dry_run: true })).toMatchObject({ status: "dry_run" });
    expect(chain.sent).not.toHaveBeenCalled();
    expect(await ctx.journal.read()).toEqual([]);
  });

  it("is not counted when the chain refuses it", async () => {
    const ctx = context(openVault());
    chain.sent.mockRejectedValueOnce(new AgentError("would_fail", "refused", "fix_request"));
    expect(await code(vaultDeposit(ctx, { vault: PDA, amount: 25 }))).toBe("would_fail");
    expect(spentSince(await ctx.journal.read(), WALLET, NOW - 10)).toBe(0);
  });

  it("stays counted when it could not be told whether it was sent", async () => {
    const ctx = context(openVault());
    chain.sent.mockRejectedValueOnce(new AgentError("send_failed", "no answer", "retry"));
    expect(await code(vaultDeposit(ctx, { vault: PDA, amount: 25 }))).toBe("send_failed");
    expect(spentSince(await ctx.journal.read(), WALLET, NOW - 10)).toBe(25);
  });

  it("stops counting once it is cancelled", async () => {
    const ctx = context(openVault());
    await vaultDeposit(ctx, { vault: PDA, amount: 25 });
    chain.state = holding({ depositRequest: { amount: 25n * USDC, createdAt: BigInt(NOW) } });
    expect(await vaultCancelRequest(ctx, { vault: PDA, request: "deposit" })).toMatchObject({ status: "cancelled", returned: { amount: 25, token: "USDC-Dev" } });
    expect(spentSince(await ctx.journal.read(), WALLET, NOW - 10)).toBe(0);
  });
});

describe("a withdrawal request", () => {
  it.each<[string, { shares?: number; all?: boolean }, Partial<VaultDepositorState>, string]>([
    ["names neither shares nor all", {}, { shareBalance: 10n * USDC }, "invalid_shares"],
    ["names both", { shares: 1, all: true }, { shareBalance: 10n * USDC }, "invalid_shares"],
    ["comes from a wallet with no shares", { all: true }, {}, "no_shares"],
    ["asks for more shares than the wallet holds", { shares: 11 }, { shareBalance: 10n * USDC }, "not_enough_shares"],
    ["comes while another is pending", { shares: 1 }, { shareBalance: 10n * USDC, withdrawRequest: { shares: 1n * USDC, createdAt: BigInt(NOW - 60) } }, "request_exists"],
  ])("is refused when it %s", async (_name, input, state, expected) => {
    chain.state = holding(state);
    expect(await code(vaultWithdraw(context(openVault({ total_shares: "100000000" })), { vault: PDA, ...input }))).toBe(expected);
    expect(chain.sent).not.toHaveBeenCalled();
  });

  it("is refused by an agent set to read only, and by a vault that is settling", async () => {
    chain.state = holding({ shareBalance: 10n * USDC });
    expect(await code(vaultWithdraw(context(openVault(), { ...DEFAULT_LIMITS, readOnly: true }), { vault: PDA, all: true }))).toBe("read_only");
    expect(await code(vaultWithdraw(context(openVault({ phase: "settling" })), { vault: PDA, all: true }))).toBe("withdrawals_closed");
  });

  it("takes every share with all, and says what they were worth at the booked price", async () => {
    chain.state = holding({ shareBalance: 10n * USDC });
    const result = await vaultWithdraw(context(openVault({ total_shares: "100000000", share_price: "1100000000" })), { vault: PDA, all: true });
    expect(result).toMatchObject({ status: "requested", shares: 10, estimated_value: { amount: 11, token: "USDC-Dev" } });
    const [, instructions] = chain.sent.mock.calls[0] as [unknown, Array<{ args: unknown[] }>];
    expect(instructions[0].args[1]).toBe(10n * USDC);
  });
});

describe("cancelling and processing", () => {
  it("has nothing to cancel or process when the wallet has no request", async () => {
    for (const request of ["deposit", "withdrawal"] as const) {
      expect(await code(vaultCancelRequest(context(openVault()), { vault: PDA, request }))).toBe("no_request");
      expect(await code(vaultProcessRequest(context(openVault()), { vault: PDA, request }))).toBe("no_request");
    }
    expect(chain.sent).not.toHaveBeenCalled();
  });

  it("keeps the shares when a withdrawal is cancelled", async () => {
    chain.state = holding({ shareBalance: 10n * USDC, withdrawRequest: { shares: 4n * USDC, createdAt: BigInt(NOW - 60) } });
    expect(await vaultCancelRequest(context(openVault()), { vault: PDA, request: "withdrawal" })).toMatchObject({ status: "cancelled", shares_kept: 4 });
  });

  it("does not let the owner process a request the vault still has time for", async () => {
    chain.state = holding({ depositRequest: { amount: 25n * USDC, createdAt: BigInt(NOW - 60) } });
    const refused = await code(vaultProcessRequest(context(openVault()), { vault: PDA, request: "deposit" }));
    expect(["not_yet", "not_available"]).toContain(refused);
    expect(chain.sent).not.toHaveBeenCalled();
  });

  it("refuses all of it to an agent set to read only", async () => {
    const readOnly = { ...DEFAULT_LIMITS, readOnly: true };
    chain.state = holding({ depositRequest: { amount: 25n * USDC, createdAt: BigInt(NOW - 60) } });
    expect(await code(vaultCancelRequest(context(openVault(), readOnly), { vault: PDA, request: "deposit" }))).toBe("read_only");
    expect(await code(vaultProcessRequest(context(openVault(), readOnly), { vault: PDA, request: "deposit" }))).toBe("read_only");
  });
});

describe("what the wallet holds in vaults", () => {
  it("lists only the vaults it is in, unless one is named", async () => {
    const ctx = context(openVault());
    expect(((await listVaultPositions(ctx, {})) as { positions: unknown[] }).positions).toEqual([]);
    const named = (await listVaultPositions(ctx, { vault: PDA })) as { positions: Array<Record<string, unknown>> };
    expect(named.positions[0]).toMatchObject({ vault: PDA, shares: 0, wallet_available: { amount: 1000, token: "USDC-Dev" }, can_deposit: "yes" });
  });

  it("shows shares at the booked price and a pending request with what can be done about it", async () => {
    chain.state = holding({ shareBalance: 10n * USDC, depositRequest: { amount: 25n * USDC, createdAt: BigInt(NOW - 60) } });
    const { positions } = (await listVaultPositions(context(openVault({ share_price: "1100000000" })), {})) as { positions: Array<Record<string, unknown>> };
    expect(positions[0]).toMatchObject({
      shares: 10,
      value: { amount: 11, token: "USDC-Dev" },
      pending_deposit: { amount: 25, cancel: "available" },
      pending_withdrawal: null,
    });
  });

  it("says in words why a vault takes no deposit", async () => {
    const { positions } = (await listVaultPositions(context(openVault({ phase: "settling" })), { vault: PDA })) as { positions: Array<{ can_deposit: string }> };
    expect(positions[0].can_deposit).toMatch(/settl/i);
  });
});
