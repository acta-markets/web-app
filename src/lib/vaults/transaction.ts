import { VersionedTransaction } from "@solana/web3.js";
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
  type Instruction,
  type Rpc,
  type Signature,
  type SolanaRpcApiMainnet,
} from "@solana/kit";

const CONFIRM_POLL_MS = 1_000;

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
  abortSignal?: AbortSignal;
};

export async function sendWalletTransaction(args: SendWalletTransactionArgs): Promise<Signature> {
  const [signature] = await sendWalletTransactions({
    ...args,
    transactions: [args.instructions],
    signAllTransactions: async ([transaction]) => [await args.signTransaction(transaction)],
  });
  return signature;
}

export type SendWalletTransactionsArgs = {
  rpc: Rpc<SolanaRpcApiMainnet>;
  feePayer: string;
  transactions: Instruction[][];
  signAllTransactions: (transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
  abortSignal?: AbortSignal;
};

export async function sendWalletTransactions(args: SendWalletTransactionsArgs): Promise<Signature[]> {
  const { rpc, abortSignal } = args;
  if (args.transactions.length === 0) return [];
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
  await Promise.all(
    compiled.map(async (transaction) => {
      const { value } = await rpc
        .simulateTransaction(getBase64EncodedWireTransaction(transaction), {
          encoding: "base64",
          sigVerify: false,
          commitment: "confirmed",
        })
        .send({ abortSignal });
      if (value.err) throw new Error(`simulation failed: ${(value.logs ?? []).join("\n")}`);
    }),
  );
  const signed = await args.signAllTransactions(
    compiled.map((transaction) => VersionedTransaction.deserialize(new Uint8Array(getTransactionEncoder().encode(transaction)))),
  );
  const signatures: Signature[] = [];
  for (const transaction of signed) {
    const wire = getBase64EncodedWireTransaction(getTransactionDecoder().decode(transaction.serialize()));
    signatures.push(
      await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send({ abortSignal }),
    );
  }
  await Promise.all(
    signatures.map((signature) => confirmSignature(rpc, signature, blockhash.lastValidBlockHeight, abortSignal)),
  );
  return signatures;
}

async function confirmSignature(
  rpc: Rpc<SolanaRpcApiMainnet>,
  signature: Signature,
  lastValidBlockHeight: bigint,
  abortSignal?: AbortSignal,
): Promise<void> {
  for (;;) {
    const { value } = await rpc.getSignatureStatuses([signature]).send({ abortSignal });
    const status = value[0];
    if (status?.err) throw new TransactionFailedError(signature, `transaction failed: ${JSON.stringify(status.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    const height = await rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal });
    if (height > lastValidBlockHeight) throw new TransactionFailedError(signature, "transaction expired");
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
}
