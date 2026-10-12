import { getTokenMint } from "@/lib/tokens";
import type { VaultDepositorState } from "./depositor";
import { PRICE_SCALE } from "./math";
import type { VaultMeta } from "./registry";
import type { Vault, VaultCycle, VaultPerformance } from "./types";

/**
 * Dev-only fixture vaults (`NEXT_PUBLIC_VAULTS_SAMPLE=1`) so the vault UI can be
 * built and checked while the backend has little to show. The figures are made
 * up and the UI does not mark them, so screenshots of this mode are not real
 * results. Never active in a production build.
 */
export function isSampleModeEnabled(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv !== "production" && flag === "1";
}

// Literal reads so Next inlines both; `next build` and `next start` always run with NODE_ENV=production.
export const VAULTS_SAMPLE_MODE = isSampleModeEnabled(process.env.NODE_ENV, process.env.NEXT_PUBLIC_VAULTS_SAMPLE);

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Well-formed but made-up addresses: random base58 keys with no account on chain.
export const SAMPLE_VAULTS = {
  sol: "7ESb3PEPvCmHSdaw8J2YfZERsSfjewfhEgZ6zzfrLiHL",
  jitosol: "BBYt9VSPf118Kt2kGhgyH9rapBqiNoQhHvWqtXvdiKAc",
  zbtc: "Honen6jgcy75yRSDWsXUJT9LcPZArza1QaMjxp1aFB7q",
  usdc: "4mSySvcVS3W4P6ujLahTNrBnYYLNEvmQUVwUNJ8pm9jB",
  usdcClosing: "3KfLJggsXX54D3orfRpp4uggiuqMzHKQSR2Q7jNL962H",
  xtsla: "8oDdcWSv5QtSfEE51K7guQL4uy3xbmisoqrjawqmY3Vm",
} as const;

const SHARE_MINTS = {
  sol: "AgTu8srVNXcdBvzFc68ZZURyMBSAve8BzLVkAhAdPo6d",
  jitosol: "bMsK1QyBcKEJnFFPKibjDUzySHLBwQ5D9na22SVBrey",
  zbtc: "UrQobXWuKSY3FGUD71FEDwaC84ErAVPSzKbSRERCSKU",
  usdc: "5CETfzWydmdWoDvfok97VPxKxkdMkedpdwuVwpK5VHVY",
  usdcClosing: "C9XdEVn7rxrLHqvp6rngRb11Q4iSw5V22igLpT5vJ6gv",
  xtsla: "GXaeMwEPLq3RT22w1jy3Pyzgky1uW9Q7J8YjBfymiFoG",
} as const;

const DESKS = {
  a: "9uj9NDtFUMY2wViFZZx6VfPCPpwL85oDPSZrb8FKGNZ6",
  b: "TE1ApPCcrSmJAAeAfJ3BJ8LWG3KKh9SpsEXfJzqzrAV",
  c: "BWKhmQ5886puiBzFDFCHqqi8NWHvbZ4waNWNUcMTXnto",
} as const;

const XTSLA_MINT = "8kL3MEcLpoSMuc2rXcJx12stBs1xGwycVqrp7QJ89Ef3";

function managedBy(desk: string): Pick<Vault, "governance" | "fee_recipient" | "primary_delegate"> {
  return { governance: desk, fee_recipient: desk, primary_delegate: desk };
}

const DAY = 86_400;
const WEEK = 7 * DAY;
const SETTLEMENT_GAP = 6 * 3_600;

/** Full Vault shape with neutral defaults; tests build on it too. */
export function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    vault_pda: SAMPLE_VAULTS.usdc,
    vault_id: "00".repeat(32),
    ...managedBy(DESKS.a),
    main_mint: MAINNET_USDC_MINT,
    second_mint: NATIVE_SOL_MINT,
    share_mint: SHARE_MINTS.usdc,
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
    performance: { status: "no_track_record" },
    ...overrides,
  };
}

