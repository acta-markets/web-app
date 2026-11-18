"use client";

import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useRestoreWallet } from "@/lib/state/remembered";

/** Loads the returning wallet's saved data the moment the app knows who it is. Renders nothing. */
export function RestoreWalletData() {
  const { selectedAccount, expectedAccount } = useSolana();
  useRestoreWallet(selectedAccount?.address ?? expectedAccount?.address ?? null);
  return null;
}
