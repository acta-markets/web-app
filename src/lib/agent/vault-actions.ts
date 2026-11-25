import { flows } from "@acta-markets/ts-sdk/chain";
import type { Rpc, SolanaRpcApiMainnet } from "@solana/kit";
import {
  buildCancelDepositInstructions,
  buildCancelWithdrawInstructions,
  buildEmergencyRefundInstructions,
  buildRequestDepositInstructions,
  buildRequestWithdrawInstructions,
  buildSelfProcessDepositInstructions,
  buildSelfProcessWithdrawInstructions,
  createVaultDepositor,
  fetchVaultDepositorState,
  isNativeVault,
  type VaultDepositorState,
} from "@/lib/vaults/depositor";
import { formatUnits, mainToShares, parseUnits, sharesToMain } from "@/lib/vaults/math";
import { createVaultManager } from "@/lib/vaults/planner";
import {
  cancelBlockMessage,
  depositBlockMessage,
  depositCap,
  depositSelfProcessView,
  isLastSharesWithdrawal,
  LAST_SHARES_COPY,
  withdrawBlockMessage,
  withdrawSelfProcessView,
  type SelfProcessView,
} from "@/lib/vaults/rules";
import type { Vault } from "@/lib/vaults/types";
import { vaultView } from "@/lib/vaults/view";
import { explorerUrl } from "./config";
import { AgentError, plainSymbol, plainText } from "./errors";
import { latestCounted } from "./journal";
import { checkSpend, reserveSpend, type Spend } from "./limits";
import { isoTime } from "./markets";
import { nothingMoved, sendFromWallet } from "./send";
import type { ActaSession } from "./session";
import type { AgentContext } from "./trade";

/**
 * A wallet's own dealings with a vault: what it holds there, and the requests it can make.
 *
 * A vault does not take or pay out on the spot. A deposit and a withdrawal are requests, held
 * by the vault and processed between cycles; until then each can be cancelled, and one left
 * unprocessed long enough can be processed by its owner. Whether a request may be made, cancelled
 * or processed right now is the contract's rule, read through the same functions the web app's
 * deposit screen uses (`vaults/rules.ts` and the SDK), and checked here before anything is signed.
 */

/** What a native-SOL vault leaves in the wallet for fees and rent, as the web app does. */
const NATIVE_FEE_RESERVE = 10_000_000n;
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type RequestKind = "deposit" | "withdrawal";

const rpcOf = (session: ActaSession) => session.rpc as unknown as Rpc<SolanaRpcApiMainnet>;
const whole = (atoms: bigint, decimals: number) => Number(formatUnits(atoms, decimals));

/** A number of whole tokens as atoms; null when it is not a positive amount the token can hold. */
function toAtoms(amount: number, decimals: number): bigint | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const atoms = parseUnits(amount.toFixed(decimals), decimals);
  return atoms && atoms > 0n ? atoms : null;
}

async function loadVault(session: ActaSession, pda: string): Promise<Vault> {
  if (!ADDRESS.test(pda)) throw new AgentError("invalid_vault", "vault is the vault's address (base58), as acta_list_vaults gives it.");
  const raw = await session.http.vault(pda).catch(() => null);
  if (!raw) throw new AgentError("unknown_vault", "No open vault has that address.", "fix_request");
  return vaultView(raw);
}

async function tokenOf(session: ActaSession, vault: Vault): Promise<string> {
  const tokens = await session.http.tokens().catch(() => null);
  return plainSymbol(tokens?.get(vault.main_mint)?.symbol) ?? "token";
}

async function depositorOf(ctx: AgentContext, vault: Vault) {
  const wallet = ctx.session.signer!.address;
  const depositor = await createVaultDepositor(vault, wallet);
  const state = await fetchVaultDepositorState(rpcOf(ctx.session), depositor, isNativeVault(vault)).catch((error) => {
    throw new AgentError("chain_unreadable", `The wallet's vault accounts could not be read from chain: ${plainText(error instanceof Error ? error.message : "unknown", 120)}`, "retry");
  });
  return { wallet, depositor, state };
}