export const SAMPLE_VAULT_META: Readonly<Record<string, VaultMeta>> = {
  [SAMPLE_VAULTS.sol]: {
    name: "SOL income",
    curator: "Desk A",
    category: "Majors",
    assetSymbol: "SOL",
    description: "Sells weekly calls against deposited SOL and keeps the premium in the vault.",
  },
  [SAMPLE_VAULTS.jitosol]: {
    name: "jitoSOL income",
    curator: "Desk B",
    category: "Majors",
    assetSymbol: "jitoSOL",
  },
  [SAMPLE_VAULTS.zbtc]: {
    name: "zBTC income",
    curator: "Desk A",
    category: "Majors",
    assetSymbol: "zBTC",
  },
  [SAMPLE_VAULTS.usdc]: {
    name: "USDC income",
    curator: "Desk C",
    category: "Stables",
    assetSymbol: "USDC",
    description: "Sells weekly puts secured by deposited USDC.",
  },
  [SAMPLE_VAULTS.usdcClosing]: {
    name: "USDC legacy",
    curator: "Desk B",
    category: "Stables",
    assetSymbol: "USDC",
  },
  [SAMPLE_VAULTS.xtsla]: {
    name: "xTSLA income",
    curator: "Desk C",
    category: "Stocks",
    assetSymbol: "xTSLA",
  },
};

