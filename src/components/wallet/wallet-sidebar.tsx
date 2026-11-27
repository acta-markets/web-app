"use client";

import { TYPE_LINK } from "@/components/app-ui/type-styles";
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Loader2, Check, Copy, Users } from "lucide-react";
import { Chevron } from "@/components/app-ui/chevron";
import { useSolana, type Wallet as WalletType } from "@/components/solana/solana-wallet-provider";
import { cn } from "@/lib/cn";
import { numberFormat } from "@/lib/number-format";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { TOKENS, displayQuoteSymbol, getNetwork } from "@/lib/tokens";
import { lastUsedFirst } from "@/lib/wallet-memory";
import { shortAddress, solscanUrl } from "@/lib/vaults/format";
import { useTokenBalance } from "./use-token-balance";

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

export function WalletSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);

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

const LABEL = "font-mono text-[12px] font-medium leading-[1.2] text-content-tertiary";
// Only `accent-primary` takes an opacity (it is defined from RGB parts); a tint of any other
// token draws nothing, and on a border falls back to the text colour.
const ROW = "group flex w-full items-center gap-4 border border-bg-border p-4 transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/10";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary";

/** What a failed connection should say: a declined request is not an error to fix. */
function connectErrorMessage(walletName: string, err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  const text = err instanceof Error ? err.message : String(err);
  if (code === 4001 || /reject|declin|denied|cancel/i.test(text)) return `Connection declined in ${walletName}.`;
  return `Couldn't connect to ${walletName}. Unlock it and try again.`;
}

function WalletSidebar() {
  const { isOpen, closeSidebar } = useWalletSidebar();
  const { wallets, selectedWallet, selectedAccount, isConnecting, isReady, lastWalletName, connectWallet, disconnectWallet } = useSolana();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeSidebar]);

  // The panel stays in the page while closed so it can slide. `inert` keeps its buttons out of
  // the tab order and away from screen readers until it is open; focus goes in with it and
  // comes back to whatever opened it.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = !isOpen;
    if (!isOpen) {
      setConnectError(null);
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, [isOpen]);

  const handleConnect = async (wallet: WalletType) => {
    setConnectError(null);
    try {
      setConnectingWallet(wallet.name);
      await connectWallet(wallet);
      closeSidebar();
    } catch (e) {
      console.error("Failed to connect:", e);
      setConnectError(connectErrorMessage(wallet.name, e));
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    closeSidebar();
  };

  const isConnected = !!(selectedWallet && selectedAccount);
  const title = isConnected ? "Wallet" : "Connect wallet";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <aside
        ref={panelRef}
        className={cn(
          "app-type fixed right-0 top-0 z-[101] h-full w-full max-w-md",
          "bg-bg-primary border-l border-bg-border",
          "transform transition-transform duration-300 ease-out",
          "flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!isOpen}
      >
        <header className="flex items-center justify-between border-b border-bg-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-bg-border bg-accent-primary/20">
              <Wallet className="h-5 w-5 text-accent-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-mono text-xl font-semibold tracking-[-0.02em] text-content-primary">{title}</h2>
              <p className="font-mono text-xs text-content-tertiary">
                {isConnected ? `Connected with ${selectedWallet!.name}` : "Select a wallet to continue"}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeSidebar}
            className={cn("p-2 text-content-secondary transition-colors hover:bg-action-primary hover:text-content-primary", FOCUS)}
            aria-label="Close"
          >
            <Chevron kind="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!isReady ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent-primary" aria-hidden="true" />
              <p role="status" className="mt-4 font-mono text-[12px] text-content-secondary">Looking for wallets</p>
            </div>
          ) : isConnected ? (
            <ConnectedView
              wallet={selectedWallet!}
              account={selectedAccount!}
              active={isOpen}
              onDisconnect={handleDisconnect}
              onClose={closeSidebar}
            />
          ) : wallets.length === 0 ? (
            <EmptyWalletsView />
          ) : (
            <WalletListView
              wallets={wallets}
              onConnect={handleConnect}
              connectingWallet={connectingWallet}
              isConnecting={isConnecting}
              error={connectError}
              lastUsed={lastWalletName}
            />
          )}
        </div>

        {/* the terms are agreed to by connecting, so they are said before it and not after */}
        {isConnected ? null : (
          <footer className="border-t border-bg-border px-6 py-4">
            <p className="text-center font-mono text-xs text-content-tertiary">
              By connecting, you agree to our Terms of Service
            </p>
          </footer>
        )}
      </aside>
    </>
  );
}