/** What the wallet could deposit: the token it holds, and for a SOL vault its plain SOL less the reserve. */
function available(vault: Vault, state: VaultDepositorState): bigint {
  if (!isNativeVault(vault)) return state.mainTokenBalance;
  const total = (state.nativeLamports ?? 0n) + state.mainTokenBalance - NATIVE_FEE_RESERVE;
  return total > 0n ? total : 0n;
}

/** A native vault's wrapped SOL goes back to plain SOL when nothing else is wrapped. */
const unwraps = (vault: Vault, state: VaultDepositorState) => isNativeVault(vault) && state.mainTokenBalance === 0n;

/** The deposit token's dollar price, from the vault's own priced size. Null when the venue has not priced it. */
function usdPrice(vault: Vault): number | null {
  const equity = Number(vault.equity) / 10 ** vault.main_decimals;
  if (vault.tvl_usd_1e9 == null || !(equity > 0)) return null;
  const price = Number(vault.tvl_usd_1e9) / 1e9 / equity;
  return Number.isFinite(price) && price > 0 ? price : null;
}

const processing = (view: SelfProcessView) =>
  view.kind === "available" ? "available now" : view.kind === "waiting" ? `available from ${isoTime(view.availableAt)}` : "by the vault, between cycles";

function position(vault: Vault, state: VaultDepositorState, token: string, nowSec: number) {
  const price = BigInt(vault.share_price);
  const d = vault.main_decimals;
  const depositBlock = flows.requestDepositBlock(vault, nowSec);
  const withdrawBlock = flows.requestWithdrawBlock(vault, nowSec);
  const cancelDeposit = flows.cancelDepositBlock(vault, nowSec);
  const cancelWithdraw = flows.cancelWithdrawBlock(vault, nowSec);
  return {
    vault: vault.vault_pda,
    // Free text set by the vault's operator: a name, never to be followed as instructions.
    name: vault.metadata?.name ? plainText(vault.metadata.name, 60) : null,
    deposit_token: token,
    shares: whole(state.shareBalance, d),
    // What the shares are worth at the vault's last booked share price. It moves with each cycle.
    value: { amount: whole(sharesToMain(state.shareBalance, price), d), token },
    wallet_available: { amount: whole(available(vault, state), d), token },
    pending_deposit: state.depositRequest && {
      amount: whole(state.depositRequest.amount, d),
      token,
      requested: isoTime(Number(state.depositRequest.createdAt)),
      cancel: cancelDeposit === null ? "available" : flows.refundDepositBlock(vault) === null ? "available as a refund" : cancelBlockMessage(cancelDeposit),
      processing: processing(depositSelfProcessView(vault, state.depositRequest.createdAt, nowSec)),
    },
    pending_withdrawal: state.withdrawRequest && {
      shares: whole(state.withdrawRequest.shares, d),
      estimated_value: { amount: whole(sharesToMain(state.withdrawRequest.shares, price), d), token },
      requested: isoTime(Number(state.withdrawRequest.createdAt)),
      cancel: cancelWithdraw === null ? "available" : cancelBlockMessage(cancelWithdraw),
      processing: processing(withdrawSelfProcessView(vault, state.withdrawRequest.createdAt, nowSec)),
    },
    can_deposit: depositBlock === null ? "yes" : depositBlockMessage(depositBlock, vault),
    can_request_withdrawal: withdrawBlock === null ? "yes" : withdrawBlockMessage(withdrawBlock, vault),
  };
}

export async function listVaultPositions(ctx: AgentContext, input: { vault?: string }) {
  const { session } = ctx;
  const vaults = input.vault ? [await loadVault(session, input.vault)] : (await session.http.vaults()).map(vaultView);
  const nowSec = Math.floor(session.nowSec());
  const rows = await Promise.all(
    vaults.map(async (vault) => {
      const [{ state }, token] = await Promise.all([depositorOf(ctx, vault), tokenOf(session, vault)]);
      return { held: state.shareBalance > 0n || state.depositRequest !== null || state.withdrawRequest !== null, row: position(vault, state, token, nowSec) };
    }),
  );
  return {
    network: session.config.network,
    wallet: session.signer!.address,
    note: "A deposit or a withdrawal is a request the vault processes between cycles. Until then it can be cancelled. value is at the last booked share price, not a promise.",
    // With a vault named, that vault is shown whatever the wallet holds there; otherwise only the ones it is in.
    positions: rows.filter((r) => input.vault || r.held).map((r) => r.row),
  };
}

