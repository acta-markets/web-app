import { fetchAllMaybeMarket, fetchAllMaybePosition, fetchMarket, fetchPosition } from "@acta-markets/ts-sdk";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  closeTokenAccountInstruction,
  decodeTokenAccount,
  deriveAta,
  flows,
  getActaProgramId,
} from "@acta-markets/ts-sdk/chain";
import { address, createNoopSigner, fetchEncodedAccounts, isAddress, type Address, type Instruction, type Rpc, type SolanaRpcApiMainnet } from "@solana/kit";
import { withRetry } from "@/lib/async-pool";

/** As many accounts as one `getMultipleAccounts` request takes. */
const ACCOUNTS_PER_READ = 100;

async function readAll<T>(read: (addresses: Address[]) => Promise<T[]>, addresses: Address[]): Promise<T[]> {
  const chunks: Address[][] = [];
  for (let i = 0; i < addresses.length; i += ACCOUNTS_PER_READ) chunks.push(addresses.slice(i, i + ACCOUNTS_PER_READ));
  return (await Promise.all(chunks.map((chunk) => withRetry(() => read(chunk))))).flat();
}

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

/** A position's deposit, or why the chain will not take one for it. */
export type BuyDepositGroup = { instructions: Instruction[] } | { skipped: string };

/**
 * The same for many positions at once: one entry per position, in the order given. The
 * accounts are read a hundred to a request, so thirty options are two requests (their
 * positions, their markets) where one position at a time made sixty. A public RPC answers
 * about forty of one kind in ten seconds, and past that the batch used to fail before the
 * wallet was asked.
 *
 * A row can be behind the chain: a position already funded, settled or closed. That one is
 * returned as skipped, with the reason, so it does not take the others down with it.
 */
export async function buildBuyDepositGroups(
  rpc: Rpc<SolanaRpcApiMainnet>,
  owner: string,
  positions: ReadonlyArray<{ pda: string; market: string }>,
): Promise<BuyDepositGroup[]> {
  const holder = address(owner);
  // a row whose addresses are not addresses is skipped like any other the chain cannot serve
  const readable = positions.filter((p) => isAddress(p.pda) && isAddress(p.market));
  const marketAddresses = [...new Set(readable.map((p) => p.market))].map((market) => address(market));
  const [positionAccounts, marketAccounts] = await Promise.all([
    readAll((chunk) => fetchAllMaybePosition(rpc, chunk, { commitment: "confirmed" }), readable.map((p) => address(p.pda))),
    readAll((chunk) => fetchAllMaybeMarket(rpc, chunk, { commitment: "confirmed" }), marketAddresses),
  ]);
  const positionsByAddress = new Map(positionAccounts.map((account) => [account.address as string, account]));
  const markets = new Map(marketAccounts.map((account) => [account.address as string, account]));
  return Promise.all(
    positions.map(async (p): Promise<BuyDepositGroup> => {
      if (!isAddress(p.pda) || !isAddress(p.market)) return { skipped: "position not found on chain" };
      const position = positionsByAddress.get(p.pda);
      const market = markets.get(p.market);
      if (!position?.exists) return { skipped: "position not found on chain" };
      if (!market?.exists) return { skipped: "market not found on chain" };
      try {
        const { ixs } = await flows.buildDepositFundsIxs({
          programId: getActaProgramId(),
          payer: holder,
          owner: createNoopSigner(holder),
          position: position.data,
          market: market.data,
        });
        return { instructions: ixs };
      } catch (err) {
        return { skipped: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}

/**
 * Takes a funded option's deposit back before expiry, from the live accounts; the position is
 * Open again and can be funded again.
 *
 * The program returns a put on SOL as wrapped SOL. Funding always wraps fresh SOL, so wrapped
 * SOL left behind would sit unused: when the wallet held none before, the same transaction
 * closes the token account and the SOL is back in the balance it came from. Wrapped SOL the
 * wallet already held is not touched, and the deposit joins it.
 */
export async function buildBuyWithdrawInstructions(
  rpc: Rpc<SolanaRpcApiMainnet>,
  owner: string,
  { pda, market }: { pda: string; market: string },
): Promise<Instruction[]> {
  const holder = address(owner);
  const [position, marketAccount, wrappedSolAta] = await Promise.all([
    fetchPosition(rpc, address(pda), { commitment: "confirmed" }),
    fetchMarket(rpc, address(market), { commitment: "confirmed" }),
    deriveAta({ owner: holder, mint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID }),
  ]);
  const { ixs, destinationAta } = await flows.buildWithdrawFundsIxs({
    programId: getActaProgramId(),
    payer: holder,
    owner: createNoopSigner(holder),
    position: position.data,
    market: marketAccount.data,
  });
  if (destinationAta !== wrappedSolAta) return ixs;
  const [account] = await fetchEncodedAccounts(rpc, [wrappedSolAta], { commitment: "confirmed" });
  const held = account.exists ? decodeTokenAccount(account.data).amount : 0n;
  return held === 0n ? [...ixs, closeTokenAccountInstruction(wrappedSolAta, holder, holder)] : ixs;
}
