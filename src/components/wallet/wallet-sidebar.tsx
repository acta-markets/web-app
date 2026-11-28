"use client";

import { TYPE_LINK } from "@/components/app-ui/type-styles";
import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
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

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** How wide the menu is where there is room, and how far it keeps from its button and the window's edge. */
const MENU_WIDTH = 360;
const MENU_GAP = 8;
const MENU_EDGE = 12;

/**
 * The wallet menu: a small panel that drops down from whichever button asked for it (the
 * header's wallet button, Trade's "Connect wallet to trade", a vault's "Connect wallet"). It
 * covers nothing else and locks nothing: the page stays as it is, and a press anywhere outside,
 * or Escape, puts the menu away. The names (`openSidebar`, `closeSidebar`) are kept from the
 * side panel this replaced, so nothing that opens it had to change.
 */
export function WalletSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  // The control last pressed. A click does not focus a button in every browser, so the focused
  // element alone cannot say which button the menu belongs to.
  const pressedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const note = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>("button, a, [role='button']") : null;
      pressedRef.current = target;
    };
    window.addEventListener("pointerdown", note, true);
    return () => window.removeEventListener("pointerdown", note, true);
  }, []);

  const closeSidebar = useCallback(() => {
    openRef.current = false;
    setIsOpen(false);
  }, []);

  const openSidebar = useCallback(() => {
    const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const opener = pressedRef.current?.isConnected ? pressedRef.current : focused;
    // the button that opened it puts it away again
    if (openRef.current && opener != null && opener === anchorRef.current) return closeSidebar();
    anchorRef.current = opener;
    openRef.current = true;
    setAnchor(opener);
    setIsOpen(true);
  }, [closeSidebar]);

  return (
    <WalletSidebarContext.Provider value={{ isOpen, openSidebar, closeSidebar }}>
      {children}
      <WalletSidebar anchor={anchor} />
    </WalletSidebarContext.Provider>
  );
}

const LABEL = "font-mono text-[12px] font-medium leading-[1.2] text-content-tertiary";
// Only `accent-primary` takes an opacity (it is defined from RGB parts); a tint of any other
// token draws nothing, and on a border falls back to the text colour.
// A menu row: no frame of its own, the menu's lines divide them.
const ROW = "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent-primary/10";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary";

/** What a failed connection should say: a declined request is not an error to fix. */
function connectErrorMessage(walletName: string, err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  const text = err instanceof Error ? err.message : String(err);
  if (code === 4001 || /reject|declin|denied|cancel/i.test(text)) return `Connection declined in ${walletName}.`;
  return `Couldn't connect to ${walletName}. Unlock it and try again.`;
}

function WalletSidebar({ anchor }: { anchor: HTMLElement | null }) {
  const { isOpen, closeSidebar } = useWalletSidebar();
  const { wallets, selectedWallet, selectedAccount, isConnecting, isReady, lastWalletName, connectWallet, disconnectWallet } = useSolana();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    // a press outside the menu puts it away; a press on its own button is that button's to answer
    const handlePress = (e: PointerEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (!target || panelRef.current?.contains(target) || anchor?.contains(target)) return;
      closeSidebar();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePress, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePress, true);
    };
  }, [isOpen, anchor, closeSidebar]);

  // Under its button, right edges together, and always down: never above it. Where the window
  // has no room beneath, the menu is held inside the window rather than turned upward. It
  // follows the button while the page scrolls or the window changes, and is measured again
  // whenever its own content changes height.
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(MENU_WIDTH, vw - 2 * MENU_EDGE);
      const box = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
      const left = Math.max(MENU_EDGE, Math.min(box ? box.right - width : vw - width - MENU_EDGE, vw - width - MENU_EDGE));
      const top = Math.max(MENU_EDGE, Math.min(box ? box.bottom + MENU_GAP : MENU_EDGE, vh - panel.offsetHeight - MENU_EDGE));
      setPlace((was) => (was && was.top === top && was.left === left && was.width === width ? was : { top, left, width }));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const watcher = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    watcher?.observe(panel);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      watcher?.disconnect();
    };
  }, [isOpen, anchor]);

  // The menu stays in the page while closed so it can fade. `inert` keeps its buttons out of
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
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
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
    <div
      ref={panelRef}
      data-testid="wallet-menu"
      style={place ? { top: place.top, left: place.left, width: place.width } : { top: MENU_EDGE, right: MENU_EDGE, width: MENU_WIDTH }}
      className={cn(
        "app-type fixed z-[101] flex max-h-[calc(100dvh-24px)] flex-col border border-bg-border bg-bg-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)]",
        "origin-top transition-[opacity,transform] duration-150 ease-out",
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
      )}
      role="dialog"
      aria-label={title}
      aria-hidden={!isOpen}
    >
      <header className="flex items-center justify-between gap-3 border-b border-bg-border py-1 pl-4 pr-1">
        <h2 className={LABEL}>{title}</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={closeSidebar}
          className={cn("flex h-8 w-8 items-center justify-center text-content-tertiary transition-colors hover:text-content-primary", FOCUS)}
          aria-label="Close"
        >
          <Chevron kind="close" className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!isReady ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
            <p role="status" className="font-mono text-sm text-content-secondary">Looking for wallets</p>
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
        <footer className="border-t border-bg-border px-4 py-2.5">
          <p className="whitespace-nowrap font-mono text-[12px] leading-[1.3] tracking-[-0.02em] text-content-tertiary max-[380px]:whitespace-normal">
            By connecting, you agree to our Terms of Service
          </p>
        </footer>
      )}
    </div>
  );
}

