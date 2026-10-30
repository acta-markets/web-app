import { describe, expect, it } from "vitest";
import type { flows } from "@acta-markets/ts-sdk/chain";
import type { DepositorPerformance } from "@acta-markets/ts-sdk/http";
import { getTokenMint } from "@/lib/tokens";
import {
  LAST_SHARES_COPY,
  REQUEST_EXISTS_COPY,
  cancelBlockMessage,
  VAULT_SORTS,
  compareVaultsByTvl,
  compareVaultsByYield,
  cyclePhaseLabel,
  depositBlockMessage,
  depositSelfProcessView,
  entryReturnPct,
  exposureRows,
  exposureTotals,
  formatPremium,
  formatVaultEquity,
  formatVaultTvl,
  isLastSharesWithdrawal,
  mintUnits,
  primaryVaultAction,
  vaultApr,
  vaultReturn,
  vaultStatus,
  withdrawBlockMessage,
  withdrawSelfProcessView,
  type VaultSortEntry,
} from "./presentation";
import { makePerformance, makeVault } from "./sample";
import type { Vault, VaultExposure, VaultExposurePosition, VaultPerformance } from "./types";

const NOW = 1_800_000_000;
// the test build runs on devnet, so take the mint the token list knows
const USDC = getTokenMint("USDC")!;
const SOL = "So11111111111111111111111111111111111111112";
const win = (pct: number, from = "1700000000") => ({ return_pct: pct, from_time: from, to_time: "1800000000" });

describe("vaultApr", () => {
  it("shows the backend's 30-day APY, New before it exists and nothing for an uncovered vault", () => {
    expect(vaultApr(makePerformance({ apy_30d: 12.3 }))).toMatchObject({
      value: "12.30%",
      muted: false,
      sources: [{ label: "Premium", pct: 12.3 }],
    });
    expect(vaultApr(makePerformance({ returns: { "7d": win(0.4), "30d": null, "90d": null, all: win(1.2) } })))
      .toMatchObject({ value: "New", muted: true, sources: [] });
    expect(vaultApr(null)).toMatchObject({ value: "—", muted: true });
    const mature = { "7d": null, "30d": null, "90d": null, all: win(1.2, "1700000000") };
    expect(vaultApr(makePerformance({ computed_at: "1800000000", returns: mature }))).toMatchObject({ value: "—" });
    expect(vaultApr(makePerformance({ covered: false }))).toMatchObject({ value: "—", muted: true, sources: [] });
  });

  it("adds the deposit asset's staking yield to the premium, so the parts sum to the headline", () => {
    const apr = vaultApr(makePerformance({ apy_30d: 10 }), 5);
    expect(apr.value).toBe("15.00%");
    expect(apr.sources).toEqual([
      { label: "Staking", pct: 5 },
      { label: "Premium", pct: 10 },
    ]);
    // before the premium has history, the staking part is still known
    expect(vaultApr(makePerformance(), 5)).toMatchObject({ value: "New", sources: [{ label: "Staking", pct: 5 }] });
  });
});

describe("vaultReturn", () => {
  it("is the generation's return with its start, or empty without one", () => {
    const all = win(-1.25, "1790000000");
    expect(vaultReturn(makePerformance({ returns: { "7d": null, "30d": null, "90d": null, all } }))).toEqual({
      value: "-1.25%",
      since: 1_790_000_000,
    });
    expect(vaultReturn(makePerformance())).toEqual({ value: "—", since: null });
    expect(vaultReturn(makePerformance({ covered: false }))).toEqual({ value: "—", since: null });
    expect(vaultReturn(null)).toEqual({ value: "—", since: null });
  });
});

