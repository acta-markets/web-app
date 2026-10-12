import { formatDate, formatPercent, NONE } from "./format";
import {
  processIdleWithdrawalBlock,
  requestDepositBlock,
  selfProcessDepositBlock,
  selfProcessWithdrawBlock,
  type VaultActionBlock,
} from "./rules";
import type { Vault, VaultPerformance, VaultPhase, VaultSafety } from "./types";

/** How a vault's headline return reads, by how much history it has. */
export type HeadlineReturn = { label: string; value: string; detail: string | null; muted: boolean };

export function headlineReturn(performance: VaultPerformance): HeadlineReturn {
  switch (performance.status) {
    case "annualized":
      return { label: "APR", value: formatPercent(performance.annualized_return_pct), detail: "After fees", muted: false };
    case "short_track_record":
      return {
        label: "Return so far",
        value: formatPercent(performance.cumulative_return_pct, { signed: true }),
        detail: "APR after 30 days",
        muted: false,
      };
    case "no_track_record":
      return { label: "APR", value: "New vault", detail: "No completed cycles yet", muted: true };
    default:
      return { label: "APR", value: NONE, detail: null, muted: true };
  }
}

const WIND_DOWN: ReadonlySet<VaultSafety> = new Set<VaultSafety>(["closing", "withdraw_only", "emergency_unwind"]);

export function isWindingDown(vault: Pick<Vault, "safety">): boolean {
  return WIND_DOWN.has(vault.safety);
}

const STATUS_RANK: Record<string, number> = {
  annualized: 0,
  short_track_record: 1,
  no_track_record: 2,
  unavailable: 3,
};

function yieldOf(performance: VaultPerformance): number {
  if (performance.status === "annualized") return performance.annualized_return_pct;
  if (performance.status === "short_track_record") return performance.cumulative_return_pct;
  return 0;
}

/**
 * Highest proven yield first, as the integration notes ask: annualized, then
 * short track records by cumulative return, then new vaults. Vaults winding
 * down go last whatever their history.
 */
export function compareVaultsByYield(a: Vault, b: Vault, nameOf: (vault: Vault) => string): number {
  const windDown = Number(isWindingDown(a)) - Number(isWindingDown(b));
  if (windDown !== 0) return windDown;
  const rank = (STATUS_RANK[a.performance.status] ?? 4) - (STATUS_RANK[b.performance.status] ?? 4);
  if (rank !== 0) return rank;
  const byYield = yieldOf(b.performance) - yieldOf(a.performance);
  if (byYield !== 0) return byYield;
  return nameOf(a).localeCompare(nameOf(b));
}

export type VaultStatusTone = "open" | "neutral" | "warning";
export type VaultStatusView = { label: string; tone: VaultStatusTone; detail?: string };

/** Deposit availability comes from the contract rules, never from `accepting_deposits` alone. */
export function vaultStatus(vault: Vault, nowSecs: number): VaultStatusView {
  switch (vault.safety) {
    case "frozen":
      return { label: "Paused", tone: "warning" };
    case "closing":
      return { label: "Closing", tone: "warning", detail: "Withdrawals only" };
    case "withdraw_only":
      return { label: "Withdraw only", tone: "warning" };
    case "emergency_unwind":
      return { label: "Unwinding", tone: "warning" };
  }
  const block = requestDepositBlock(vault, nowSecs);
  if (block === null) {
    return vault.phase === "active"
      ? { label: "Accepting deposits", tone: "open", detail: `Cycle ends ${formatDate(Number(vault.active_expiry))}` }
      : { label: "Accepting deposits", tone: "open" };
  }
  if (block === "cutoff" || vault.phase === "settling") return { label: "Settling", tone: "neutral" };
  if (vault.phase === "processing_capital" || vault.equity_computed) {
    return { label: "Processing requests", tone: "neutral" };
  }
  return { label: "Deposits closed", tone: "neutral", detail: "Opens when the next cycle starts" };
}

export type VaultModalTab = "deposit" | "withdraw";

/** Vaults that will never take deposits again open straight on Withdraw. */
export function primaryVaultAction(vault: Vault, nowSecs: number): { label: "Deposit" | "Manage"; tab: VaultModalTab } {
  return requestDepositBlock(vault, nowSecs) === "safety"
    ? { label: "Manage", tab: "withdraw" }
    : { label: "Deposit", tab: "deposit" };
}

type BlockContext = Pick<Vault, "safety" | "phase" | "equity_computed">;

