"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";
import { useSolana } from "@/components/solana/solana-wallet-provider";

export function ClarityProvider() {
  useEffect(() => {
    Clarity.init("vxbh1tahoa");
  }, []);

  const { selectedAccount, isConnected } = useSolana();

  useEffect(() => {
    if (isConnected && selectedAccount?.address) {
      Clarity.identify(selectedAccount.address);
    }
  }, [isConnected, selectedAccount?.address]);

  return null;
}
