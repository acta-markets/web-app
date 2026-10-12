import { describe, expect, it } from "vitest";
import {
  LAST_SHARES_COPY,
  REQUEST_EXISTS_COPY,
  cancelBlockMessage,
  compareVaultsByYield,
  depositBlockMessage,
  depositSelfProcessView,
  headlineReturn,
  isLastSharesWithdrawal,
  primaryVaultAction,
  vaultStatus,
  withdrawBlockMessage,
  withdrawSelfProcessView,
} from "./presentation";
import type { VaultActionBlock } from "./rules";
import { makeVault } from "./sample";
import type { Vault, VaultPerformance } from "./types";

const NOW = 1_800_000_000;
const track = { cycles_completed: 3, last_cycle_return_pct: 0.4, cumulative_return_pct: 1.2, track_record_secs: "1814400" };

describe("headlineReturn", () => {
  it("leads with APR only once the backend annualizes", () => {
    expect(headlineReturn({ status: "annualized", annualized_return_pct: 12.3, ...track })).toMatchObject({
      label: "APR",
      value: "12.30%",
    });
    expect(headlineReturn({ status: "short_track_record", ...track })).toMatchObject({
      label: "Return so far",
      value: "+1.20%",
      detail: "APR after 30 days",
    });
    expect(headlineReturn({ status: "no_track_record" })).toMatchObject({ value: "New vault", muted: true });
    expect(headlineReturn({ status: "unavailable" })).toMatchObject({ value: "—", muted: true });
  });
});

describe("compareVaultsByYield", () => {
  const vault = (pda: string, performance: VaultPerformance, extra: Partial<Vault> = {}) =>
    makeVault({ vault_pda: pda, performance, ...extra });

  it("ranks proven yield first and puts vaults winding down last", () => {
    const vaults = [
      vault("new", { status: "no_track_record" }),
      vault("short-high", { status: "short_track_record", ...track, cumulative_return_pct: 3 }),
      vault("closing", { status: "annualized", annualized_return_pct: 40, ...track }, { safety: "closing" }),
      vault("annualized-low", { status: "annualized", annualized_return_pct: 8, ...track }),
      vault("unknown", { status: "unavailable" }),
      vault("annualized-high", { status: "annualized", annualized_return_pct: 15, ...track }),
      vault("short-low", { status: "short_track_record", ...track, cumulative_return_pct: 1 }),
    ];
    const order = [...vaults].sort((a, b) => compareVaultsByYield(a, b, (v) => v.vault_pda)).map((v) => v.vault_pda);
    expect(order).toEqual(["annualized-high", "annualized-low", "short-high", "short-low", "new", "unknown", "closing"]);
  });
});

describe("vaultStatus", () => {
  it.each([
    [{ safety: "frozen" }, "Paused", "warning"],
    [{ safety: "closing" }, "Closing", "warning"],
    [{ safety: "withdraw_only" }, "Withdraw only", "warning"],
    [{ safety: "emergency_unwind" }, "Unwinding", "warning"],
    [{ phase: "idle", accepting_deposits: true }, "Accepting deposits", "open"],
    [{ phase: "idle", accepting_deposits: false }, "Deposits closed", "neutral"],
    [{ phase: "idle", accepting_deposits: false, equity_computed: true }, "Processing requests", "neutral"],
    [{ phase: "active", active_expiry: String(NOW - 1) }, "Settling", "neutral"],
    [{ phase: "settling" }, "Settling", "neutral"],
    [{ phase: "processing_capital" }, "Processing requests", "neutral"],
  ] as const)("%o reads %s", (overrides, label, tone) => {
    expect(vaultStatus(makeVault(overrides as Partial<Vault>), NOW)).toMatchObject({ label, tone });
  });

  it("takes deposits mid-cycle whatever the intake flag says", () => {
    const status = vaultStatus(makeVault({ phase: "active", accepting_deposits: false, active_expiry: String(NOW + 86_400) }), NOW);
    expect(status).toMatchObject({ label: "Accepting deposits", tone: "open" });
    expect(status.detail).toMatch(/^Cycle ends /);
  });
});

describe("primaryVaultAction", () => {
  it("opens closing vaults on Withdraw", () => {
    expect(primaryVaultAction(makeVault({ safety: "closing" }), NOW)).toEqual({ label: "Manage", tab: "withdraw" });
    expect(primaryVaultAction(makeVault({ phase: "settling" }), NOW)).toEqual({ label: "Deposit", tab: "deposit" });
  });
});

