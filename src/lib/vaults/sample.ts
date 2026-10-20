import type { VaultDepositorState } from "./depositor";
import { PRICE_SCALE } from "./math";
import type { VaultCategory, VaultMeta } from "./registry";
import type { Vault, VaultCycle, VaultDepositorEvent, VaultExposure, VaultPerformance } from "./types";

/**
 * Dev-only fixture vaults (`NEXT_PUBLIC_VAULTS_SAMPLE=1`) so the vault UI can be
 * built and checked while the backend has little to show. The data lives in
 * sample-data.json; the figures are made up and the UI does not mark them, so
 * screenshots of this mode are not real results. Never active in a production build.
 */
export function isSampleModeEnabled(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv !== "production" && flag === "1";
}

// Literal reads so Next inlines both; `next build` and `next start` always run with NODE_ENV=production.
export const VAULTS_SAMPLE_MODE = isSampleModeEnabled(process.env.NODE_ENV, process.env.NEXT_PUBLIC_VAULTS_SAMPLE);

const DAY = 86_400;
const HOUR = 3_600;
const PLACEHOLDER_ADDRESS = "11111111111111111111111111111111";
/** Stands in for the connected wallet; sample history ignores it. */
export const SAMPLE_WALLET = PLACEHOLDER_ADDRESS;
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Full Vault shape with neutral defaults, for tests. */
export function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    vault_pda: PLACEHOLDER_ADDRESS,
    vault_id: "00".repeat(32),
    governance: PLACEHOLDER_ADDRESS,
    fee_recipient: PLACEHOLDER_ADDRESS,
    primary_delegate: PLACEHOLDER_ADDRESS,
    main_mint: MAINNET_USDC_MINT,
    second_mint: NATIVE_SOL_MINT,
    share_mint: PLACEHOLDER_ADDRESS,
    main_token_program: "legacy_spl",
    second_token_program: "legacy_spl",
    main_decimals: 6,
    second_decimals: 9,
    phase: "idle",
    safety: "normal",
    capabilities: 0,
    active_expiry: "0",
    open_positions: "0",
    total_shares: "0",
    share_price: PRICE_SCALE.toString(),
    equity: "0",
    capital_generation: "0",
    accepting_deposits: true,
    equity_computed: false,
    pending_deposit_count: 0,
    pending_withdraw_count: 0,
    pending_deposit_amount: "0",
    pending_withdraw_shares: "0",
    performance_fee_bps: 1000,
    management_fee_bps: 200,
    manager_stake_min_bps: 100,
    share_price_hwm: PRICE_SCALE.toString(),
    last_hwm_update_ts: "0",
    last_hwm_reset_ts: "0",
    last_settlement_ts: "0",
    cap_limit: "0",
    capacity: { cap_limit: "0", remaining: null },
    capital_fallback_delay_secs: "43200",
    deposit_window_set_ts: null,
    main_balance: null,
    second_balance: null,
    balance_updated_at: null,
    live_share_supply: null,
    observed_manager_stake_shares: null,
    balance_chain_slot: null,
    policy: { max_open_positions: 4, max_rebalance_drift_bps: 100, min_main_liquidity_bps: 1000 },
    projection: { version: "1", slot: "1", transaction_index: 0, signature: "1".repeat(88), event_index: 0 },
    created_at: null,
    generation_started_at: null,
    tvl_usd_1e9: null,
    price_time: null,
    premium: null,
    fees: null,
    depositors_in_generation: null,
    performance: null,
    ...overrides,
  };
}

/** Covered performance with no history yet, for tests. */
export function makePerformance(overrides: Partial<VaultPerformance> = {}): VaultPerformance {
  return {
    capital_generation: "0",
    computed_at: "0",
    covered: true,
    returns: { "7d": null, "30d": null, "90d": null, all: null },
    apy_30d: null,
    apy_90d: null,
    max_drawdown_pct: null,
    worst_cycle_return_pct: null,
    losing_cycles: null,
    cycles_completed: null,
    ...overrides,
  };
}