describe("vault sorts", () => {
  const apr = (pct: number) => makePerformance({ apy_30d: pct, returns: { "7d": null, "30d": win(pct / 12), "90d": null, all: win(pct / 6) } });
  const young = (all: number) => makePerformance({ returns: { "7d": null, "30d": null, "90d": null, all: win(all) } });
  const entry = (
    name: string,
    performance: VaultPerformance | null,
    opts: { vault?: Partial<Vault>; stakingAprPct?: number } = {},
  ): VaultSortEntry => ({
    vault: makeVault({ performance, ...opts.vault }),
    meta: { name, stakingAprPct: opts.stakingAprPct ?? 0 },
  });
  const sorted = (entries: VaultSortEntry[], compare: (a: VaultSortEntry, b: VaultSortEntry) => number) =>
    [...entries].sort(compare).map((e) => e.meta.name);

  it("ranks proven yield first and puts vaults winding down last", () => {
    const entries = [
      entry("new", makePerformance()),
      entry("short-high", young(3)),
      entry("closing", apr(40), { vault: { safety: "closing" } }),
      entry("apr-low", apr(8)),
      entry("unknown", makePerformance({ covered: false })),
      entry("apr-high", apr(15)),
      entry("short-low", young(1)),
    ];
    expect(sorted(entries, compareVaultsByYield)).toEqual([
      "apr-high",
      "apr-low",
      "short-high",
      "short-low",
      "new",
      "unknown",
      "closing",
    ]);
  });

  it("orders by the APY the cards show, staking included", () => {
    const entries = [entry("premium 12", apr(12)), entry("staked 8 + 5", apr(8), { stakingAprPct: 5 })];
    expect(sorted(entries, compareVaultsByYield)).toEqual(["staked 8 + 5", "premium 12"]);
  });

  it("puts the largest dollar TVL first and vaults without one last, by name", () => {
    const usd = (dollars: number) => ({ vault: { tvl_usd_1e9: String(dollars * 1e9) } });
    const entries = [
      entry("b-unpriced", apr(9)),
      entry("small", apr(9), usd(1_000)),
      entry("a-unpriced", apr(9)),
      entry("large", apr(9), usd(2_000_000)),
      entry("empty", apr(9), usd(0)),
    ];
    expect(sorted(entries, compareVaultsByTvl)).toEqual(["large", "small", "empty", "a-unpriced", "b-unpriced"]);
  });

  it("offers APY first, then TVL and name, with name ignoring case", () => {
    expect(VAULT_SORTS.map((s) => s.label)).toEqual(["APY", "TVL", "Name"]);
    const byName = VAULT_SORTS.find((s) => s.value === "name")!.compare;
    const entries = ["USDC", "jitoSOL", "HYPE", "ZEC"].map((name) => entry(name, apr(9)));
    expect(sorted(entries, byName)).toEqual(["HYPE", "jitoSOL", "USDC", "ZEC"]);
  });
});

describe("TVL", () => {
  it("is the backend's dollar figure when it has a price, else the deposit asset", () => {
    const vault = makeVault({ equity: "2500000000", main_decimals: 6 });
    expect(formatVaultTvl({ ...vault, tvl_usd_1e9: "3750000000000" }, "SOL")).toBe("$3.75K");
    expect(formatVaultTvl(vault, "SOL")).toBe("2,500 SOL");
  });

  it("in the asset itself stays short: whole units from a thousand, two decimals from one", () => {
    const equity = (base: string, decimals: number) => formatVaultEquity(makeVault({ equity: base, main_decimals: decimals }));
    expect(equity("2108855470000", 6)).toBe("2.11M");
    expect(equity("2500999999", 6)).toBe("2,500");
    expect(equity("707856612345", 9)).toBe("707.85");
    expect(equity("1234", 6)).toBe("0.001234");
  });
});

describe("current cycle", () => {
  it("labels the phase, with safety modes first", () => {
    expect(cyclePhaseLabel({ phase: "active", safety: "normal" })).toBe("Trading");
    expect(cyclePhaseLabel({ phase: "processing_capital", safety: "normal" })).toBe("Processing requests");
    expect(cyclePhaseLabel({ phase: "active", safety: "emergency_unwind" })).toBe("Unwinding");
  });

  it("formats premium in the quote mint's units, adding paid only when it is known and not zero", () => {
    const vault = makeVault({ main_mint: SOL, main_decimals: 9, second_mint: USDC, second_decimals: 6 });
    const units = mintUnits(vault, USDC)!;
    expect(units).toEqual({ symbol: "USDC", decimals: 6 });
    expect(formatPremium({ received: "2842000000", paid: "310500000" }, units)).toBe("2,842 USDC · paid 310.5");
    expect(formatPremium({ received: "2842000000", paid: null }, units)).toBe("2,842 USDC");
    expect(formatPremium({ received: "2842000000", paid: "0" }, units)).toBe("2,842 USDC");
    expect(mintUnits(vault, "Unknown1111111111111111111111111111111111111")).toBeNull();
  });
});

