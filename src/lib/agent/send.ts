import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { Instruction, Rpc, SolanaRpcApiMainnet } from "@solana/kit";
import { sendWalletTransaction, TransactionFailedError } from "@/lib/vaults/transaction";
import { AgentError, plainText } from "./errors";
import type { ActaSession } from "./session";

/**
 * Sends a transaction the agent's own wallet pays for, the way the web app sends one: built on
 * a fresh blockhash, simulated first, signed, checked to be what was simulated, sent, and
 * awaited until confirmed. A fill is not sent here: the venue's keeper pays for that one.
 */
export async function sendFromWallet(session: ActaSession, instructions: Instruction[]): Promise<string> {
  const signer = session.signer;
  if (!signer) throw new AgentError("no_wallet", "This server has no wallet.", "stop");
  try {
    return await sendWalletTransaction({
      rpc: session.rpc as unknown as Rpc<SolanaRpcApiMainnet>,
      feePayer: signer.address,
      instructions,
      signTransaction: async (transaction) => {
        if (signer.signTransaction) {
          return VersionedTransaction.deserialize(await signer.signTransaction(transaction.serialize()));
        }
        transaction.addSignature(new PublicKey(signer.address), await signer.signMessage(transaction.message.serialize()));
        return transaction;
      },
    });
  } catch (error) {
    if (error instanceof AgentError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof TransactionFailedError) {
      throw new AgentError("transaction_failed", `The transaction was sent and failed on chain (${plainText(error.signature, 90)}). Nothing moved.`, "stop");
    }
    if (message.startsWith("simulation failed")) {
      // the program's own log lines: the last ones say which rule refused it
      const reason = plainText(message.split("\n").filter((line) => /error|failed|insufficient/i.test(line)).slice(-2).join("; "), 240);
      throw new AgentError("would_fail", `The chain would refuse this transaction, so it was not sent${reason ? `: ${reason}` : ""}.`, "fix_request");
    }
    throw new AgentError("send_failed", `The transaction could not be sent: ${plainText(message)}.`, "retry");
  }
}