function refuseReadOnly(ctx: AgentContext) {
  if (ctx.limits.readOnly) throw new AgentError("read_only", "This agent is set to read only: it cannot move funds in or out of a vault.", "stop");
}

export async function vaultDeposit(ctx: AgentContext, input: { vault: string; amount: number; dry_run?: boolean }) {
  const { session, limits, journal } = ctx;
  refuseReadOnly(ctx);
  const vault = await loadVault(session, input.vault);
  const nowSec = Math.floor(session.nowSec());
  const block = flows.requestDepositBlock(vault, nowSec);
  if (block) throw new AgentError("deposits_closed", depositBlockMessage(block, vault), "stop");

  const token = await tokenOf(session, vault);
  if (limits.allowedAssets && !limits.allowedAssets.includes(token.toUpperCase())) {
    throw new AgentError("asset_not_allowed", `This agent may only use ${limits.allowedAssets.join(", ")}.`, "stop");
  }
  const amount = toAtoms(input.amount, vault.main_decimals);
  if (!amount) throw new AgentError("invalid_amount", `amount is how much ${token} to deposit, in whole tokens, with at most ${vault.main_decimals} decimals.`);
  const shares = mainToShares(amount, BigInt(vault.share_price));
  if (shares === 0n) throw new AgentError("amount_too_small", "That amount is too small to buy a share.");

  const { wallet, depositor, state } = await depositorOf(ctx, vault);
  if (state.depositRequest) {
    throw new AgentError("request_exists", "This wallet already has a pending deposit in this vault. Cancel it with acta_vault_cancel_request to change the amount.", "stop");
  }
  const holds = available(vault, state);
  if (amount > holds) {
    throw new AgentError("insufficient_funds", `The wallet can deposit ${whole(holds, vault.main_decimals)} ${token}; ${input.amount} was asked.`, "fix_request");
  }
  const cap = depositCap(vault.capacity);
  if (cap && amount > cap.remaining) {
    throw new AgentError("over_capacity", `The vault has room for ${whole(cap.remaining, vault.main_decimals)} ${token} more.`, "fix_request");
  }

  // The owner's limits count a deposit by its dollar value, as they count a trade by its notional.
  const price = usdPrice(vault);
  if (price === null) throw new AgentError("cannot_value", "The venue has no price for this vault's token right now, so the deposit cannot be checked against the spending limits.", "retry");
  const usd = whole(amount, vault.main_decimals) * price;
  const spend: Spend = { wallet, asset: token, usd, nowSec, what: "deposit" };
  // Here for the dry run and for a quick refusal. The check that counts is `reserveSpend` below.
  checkSpend(limits, await journal.read(), spend);

  const summary = {
    network: session.config.network,
    vault: vault.vault_pda,
    deposit: { amount: whole(amount, vault.main_decimals), token },
    value_usd: Number(usd.toFixed(2)),
    estimated_shares: whole(shares, vault.main_decimals),
    processed: vault.active_expiry_ts ? `between cycles; this cycle ends ${isoTime(Number(vault.active_expiry_ts))}` : "when the vault next processes requests",
  };
  if (input.dry_run) return { status: "dry_run", ...summary, note: "Nothing was sent. The vault takes this deposit right now." };

  const wrapLamports = isNativeVault(vault) && amount > state.mainTokenBalance ? amount - state.mainTokenBalance : 0n;
  const instructions = await buildRequestDepositInstructions(depositor, amount, wrapLamports);
  // Checked and counted in one step, before it is sent: two deposits in flight cannot both use
  // the same room, and a crash between counting and sending cannot leave one the limits never saw.
  const entry = { orderId: `vault:${vault.vault_pda}:${crypto.randomUUID()}`, rfqId: "", wallet, asset: token, side: "deposit" as const, notionalUsd: usd };
  await reserveSpend(ctx, spend, { ...entry, state: "reserved", at: nowSec });
  const signature = await sendFromWallet(session, instructions).catch(async (error) => {
    // Refused by the chain: nothing left the wallet. Any other failure leaves it counted.
    if (nothingMoved(error)) await journal.append({ ...entry, state: "failed", at: Math.floor(session.nowSec()) });
    throw error;
  });
  await journal.append({ ...entry, state: "confirmed", at: Math.floor(session.nowSec()), txSignature: signature });
  return {
    status: "requested",
    ...summary,
    transaction: explorerUrl(session.config, "tx", signature),
    note: "The deposit is a request: it has left the wallet and buys shares when the vault processes it. Until then acta_vault_cancel_request takes it back.",
  };
}

