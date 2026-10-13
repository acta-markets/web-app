import { describe, expect, it } from "vitest";
import {
  LAST_SHARES_COPY,
  REQUEST_EXISTS_COPY,
  cancelBlockMessage,
  VAULT_SORTS,
  compareVaultsByTvl,
  compareVaultsByYield,
  depositBlockMessage,
  depositSelfProcessView,
  formatVaultEquity,
  isLastSharesWithdrawal,
  primaryVaultAction,
  vaultApr,
  vaultStatus,
  vaultTvlUsd,
  withdrawBlockMessage,
  withdrawSelfProcessView,
  type VaultSortEntry,
} from "./presentation";
import type { VaultActionBlock } from "./rules";
import { makeVault } from "./sample";
import type { Vault, VaultPerformance } from "./types";

const NOW = 1_800_000_000;
const track = { cycles_completed: 3, last_cycle_return_pct: 0.4, cumulative_return_pct: 1.2, track_record_secs: "1814400" };

describe("vaultApr", () => {
  it("shows a figure only once the backend annualizes, and New before that", () => {
    expect(vaultApr({ status: "annualized", annualized_return_pct: 12.3, ...track })).toMatchObject({
      value: "12.30%",
      muted: false,
      sources: [{ label: "Premium", pct: 12.3 }],
    });
    expect(vaultApr({ status: "short_track_record", ...track })).toMatchObject({ value: "New", muted: true, sources: [] });
    expect(vaultApr({ status: "no_track_record" })).toMatchObject({ value: "New", muted: true });
    expect(vaultApr({ status: "unavailable" })).toMatchObject({ value: "—", muted: true, sources: [] });
  });

  it("adds the deposit asset's staking yield to the premium, so the parts sum to the headline", () => {
    const apr = vaultApr({ status: "annualized", annualized_return_pct: 10, ...track }, 5);
    expect(apr.value).toBe("15.00%");
    expect(apr.sources).toEqual([
      { label: "Staking", pct: 5 },
      { label: "Premium", pct: 10 },
    ]);
    // before the premium has history, the staking part is still known
    expect(vaultApr({ status: "no_track_record" }, 5)).toMatchObject({ value: "New", sources: [{ label: "Staking", pct: 5 }] });
  });
});

describe("vault sorts", () => {
  const annualized = (pct: number): VaultPerformance => ({ status: "annualized", annualized_return_pct: pct, ...track });
  const entry = (
    name: string,
    performance: VaultPerformance,
    opts: { vault?: Partial<Vault>; stakingAprPct?: number; tvlUsd?: number | null } = {},
  ): VaultSortEntry => ({
    vault: makeVault({ performance, ...opts.vault }),
    meta: { name, stakingAprPct: opts.stakingAprPct ?? 0 },
    tvlUsd: opts.tvlUsd ?? null,
  });
  const sorted = (entries: VaultSortEntry[], compare: (a: VaultSortEntry, b: VaultSortEntry) => number) =>
    [...entries].sort(compare).map((e) => e.meta.name);

  it("ranks proven yield first and puts vaults winding down last", () => {
    const entries = [
      entry("new", { status: "no_track_record" }),
      entry("short-high", { status: "short_track_record", ...track, cumulative_return_pct: 3 }),
      entry("closing", annualized(40), { vault: { safety: "closing" } }),
      entry("annualized-low", annualized(8)),
      entry("unknown", { status: "unavailable" }),
      entry("annualized-high", annualized(15)),
      entry("short-low", { status: "short_track_record", ...track, cumulative_return_pct: 1 }),
    ];
    expect(sorted(entries, compareVaultsByYield)).toEqual([
      "annualized-high",
      "annualized-low",
      "short-high",
      "short-low",
      "new",
      "unknown",
      "closing",
    ]);
  });

  it("orders by the APR the cards show, staking included", () => {
    const entries = [entry("premium 12", annualized(12)), entry("staked 8 + 5", annualized(8), { stakingAprPct: 5 })];
    expect(sorted(entries, compareVaultsByYield)).toEqual(["staked 8 + 5", "premium 12"]);
  });

  it("puts the largest TVL first and vaults without a price last, by name", () => {
    const entries = [
      entry("b-unpriced", annualized(9)),
      entry("small", annualized(9), { tvlUsd: 1_000 }),
      entry("a-unpriced", annualized(9)),
      entry("large", annualized(9), { tvlUsd: 2_000_000 }),
      entry("empty", annualized(9), { tvlUsd: 0 }),
    ];
    expect(sorted(entries, compareVaultsByTvl)).toEqual(["large", "small", "empty", "a-unpriced", "b-unpriced"]);
  });

  it("offers APR first, then TVL and name, with name ignoring case", () => {
    expect(VAULT_SORTS.map((s) => s.label)).toEqual(["APR", "TVL", "Name"]);
    const byName = VAULT_SORTS.find((s) => s.value === "name")!.compare;
    const entries = ["USDC", "jitoSOL", "HYPE", "ZEC"].map((name) => entry(name, annualized(9)));
    expect(sorted(entries, byName)).toEqual(["HYPE", "jitoSOL", "USDC", "ZEC"]);
  });
});

describe("TVL", () => {
  it("is in dollars only when the deposit asset has a price", () => {
    const vault = makeVault({ equity: "2500000000", main_decimals: 6 });
    expect(vaultTvlUsd(vault, 1.5)).toBe(3750);
    expect(vaultTvlUsd(vault, undefined)).toBeNull();
  });

  it("in the asset itself stays short: whole units from a thousand, two decimals from one", () => {
    const equity = (base: string, decimals: number) => formatVaultEquity(makeVault({ equity: base, main_decimals: decimals }));
    expect(equity("2108855470000", 6)).toBe("2.11M");
    expect(equity("2500999999", 6)).toBe("2,500");
    expect(equity("707856612345", 9)).toBe("707.85");
    expect(equity("1234", 6)).toBe("0.001234");
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
