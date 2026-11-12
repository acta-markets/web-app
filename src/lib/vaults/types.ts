// The app's view of the vault HTTP API: absent facts as `null`, unpacked once in `view.ts`.
// `staging`, `balances` and depositor events keep the SDK shape because SDK rule helpers read them.
import type * as Sdk from "@acta-markets/ts-sdk/http";

export type {
  VaultDepositorAction,
  VaultDepositorEvent,
  VaultDepositorHistoryPage,
  VaultFees,
  VaultPhase,
  VaultPolicy,
  VaultPositionRole,
  VaultPositionStatus,
  VaultProjection,
  VaultSafety,
  VaultStaging,
  VaultTokenProgram,
} from "@acta-markets/ts-sdk/http";

export type VaultMetadata = Omit<Extract<Sdk.Vault["metadata"], { type: "set" }>, "type">;

/** `paid` is null when a holder leg's market lacks decimals or its open price. */
export type VaultPremiumFlow = { received: string; paid: string | null };

export type VaultPremium = { quote_mint: string; cycle: VaultPremiumFlow; generation: VaultPremiumFlow };

/** Net-of-fee booked share price return between two checkpoint times. */
export type VaultWindowReturn = { return_pct: number; window_start_at: string; window_end_at: string };

/** Metrics of `capital_generation` as of `computed_at`; all null unless `covered`. */
export type VaultPerformance = {
  capital_generation: string;
  computed_at: string;
  covered: boolean;
  returns: {
    "7d": VaultWindowReturn | null;
    "30d": VaultWindowReturn | null;
    "90d": VaultWindowReturn | null;
    all: VaultWindowReturn | null;
  };
  apy_30d: number | null;
  apy_90d: number | null;
  max_drawdown_pct: number | null;
  worst_cycle_return_pct: number | null;
  losing_cycles: number | null;
  cycles_completed: number | null;
};

export type Vault = Omit<Sdk.Vault, "deposit_window" | "tvl_usd" | "stats" | "metadata"> & {
  deposit_window_set_at: string | null;
  created_at: string | null;
  generation_started_at: string | null;
  /** Indicative: booked equity at the main mint's USD price, 1e9 scale, as of `price_published_at`. */
  tvl_usd_1e9: string | null;
  price_published_at: string | null;
  premium: VaultPremium[] | null;
  fees: Sdk.VaultFees | null;
  depositors_in_generation: number | null;
  performance: VaultPerformance | null;
  /** Display only; `governance` is the authority. */
  metadata: VaultMetadata | null;
};

export type VaultPosition = Omit<Sdk.VaultPosition, "funded_amount" | "close" | "transaction"> & {
  funded_amount: string | null;
  is_otm: boolean | null;
  settled_at: string | null;
  transaction_signature: string | null;
};

export type VaultPositionsPage = { positions: VaultPosition[]; next_cursor: string | null };

/** `intrinsic` is in quote atoms: positive for holder legs, negative for writer legs. */
export type VaultExposurePosition = Omit<
  Sdk.VaultExposurePosition,
  "decimals" | "spot" | "moneyness" | "intrinsic"
> & {
  underlying_decimals: number | null;
  quote_decimals: number | null;
  spot: string | null;
  spot_published_at: string | null;
  distance_pct: number | null;
  itm: boolean | null;
  intrinsic: string | null;
};

/** A total is null when any position of its quote mint lacks the value. */
export type VaultExposureTotal = { quote_mint: string; notional_at_strike: string | null; outstanding_intrinsic: string | null };

export type VaultExposure = {
  vault_pda: string;
  /** Unix seconds the positions were read; never older than 15 s. */
  as_of: string;
  positions: VaultExposurePosition[];
  totals: VaultExposureTotal[];
};

export type VaultCycle = Omit<Sdk.VaultCycle, "capital_generation" | "state"> & {
  /** Null for cycles recorded before generations were tracked. */
  capital_generation: string | null;
  finished_at: string | null;
  share_price_end: string | null;
  equity_end: string | null;
  return_pct: number | null;
};

export type VaultCyclesPage = { cycles: VaultCycle[]; next_cursor: string | null };

type Request<T> = T & { created_at: string; transaction_signature: string | null };

export type VaultDepositRequest = Request<{ wallet: string; amount: string }>;
export type VaultWithdrawRequest = Request<{ wallet: string; shares: string }>;
export type VaultDepositRequestsPage = { requests: VaultDepositRequest[]; next_cursor: string | null };
export type VaultWithdrawRequestsPage = { requests: VaultWithdrawRequest[]; next_cursor: string | null };

export type VaultDepositor = {
  vault_pda: string;
  wallet: string;
  deposit_request: Request<{ amount: string }> | null;
  withdraw_request: Request<{ shares: string }> | null;
  totals: Omit<Extract<Sdk.VaultDepositor["totals"], { type: "recorded" }>, "type"> | null;
};

export type DepositorPortfolio = { wallet: string; vaults: VaultDepositor[] };