/** One balance line. The read is on only while the panel is open, so a closed panel polls nothing. */
function BalanceRow({ owner, symbol, mint, decimals, fractionDigits }: { owner: string | undefined; symbol: string; mint: string; decimals: number; fractionDigits: number }) {
  const balance = useTokenBalance(owner, mint, decimals);
  const logo = getTokenLogoSrc(symbol);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt="" className="h-5 w-5 shrink-0 rounded-full" /> : null}
      <span className="font-mono text-[12px] text-content-primary">{symbol}</span>
      <span className="ml-auto font-mono text-[12px] tabular-nums text-content-primary">
        {balance == null ? (
          <span className="text-content-tertiary">—</span>
        ) : (
          numberFormat({ minimumFractionDigits: fractionDigits === 2 ? 2 : 0, maximumFractionDigits: fractionDigits }).format(balance)
        )}
      </span>
    </div>
  );
}

/**
 * The connected wallet: which one, its address once with a way to copy it and to look it up,
 * what it holds to trade with, then where to go and how to leave.
 */
export function ConnectedView({
  wallet,
  account,
  active,
  onDisconnect,
  onClose,
}: {
  wallet: { name: string; icon?: string };
  account: { address: string };
  /** The panel is open, so balances are worth reading. */
  active: boolean;
  onDisconnect: () => void | Promise<void>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const network = getNetwork();
  const owner = active ? account.address : undefined;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
    } catch {
      // no clipboard access (an insecure page, a denied permission): the address is on screen to select
    }
  };

  const goToReferrals = () => {
    onClose();
    router.push("/referrals");
  };

  const disconnect = async () => {
    setLeaving(true);
    try {
      await onDisconnect();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-accent-primary/30 bg-accent-primary/5 p-5">
        <div className="flex items-center gap-4">
          {wallet.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.icon} alt="" className="h-12 w-12 shrink-0" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-bg-border bg-accent-primary/20">
              <Wallet className="h-6 w-6 text-accent-primary" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono font-semibold text-content-primary">{wallet.name}</span>
              <span className="flex shrink-0 items-center gap-1 bg-accent-primary/20 px-2 py-0.5 font-mono text-xs font-medium text-accent-primary">
                <Check className="h-3 w-3" aria-hidden="true" />
                Connected
              </span>
            </div>
            {/* the short form to read, the whole address to copy or to check against the wallet */}
            <p className="mt-1 font-mono text-[12px] tabular-nums text-content-secondary" title={account.address}>
              {shortAddress(account.address, 6)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-accent-primary/20 pt-4">
          <button
            type="button"
            onClick={() => void copy()}
            className={cn(TYPE_LINK, "gap-1.5 text-[12px]", FOCUS)}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy address"}</span>
          </button>
          <a
            href={solscanUrl("account", account.address)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(TYPE_LINK, "text-[12px]", FOCUS)}
          >
            View on Solscan
            <Chevron kind="go" className="h-4 w-4" />
          </a>
        </div>
      </div>

      <section aria-label="Balances" className="space-y-3">
        <h3 className={LABEL}>Balances</h3>
        <div className="divide-y divide-bg-border border border-bg-border">
          <BalanceRow owner={owner} symbol={displayQuoteSymbol()} mint={TOKENS.USDC.mint[network]} decimals={TOKENS.USDC.decimals} fractionDigits={2} />
          <BalanceRow owner={owner} symbol="SOL" mint={TOKENS.SOL.mint[network]} decimals={TOKENS.SOL.decimals} fractionDigits={4} />
        </div>
      </section>

      <button type="button" onClick={goToReferrals} className={cn(ROW, FOCUS)}>
        <div className="flex h-10 w-10 items-center justify-center border border-bg-border bg-accent-primary/10">
          <Users className="h-5 w-5 text-accent-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 text-left">
          <div className="font-mono font-medium text-content-primary">Referrals</div>
          <div className="font-mono text-xs text-content-tertiary">Your invite code and stats</div>
        </div>
        <Chevron kind="next" className="h-5 w-5 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-accent-primary" />
      </button>

      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={leaving}
        className={cn(
          // the way out is here and nowhere else, but it is not the thing to press: an outline, red only in its words
          "w-full border border-bg-border px-4 py-3 font-mono font-semibold text-additional-red-primary transition-colors hover:border-additional-red-primary disabled:cursor-not-allowed disabled:opacity-60",
          FOCUS,
        )}
      >
        {leaving ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>
  );
}

export function WalletListView({
  wallets,
  onConnect,
  connectingWallet,
  isConnecting,
  error,
  lastUsed,
}: {
  wallets: Array<{ name: string; icon?: string }>;
  onConnect: (wallet: WalletType) => void;
  connectingWallet: string | null;
  isConnecting: boolean;
  /** Why the last attempt did not connect, in words for the user. */
  error?: string | null;
  /** The wallet this browser connected with last time: listed first and marked. */
  lastUsed?: string | null;
}) {
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
      {error ? (
        <p role="alert" className="border border-additional-orange-primary p-4 font-mono text-[12px] text-content-primary">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        {lastUsedFirst(wallets, lastUsed).map((wallet) => {
          const icon = getWalletIcon(wallet);
          const isLoading = connectingWallet === wallet.name;

          return (
            <button
              key={wallet.name}
              type="button"
              onClick={() => onConnect(wallet as WalletType)}
              disabled={isConnecting}
              className={cn(
                ROW,
                FOCUS,
                "disabled:cursor-not-allowed disabled:opacity-50",
                isLoading && "border-accent-primary/50 bg-accent-primary/10"
              )}
            >
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="h-10 w-10" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center border border-bg-border bg-bg-primary">
                  <Wallet className="h-5 w-5 text-content-secondary" aria-hidden="true" />
                </div>
              )}
              <span className="flex-1 text-left font-mono font-medium text-content-primary">
                {wallet.name}
              </span>
              {!isLoading && wallet.name === lastUsed ? <span className="font-mono text-xs text-content-secondary">Last used</span> : null}
              {isLoading ? (
                <>
                  <span className="font-mono text-xs text-content-secondary">Approve in wallet</span>
                  <Loader2 className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
                </>
              ) : (
                <Chevron kind="next" className="h-5 w-5 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-accent-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="border border-bg-border p-4">
        <p className="font-mono text-[12px] text-content-secondary">
          <span className="font-medium text-content-primary">New to Solana?</span>{" "}
          Install a wallet extension like Phantom or Backpack to get started.
        </p>
      </div>
    </div>
  );
}

export function EmptyWalletsView() {
  const popularWallets = [
    { name: "Phantom", url: "https://phantom.app", icon: "/wallets/phantom.png" },
    { name: "Backpack", url: "https://backpack.app", icon: "/wallets/backpack.png" },
    { name: "Solflare", url: "https://solflare.com", icon: "/wallets/solflare.png" },
  ];

  return (
    <div className="space-y-6">
      <div className="border border-bg-border p-5">
        <h3 className="font-mono font-semibold text-additional-orange-primary">No wallet detected</h3>
        <p className="mt-2 font-mono text-[12px] text-content-secondary">
          Install a Solana wallet extension, then reload this page to connect.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className={LABEL}>Popular wallets</h3>
        {popularWallets.map((wallet) => (
          <a key={wallet.name} href={wallet.url} target="_blank" rel="noopener noreferrer" className={cn(ROW, FOCUS)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wallet.icon} alt="" className="h-10 w-10" />
            <span className="flex-1 font-mono font-medium text-content-primary">{wallet.name}</span>
            <Chevron kind="go" className="h-5 w-5 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-accent-primary" />
          </a>
        ))}
      </div>
    </div>
  );
}