describe("block copy", () => {
  const blocks: VaultActionBlock[] = [
    "safety",
    "phase",
    "window_closed",
    "window_open",
    "cutoff",
    "priced",
    "unpriced",
    "empty",
    "pending",
    "supply",
    "authority",
  ];
  const contexts: Vault[] = [
    makeVault(),
    makeVault({ safety: "frozen" }),
    makeVault({ safety: "closing" }),
    makeVault({ safety: "withdraw_only" }),
    makeVault({ safety: "emergency_unwind" }),
    makeVault({ phase: "settling" }),
    makeVault({ phase: "processing_capital", equity_computed: true }),
  ];

  it("gives every block a sentence, without dashes", () => {
    const copy = [
      ...blocks.flatMap((block) =>
        contexts.flatMap((vault) => [depositBlockMessage(block, vault), withdrawBlockMessage(block, vault)]),
      ),
      ...blocks.map(cancelBlockMessage),
      REQUEST_EXISTS_COPY.deposit,
      REQUEST_EXISTS_COPY.withdraw,
      LAST_SHARES_COPY,
    ];
    for (const sentence of copy) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
      expect(sentence).not.toMatch(/[–—]/);
    }
  });

  it("explains a closing vault in its own words", () => {
    expect(depositBlockMessage("safety", makeVault({ safety: "closing" }))).toBe(
      "This vault is closing. It only processes withdrawals now.",
    );
  });
});

describe("self-processing", () => {
  const delay = 43_200;
  const createdAt = BigInt(NOW - 3_600);

  it("counts down to the fallback delay before anyone may process a deposit", () => {
    const priced = makeVault({ equity_computed: true, accepting_deposits: false, capital_fallback_delay_secs: String(delay) });
    expect(depositSelfProcessView(priced, createdAt, NOW)).toEqual({ kind: "waiting", availableAt: NOW - 3_600 + delay });
    expect(depositSelfProcessView(priced, createdAt, NOW + delay)).toEqual({ kind: "available", label: "Process my deposit" });
  });

  it("offers a refund right away in a closing vault", () => {
    expect(depositSelfProcessView(makeVault({ safety: "closing" }), createdAt, NOW)).toEqual({
      kind: "available",
      label: "Refund my deposit",
    });
  });

  it("hides deposit processing where only cancel makes sense", () => {
    expect(depositSelfProcessView(makeVault(), createdAt, NOW + delay)).toEqual({ kind: "hidden" });
  });

  it("lets an aged withdrawal value idle capital itself", () => {
    const idle = makeVault({ pending_withdraw_count: 1, capital_fallback_delay_secs: String(delay) });
    expect(withdrawSelfProcessView(idle, createdAt, NOW)).toEqual({ kind: "waiting", availableAt: NOW - 3_600 + delay });
    expect(withdrawSelfProcessView(idle, createdAt, NOW + delay)).toEqual({ kind: "available", label: "Process my withdrawal" });
  });

  it("counts processing-capital requests from expiry", () => {
    const processing = makeVault({
      phase: "processing_capital",
      equity_computed: true,
      active_expiry: String(NOW - 600),
      capital_fallback_delay_secs: String(delay),
    });
    expect(withdrawSelfProcessView(processing, createdAt, NOW)).toEqual({ kind: "waiting", availableAt: NOW - 600 + delay });
  });

  it("never offers processing in a closing vault", () => {
    expect(withdrawSelfProcessView(makeVault({ safety: "closing" }), createdAt, NOW)).toEqual({ kind: "hidden" });
  });
});

describe("isLastSharesWithdrawal", () => {
  it("flags redeeming the whole live supply", () => {
    const vault = makeVault({ total_shares: "1000", live_share_supply: "900" });
    expect(isLastSharesWithdrawal(vault, 900n)).toBe(true);
    expect(isLastSharesWithdrawal(vault, 899n)).toBe(false);
    expect(isLastSharesWithdrawal(makeVault({ total_shares: "1000", live_share_supply: null }), 1000n)).toBe(true);
    expect(isLastSharesWithdrawal(vault, 0n)).toBe(false);
  });
});