describe("exposure", () => {
  const leg = (overrides: Partial<VaultExposurePosition>): VaultExposurePosition => ({
    position: "p1",
    market: "m1",
    position_type: "cash_secured_put",
    role: "writer",
    status: "funded",
    strike: "160000000000",
    quantity: "4000000000000",
    expiry: "1800000000",
    underlying_mint: SOL,
    quote_mint: USDC,
    underlying_decimals: 9,
    quote_decimals: 6,
    spot: "172400000000",
    spot_time: "1799999990",
    distance_pct: 7.19,
    itm: false,
    intrinsic: "0",
    ...overrides,
  });
  const exposure = (positions: VaultExposurePosition[], outstanding: string | null): VaultExposure => ({
    vault_pda: "v",
    as_of: "1800000000",
    positions,
    totals: [{ quote_mint: USDC, notional_at_strike: "1000", outstanding_intrinsic: outstanding }],
  });

  it("shows strike, type, side and distance from spot", () => {
    const rows = exposureRows(
      exposure(
        [
          leg({}),
          leg({ position: "p2", position_type: "covered_call", role: "holder", strike: "180500000000", distance_pct: -4.41, itm: true }),
          leg({ position: "p3", spot: null, distance_pct: null, itm: null, intrinsic: null }),
          leg({ position: "p4", strike: "5000000" }),
        ],
        null,
      ),
    );
    expect(rows.map((r) => [r.strike, r.type, r.role, r.distance])).toEqual([
      ["160", "Put", "Sold", "7.2% OTM"],
      ["180.5", "Call", "Bought", "4.4% ITM"],
      ["160", "Put", "Sold", "—"],
      ["0.005", "Put", "Sold", "7.2% OTM"],
    ]);
  });

  it("totals intrinsic per quote mint and drops a mint without a full spot read", () => {
    expect(exposureTotals(exposure([leg({ intrinsic: "-19000000000" })], "-19000000000"))).toEqual([
      { quoteMint: USDC, value: "-19,000 USDC" },
    ]);
    expect(exposureTotals(exposure([leg({ role: "holder" })], "2500000"))).toEqual([{ quoteMint: USDC, value: "+2.5 USDC" }]);
    expect(exposureTotals(exposure([leg({ spot: null, intrinsic: null })], null))).toEqual([]);
  });
});

describe("entryReturnPct", () => {
  const lot = (shares: bigint, pct: number | null) => ({
    shares,
    entryPrice: 1_000_000_000n,
    eventTime: 0n,
    transactionSignature: "s",
    returnSinceEntryPct: pct,
  });
  const perf = (lots: DepositorPerformance["lots"]): DepositorPerformance => ({ lots, value: 0n, secondRedeemed: 0n });

  it("weights lots by shares only when priced lots hold every share", () => {
    expect(entryReturnPct(perf([lot(300n, 4), lot(100n, -4)]), 400n)).toBeCloseTo(2, 10);
    expect(entryReturnPct(perf([lot(300n, 4), lot(100n, -4), lot(50n, null)]), 450n)).toBeNull();
    expect(entryReturnPct(perf([lot(100n, 4)]), 150n)).toBeNull();
    expect(entryReturnPct(perf([]), 0n)).toBeNull();
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
  const blocks: flows.VaultActionBlock[] = [
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
    "staged",
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

  it("does not offer idle valuation while a staging slot is open", () => {
    const staging = { mint: USDC, from_leg: "second" as const, amount: "5", staged_at: String(NOW), generation: "1" };
    const idle = makeVault({ pending_withdraw_count: 1, capital_fallback_delay_secs: String(delay), staging });
    expect(withdrawSelfProcessView(idle, createdAt, NOW + delay)).toEqual({ kind: "hidden" });
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