/** One balance line. The read is on only while the panel is open, so a closed panel polls nothing. */
function BalanceRow({ owner, symbol, mint, decimals, fractionDigits }: { owner: string | undefined; symbol: string; mint: string; decimals: number; fractionDigits: number }) {
  const balance = useTokenBalance(owner, mint, decimals);
  const logo = getTokenLogoSrc(symbol);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
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
 * what it holds to trade with, then where to go and how to leave. Laid out as a menu: plain
 * rows divided by lines, nothing framed twice.
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
  /** The menu is open, so balances are worth reading. */
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
    <div className="divide-y divide-bg-border">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {wallet.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.icon} alt="" className="h-8 w-8 shrink-0" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-bg-border bg-accent-primary/20">
              <Wallet className="h-4 w-4 text-accent-primary" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-semibold text-content-primary">{wallet.name}</span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-accent-primary">
                <Check className="h-3 w-3" aria-hidden="true" />
                Connected
              </span>
            </div>
            {/* the short form to read, the whole address to copy or to check against the wallet */}
            <p className="mt-0.5 font-mono text-[12px] tabular-nums text-content-secondary" title={account.address}>
              {shortAddress(account.address, 6)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
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

      <section aria-label="Balances">
        <h3 className={cn(LABEL, "px-4 pt-3")}>Balances</h3>
        <BalanceRow owner={owner} symbol={displayQuoteSymbol()} mint={TOKENS.USDC.mint[network]} decimals={TOKENS.USDC.decimals} fractionDigits={2} />
        <BalanceRow owner={owner} symbol="SOL" mint={TOKENS.SOL.mint[network]} decimals={TOKENS.SOL.decimals} fractionDigits={4} />
      </section>

      <button type="button" onClick={goToReferrals} className={cn(ROW, FOCUS)}>
        <Users className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-mono text-sm font-medium text-content-primary">Referrals</span>
          <span className="block font-mono text-xs text-content-tertiary">Your invite code and stats</span>
        </span>
        <Chevron kind="next" className="h-4 w-4 shrink-0 text-content-tertiary transition-colors group-hover:text-accent-primary" />
      </button>

      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={leaving}
        className={cn(
          // the way out is here and nowhere else, but it is not the thing to press: a plain row, red only in its words
          ROW,
          "font-mono text-sm font-medium text-additional-red-primary disabled:cursor-not-allowed disabled:opacity-60",
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
    <div className="divide-y divide-bg-border">
      {error ? (
        <p role="alert" className="px-4 py-3 font-mono text-[12px] text-additional-orange-primary-deep">
          {error}
        </p>
      ) : null}
      {lastUsedFirst(wallets, lastUsed).map((wallet) => {
        const icon = getWalletIcon(wallet);
        const isLoading = connectingWallet === wallet.name;

        return (
          <button
            key={wallet.name}
            type="button"
            onClick={() => onConnect(wallet as WalletType)}
            disabled={isConnecting}
            className={cn(ROW, FOCUS, "disabled:cursor-not-allowed disabled:opacity-50", isLoading && "bg-accent-primary/10")}
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-7 w-7 shrink-0" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-bg-border bg-bg-primary">
                <Wallet className="h-4 w-4 text-content-secondary" aria-hidden="true" />
              </div>
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-content-primary">
              {wallet.name}
            </span>
            {!isLoading && wallet.name === lastUsed ? <span className="shrink-0 font-mono text-xs text-content-secondary">Last used</span> : null}
            {isLoading ? (
              <>
                <span className="shrink-0 font-mono text-xs text-content-secondary">Approve in wallet</span>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-primary" aria-hidden="true" />
              </>
            ) : (
              <Chevron kind="next" className="h-4 w-4 shrink-0 text-content-tertiary transition-colors group-hover:text-accent-primary" />
            )}
          </button>
        );
      })}
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
    <div className="divide-y divide-bg-border">
      <div className="px-4 py-3">
        <h3 className="font-mono text-sm font-semibold text-additional-orange-primary-deep">No wallet detected</h3>
        <p className="mt-1 font-mono text-xs leading-[1.4] text-content-secondary">
          Install a Solana wallet, then reload this page to connect.
        </p>
      </div>
      {popularWallets.map((wallet) => (
        <a key={wallet.name} href={wallet.url} target="_blank" rel="noopener noreferrer" className={cn(ROW, FOCUS)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallet.icon} alt="" className="h-7 w-7 shrink-0" />
          <span className="flex-1 font-mono text-sm font-medium text-content-primary">{wallet.name}</span>
          <Chevron kind="go" className="h-4 w-4 shrink-0 text-content-tertiary transition-colors group-hover:text-accent-primary" />
        </a>
      ))}
    </div>
  );
}