export type SampleData = {
  vaults: Vault[];
  /** Newest first, like the cycles route. */
  cycles: Record<string, VaultCycle[]>;
  depositors: Record<string, VaultDepositorState>;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

type CycleSpec = {
  seed: number;
  finished: number;
  meanPct: number;
  sdPct: number;
  /** cycle indexes forced to lose money */
  negatives?: number[];
  /** a new capital generation starts here: share price restarts at 1 */
  resetAt?: number;
  startEquity: number;
  /** net deposits added at each boundary, % of equity */
  flowPct: number;
  decimals: number;
  lastFinishedAt: number;
  running?: { startedAt: number; expiry: number };
};

type BuiltHistory = {
  cycles: VaultCycle[];
  sharePrice: bigint;
  equity: bigint;
  generation: number;
  performance: VaultPerformance;
};

function scaleBy(value: bigint, returnPct: number): bigint {
  return (value * BigInt(Math.round((1 + returnPct / 100) * 1e9))) / 1_000_000_000n;
}

function buildHistory(spec: CycleSpec): BuiltHistory {
  const rand = mulberry32(spec.seed);
  const unit = 10n ** BigInt(spec.decimals);
  let sharePrice = PRICE_SCALE;
  let equity = BigInt(Math.round(spec.startEquity)) * unit;
  let generation = 0;
  const cycles: VaultCycle[] = [];
  const returns: number[] = [];
  let firstStartedAt = 0;

  for (let i = 0; i < spec.finished; i++) {
    if (spec.resetAt === i) {
      sharePrice = PRICE_SCALE;
      generation += 1;
    }
    const finishedAt = spec.lastFinishedAt - (spec.finished - 1 - i) * WEEK;
    const startedAt = finishedAt - (WEEK - SETTLEMENT_GAP);
    if (i === 0) firstStartedAt = startedAt;

    let returnPct = spec.meanPct + spec.sdPct * gaussian(rand);
    if (spec.negatives?.includes(i)) returnPct = -Math.abs(returnPct) - 0.2;
    returnPct = Math.round(returnPct * 10_000) / 10_000;

    const priceEnd = scaleBy(sharePrice, returnPct);
    const equityEnd = scaleBy(equity, returnPct);
    const positions = 2 + Math.floor(rand() * 3);
    cycles.push({
      cycle_number: String(i),
      capital_generation: String(generation),
      expiry: String(finishedAt - SETTLEMENT_GAP),
      started_at: String(startedAt),
      finished_at: String(finishedAt),
      share_price_start: sharePrice.toString(),
      share_price_end: priceEnd.toString(),
      equity_start: equity.toString(),
      equity_end: equityEnd.toString(),
      positions_opened: positions,
      positions_settled: positions,
      return_pct: returnPct,
      performance_fee_assessed: "0",
      management_fee_assessed: "0",
    });
    returns.push(returnPct);
    sharePrice = priceEnd;
    const flow = (spec.flowPct / 100) * (0.5 + rand());
    equity = equityEnd + BigInt(Math.round(Number(equityEnd) * flow));
  }

  if (spec.running) {
    cycles.push({
      cycle_number: String(spec.finished),
      capital_generation: String(generation),
      expiry: String(spec.running.expiry),
      started_at: String(spec.running.startedAt),
      finished_at: null,
      share_price_start: sharePrice.toString(),
      // the backend can fill these in before the cycle is final; the UI must ignore them
      share_price_end: scaleBy(sharePrice, 0.12).toString(),
      equity_start: equity.toString(),
      equity_end: scaleBy(equity, 0.12).toString(),
      positions_opened: 3,
      positions_settled: 0,
      return_pct: 0.12,
      performance_fee_assessed: "0",
      management_fee_assessed: "0",
    });
  }

  let performance: VaultPerformance = { status: "no_track_record" };
  if (returns.length > 0) {
    const cumulative = (returns.reduce((index, r) => index * (1 + r / 100), 1) - 1) * 100;
    const trackSecs = spec.lastFinishedAt - firstStartedAt;
    const record = {
      cycles_completed: returns.length,
      last_cycle_return_pct: returns[returns.length - 1],
      cumulative_return_pct: cumulative,
      track_record_secs: String(trackSecs),
    };
    performance = trackSecs >= 30 * DAY
      ? { status: "annualized", annualized_return_pct: (cumulative * 365 * DAY) / trackSecs, ...record }
      : { status: "short_track_record", ...record };
  }

  return { cycles: cycles.reverse(), sharePrice, equity, generation, performance };
}

function sharesFor(equity: bigint, sharePrice: bigint): string {
  return sharePrice === 0n ? "0" : ((equity * PRICE_SCALE) / sharePrice).toString();
}

function liveFields(history: BuiltHistory): Partial<Vault> {
  const shares = sharesFor(history.equity, history.sharePrice);
  return {
    share_price: history.sharePrice.toString(),
    equity: history.equity.toString(),
    total_shares: shares,
    live_share_supply: shares,
    capital_generation: String(history.generation),
    performance: history.performance,
  };
}

const NO_POSITION: VaultDepositorState = {
  depositRequest: null,
  withdrawRequest: null,
  shareBalance: 0n,
  mainTokenBalance: 0n,
  nativeLamports: null,
};

export function buildSampleData(nowSecs: number): SampleData {
  const now = Math.floor(nowSecs / 3_600) * 3_600;
  const usdcMint = getTokenMint("USDC") ?? MAINNET_USDC_MINT;
  const sol = 10n ** 9n;
  const usdc = 10n ** 6n;

  const solHistory = buildHistory({
    seed: 11,
    finished: 20,
    meanPct: 0.24,
    sdPct: 0.32,
    negatives: [6, 13],
    resetAt: 10,
    startEquity: 900,
    flowPct: 6,
    decimals: 9,
    lastFinishedAt: now - 4 * DAY,
    running: { startedAt: now - 4 * DAY + SETTLEMENT_GAP, expiry: now + 3 * DAY - SETTLEMENT_GAP },
  });
  const jitoHistory = buildHistory({
    seed: 23,
    finished: 2,
    meanPct: 0.5,
    sdPct: 0.2,
    startEquity: 260,
    flowPct: 12,
    decimals: 9,
    lastFinishedAt: now - DAY,
  });
  const usdcHistory = buildHistory({
    seed: 37,
    finished: 12,
    meanPct: 0.3,
    sdPct: 0.18,
    negatives: [4],
    startEquity: 1_200_000,
    flowPct: 4,
    decimals: 6,
    lastFinishedAt: now - 2 * DAY,
    running: { startedAt: now - 2 * DAY + SETTLEMENT_GAP, expiry: now + 5 * DAY - SETTLEMENT_GAP },
  });
  const closingHistory = buildHistory({
    seed: 41,
    finished: 3,
    meanPct: 0.15,
    sdPct: 0.25,
    startEquity: 85_000,
    flowPct: 0,
    decimals: 6,
    lastFinishedAt: now - 2 * DAY,
  });

  const usdcPending = 30_000n * usdc;
  const vaults: Vault[] = [
    makeVault({
      vault_pda: SAMPLE_VAULTS.sol,
      share_mint: SHARE_MINTS.sol,
      ...managedBy(DESKS.a),
      main_mint: NATIVE_SOL_MINT,
      second_mint: usdcMint,
      main_decimals: 9,
      second_decimals: 6,
      phase: "active",
      active_expiry: String(now + 3 * DAY - SETTLEMENT_GAP),
      open_positions: "3",
      accepting_deposits: false,
      cap_limit: (10_000n * sol).toString(),
      pending_deposit_count: 3,
      pending_deposit_amount: (42n * sol).toString(),
      pending_withdraw_count: 1,
      pending_withdraw_shares: (2n * sol).toString(),
      ...liveFields(solHistory),
    }),
    makeVault({
      vault_pda: SAMPLE_VAULTS.jitosol,
      share_mint: SHARE_MINTS.jitosol,
      ...managedBy(DESKS.b),
      main_mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      second_mint: usdcMint,
      main_decimals: 9,
      second_decimals: 6,
      phase: "idle",
      accepting_deposits: true,
      ...liveFields(jitoHistory),
    }),
    makeVault({
      vault_pda: SAMPLE_VAULTS.zbtc,
      share_mint: SHARE_MINTS.zbtc,
      ...managedBy(DESKS.a),
      main_mint: "zeusLhUcFiPKG5NFuKrXEkChBXGNKPJBnqR2BC5v6R5",
      second_mint: usdcMint,
      main_decimals: 8,
      second_decimals: 6,
      phase: "idle",
      accepting_deposits: false,
      equity: (3n * 10n ** 8n).toString(),
      total_shares: (3n * 10n ** 8n).toString(),
      live_share_supply: (3n * 10n ** 8n).toString(),
    }),
    makeVault({
      vault_pda: SAMPLE_VAULTS.usdc,
      share_mint: SHARE_MINTS.usdc,
      ...managedBy(DESKS.c),
      main_mint: usdcMint,
      second_mint: NATIVE_SOL_MINT,
      phase: "active",
      active_expiry: String(now + 5 * DAY - SETTLEMENT_GAP),
      open_positions: "4",
      accepting_deposits: false,
      // nearly full: 20,000 USDC of room left
      cap_limit: (usdcHistory.equity + usdcPending + 20_000n * usdc).toString(),
      pending_deposit_count: 6,
      pending_deposit_amount: usdcPending.toString(),
      ...liveFields(usdcHistory),
    }),
    makeVault({
      vault_pda: SAMPLE_VAULTS.usdcClosing,
      share_mint: SHARE_MINTS.usdcClosing,
      ...managedBy(DESKS.b),
      main_mint: usdcMint,
      second_mint: NATIVE_SOL_MINT,
      phase: "idle",
      safety: "closing",
      accepting_deposits: false,
      ...liveFields(closingHistory),
    }),
    makeVault({
      vault_pda: SAMPLE_VAULTS.xtsla,
      share_mint: SHARE_MINTS.xtsla,
      ...managedBy(DESKS.c),
      main_mint: XTSLA_MINT,
      second_mint: usdcMint,
      main_decimals: 8,
      second_decimals: 6,
      phase: "idle",
      accepting_deposits: true,
      performance: { status: "unavailable" },
    }),
  ];

  const solSharePrice = BigInt(vaults[0].share_price);
  return {
    vaults,
    cycles: {
      [SAMPLE_VAULTS.sol]: solHistory.cycles,
      [SAMPLE_VAULTS.jitosol]: jitoHistory.cycles,
      [SAMPLE_VAULTS.zbtc]: [],
      [SAMPLE_VAULTS.usdc]: usdcHistory.cycles,
      [SAMPLE_VAULTS.usdcClosing]: closingHistory.cycles,
      [SAMPLE_VAULTS.xtsla]: [],
    },
    depositors: {
      [SAMPLE_VAULTS.sol]: {
        ...NO_POSITION,
        shareBalance: (125n * sol * PRICE_SCALE) / (10n * solSharePrice),
        withdrawRequest: { shares: 2n * sol, createdAt: BigInt(now - 2 * 3_600) },
        nativeLamports: (32n * sol) / 10n,
      },
      [SAMPLE_VAULTS.jitosol]: { ...NO_POSITION, mainTokenBalance: 25n * sol },
      [SAMPLE_VAULTS.zbtc]: { ...NO_POSITION, mainTokenBalance: 15n * 10n ** 6n },
      [SAMPLE_VAULTS.usdc]: {
        ...NO_POSITION,
        depositRequest: { amount: 500n * usdc, createdAt: BigInt(now - 20 * 3_600) },
        mainTokenBalance: 1_250n * usdc,
      },
      [SAMPLE_VAULTS.usdcClosing]: { ...NO_POSITION, shareBalance: 300n * usdc },
      [SAMPLE_VAULTS.xtsla]: NO_POSITION,
    },
  };
}

let cached: { day: number; data: SampleData } | null = null;

/** Stable for the rest of the day, so list and detail pages agree. */
export function sampleData(): SampleData {
  const nowSecs = Math.floor(Date.now() / 1000);
  const day = Math.floor(nowSecs / DAY);
  if (!cached || cached.day !== day) cached = { day, data: buildSampleData(nowSecs) };
  return cached.data;
}
