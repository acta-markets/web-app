"use client";

import { useState } from "react";
import { Loader2, Unlink } from "lucide-react";
import { useSolana } from "./solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { AppButton } from "@/components/app-ui/app-button";

interface SolanaConnectButtonProps {
  fullWidth?: boolean;
}

export function SolanaConnectButton({ fullWidth = false }: SolanaConnectButtonProps) {
  const { selectedAccount, isConnected, isReady, disconnectWallet } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const [disconnecting, setDisconnecting] = useState(false);
  
  const handleDisconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisconnecting(true);
    try {
      await disconnectWallet();
    } finally {
      setDisconnecting(false);
    }
  };
  
  // Show loading state while wallet standard initializes
  if (!isReady) {
    return (
      <AppButton variant="secondary" disabled className={fullWidth ? "w-full" : ""}>
        Loading...
      </AppButton>
    );
  }
  
  if (isConnected && selectedAccount) {
    const shortAddress = `${selectedAccount.address.slice(0, 4)}...${selectedAccount.address.slice(-4)}`;
    
    return (
      <div className={`inline-flex items-center ${fullWidth ? "w-full" : ""}`}>
        <AppButton 
          variant="secondary" 
          onClick={openSidebar}
          className={`rounded-r-none ${fullWidth ? "flex-1" : ""}`}
        >
          {shortAddress}
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="rounded-l-none border-l-0 px-3 dark:border-white/10"
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
  
  return (
    <AppButton 
      variant="primary" 
      onClick={openSidebar}
      className={fullWidth ? "w-full" : ""}
    >
      Connect
    </AppButton>
  );
}