export type SampleData = {
  vaults: Vault[];
  meta: Record<string, VaultMeta>;
  /** newest first, like the cycles route */
  cycles: Record<string, VaultCycle[]>;
  depositors: Record<string, VaultDepositorState>;
  /** the wallet's vault history, newest first, like the history route */
  history: Record<string, VaultDepositorEvent[]>;
  exposure: Record<string, VaultExposure>;
  /** the file's short handles, e.g. `sol`, mapped to vault PDAs */
  keys: Record<string, string>;
};

// What sample-data.json holds: API shapes, plus a position with amounts as strings.
type RawPosition = {
  shareBalance: string;
  mainTokenBalance: string;
  nativeLamports: string | null;
  depositRequest: { amount: string; createdAt: number } | null;
  withdrawRequest: { shares: string; createdAt: number } | null;
  history: VaultDepositorEvent[];
};
type RawEntry = {
  key: string;
  meta: VaultMeta;
  vault: Vault;
  cycles: VaultCycle[];
  exposure: VaultExposure;
  position: RawPosition;
};
type RawFile = { anchor: number; vaults: RawEntry[] };

const PHASES = new Set(["idle", "active", "settling", "processing_capital"]);
const SAFETIES = new Set(["normal", "frozen", "emergency_unwind", "withdraw_only", "closing"]);
const WINDOWS = ["7d", "30d", "90d", "all"] as const;
const CATEGORIES: ReadonlySet<VaultCategory> = new Set<VaultCategory>(["Crypto", "Stocks", "Stables"]);

function fail(where: string, message: string): never {
  throw new Error(`sample-data.json: ${where}: ${message}`);
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function amount(value: unknown, where: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) fail(where, `expected a base-unit string, got ${JSON.stringify(value)}`);
  return BigInt(value);
}

/** Checks the fields a hand edit is most likely to break, so a typo reads as an error instead of a blank page. */
function validate(file: unknown): RawFile {
  const raw = file as RawFile;
  if (typeof raw?.anchor !== "number" || !Array.isArray(raw.vaults)) fail("root", "expected { anchor, vaults: [...] }");
  for (const entry of raw.vaults) {
    const where = `vault "${entry?.key ?? "?"}"`;
    if (typeof entry?.key !== "string") fail(where, "missing key");
    if (typeof entry.meta?.name !== "string" || typeof entry.meta.curator !== "string") fail(where, "meta needs name and curator");
    if (entry.meta.category !== undefined && !CATEGORIES.has(entry.meta.category)) {
      fail(where, `unknown category ${JSON.stringify(entry.meta.category)}`);
    }
    if (entry.meta.stakingAprPct !== undefined && !isPositive(entry.meta.stakingAprPct)) {
      fail(where, `stakingAprPct must be a positive percentage, got ${JSON.stringify(entry.meta.stakingAprPct)}`);
    }
    if (typeof entry.vault?.vault_pda !== "string") fail(where, "vault.vault_pda is missing");
    if (!PHASES.has(entry.vault.phase)) fail(where, `unknown phase ${JSON.stringify(entry.vault.phase)}`);
    if (!SAFETIES.has(entry.vault.safety)) fail(where, `unknown safety ${JSON.stringify(entry.vault.safety)}`);
    const performance = entry.vault.performance;
    if (performance !== null) {
      if (typeof performance?.covered !== "boolean") fail(where, "performance.covered must be true or false");
      if (WINDOWS.some((w) => performance.returns?.[w] === undefined)) fail(where, "performance.returns needs 7d, 30d, 90d and all");
    }
    if (typeof entry.vault.capacity?.cap_limit !== "string") fail(where, "vault.capacity is missing");
    if (!Array.isArray(entry.cycles)) fail(where, "cycles must be an array");
    if (!Array.isArray(entry.exposure?.positions) || !Array.isArray(entry.exposure.totals)) {
      fail(where, "exposure needs positions and totals");
    }
    if (typeof entry.position !== "object" || entry.position === null) fail(where, "position is missing");
    if (!Array.isArray(entry.position.history)) fail(where, "position.history must be an array");
  }
  return raw;
}

// "0" means unset on chain and stays put; everything else moves with the clock.
function shifted(value: string, shift: number): string {
  return value === "0" ? value : String(Number(value) + shift);
}

function shiftedOrNull(value: string | null, shift: number): string | null {
  return value === null ? null : shifted(value, shift);
}

