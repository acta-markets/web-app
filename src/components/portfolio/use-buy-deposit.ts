"use client";

import { useCallback, useState } from "react";
import { useSolana } from "@/components/solana/solana-wallet-provider";

type Fundable = { pda: string; market: string };

const NONE: ReadonlySet<string> = new Set();

function without(set: ReadonlySet<string>, pdas: readonly string[]): ReadonlySet<string> {
  if (!pdas.some((pda) => set.has(pda))) return set;
  const next = new Set(set);
  for (const pda of pdas) next.delete(pda);
  return next;
}

/**
 * Wallet-paid funding, one position or several, and taking one deposit back. `funded` covers
 * confirmed deposits until the listener's Funded row arrives, `withdrawn` the same for a
 * deposit taken back; `pending` holds the positions being signed or confirmed and `action`
 * says which of the two it is.
 */
export function useBuyDeposit(onFunded: () => void) {
  const { rpc, selectedAccount, signTransaction, signAllTransactions } = useSolana();
  const owner = selectedAccount?.address;
  const [pending, setPending] = useState<ReadonlySet<string>>(NONE);
  const [action, setAction] = useState<"fund" | "withdraw" | null>(null);
  const [funded, setFunded] = useState<ReadonlySet<string>>(new Set());
  const [withdrawn, setWithdrawn] = useState<ReadonlySet<string>>(NONE);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (positions: readonly Fundable[]) => {
      if (!owner || positions.length === 0) return;
      setPending(new Set(positions.map((p) => p.pda)));
      setAction("fund");
      setError(null);
      // what a failure may have left behind depends on how far it got
      let sent = false;
      let several = false;
      let fundedNow: string[] = [];
      const onSending = () => {
        sent = true;
      };
      try {
        const [{ buildBuyDepositBatch }, { sendWalletTransaction, sendWalletTransactions }] = await Promise.all([
          import("@/lib/trade/buy-deposit"),
          import("@/lib/vaults/transaction"),
        ]);
        // Every position's accounts come from two reads in all, and the SDK packs the deposits
        // several to a transaction, in the order given, so the soonest expiry lands first.
        // Thirty options used to be sixty reads and thirty transactions, which a public RPC
        // refuses for rate before the wallet is ever asked. A batch is approved once.
        const { transactions, funded: fundable, skipped: leftOut } = await buildBuyDepositBatch(rpc, owner, positions);
        // A row behind the chain (already funded, settled, closed) is left out, not allowed to
        // fail the rest. If that leaves nothing, its reason is the error.
        const skipped = leftOut.map((entry) => entry.reason);
        if (transactions.length === 0) throw new Error(skipped[0] ?? "nothing to fund");
        several = transactions.length > 1;
        if (several) await sendWalletTransactions({ rpc, feePayer: owner, transactions, signAllTransactions, onSending });
        else await sendWalletTransaction({ rpc, feePayer: owner, instructions: transactions[0], signTransaction, onSending });
        fundedNow = fundable;
        if (skipped.length > 0) {
          const { describeSkippedPosition } = await import("@/lib/vaults/tx-errors");
          const reasons = [...new Set(skipped.map(describeSkippedPosition))].join("; ");
          setError(`${skipped.length} of ${positions.length} options were left out: ${reasons}. The rest are funded.`);
        }
        setFunded((current) => {
          const next = new Set(current);
          for (const pda of fundedNow) next.add(pda);
          return next;
        });
        setWithdrawn((current) => without(current, fundedNow));
        onFunded();
      } catch (err) {
        console.error("[Portfolio] funding failed", err);
        const { describeNotSent, describeVaultTxError } = await import("@/lib/vaults/tx-errors");
        const { message } = describeVaultTxError(err);
        if (!sent) {
          // it stopped while preparing, simulating or signing: say that, and why
          setError(describeNotSent(err));
        } else {
          // Several transactions can fail part way: the ones sent before the failure may have
          // landed, and only the listener knows which. Say so and reload instead of guessing.
          setError(several ? `${message} Options funded before it may have gone through; the list updates in a moment.` : message);
          if (several) onFunded();
        }
      } finally {
        setPending(NONE);
        setAction(null);
      }
    },
    [owner, rpc, signTransaction, signAllTransactions, onFunded],
  );

  const deposit = useCallback((position: Fundable) => send([position]), [send]);

  /** Takes one funded option's deposit back; it is Open again and can be funded again before expiry. */
  const withdraw = useCallback(
    async (position: Fundable) => {
      if (!owner) return;
      setPending(new Set([position.pda]));
      setAction("withdraw");
      setError(null);
      try {
        const [{ buildBuyWithdrawInstructions }, { sendWalletTransaction }, { withRetry }] = await Promise.all([
          import("@/lib/trade/buy-deposit"),
          import("@/lib/vaults/transaction"),
          import("@/lib/async-pool"),
        ]);
        const instructions = await withRetry(() => buildBuyWithdrawInstructions(rpc, owner, position));
        await sendWalletTransaction({ rpc, feePayer: owner, instructions, signTransaction });
        setFunded((current) => without(current, [position.pda]));
        setWithdrawn((current) => new Set(current).add(position.pda));
        onFunded();
      } catch (err) {
        const { describeVaultTxError } = await import("@/lib/vaults/tx-errors");
        setError(describeVaultTxError(err).message);
      } finally {
        setPending(NONE);
        setAction(null);
      }
    },
    [owner, rpc, signTransaction, onFunded],
  );

  return { deposit, depositAll: send, withdraw, pending, action, funded, withdrawn, error };
}
