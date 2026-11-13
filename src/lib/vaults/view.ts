import type * as Sdk from "@acta-markets/ts-sdk/http";
import type * as View from "./types";

const atoms = (value: Sdk.Atoms): string | null => (value.type === "available" ? value.atoms : null);
const metric = (value: Sdk.Metric): number | null => (value.type === "available" ? value.value : null);
const signature = (value: Sdk.Transaction): string | null => (value.type === "known" ? value.signature : null);

function windowReturn(value: Sdk.VaultWindowReturn): View.VaultWindowReturn | null {
  if (value.type === "insufficient_history") return null;
  const { type: _, ...rest } = value;
  return rest;
}

function premium(value: Sdk.VaultPremium): View.VaultPremium {
  const flow = (f: Sdk.VaultPremiumFlow): View.VaultPremiumFlow => ({ received: f.received, paid: atoms(f.paid) });
  return { quote_mint: value.quote_mint, cycle: flow(value.cycle), generation: flow(value.generation) };
}

export function vaultView(vault: Sdk.Vault): View.Vault {
  const { deposit_window, tvl_usd, stats, metadata, ...rest } = vault;
  const current = stats.type === "current" ? stats : null;
  const generation = current?.generation.type === "covered" ? current.generation : null;
  const performance = generation?.performance;
  return {
    ...rest,
    deposit_window_set_at: deposit_window.type === "set" ? deposit_window.set_at : null,
    created_at: stats.type === "not_indexed" ? null : stats.created_at,
    generation_started_at: generation?.started.type === "at" ? generation.started.at : null,
    tvl_usd_1e9: tvl_usd.type === "priced" ? tvl_usd.value_1e9 : null,
    price_published_at: tvl_usd.type === "priced" ? tvl_usd.price_published_at : null,
    premium: generation ? generation.premium.map(premium) : null,
    fees: generation?.fees ?? null,
    depositors_in_generation: generation?.depositors ?? null,
    performance: current && {
      capital_generation: vault.capital_generation,
      computed_at: current.computed_at,
      covered: generation !== null,
      returns: {
        "7d": performance ? windowReturn(performance.returns["7d"]) : null,
        "30d": performance ? windowReturn(performance.returns["30d"]) : null,
        "90d": performance ? windowReturn(performance.returns["90d"]) : null,
        all: performance ? windowReturn(performance.returns.all) : null,
      },
      apy_30d: performance ? metric(performance.apy_30d) : null,
      apy_90d: performance ? metric(performance.apy_90d) : null,
      max_drawdown_pct: performance ? metric(performance.max_drawdown_pct) : null,
      worst_cycle_return_pct: performance ? metric(performance.worst_cycle_return_pct) : null,
      losing_cycles: performance ? metric(performance.losing_cycles) : null,
      cycles_completed: performance?.cycles_completed ?? null,
    },
    metadata: metadata.type === "set" ? (({ type: _, ...fields }) => fields)(metadata) : null,
  };
}

export function positionView(position: Sdk.VaultPosition): View.VaultPosition {
  const { funded_amount, close, transaction, ...rest } = position;
  return {
    ...rest,
    funded_amount: atoms(funded_amount),
    is_otm: close.type === "closed" ? close.is_otm : null,
    settled_at: close.type === "closed" ? close.closed_at : null,
    transaction_signature: signature(transaction),
  };
}

export function exposureView(exposure: Sdk.VaultExposure): View.VaultExposure {
  return {
    vault_pda: exposure.vault_pda,
    as_of: exposure.as_of,
    positions: exposure.positions.map(({ decimals, spot, moneyness, intrinsic, ...rest }) => ({
      ...rest,
      underlying_decimals: decimals.type === "known" ? decimals.underlying : null,
      quote_decimals: decimals.type === "known" ? decimals.quote : null,
      spot: spot.type === "priced" ? spot.price : null,
      spot_published_at: spot.type === "priced" ? spot.published_at : null,
      distance_pct: moneyness.type === "available" ? moneyness.distance_pct : null,
      itm: moneyness.type === "available" ? moneyness.itm : null,
      intrinsic: atoms(intrinsic),
    })),
    totals: exposure.totals.map((total) => ({
      quote_mint: total.quote_mint,
      notional_at_strike: atoms(total.notional_at_strike),
      outstanding_intrinsic: atoms(total.outstanding_intrinsic),
    })),
  };
}

export function cycleView(cycle: Sdk.VaultCycle): View.VaultCycle {
  const { capital_generation, state, ...rest } = cycle;
  const priced = state.type === "running" ? null : state;
  return {
    ...rest,
    capital_generation: capital_generation.type === "known" ? capital_generation.generation : null,
    finished_at: state.type === "finished" ? state.finished_at : null,
    share_price_end: priced?.share_price_end ?? null,
    equity_end: priced?.equity_end ?? null,
    return_pct: priced?.return_pct.type === "available" ? priced.return_pct.value : null,
  };
}

function request<T extends { transaction: Sdk.Transaction }>({ transaction, ...rest }: T) {
  return { ...rest, transaction_signature: signature(transaction) };
}

export function depositorView(depositor: Sdk.VaultDepositor): View.VaultDepositor {
  const pending = <T extends { type: string; transaction: Sdk.Transaction }>(value: { type: "none" } | T) =>
    value.type === "none" ? null : (({ type: _, ...fields }) => request(fields as Omit<T, "type">))(value as T);
  return {
    vault_pda: depositor.vault_pda,
    wallet: depositor.wallet,
    deposit_request: pending(depositor.deposit_request),
    withdraw_request: pending(depositor.withdraw_request),
    totals: depositor.totals.type === "recorded" ? (({ type: _, ...fields }) => fields)(depositor.totals) : null,
  };
}

export const depositRequestView = (value: Sdk.VaultDepositRequest): View.VaultDepositRequest => request(value);
export const withdrawRequestView = (value: Sdk.VaultWithdrawRequest): View.VaultWithdrawRequest => request(value);

/** Observed share supply, falling back to the booked total before the first balance observation. */
export const liveShareSupply = (vault: Pick<View.Vault, "balances" | "total_shares">): string =>
  vault.balances.type === "observed" ? vault.balances.live_share_supply : vault.total_shares;
