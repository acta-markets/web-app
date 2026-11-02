import { fetchMarket, fetchPosition } from "@acta-markets/ts-sdk";
import { flows, getActaProgramId } from "@acta-markets/ts-sdk/chain";
import { address, createNoopSigner, type Instruction, type Rpc, type SolanaRpcApiMainnet } from "@solana/kit";

/** Reads the live accounts, so a stale portfolio row cannot fund a position that moved on. */
export async function buildBuyDepositInstructions(
  rpc: Rpc<SolanaRpcApiMainnet>,
  owner: string,
  { pda, market }: { pda: string; market: string },
): Promise<Instruction[]> {
  const [position, marketAccount] = await Promise.all([
    fetchPosition(rpc, address(pda), { commitment: "confirmed" }),
    fetchMarket(rpc, address(market), { commitment: "confirmed" }),
  ]);
  const { ixs } = await flows.buildDepositFundsIxs({
    programId: getActaProgramId(),
    payer: address(owner),
    owner: createNoopSigner(address(owner)),
    position: position.data,
    market: marketAccount.data,
  });
  return ixs;
}
