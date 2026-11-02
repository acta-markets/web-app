"use client";

import { useCallback, useState } from "react";
import { useSolana } from "@/components/solana/solana-wallet-provider";

/** Wallet-paid funding. `funded` covers confirmed deposits until the listener's Funded row arrives. */
export function useBuyDeposit(onFunded: () => void) {
  const { rpc, selectedAccount, signTransaction } = useSolana();
  const owner = selectedAccount?.address;
  const [pending, setPending] = useState<string | null>(null);
  const [funded, setFunded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (position: { pda: string; market: string }) => {
      if (!owner) return;
      setPending(position.pda);
      setError(null);
      try {
        const [{ buildBuyDepositInstructions }, { sendWalletTransaction }] = await Promise.all([
          import("@/lib/trade/buy-deposit"),
          import("@/lib/vaults/transaction"),
        ]);
        await sendWalletTransaction({
          rpc,
          feePayer: owner,
          instructions: await buildBuyDepositInstructions(rpc, owner, position),
          signTransaction,
        });
        setFunded((current) => new Set(current).add(position.pda));
        onFunded();
      } catch (err) {
        const { describeVaultTxError } = await import("@/lib/vaults/tx-errors");
        setError(describeVaultTxError(err).message);
      } finally {
        setPending(null);
      }
    },
    [owner, rpc, signTransaction, onFunded],
  );

  return { deposit, pending, funded, error };
}
