"use client";

import { useCallback, useState } from "react";
import { useSolana } from "@/components/solana/solana-wallet-provider";

type Fundable = { pda: string; market: string };

const NONE: ReadonlySet<string> = new Set();

/**
 * Wallet-paid funding, one position or several. `funded` covers confirmed deposits until the
 * listener's Funded row arrives; `pending` holds the positions being signed or confirmed.
 */
export function useBuyDeposit(onFunded: () => void) {
  const { rpc, selectedAccount, signTransaction, signAllTransactions } = useSolana();
  const owner = selectedAccount?.address;
  const [pending, setPending] = useState<ReadonlySet<string>>(NONE);
  const [funded, setFunded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (positions: readonly Fundable[]) => {
      if (!owner || positions.length === 0) return;
      const batch = positions.length > 1;
      setPending(new Set(positions.map((p) => p.pda)));
      setError(null);
      try {
        const [{ buildBuyDepositInstructions }, { sendWalletTransaction, sendWalletTransactions }] = await Promise.all([
          import("@/lib/trade/buy-deposit"),
          import("@/lib/vaults/transaction"),
        ]);
        // One transaction per position. A batch is approved once in the wallet and sent in the
        // order given, so the soonest expiry lands first.
        const transactions = await Promise.all(positions.map((p) => buildBuyDepositInstructions(rpc, owner, p)));
        if (batch) await sendWalletTransactions({ rpc, feePayer: owner, transactions, signAllTransactions });
        else await sendWalletTransaction({ rpc, feePayer: owner, instructions: transactions[0], signTransaction });
        setFunded((current) => {
          const next = new Set(current);
          for (const p of positions) next.add(p.pda);
          return next;
        });
        onFunded();
      } catch (err) {
        const { describeVaultTxError } = await import("@/lib/vaults/tx-errors");
        const { message } = describeVaultTxError(err);
        // A batch can fail part way: the deposits sent before the failure may have landed, and
        // only the listener knows which. Say so and reload instead of guessing.
        const partial = batch && !message.endsWith("Nothing was sent.");
        setError(partial ? `${message} Options funded before it may have gone through; the list updates in a moment.` : message);
        if (partial) onFunded();
      } finally {
        setPending(NONE);
      }
    },
    [owner, rpc, signTransaction, signAllTransactions, onFunded],
  );

  const deposit = useCallback((position: Fundable) => send([position]), [send]);

  return { deposit, depositAll: send, pending, funded, error };
}
