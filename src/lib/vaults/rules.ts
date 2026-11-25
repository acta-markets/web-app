import { flows } from "@acta-markets/ts-sdk/chain";
import type { Vault, VaultPhase } from "./types";
import { liveShareSupply } from "./view";

/**
 * What a depositor may do with a vault right now, and the words for why not. The rules are the
 * contract's, read through the SDK; this file only turns them into sentences. It imports no
 * token table and reads no environment, so the web app and the headless agent share it.
 */

type BlockContext = Pick<Vault, "safety" | "phase" | "equity_computed">;

function phaseMessage(phase: VaultPhase, subject: "Deposits" | "Withdrawal requests"): string {
  if (phase === "settling") return `The vault is settling this cycle. ${subject} open again after settlement.`;
  if (phase === "processing_capital") {
    return `The vault is processing this cycle's requests. ${subject} open again after that.`;
  }
  return `${subject} are not open right now.`;
}

export function depositBlockMessage(block: flows.VaultActionBlock, vault: BlockContext): string {
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

export function withdrawBlockMessage(block: flows.VaultActionBlock, vault: BlockContext): string {
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

export function cancelBlockMessage(block: flows.VaultActionBlock): string {
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
  "This requests every remaining share. The final withdrawal pays out both vault assets and may need to wait for pending deposits to be processed.";

export type SelfProcessView =
  | { kind: "available"; label: string }
  | { kind: "waiting"; availableAt: number }
  | { kind: "hidden" };

/** When anyone, not just the manager, may process a request (the contract's fallback delay). */
function publicProcessingAt(vault: Vault, createdAt: bigint): number {
  const delay = Number(vault.capital_fallback_delay_seconds);
  return vault.phase === "processing_capital" ? Number(vault.active_expiry_ts) + delay : Number(createdAt) + delay;
}

export function depositSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const block = flows.selfProcessDepositBlock(vault, createdAt, nowSecs);
  if (block === null) {
    // outside normal mode, processing a deposit returns it instead of minting shares
    return { kind: "available", label: vault.safety === "normal" ? "Process my deposit" : "Refund my deposit" };
  }
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  // a deposit alone cannot force a valuation, so there is nothing to offer but cancel
  return { kind: "hidden" };
}

export function withdrawSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const finalRequest = vault.pending_withdraw_count === 1 && isLastSharesWithdrawal(vault, BigInt(vault.pending_withdraw_shares));
  const pricedVault = vault.phase === "idle" && !vault.equity_computed ? { ...vault, equity_computed: true } : vault;
  if (finalRequest && flows.processFinalWithdrawalBlock(pricedVault)) return { kind: "hidden" };
  const block = flows.selfProcessWithdrawBlock(vault, createdAt, nowSecs);
  if (block === null) return { kind: "available", label: "Process my withdrawal" };
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  if (block === "unpriced") {
    // an aged withdrawal may value idle capital itself, then withdraw, in one transaction
    const idle = flows.processIdleWithdrawalBlock(vault, createdAt, nowSecs);
    if (idle === null) return { kind: "available", label: "Process my withdrawal" };
    if (idle === "authority") {
      return { kind: "waiting", availableAt: Number(createdAt) + Number(vault.capital_fallback_delay_seconds) };
    }
  }
  return { kind: "hidden" };
}

/** The contract reads the live mint supply for the final withdrawal. */
export function isLastSharesWithdrawal(vault: Pick<Vault, "balances" | "total_shares">, shares: bigint): boolean {
  if (shares <= 0n) return false;
  return shares >= BigInt(liveShareSupply(vault));
}

/** The binding deposit cap, or null when deposits are uncapped (a u64::MAX cap counts as none). */
export function depositCap(capacity: Vault["capacity"]): { cap: bigint; remaining: bigint } | null {
  if (capacity.type === "unlimited" || BigInt(capacity.cap_limit) === 18_446_744_073_709_551_615n) return null;
  return { cap: BigInt(capacity.cap_limit), remaining: BigInt(capacity.remaining) };
}