export async function vaultWithdraw(ctx: AgentContext, input: { vault: string; shares?: number; all?: boolean }) {
  const { session } = ctx;
  refuseReadOnly(ctx);
  if ((input.shares === undefined) === !input.all) {
    throw new AgentError("invalid_shares", "Give shares, the number of shares to withdraw, or all: true for every share. Not both.");
  }
  const vault = await loadVault(session, input.vault);
  const block = flows.requestWithdrawBlock(vault, Math.floor(session.nowSec()));
  if (block) throw new AgentError("withdrawals_closed", withdrawBlockMessage(block, vault), "stop");

  const { depositor, state } = await depositorOf(ctx, vault);
  if (state.withdrawRequest) {
    throw new AgentError("request_exists", "This wallet already has a pending withdrawal in this vault. Cancel it with acta_vault_cancel_request to change the amount.", "stop");
  }
  if (state.shareBalance === 0n) throw new AgentError("no_shares", "This wallet holds no shares of this vault.", "stop");
  const shares = input.all ? state.shareBalance : toAtoms(input.shares!, vault.main_decimals);
  if (!shares) throw new AgentError("invalid_shares", `shares is a number of shares, with at most ${vault.main_decimals} decimals.`);
  if (shares > state.shareBalance) {
    throw new AgentError("not_enough_shares", `The wallet holds ${whole(state.shareBalance, vault.main_decimals)} shares.`, "fix_request");
  }

  const token = await tokenOf(session, vault);
  const signature = await sendFromWallet(session, buildRequestWithdrawInstructions(depositor, shares));
  const last = isLastSharesWithdrawal(vault, shares);
  return {
    status: "requested",
    network: session.config.network,
    vault: vault.vault_pda,
    shares: whole(shares, vault.main_decimals),
    // At the last booked share price. What is paid is set when the vault processes the request.
    estimated_value: { amount: whole(sharesToMain(shares, BigInt(vault.share_price)), vault.main_decimals), token },
    transaction: explorerUrl(session.config, "tx", signature),
    note: `The withdrawal is a request: the vault pays it out when it processes requests between cycles. Until then acta_vault_cancel_request takes it back.${last ? ` ${LAST_SHARES_COPY}` : ""}`,
  };
}

