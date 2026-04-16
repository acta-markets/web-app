"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { X, Wallet, ChevronRight, Loader2, Check } from "lucide-react";
import { useSolana, type Wallet as WalletType } from "@/components/solana/solana-wallet-provider";
import { cn } from "@/lib/cn";

// Context for sidebar state
interface WalletSidebarContextValue {
  isOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

const WalletSidebarContext = createContext<WalletSidebarContextValue | undefined>(undefined);

export function useWalletSidebar() {
  const context = useContext(WalletSidebarContext);
  if (!context) {
    throw new Error("useWalletSidebar must be used within a WalletSidebarProvider");
  }
  return context;
}

// Provider component
export function WalletSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <WalletSidebarContext.Provider value={{ isOpen, openSidebar, closeSidebar }}>
      {children}
      <WalletSidebar />
    </WalletSidebarContext.Provider>
  );
}

// Sidebar component
function WalletSidebar() {
  const { isOpen, closeSidebar } = useWalletSidebar();
  const { wallets, selectedWallet, selectedAccount, isConnecting, isReady, connectWallet, disconnectWallet } = useSolana();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeSidebar]);

  const handleConnect = async (wallet: WalletType) => {
    try {
      setConnectingWallet(wallet.name);
      await connectWallet(wallet);
      closeSidebar();
    } catch (e) {
      console.error("Failed to connect:", e);
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    closeSidebar();
  };

  const isConnected = !!(selectedWallet && selectedAccount);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-[101] h-full w-full max-w-md",
          "bg-bg-primary border-l border-bg-border",
          "transform transition-transform duration-300 ease-out",
          "flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Connect Wallet"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-bg-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-bg-border bg-accent-primary/20">
              <Wallet className="h-5 w-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold tracking-tight text-content-primary">
                {isConnected ? "Wallet" : "Connect Wallet"}
              </h2>
              <p className="font-mono text-xs text-content-tertiary">
                {isConnected ? "Manage your connection" : "Select a wallet to continue"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSidebar}
            className="p-2 text-content-secondary transition-colors hover:bg-action-primary hover:text-content-primary"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!isReady ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
              <p className="mt-4 font-mono text-sm text-content-secondary">Detecting wallets...</p>
            </div>
          ) : isConnected ? (
            <ConnectedView
              wallet={selectedWallet!}
              account={selectedAccount!}
              onDisconnect={handleDisconnect}
            />
          ) : wallets.length === 0 ? (
            <EmptyWalletsView />
          ) : (
            <WalletListView
              wallets={wallets}
              onConnect={handleConnect}
              connectingWallet={connectingWallet}
              isConnecting={isConnecting}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-bg-border px-6 py-4">
          <p className="text-center font-mono text-xs text-content-tertiary">
            By connecting, you agree to our Terms of Service
          </p>
        </footer>
      </aside>
    </>
  );
}

// Connected wallet view
function ConnectedView({
  wallet,
  account,
  onDisconnect,
}: {
  wallet: { name: string; icon?: string };
  account: { address: string };
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Connected wallet card */}
      <div className="border border-accent-primary/30 bg-accent-primary/5 p-5">
        <div className="flex items-center gap-4">
          {wallet.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.icon} alt={wallet.name} className="h-12 w-12" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center border border-bg-border bg-accent-primary/20">
              <Wallet className="h-6 w-6 text-accent-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-content-primary">{wallet.name}</span>
              <span className="flex items-center gap-1 bg-accent-primary/20 px-2 py-0.5 font-mono text-xs font-medium text-accent-primary">
                <Check className="h-3 w-3" />
                Connected
              </span>
            </div>
            <p className="mt-1 truncate font-mono text-sm text-content-secondary">
              {account.address}
            </p>
          </div>
        </div>
      </div>

      {/* Address details */}
      <div className="space-y-3">
        <h3 className="font-mono text-sm font-medium text-content-secondary">Wallet Address</h3>
        <div className="border border-bg-border bg-action-primary/50 p-4">
          <p className="break-all font-mono text-sm text-content-primary">
            {account.address}
          </p>
        </div>
      </div>

      {/* Disconnect button */}
      <button
        type="button"
        onClick={onDisconnect}
        className="w-full border border-additional-red-primary/30 bg-additional-red-primary/10 px-4 py-3 font-mono font-semibold text-additional-red-primary transition-colors hover:bg-additional-red-primary/20"
      >
        Disconnect Wallet
      </button>
    </div>
  );
}

