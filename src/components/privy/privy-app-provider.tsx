"use client";

import { useEffect, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const solanaConnectors = useMemo(() => {
    return toSolanaWalletConnectors({ shouldAutoConnect: true });
  }, []);

  useEffect(() => {
    if (!appId) return;
    solanaConnectors.onMount();
    return () => solanaConnectors.onUnmount();
  }, [appId, solanaConnectors]);

  // Allow the app to render even if Privy is not configured (button will be disabled).
  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          walletChainType: "solana-only",
          // Matches the "Detected" behavior from the screenshot, while still
          // allowing "Other wallets" (via wallet list overflow).
          walletList: [
            "detected_solana_wallets",
            "phantom",
            "solflare",
            "backpack",
            "jupiter",
            "wallet_connect_qr_solana"
          ]
        },
        externalWallets: {
          solana: { connectors: solanaConnectors }
        }
      }}
    >
      {children}
    </PrivyProvider>
  );
}