function shiftedPerformance(performance: VaultPerformance | null, shift: number): VaultPerformance | null {
  if (performance === null) return null;
  const returns = { ...performance.returns };
  for (const w of WINDOWS) {
    const r = returns[w];
    if (r) returns[w] = { ...r, from_time: shifted(r.from_time, shift), to_time: shifted(r.to_time, shift) };
  }
  return { ...performance, computed_at: shifted(performance.computed_at, shift), returns };
}

/**
 * Turns sample-data.json into typed data. Timestamps were written against the
 * file's `anchor`; they are shifted so the anchor lands on `nowSecs` (to the
 * hour), keeping expiries, request ages and 30-day windows current.
 */
export function parseSampleData(file: unknown, nowSecs: number): SampleData {
  const raw = validate(file);
  const shift = Math.floor(nowSecs / HOUR) * HOUR - raw.anchor;
  const data: SampleData = { vaults: [], meta: {}, cycles: {}, depositors: {}, history: {}, exposure: {}, keys: {} };

  for (const entry of raw.vaults) {
    const pda = entry.vault.vault_pda;
    const where = `vault "${entry.key}" position`;
    const v = entry.vault;
    data.vaults.push({
      ...v,
      active_expiry: shifted(v.active_expiry, shift),
      last_hwm_update_ts: shifted(v.last_hwm_update_ts, shift),
      last_hwm_reset_ts: shifted(v.last_hwm_reset_ts, shift),
      last_settlement_ts: shifted(v.last_settlement_ts, shift),
      deposit_window_set_ts: shiftedOrNull(v.deposit_window_set_ts, shift),
      balance_updated_at: shiftedOrNull(v.balance_updated_at, shift),
      created_at: shiftedOrNull(v.created_at, shift),
      generation_started_at: shiftedOrNull(v.generation_started_at, shift),
      price_time: shiftedOrNull(v.price_time, shift),
      performance: shiftedPerformance(v.performance, shift),
    });
    data.meta[pda] = entry.meta;
    data.keys[entry.key] = pda;
    data.cycles[pda] = entry.cycles.map((c) => ({
      ...c,
      expiry: shifted(c.expiry, shift),
      started_at: shifted(c.started_at, shift),
      finished_at: shiftedOrNull(c.finished_at, shift),
    }));
    const x = entry.exposure;
    data.exposure[pda] = {
      ...x,
      as_of: shifted(x.as_of, shift),
      positions: x.positions.map((p) => ({ ...p, expiry: shifted(p.expiry, shift), spot_time: shiftedOrNull(p.spot_time, shift) })),
    };
    const p = entry.position;
    data.history[pda] = p.history.map((e) => ({ ...e, event_time: shifted(e.event_time, shift) }));
    data.depositors[pda] = {
      shareBalance: amount(p.shareBalance, where),
      mainTokenBalance: amount(p.mainTokenBalance, where),
      nativeLamports: p.nativeLamports === null ? null : amount(p.nativeLamports, where),
      depositRequest: p.depositRequest
        ? { amount: amount(p.depositRequest.amount, where), createdAt: BigInt(p.depositRequest.createdAt + shift) }
        : null,
      withdrawRequest: p.withdrawRequest
        ? { shares: amount(p.withdrawRequest.shares, where), createdAt: BigInt(p.withdrawRequest.createdAt + shift) }
        : null,
    };
  }
  return data;
}

let loaded: { day: number; data: SampleData } | null = null;
let loading: Promise<SampleData> | null = null;

/**
 * Loads sample-data.json on first use. It is a separate chunk that nothing
 * requests outside sample mode. Stable for the rest of the day, so list and
 * detail pages agree.
 */
export function loadSampleData(): Promise<SampleData> {
  const nowSecs = Math.floor(Date.now() / 1000);
  const day = Math.floor(nowSecs / DAY);
  if (loaded?.day === day) return Promise.resolve(loaded.data);
  loading ??= import("./sample-data.json").then(
    (file) => {
      const data = parseSampleData(file.default, nowSecs);
      loaded = { day, data };
      loading = null;
      return data;
    },
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

/** The data from the last load, for synchronous readers that run after one (names, positions). */
export function peekSampleData(): SampleData | null {
  return loaded?.data ?? null;
}