export async function vaultCancelRequest(ctx: AgentContext, input: { vault: string; request: RequestKind }) {
  const { session } = ctx;
  refuseReadOnly(ctx);
  const vault = await loadVault(session, input.vault);
  const nowSec = Math.floor(session.nowSec());
  const { wallet, depositor, state } = await depositorOf(ctx, vault);
  const token = await tokenOf(session, vault);
  const base = { network: session.config.network, vault: vault.vault_pda };

  if (input.request === "deposit") {
    const request = state.depositRequest;
    if (!request) throw new AgentError("no_request", "This wallet has no pending deposit in this vault.", "stop");
    const block = flows.cancelDepositBlock(vault, nowSec);
    // A vault that has left normal operation refunds a deposit it will not process.
    const refund = block !== null && flows.refundDepositBlock(vault) === null;
    if (block && !refund) throw new AgentError("cannot_cancel", cancelBlockMessage(block), "stop");
    const unwrap = unwraps(vault, state);
    const instructions = refund ? buildEmergencyRefundInstructions(depositor, unwrap) : buildCancelDepositInstructions(depositor, unwrap);
    const signature = await sendFromWallet(session, instructions);
    // The deposit is back in the wallet, so it no longer counts against the day's limit.
    const counted = latestCounted(await ctx.journal.read(), wallet, `vault:${vault.vault_pda}:`);
    if (counted) await ctx.journal.append({ ...counted, state: "abandoned", at: Math.floor(session.nowSec()) });
    return {
      status: refund ? "refunded" : "cancelled",
      ...base,
      returned: { amount: whole(request.amount, vault.main_decimals), token },
      transaction: explorerUrl(session.config, "tx", signature),
    };
  }

  const request = state.withdrawRequest;
  if (!request) throw new AgentError("no_request", "This wallet has no pending withdrawal in this vault.", "stop");
  const block = flows.cancelWithdrawBlock(vault, nowSec);
  if (block) throw new AgentError("cannot_cancel", cancelBlockMessage(block), "stop");
  const signature = await sendFromWallet(session, buildCancelWithdrawInstructions(depositor));
  return {
    status: "cancelled",
    ...base,
    shares_kept: whole(request.shares, vault.main_decimals),
    transaction: explorerUrl(session.config, "tx", signature),
  };
}

/** Refuses unless the contract lets the request's owner process it right now. */
function mustBeProcessable(view: SelfProcessView) {
  if (view.kind === "waiting") {
    throw new AgentError("not_yet", `The vault processes requests itself between cycles. The owner may process this one from ${isoTime(view.availableAt)}.`, "stop", { available_from: isoTime(view.availableAt) });
  }
  if (view.kind !== "available") {
    throw new AgentError("not_available", "This request cannot be processed by its owner right now. The vault processes it between cycles, or it can be cancelled.", "stop");
  }
}

export async function vaultProcessRequest(ctx: AgentContext, input: { vault: string; request: RequestKind }) {
  const { session } = ctx;
  refuseReadOnly(ctx);
  const vault = await loadVault(session, input.vault);
  const nowSec = Math.floor(session.nowSec());
  const { wallet, state } = await depositorOf(ctx, vault);
  const token = await tokenOf(session, vault);
  const base = { network: session.config.network, vault: vault.vault_pda };

  if (input.request === "deposit") {
    const request = state.depositRequest;
    if (!request) throw new AgentError("no_request", "This wallet has no pending deposit in this vault.", "stop");
    mustBeProcessable(depositSelfProcessView(vault, request.createdAt, nowSec));
    const instructions = await buildSelfProcessDepositInstructions(await createVaultManager(vault, wallet), unwraps(vault, state));
    const signature = await sendFromWallet(session, instructions);
    // Outside normal operation, processing a deposit returns it instead of buying shares.
    return {
      status: vault.safety === "normal" ? "processed" : "refunded",
      ...base,
      deposit: { amount: whole(request.amount, vault.main_decimals), token },
      transaction: explorerUrl(session.config, "tx", signature),
      note: vault.safety === "normal" ? "The deposit bought shares at the vault's booked price. acta_list_vault_positions shows them." : "The vault is not in normal operation, so the deposit came back to the wallet.",
    };
  }

  const request = state.withdrawRequest;
  if (!request) throw new AgentError("no_request", "This wallet has no pending withdrawal in this vault.", "stop");
  mustBeProcessable(withdrawSelfProcessView(vault, request.createdAt, nowSec));
  const instructions = await buildSelfProcessWithdrawInstructions(rpcOf(session), await createVaultManager(vault, wallet), vault).catch((error) => {
    throw new AgentError("not_available", plainText(error instanceof Error ? error.message : "This withdrawal cannot be processed right now.", 160), "stop");
  });
  const signature = await sendFromWallet(session, instructions);
  return {
    status: "processed",
    ...base,
    shares: whole(request.shares, vault.main_decimals),
    transaction: explorerUrl(session.config, "tx", signature),
    note: "The withdrawal was paid out to the wallet at the vault's booked price. acta_status shows the balance.",
  };
}
