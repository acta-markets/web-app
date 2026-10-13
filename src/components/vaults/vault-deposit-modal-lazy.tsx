"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

/**
 * The modal carries the whole transaction stack (web3.js, depositor and SDK
 * builders), which read-only vault pages do not need until someone clicks.
 */
export const LazyVaultDepositModal = dynamic(
  () => import("./vault-deposit-modal").then((m) => m.VaultDepositModal),
  { ssr: false },
);

/** Fetches the modal's code in the background after the page is up, so the first click does not wait. */
export function usePrefetchVaultModal() {
  useEffect(() => {
    void import("./vault-deposit-modal");
  }, []);
}
