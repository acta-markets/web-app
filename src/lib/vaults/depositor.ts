import { getDepositRequestDecoder, getWithdrawRequestDecoder } from "@acta-markets/ts-sdk";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buildWrapSolInstructions,
  closeTokenAccountInstruction,
  decodeTokenAccount,
  deriveAta,
  flows,
  resolveVaultPriceUpdates,
} from "@acta-markets/ts-sdk/chain";
import {
  address,
  createNoopSigner,
  fetchEncodedAccounts,
  type Instruction,
  type Rpc,
  type SolanaRpcApiMainnet,
} from "@solana/kit";
import { withComputeUnitLimit, type VaultManager } from "./operator";
import type { Vault } from "./types";

export { NATIVE_MINT };

export type VaultDepositor = flows.VaultDepositorPlanner;

export type VaultDepositorState = {
  depositRequest: { amount: bigint; createdAt: bigint } | null;
  withdrawRequest: { shares: bigint; createdAt: bigint } | null;
  shareBalance: bigint;
  mainTokenBalance: bigint;
  nativeLamports: bigint | null;
};

export function isNativeVault(vault: Vault): boolean {
  return vault.main_mint === NATIVE_MINT;
}

export async function buildSelfProcessDepositInstructions(
  processor: VaultManager,
  unwrap: boolean,
): Promise<Instruction[]> {
  const user = processor.actor.address;
  const instructions = [await processor.processDeposits([user])];
  if (unwrap) {
    const ata = await deriveAta({ owner: user, mint: processor.mainMint, tokenProgram: TOKEN_PROGRAM_ID });
    instructions.push(closeTokenAccountInstruction(ata, user, user));
  }
  return instructions;
}

export async function buildSelfProcessWithdrawInstructions(
  rpc: Rpc<SolanaRpcApiMainnet>,
  processor: VaultManager,
  vault: Vault,
): Promise<Instruction[]> {
  const user = processor.actor.address;
  const withdraw = await processor.processWithdrawals([user]);
  if (vault.phase !== "idle" || vault.equity_computed || vault.safety === "withdraw_only") return [withdraw];
  const prices = await resolveVaultPriceUpdates(rpc, processor);
  const equity = await processor.processIdleWithdrawal(user, prices.mainPriceUpdate, prices.secondPriceUpdate);
  return withComputeUnitLimit([equity, withdraw], IDLE_WITHDRAWAL_COMPUTE_UNITS);
}

const IDLE_WITHDRAWAL_COMPUTE_UNITS = 400_000;

export function createVaultDepositor(vault: Vault, user: string): Promise<VaultDepositor> {
  return flows.VaultDepositorPlanner.create({
    vault: address(vault.vault_pda),
    user: createNoopSigner(address(user)),
    mainMint: address(vault.main_mint),
    shareMint: address(vault.share_mint),
    mainTokenProgram: vault.main_token_program === "token_2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
  });
}

export async function fetchVaultDepositorState(
  rpc: Rpc<SolanaRpcApiMainnet>,
  depositor: VaultDepositor,
  native: boolean,
): Promise<VaultDepositorState> {
  const { depositRequest, withdrawRequest, userMainAta, userShareAta } = depositor.addresses;
  const [accounts, lamports] = await Promise.all([
    fetchEncodedAccounts(rpc, [depositRequest, withdrawRequest, userMainAta, userShareAta], {
      commitment: "confirmed",
    }),
    native
      ? rpc.getBalance(depositor.user.address, { commitment: "confirmed" }).send()
      : Promise.resolve(null),
  ]);
  const [depositAccount, withdrawAccount, mainAccount, shareAccount] = accounts;
  const deposit = depositAccount.exists ? getDepositRequestDecoder().decode(depositAccount.data) : null;
  const withdraw = withdrawAccount.exists ? getWithdrawRequestDecoder().decode(withdrawAccount.data) : null;
  return {
    depositRequest: deposit ? { amount: deposit.amount, createdAt: deposit.createdAt } : null,
    withdrawRequest: withdraw ? { shares: withdraw.shares, createdAt: withdraw.createdAt } : null,
    mainTokenBalance: mainAccount.exists ? decodeTokenAccount(mainAccount.data).amount : 0n,
    shareBalance: shareAccount.exists ? decodeTokenAccount(shareAccount.data).amount : 0n,
    nativeLamports: lamports ? lamports.value : null,
  };
}

export async function buildRequestDepositInstructions(
  depositor: VaultDepositor,
  amount: bigint,
  wrapLamports = 0n,
): Promise<Instruction[]> {
  const user = depositor.user.address;
  const wrap = wrapLamports > 0n ? await buildWrapSolInstructions({ payer: user, owner: user, lamports: wrapLamports }) : [];
  return [...wrap, depositor.requestDeposit(amount)];
}

export function buildUnwrapNativeInstruction(depositor: VaultDepositor): Instruction {
  const user = depositor.user.address;
  return closeTokenAccountInstruction(depositor.addresses.userMainAta, user, user);
}

export function buildCancelDepositInstructions(depositor: VaultDepositor, unwrap: boolean): Instruction[] {
  const instructions = [depositor.cancelDeposit()];
  if (unwrap) instructions.push(buildUnwrapNativeInstruction(depositor));
  return instructions;
}

export function buildEmergencyRefundInstructions(depositor: VaultDepositor, unwrap: boolean): Instruction[] {
  const instructions = [depositor.emergencyRefundDeposit()];
  if (unwrap) instructions.push(buildUnwrapNativeInstruction(depositor));
  return instructions;
}

export function buildRequestWithdrawInstructions(depositor: VaultDepositor, shares: bigint): Instruction[] {
  return [depositor.requestWithdraw(shares)];
}

export function buildCancelWithdrawInstructions(depositor: VaultDepositor): Instruction[] {
  return [depositor.cancelWithdraw()];
}
