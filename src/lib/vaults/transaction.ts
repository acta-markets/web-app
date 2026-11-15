import { VersionedTransaction, type VersionedMessage } from "@solana/web3.js";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type Instruction,
  type Rpc,
  type Signature,
  type SolanaRpcApiMainnet,
} from "@solana/kit";

import { isTransportError, mapLimit, withRetry } from "@/lib/async-pool";

const CONFIRM_POLL_MS = 1_000;
/**
 * How many RPC requests a batch keeps in flight. Thirty transactions simulated at once is
 * enough for a public RPC to drop or refuse a few, and one lost request used to fail them all.
 */
const RPC_CONCURRENCY = 4;

export class TransactionFailedError extends Error {
  constructor(
    readonly signature: string,
    message: string,
  ) {
    super(message);
    this.name = "TransactionFailedError";
  }
}

export type SendWalletTransactionArgs = {
  rpc: Rpc<SolanaRpcApiMainnet>;
  feePayer: string;
  instructions: Instruction[];
  signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  /** Called once, right before the transaction goes out: until then nothing was sent. */
  onSending?: () => void;
  abortSignal?: AbortSignal;
  assertBinding?: () => void;
};

export async function sendWalletTransaction(args: SendWalletTransactionArgs): Promise<Signature> {
  const [signature] = await sendWalletTransactions({
    ...args,
    transactions: [args.instructions],
    signAllTransactions: async ([transaction]) => [await args.signTransaction(transaction)],
  });
  return signature;
}

/**
 * Programs a wallet may add instructions for before it signs. Phantom does both on
 * `signTransaction` and `signAllTransactions`: a priority fee through the compute budget
 * program when the transaction sets none, and Lighthouse assertions, which fail the
 * transaction when it does not do what the wallet's preview showed. Neither can move anything:
 * the first takes no accounts, the second only reads them.
 */
const WALLET_ADDED_PROGRAMS: ReadonlySet<string> = new Set([
  "ComputeBudget111111111111111111111111111111",
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
]);

type FlatInstruction = { program: string; accounts: string[]; data: Uint8Array };

function flatInstructions(message: VersionedMessage): FlatInstruction[] | null {
  // an address table would hide accounts from this comparison; nothing built here uses one
  if (message.addressTableLookups.length > 0) return null;
  const keys = message.staticAccountKeys.map((key) => key.toBase58());
  return message.compiledInstructions.map((ix) => ({
    program: keys[ix.programIdIndex],
    accounts: ix.accountKeyIndexes.map((index) => keys[index]),
    data: ix.data,
  }));
}

function sameInstruction(a: FlatInstruction, b: FlatInstruction): boolean {
  return (
    a.program === b.program &&
    a.accounts.length === b.accounts.length &&
    a.accounts.every((account, i) => account === b.accounts[i]) &&
    a.data.length === b.data.length &&
    a.data.every((byte, i) => byte === b.data[i])
  );
}

/**
 * What a wallet did to a transaction between its simulation and its signature that this app
 * does not accept, in a few words; null when it did nothing it may not.
 *
 * A wallet may add instructions of its own (see `WALLET_ADDED_PROGRAMS`), which moves the
 * accounts around and changes every byte of the message, so the bytes cannot be compared.
 * What is held to instead: the same fee payer, signers and blockhash; every simulated
 * instruction still there, unchanged and in order; and nothing added for any other program.
 * What was simulated is therefore still what runs, with at most a fee setting and assertions
 * around it.
 */
export function walletChange(simulated: VersionedMessage, signed: VersionedMessage): string | null {
  const before = flatInstructions(simulated);
  const after = flatInstructions(signed);
  if (!before || !after) return "it uses an address lookup table";
  const signers = (message: VersionedMessage) =>
    message.staticAccountKeys.slice(0, message.header.numRequiredSignatures).map((key) => key.toBase58());
  const [was, is] = [signers(simulated), signers(signed)];
  if (was[0] !== is[0]) return "the fee payer changed";
  if (was.length !== is.length || was.some((signer) => !is.includes(signer))) return "the signers changed";
  if (simulated.recentBlockhash !== signed.recentBlockhash) return "the blockhash changed";
  let kept = 0;
  const foreign = new Set<string>();
  for (const ix of after) {
    if (kept < before.length && sameInstruction(ix, before[kept])) kept++;
    else if (!WALLET_ADDED_PROGRAMS.has(ix.program)) foreign.add(ix.program);
  }
  if (kept < before.length) return "an instruction was changed or removed";
  if (foreign.size > 0) return `it added instructions for ${[...foreign].join(", ")}`;
  return null;
}

