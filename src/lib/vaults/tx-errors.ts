import {
  ACTA_CONTRACT_ERROR__MARKET_EXPIRED,
  ACTA_CONTRACT_ERROR__POSITION_ALREADY_FUNDED,
  ACTA_CONTRACT_ERROR__POSITION_NOT_FUNDED,
  ACTA_CONTRACT_ERROR__VAULT_CAPITAL_PROCESSING_CLOSED,
  ACTA_CONTRACT_ERROR__VAULT_DEPOSIT_CLOSED,
  ACTA_CONTRACT_ERROR__VAULT_FINAL_REDEMPTION_REQUIRED,
  ACTA_CONTRACT_ERROR__VAULT_PENDING_CAPITAL,
  ACTA_CONTRACT_ERROR__VAULT_POLICY_LIMIT_EXCEEDED,
  ACTA_CONTRACT_ERROR__VAULT_REQUEST_EXISTS,
  ACTA_CONTRACT_ERROR__VAULT_SHARE_AMOUNT_TOO_SMALL,
  ACTA_CONTRACT_ERROR__VAULT_STAGING_ACTIVE,
  ACTA_CONTRACT_ERROR__VAULT_WITHDRAW_CLOSED,
} from "@acta-markets/ts-sdk";
import { isTransportError } from "@/lib/async-pool";
import { LAST_SHARES_COPY } from "./presentation";
import { TransactionFailedError } from "./transaction";

export type VaultTxErrorView = { tone: "info" | "error"; message: string; signature?: string };

// The SDK's own message helper returns a placeholder in production bundles, so the
// codes a depositor can actually hit are mapped here.
const CONTRACT_ERROR_COPY: Record<number, string> = {
  [ACTA_CONTRACT_ERROR__VAULT_REQUEST_EXISTS]: "You already have a pending request of this kind. Cancel it first.",
  [ACTA_CONTRACT_ERROR__VAULT_SHARE_AMOUNT_TOO_SMALL]: "This amount is too small to convert into shares.",
  [ACTA_CONTRACT_ERROR__VAULT_DEPOSIT_CLOSED]: "Deposits closed before your request reached the vault.",
  [ACTA_CONTRACT_ERROR__VAULT_WITHDRAW_CLOSED]: "Withdrawals closed before your request reached the vault.",
  [ACTA_CONTRACT_ERROR__VAULT_FINAL_REDEMPTION_REQUIRED]: LAST_SHARES_COPY,
  [ACTA_CONTRACT_ERROR__VAULT_PENDING_CAPITAL]:
    "The vault is processing capital right now. Try again after this cycle's requests are processed.",
  [ACTA_CONTRACT_ERROR__VAULT_CAPITAL_PROCESSING_CLOSED]: "Requests cannot be processed at this point in the cycle.",
  [ACTA_CONTRACT_ERROR__VAULT_POLICY_LIMIT_EXCEEDED]: "The vault's limits do not allow this amount right now.",
  [ACTA_CONTRACT_ERROR__VAULT_STAGING_ACTIVE]: "The vault is in the middle of a two-step swap. Try again once it completes.",
  // funding a bought option and taking the deposit back, when the row on screen is behind the chain
  [ACTA_CONTRACT_ERROR__POSITION_ALREADY_FUNDED]: "This option is already funded.",
  [ACTA_CONTRACT_ERROR__POSITION_NOT_FUNDED]: "This option is not funded, so there is no deposit to take back.",
  [ACTA_CONTRACT_ERROR__MARKET_EXPIRED]: "This option has expired, so its deposit can no longer be changed.",
};

/** Program error code from simulation logs (`custom program error: 0x467`) or a status (`"Custom":1127`). */
export function contractErrorCode(text: string): number | null {
  const hex = /custom program error: (0x[0-9a-f]+)/i.exec(text);
  if (hex) return parseInt(hex[1], 16);
  const custom = /"Custom":\s*(\d+)/.exec(text);
  return custom ? Number(custom[1]) : null;
}

const WALLET_REJECTION = /reject|denied|declin|cancel|plugin closed|window closed|user closed|abort/i;

function isWalletRejection(err: unknown): boolean {
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === 4001) return true;
  return WALLET_REJECTION.test(err instanceof Error ? err.message : String(err));
}

export function describeVaultTxError(err: unknown): VaultTxErrorView {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof TransactionFailedError) {
    if (/expired/i.test(message)) {
      return {
        tone: "error",
        message: "The transaction expired before it confirmed. Check your wallet history before trying again.",
        signature: err.signature,
      };
    }
    const code = contractErrorCode(message);
    return {
      tone: "error",
      message: (code != null ? CONTRACT_ERROR_COPY[code] : undefined) ?? "The transaction failed on chain.",
      signature: err.signature,
    };
  }

  // sendWalletTransactions simulates before asking the wallet, so nothing has been signed yet
  if (message.startsWith("simulation failed")) {
    const code = contractErrorCode(message);
    const known = code != null ? CONTRACT_ERROR_COPY[code] : undefined;
    if (known) return { tone: "error", message: `${known} Nothing was sent.` };
    if (/insufficient (lamports|funds)/i.test(message)) {
      return { tone: "error", message: "Not enough balance for this amount plus network fees. Nothing was sent." };
    }
    return { tone: "error", message: "The transaction failed in simulation. Nothing was sent." };
  }

  if (isWalletRejection(err)) return { tone: "info", message: "Request declined in your wallet. Nothing was sent." };

  return { tone: "error", message: "Something went wrong. Check your wallet history before trying again." };
}

/** Why the chain would not take a deposit for a position, in the reader's words. */
export function describeSkippedPosition(reason: string): string {
  if (/requires a matching (Open|Funded) position/i.test(reason)) return "no longer open on chain";
  if (/not found on chain/i.test(reason)) return "not found on chain";
  if (/must be signed by the position holder/i.test(reason)) return "held by another wallet";
  return reason.split("\n")[0].slice(0, 120);
}

/**
 * What to say when something failed before any transaction went out: while preparing,
 * simulating or signing. It always ends by saying nothing was sent, and it names the reason,
 * because "something went wrong" sends a person to their wallet history for a transaction
 * that never existed and tells whoever debugs it nothing.
 */
export function describeNotSent(err: unknown): string {
  const { message } = describeVaultTxError(err);
  if (message.endsWith("Nothing was sent.")) return message;
  if (isTransportError(err)) return "The network is busy and did not answer. Nothing was sent. Try again in a moment.";
  const raw = (err instanceof Error ? err.message : String(err)).split("\n")[0].trim();
  const changed = /Wallet changed the simulated transaction(?::\s*(.+))?/i.exec(raw);
  if (changed) {
    // a fee setting or the wallet's own assertions are accepted; this is anything past that, and it says what
    const what = changed[1] ? ` (${changed[1].slice(0, 160)})` : "";
    return `Your wallet changed the transaction before signing it${what}, which this app does not accept. Nothing was sent.`;
  }
  if (/unexpected transaction count/i.test(raw)) return "Your wallet did not sign every transaction it was asked to. Nothing was sent.";
  if (/does not support transaction signing/i.test(raw)) return "This wallet cannot sign transactions here. Nothing was sent.";
  if (/requires a matching (Open|Funded) position|not found on chain|must be signed by the position holder/i.test(raw)) {
    return `This option is ${describeSkippedPosition(raw)}. Nothing was sent.`;
  }
  return `Could not prepare this: ${raw.slice(0, 160) || "unknown error"}. Nothing was sent.`;
}
