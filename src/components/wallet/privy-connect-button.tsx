"use client";

import { useMemo, useState } from "react";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { AppButton } from "@/components/app-ui/app-button";
import { Loader2, Unlink } from "lucide-react";

function shortAddress(addr: string, left = 4, right = 4) {
  if (!addr) return "";
  if (addr.length <= left + right + 3) return addr;
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export function PrivyConnectButton() {
  const privyConfigured = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const { ready, authenticated, linkWallet } = usePrivy();
  const { wallets } = useWallets();

  const [disconnecting, setDisconnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<null | { address: string; disconnect?: () => void }>(
    null
  );

  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      setLastError(null);
      setConnectedWallet({ address: wallet.address, disconnect: wallet.disconnect });
    },
    onError: (code) => {
      console.error("[Privy] connectWallet error:", code);
      setLastError(String(code));
    }
  });

  const wallet = wallets[0] ?? (connectedWallet ? ({ address: connectedWallet.address } as const) : null);

  const label = useMemo(() => {
    if (!wallet) return "Connect";
    return shortAddress(wallet.address, 4, 4);
  }, [wallet]);

  async function disconnect() {
    if (!wallets[0] && !connectedWallet) return;
    setDisconnecting(true);
    try {
      // If authenticated + linked wallet, unlink it (best-effort).
      if (wallets[0]) await wallets[0].unlink();
    } catch {}
    try {
      // ConnectedWallet.disconnect() is best-effort/no-op for some wallets.
      if (wallets[0]) wallets[0].disconnect();
      if (connectedWallet?.disconnect) connectedWallet.disconnect();
    } catch {}
    setConnectedWallet(null);
    setDisconnecting(false);
  }

  const disabled = !privyConfigured || !ready;
  const disabledTitle = !privyConfigured
    ? "Set NEXT_PUBLIC_PRIVY_APP_ID to enable wallet connect."
    : lastError
      ? `Privy error: ${lastError} (see console)`
      : undefined;

  if (!wallet) {
    return (
      <AppButton
        type="button"
        variant="primary"
        onClick={() => connectWallet({ walletChainType: "solana-only" })}
        disabled={disabled}
        title={disabledTitle}
      >
        {label}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chevron-right-duo-dark.svg" alt="" className="h-5 w-5" />
      </AppButton>
    );
  }

  // Connected state: show address + a disconnect action.
  return (
    <div className="inline-flex items-center">
      <AppButton
        type="button"
        variant="secondary"
        onClick={() =>
          authenticated ? linkWallet({ walletChainType: "solana-only" }) : connectWallet({ walletChainType: "solana-only" })
        }
        disabled={disabled}
        title={disabledTitle}
        className="backdrop-blur-[4px]"
      >
        {label}
      </AppButton>
      <AppButton
        type="button"
        variant="secondary"
        onClick={disconnect}
        disabled={disabled || disconnecting}
        className="border-l border-bg-border px-3 backdrop-blur-[4px]"
        title="Disconnect wallet"
        aria-label="Disconnect wallet"
      >
        {disconnecting ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Unlink className="h-5 w-5" aria-hidden="true" />
        )}
      </AppButton>
    </div>
  );
}