// Wallet list view
function WalletListView({
  wallets,
  onConnect,
  connectingWallet,
  isConnecting,
}: {
  wallets: Array<{ name: string; icon?: string }>;
  onConnect: (wallet: WalletType) => void;
  connectingWallet: string | null;
  isConnecting: boolean;
}) {
  // Map of known wallet icons as fallbacks
  const walletIcons: Record<string, string> = {
    phantom: "/wallets/phantom.png",
    backpack: "/wallets/backpack.png",
    solflare: "/wallets/solflare.png",
    "trust wallet": "/wallets/trust.png",
    brave: "/wallets/brave.png",
    jupiter: "/wallets/jupiter.png",
  };

  const getWalletIcon = (wallet: { name: string; icon?: string }) => {
    if (wallet.icon) return wallet.icon;
    const fallback = walletIcons[wallet.name.toLowerCase()];
    return fallback || null;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {wallets.map((wallet) => {
          const icon = getWalletIcon(wallet);
          const isLoading = connectingWallet === wallet.name || (isConnecting && connectingWallet === wallet.name);

          return (
            <button
              key={wallet.name}
              type="button"
              onClick={() => onConnect(wallet as WalletType)}
              disabled={isConnecting}
              className={cn(
                "group flex w-full items-center gap-4 border border-bg-border p-4",
                "bg-action-primary/30 transition-all duration-200",
                "hover:border-accent-primary/50 hover:bg-accent-primary/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isLoading && "border-accent-primary/50 bg-accent-primary/10"
              )}
            >
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt={wallet.name} className="h-10 w-10" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center border border-bg-border bg-bg-primary">
                  <Wallet className="h-5 w-5 text-content-secondary" />
                </div>
              )}
              <span className="flex-1 text-left font-mono font-medium text-content-primary">
                {wallet.name}
              </span>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
              ) : (
                <ChevronRight className="h-5 w-5 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-accent-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Info note */}
      <div className="border border-bg-border bg-action-primary/50 p-4">
        <p className="font-mono text-sm text-content-secondary">
          <span className="font-medium text-content-primary">New to Solana?</span>{" "}
          Install a wallet extension like Phantom or Backpack to get started.
        </p>
      </div>
    </div>
  );
}

// Empty wallets view
function EmptyWalletsView() {
  const popularWallets = [
    { name: "Phantom", url: "https://phantom.app", icon: "/wallets/phantom.png" },
    { name: "Backpack", url: "https://backpack.app", icon: "/wallets/backpack.png" },
    { name: "Solflare", url: "https://solflare.com", icon: "/wallets/solflare.png" },
  ];

  return (
    <div className="space-y-6">
      <div className="border border-additional-orange-primary/30 bg-additional-orange-primary/10 p-5">
        <h3 className="font-mono font-semibold text-additional-orange-primary">No Wallet Detected</h3>
        <p className="mt-2 font-mono text-sm text-content-secondary">
          Please install a Solana wallet extension to connect.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-mono text-sm font-medium text-content-secondary">Popular Wallets</h3>
        {popularWallets.map((wallet) => (
          <a
            key={wallet.name}
            href={wallet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 border border-bg-border bg-action-primary/30 p-4 transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wallet.icon} alt={wallet.name} className="h-10 w-10" />
            <span className="flex-1 font-mono font-medium text-content-primary">{wallet.name}</span>
            <ChevronRight className="h-5 w-5 text-content-tertiary" />
          </a>
        ))}
      </div>
    </div>
  );
}
