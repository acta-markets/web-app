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

/** What funding several positions comes to: the transactions to sign, and what was left out. */
export type BuyDepositBatch = {
  /**
   * Whole transactions, the positions in the order given. The SDK fills each one (up to nine
   * deposits on one market, fewer across markets), leaves room for the two fee instructions a
   * wallet may add before signing, and wraps SOL once per transaction.
   */
  transactions: Instruction[][];
  /** The positions those transactions fund. */
  funded: string[];
  /** The positions the chain will not take a deposit for, each with the reason. */
  skipped: Array<{ pda: string; reason: string }>;
};

/**
 * The same for many positions at once. The accounts are read a hundred to a request, so
 * thirty options are two requests (their positions, their markets) where one position at a
 * time made sixty. A public RPC answers about forty of one kind in ten seconds, and past that
 * the batch used to fail before the wallet was asked.
 *
 * A row can be behind the chain: a position already funded, settled or closed. That one is
 * returned as skipped, with the reason, so it does not take the others down with it.
 */
export async function buildBuyDepositBatch(
  rpc: Rpc<SolanaRpcApiMainnet>,
  owner: string,
  positions: ReadonlyArray<{ pda: string; market: string }>,
): Promise<BuyDepositBatch> {
  const holder = address(owner);
  const common = { programId: getActaProgramId(), payer: holder, owner: createNoopSigner(holder) };
  // the SDK refuses a batch that names a position twice: it is funded once
  const unique = [...new Map(positions.map((p) => [p.pda, p])).values()];
  // a row whose addresses are not addresses is skipped like any other the chain cannot serve
  const readable = unique.filter((p) => isAddress(p.pda) && isAddress(p.market));
  const marketAddresses = [...new Set(readable.map((p) => p.market))].map((market) => address(market));
  const [positionAccounts, marketAccounts] = await Promise.all([
    readAll((chunk) => fetchAllMaybePosition(rpc, chunk, { commitment: "confirmed" }), readable.map((p) => address(p.pda))),
    readAll((chunk) => fetchAllMaybeMarket(rpc, chunk, { commitment: "confirmed" }), marketAddresses),
  ]);
  const positionsByAddress = new Map(positionAccounts.map((account) => [account.address as string, account]));
  const markets = new Map(marketAccounts.map((account) => [account.address as string, account]));

  const reasons = new Map<string, string>();
  const found = unique.flatMap((p) => {
    const position = isAddress(p.pda) && isAddress(p.market) ? positionsByAddress.get(p.pda) : undefined;
    const market = markets.get(p.market);
    if (!position?.exists) reasons.set(p.pda, "position not found on chain");
    else if (!market?.exists) reasons.set(p.pda, "market not found on chain");
    else return [{ pda: p.pda, position: position.data, market: market.data }];
    return [];
  });

  const batch = (items: typeof found) => (items.length === 0 ? [] : flows.buildDepositFundsBatchIxs({ ...common, items }).then((built) => built.transactions));
  let ready = found;
  let transactions: Instruction[][];
  try {
    transactions = await batch(ready);
  } catch (refused) {
    // One position the program will not fund refuses the whole batch, without saying which.
    // Ask for each on its own, leave the refused ones out and batch the rest.
    const refusals = await Promise.all(
      found.map((item) =>
        flows.buildDepositFundsIxs({ ...common, position: item.position, market: item.market }).then(
          () => null,
          (err: unknown) => (err instanceof Error ? err.message : String(err)),
        ),
      ),
    );
    // every position is fine on its own: the batch itself failed, and that is the error
    if (refusals.every((reason) => reason === null)) throw refused;
    found.forEach((item, index) => {
      const reason = refusals[index];
      if (reason !== null) reasons.set(item.pda, reason);
    });
    ready = found.filter((item) => !reasons.has(item.pda));
    transactions = await batch(ready);
  }
  return {
    transactions,
    funded: ready.map((item) => item.pda),
    skipped: unique.flatMap((p) => (reasons.has(p.pda) ? [{ pda: p.pda, reason: reasons.get(p.pda)! }] : [])),
  };
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