function phaseMessage(phase: VaultPhase, subject: "Deposits" | "Withdrawal requests"): string {
  if (phase === "settling") return `The vault is settling this cycle. ${subject} open again after settlement.`;
  if (phase === "processing_capital") {
    return `The vault is processing this cycle's requests. ${subject} open again after that.`;
  }
  return `${subject} are not open right now.`;
}

export function depositBlockMessage(block: VaultActionBlock, vault: BlockContext): string {
  switch (block) {
    case "safety":
      switch (vault.safety) {
        case "frozen":
          return "This vault is paused and is not taking deposits.";
        case "closing":
          return "This vault is closing. It only processes withdrawals now.";
        case "withdraw_only":
          return "This vault only processes withdrawals now.";
        case "emergency_unwind":
          return "This vault is unwinding its positions and is not taking deposits.";
        default:
          return "Deposits are not open right now.";
      }
    case "window_closed":
      return vault.equity_computed
        ? "This cycle's requests are being processed. Deposits open again after that."
        : "Deposits are closed until the next cycle starts.";
    case "phase":
      return phaseMessage(vault.phase, "Deposits");
    case "cutoff":
      return "This cycle has reached expiry. Deposits open again after settlement.";
    default:
      return "Deposits are not open right now.";
  }
}

export function withdrawBlockMessage(block: VaultActionBlock, vault: BlockContext): string {
  switch (block) {
    case "safety":
      return "This vault is unwinding its positions. Withdrawals open once the unwind completes.";
    case "phase":
      return phaseMessage(vault.phase, "Withdrawal requests");
    case "cutoff":
      return "This cycle has reached expiry. Withdrawal requests open again after settlement.";
    case "priced":
      return "This cycle's requests are being processed. Withdrawal requests open again after that.";
    default:
      return "Withdrawal requests are not open right now.";
  }
}

export function cancelBlockMessage(block: VaultActionBlock): string {
  switch (block) {
    case "safety":
      return "Cancelling is not available while the vault is in this mode.";
    case "phase":
    case "cutoff":
    case "priced":
      return "This request is locked in for processing and can no longer be cancelled.";
    default:
      return "This request cannot be cancelled right now.";
  }
}

export const REQUEST_EXISTS_COPY = {
  deposit: "You already have a pending deposit. Cancel it to change the amount.",
  withdraw: "You already have a pending withdrawal. Cancel it to change the amount.",
} as const;

export const LAST_SHARES_COPY =
  "This would redeem every remaining share in the vault. Final withdrawals are not available in the app yet.";

export type SelfProcessView =
  | { kind: "available"; label: string }
  | { kind: "waiting"; availableAt: number }
  | { kind: "hidden" };

/** When anyone, not just the manager, may process a request (the contract's fallback delay). */
function publicProcessingAt(vault: Vault, createdAt: bigint): number {
  const delay = Number(vault.capital_fallback_delay_secs);
  return vault.phase === "processing_capital" ? Number(vault.active_expiry) + delay : Number(createdAt) + delay;
}

export function depositSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const block = selfProcessDepositBlock(vault, createdAt, nowSecs);
  if (block === null) {
    // outside normal mode, processing a deposit returns it instead of minting shares
    return { kind: "available", label: vault.safety === "normal" ? "Process my deposit" : "Refund my deposit" };
  }
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  // a deposit alone cannot force a valuation, so there is nothing to offer but cancel
  return { kind: "hidden" };
}

export function withdrawSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const block = selfProcessWithdrawBlock(vault, createdAt, nowSecs);
  if (block === null) return { kind: "available", label: "Process my withdrawal" };
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  if (block === "unpriced") {
    // an aged withdrawal may value idle capital itself, then withdraw, in one transaction
    const idle = processIdleWithdrawalBlock(vault, createdAt, nowSecs);
    if (idle === null) return { kind: "available", label: "Process my withdrawal" };
    if (idle === "authority") {
      return { kind: "waiting", availableAt: Number(createdAt) + Number(vault.capital_fallback_delay_secs) };
    }
  }
  return { kind: "hidden" };
}

/** Redeeming the whole supply needs the final-withdrawal path, which the app does not build yet. */
export function isLastSharesWithdrawal(vault: Pick<Vault, "live_share_supply" | "total_shares">, shares: bigint): boolean {
  if (shares <= 0n) return false;
  return shares >= BigInt(vault.live_share_supply ?? vault.total_shares);
}
