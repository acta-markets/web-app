import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, flows } from "@acta-markets/ts-sdk/chain";
import { address, createNoopSigner, getBase16Encoder, type Instruction } from "@solana/kit";
import type { Vault } from "./types";

/**
 * Building a vault's instructions: the planner for whoever processes requests, and the compute
 * budget prefix. Apart from `operator.ts` because that file also reads the vault API through the
 * app's own client; this one needs nothing but the vault, so the headless agent can use it.
 */

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

const COMPUTE_BUDGET_PROGRAM_ID = address("ComputeBudget111111111111111111111111111111");

export function withComputeUnitLimit(instructions: Instruction[], units: number): Instruction[] {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return [{ programAddress: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data }, ...instructions];
}
