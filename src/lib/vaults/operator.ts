import { getVaultDelegateDecoder } from "@acta-markets/ts-sdk";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  flows,
  resolveVaultPriceUpdates,
} from "@acta-markets/ts-sdk/chain";
import type { VaultDepositRequest, VaultWithdrawRequest } from "@acta-markets/ts-sdk/http";
import { VaultDelegatePermission, hasVaultPermission } from "@acta-markets/ts-sdk/ws";
import {
  address,
  createNoopSigner,
  fetchEncodedAccount,
  getBase16Encoder,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApiMainnet,
} from "@solana/kit";
import { fetchVaultDepositRequests, fetchVaultWithdrawRequests } from "./api";
import type { Vault } from "./types";

export type VaultManager = flows.VaultManagerPlanner;

export async function createVaultManager(vault: Vault, actor: string): Promise<VaultManager> {
  const manager = await flows.VaultManagerPlanner.create({
    vaultId: new Uint8Array(getBase16Encoder().encode(vault.vault_id)),
    actor: createNoopSigner(address(actor)),
    delegateAuthority: address(vault.primary_delegate),
    mainMint: address(vault.main_mint),
    secondMint: address(vault.second_mint),
    shareMint: address(vault.share_mint),
    mainTokenProgram: vault.main_token_program === "token_2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    secondTokenProgram: vault.second_token_program === "token_2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
  });
  if (manager.addresses.vault !== vault.vault_pda) throw new Error("vault id does not derive the vault address");
  return manager;
}

export type VaultOperatorRole = { kind: "governance" | "delegate"; permissions: number };

export async function fetchVaultOperatorRole(
  rpc: Rpc<SolanaRpcApiMainnet>,
  manager: VaultManager,
  vault: Vault,
  nowSecs: number,
): Promise<VaultOperatorRole | null> {
  const wallet = manager.actor.address;
  if (wallet === vault.governance) {
    return { kind: "governance", permissions: flows.VAULT_DELEGATE_PERMISSIONS_KNOWN_MASK };
  }
  if (wallet !== vault.primary_delegate) return null;
  const account = await fetchEncodedAccount(rpc, manager.addresses.delegate, { commitment: "confirmed" });
  if (!account.exists) return null;
  const delegate = getVaultDelegateDecoder().decode(account.data);
  const live = delegate.expiresAt === 0n || BigInt(nowSecs) < delegate.expiresAt;
  if (delegate.enabled !== 1 || delegate.delegate !== wallet || !live) return null;
  return { kind: "delegate", permissions: delegate.permissions & flows.VAULT_DELEGATE_PERMISSIONS_KNOWN_MASK };
}

export const canProcessCapital = (role: VaultOperatorRole | null) =>
  role !== null && hasVaultPermission(role.permissions, VaultDelegatePermission.PROCESS_CAPITAL);

export const canSetDepositWindow = (role: VaultOperatorRole | null) =>
  role !== null && hasVaultPermission(role.permissions, VaultDelegatePermission.SET_DEPOSIT_WINDOW);

async function collectPages<T>(
  load: (cursor: string | undefined) => Promise<{ requests: T[]; next_cursor: string | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    all.push(...page.requests);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return all;
}

export const fetchAllVaultDepositRequests = (pda: string, signal?: AbortSignal): Promise<VaultDepositRequest[]> =>
  collectPages((cursor) => fetchVaultDepositRequests(pda, { cursor, limit: 100 }, signal));

export const fetchAllVaultWithdrawRequests = (pda: string, signal?: AbortSignal): Promise<VaultWithdrawRequest[]> =>
  collectPages((cursor) => fetchVaultWithdrawRequests(pda, { cursor, limit: 100 }, signal));

const COMPUTE_BUDGET_PROGRAM_ID = address("ComputeBudget111111111111111111111111111111");

export function withComputeUnitLimit(instructions: Instruction[], units: number): Instruction[] {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return [{ programAddress: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data }, ...instructions];
}

export function capitalBatchComputeUnits(users: number): number {
  const n = Math.min(users, flows.VAULT_CAPITAL_BATCH_USERS);
  return 40_000 + n * 13_000 + 2 * n * 25_000 + 28 * n * 1_800;
}

async function batched(
  users: Address[],
  build: (batch: Address[]) => Promise<Instruction>,
): Promise<Instruction[][]> {
  const txs: Instruction[][] = [];
  for (let i = 0; i < users.length; i += flows.VAULT_CAPITAL_BATCH_USERS) {
    const batch = users.slice(i, i + flows.VAULT_CAPITAL_BATCH_USERS);
    txs.push(withComputeUnitLimit([await build(batch)], capitalBatchComputeUnits(batch.length)));
  }
  return txs;
}

export type CapitalStepContext = {
  rpc: Rpc<SolanaRpcApiMainnet>;
  manager: VaultManager;
  vault: Vault;
  signal?: AbortSignal;
};

/** One entry per transaction, sent in order; an empty list means nothing to do. */
export async function buildCapitalStepTransactions(
  step: flows.CapitalStep,
  ctx: CapitalStepContext,
): Promise<Instruction[][]> {
  const { rpc, manager, vault, signal } = ctx;
  switch (step) {
    case "close_deposits":
      if (vault.pending_deposit_count > 0 || vault.pending_withdraw_count > 0) await resolveVaultPriceUpdates(rpc, manager);
      return [[manager.setAcceptingDeposits(false)]];
    case "open_deposits":
      return [[manager.setAcceptingDeposits(true)]];
    case "compute_equity": {
      const prices = await resolveVaultPriceUpdates(rpc, manager);
      return [[manager.processEquity(prices.mainPriceUpdate, prices.secondPriceUpdate)]];
    }
    case "process_deposits": {
      const users = (await fetchAllVaultDepositRequests(vault.vault_pda, signal)).map((r) => address(r.wallet));
      return batched(users, (batch) => manager.processDeposits(batch));
    }
    case "process_withdrawals":
      return buildWithdrawalTransactions(ctx);
    case "finalize_cycle":
      return [[manager.finalizeCycle()]];
  }
}

async function buildWithdrawalTransactions({ rpc, manager, vault, signal }: CapitalStepContext): Promise<Instruction[][]> {
  const [requests, supply] = await Promise.all([
    fetchAllVaultWithdrawRequests(vault.vault_pda, signal),
    rpc.getTokenSupply(manager.shareMint, { commitment: "confirmed" }).send({ abortSignal: signal }),
  ]);
  const plan = flows.planWithdrawals(
    requests.map((r) => ({ user: address(r.wallet), shares: BigInt(r.shares) })),
    BigInt(supply.value.amount),
  );
  const txs = await batched(plan.partial, (batch) => manager.processWithdrawals(batch));
  if (
    plan.finalUser &&
    txs.length === 0 &&
    (vault.pending_deposit_count === 0 || vault.safety === "withdraw_only")
  ) {
    txs.push(withComputeUnitLimit([await manager.processFinalWithdrawal(plan.finalUser)], capitalBatchComputeUnits(1)));
  }
  return txs;
}