export type SendWalletTransactionsArgs = {
  rpc: Rpc<SolanaRpcApiMainnet>;
  feePayer: string;
  transactions: Instruction[][];
  signAllTransactions: (transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
  /** Called once, right before the first transaction goes out: until then nothing was sent. */
  onSending?: () => void;
  abortSignal?: AbortSignal;
  assertBinding?: () => void;
};

/**
 * A transaction may be 1232 bytes on the wire. A packed one stops well short of it, so a
 * wallet that adds instructions of its own before signing still has the room.
 */
const PACKED_TRANSACTION_BYTES = 1_000;
/** Only the size matters while packing, so any well-formed blockhash stands in for the real one. */
const SIZING_LIFETIME = { blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 0n };

function wireSize(feePayer: string, instructions: Instruction[]): number {
  try {
    const compiled = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(address(feePayer), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(SIZING_LIFETIME, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
      ),
    );
    return getTransactionEncoder().encode(compiled).length;
  } catch {
    // too many accounts or instructions to compile at all: too big by any measure
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Fills transactions with whole groups of instructions, in order, as many groups to a
 * transaction as fit `maxBytes`. A group is never split, so what belongs together (a token
 * account and the deposit into it) lands or fails together; a group too big on its own still
 * gets a transaction to itself. Thirty deposits become a handful of transactions: fewer to
 * approve on a hardware wallet, fewer fees and far fewer requests to the RPC.
 */
export function packInstructionGroups(
  feePayer: string,
  groups: ReadonlyArray<Instruction[]>,
  maxBytes = PACKED_TRANSACTION_BYTES,
): Instruction[][] {
  const packed: Instruction[][] = [];
  let current: Instruction[] = [];
  for (const group of groups) {
    if (current.length > 0 && wireSize(feePayer, [...current, ...group]) > maxBytes) {
      packed.push(current);
      current = [];
    }
    current = [...current, ...group];
  }
  if (current.length > 0) packed.push(current);
  return packed;
}

export async function sendWalletTransactions(args: SendWalletTransactionsArgs): Promise<Signature[]> {
  const { rpc, abortSignal } = args;
  if (args.transactions.length === 0) return [];
  args.assertBinding?.();
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send({ abortSignal });
  const compiled = args.transactions.map((instructions) =>
    compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(address(args.feePayer), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
      ),
    ),
  );
  await mapLimit(compiled, RPC_CONCURRENCY, async (transaction) => {
    // A request that is dropped or refused is tried again. An error the simulation itself
    // reports is final: it is thrown outside the retry.
    const { value } = await withRetry(
      () =>
        rpc
          .simulateTransaction(getBase64EncodedWireTransaction(transaction), {
            encoding: "base64",
            sigVerify: false,
            commitment: "confirmed",
          })
          .send({ abortSignal }),
      { signal: abortSignal },
    );
    if (value.err) throw new Error(`simulation failed: ${(value.logs ?? []).join("\n")}`);
  });
  const unsigned = compiled.map(transaction =>
    VersionedTransaction.deserialize(new Uint8Array(getTransactionEncoder().encode(transaction))));
  // kept apart from what the wallet is handed, which it may change in place
  const simulated = unsigned.map(transaction => VersionedTransaction.deserialize(transaction.serialize()).message);
  args.assertBinding?.();
  const signed = await args.signAllTransactions(unsigned);
  args.assertBinding?.();
  if (signed.length !== simulated.length) throw new Error("Wallet returned an unexpected transaction count");
  signed.forEach((transaction, index) => {
    const change = walletChange(simulated[index], transaction.message);
    if (change) throw new Error(`Wallet changed the simulated transaction: ${change}`);
  });
  const signatures: Signature[] = [];
  args.onSending?.();
  for (const transaction of signed) {
    args.assertBinding?.();
    const wire = getBase64EncodedWireTransaction(getTransactionDecoder().decode(transaction.serialize()));
    signatures.push(
      // The same signed bytes are the same transaction however often they are sent, so a send
      // the RPC refused for rate or dropped is sent again. A transaction it rejected is not.
      await withRetry(
        () => rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send({ abortSignal }),
        { when: isTransportError, signal: abortSignal },
      ),
    );
  }
  await confirmSignatures(rpc, signatures, blockhash.lastValidBlockHeight, abortSignal);
  return signatures;
}

/**
 * Waits until every signature is confirmed, with one status request per poll however many
 * there are: a loop per signature made a batch of thirty ask sixty questions a second.
 */
async function confirmSignatures(
  rpc: Rpc<SolanaRpcApiMainnet>,
  signatures: readonly Signature[],
  lastValidBlockHeight: bigint,
  abortSignal?: AbortSignal,
): Promise<void> {
  let pending = [...signatures];
  for (;;) {
    const { value } = await withRetry(() => rpc.getSignatureStatuses(pending).send({ abortSignal }), { signal: abortSignal });
    const waiting: Signature[] = [];
    pending.forEach((signature, index) => {
      const status = value[index];
      if (status?.err) throw new TransactionFailedError(signature, `transaction failed: ${JSON.stringify(status.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
      if (status?.confirmationStatus !== "confirmed" && status?.confirmationStatus !== "finalized") waiting.push(signature);
    });
    if (waiting.length === 0) return;
    pending = waiting;
    const height = await withRetry(() => rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal }), { signal: abortSignal });
    if (height > lastValidBlockHeight) throw new TransactionFailedError(pending[0], "transaction expired");
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
}
