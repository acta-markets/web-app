"use client";

import { Wallet as WalletGlyph } from "lucide-react";
import { AppButton } from "@/components/app-ui/app-button";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/vaults/format";
import { useSolana } from "./solana-wallet-provider";

export type WalletButtonState =
  /** wallets are still being detected; nothing can be said yet */
  | { type: "loading" }
  | { type: "disconnected" }
  /** the wallet used last time is being reconnected; it is shown already, as it will be */
  | { type: "restoring"; address: string }
  /** the wallet's own approval window is open */
  | { type: "connecting" }
  | { type: "connected"; address: string; walletName: string; walletIcon?: string };

/**
 * The wallet control as it looks in each state, with no wallet behind it. One button per
 * state, and every one of them opens the wallet panel:
 *
 * - loading: a block the size of Connect, so the header does not flash a word and jump
 * - disconnected: Connect, the page's call to action
 * - restoring: the returning wallet's address, dimmed, while it reconnects, so the header never says Connect to someone it knows
 * - connecting: the same button, saying so, while the wallet asks for approval
 * - connected: the wallet's own mark and the short address
 *
 * Disconnecting lives in the panel, not here: a one-click disconnect next to the address was
 * easy to hit by accident and logged the user out of trading.
 */
export function WalletButton({ state, fullWidth = false, onOpen }: { state: WalletButtonState; fullWidth?: boolean; onOpen: () => void }) {
  if (state.type === "loading") {
    return (
      <div role="status" aria-label="Checking for a wallet" className={cn("h-10 animate-pulse bg-action-primary", fullWidth ? "w-full" : "w-[100px]")} />
    );
  }

  if (state.type === "restoring") {
    return (
      <AppButton
        variant="secondary"
        onClick={onOpen}
        aria-label={`Wallet ${shortAddress(state.address)}, reconnecting. Open wallet`}
        className={cn("shrink-0 gap-2 whitespace-nowrap px-3 font-mono text-sm tabular-nums", fullWidth && "w-full")}
      >
        <WalletGlyph aria-hidden="true" className="h-4 w-4 shrink-0 animate-pulse text-accent-secondary" />
        <span className="text-content-secondary">{shortAddress(state.address)}</span>
      </AppButton>
    );
  }

  if (state.type === "connected") {
    return (
      <AppButton
        variant="secondary"
        onClick={onOpen}
        aria-label={`Wallet ${shortAddress(state.address)}, connected with ${state.walletName}. Open wallet`}
        // even padding and a wider gap: the default leans left for a trailing chevron this button does not have
        className={cn("shrink-0 gap-2 whitespace-nowrap px-3 font-mono text-sm tabular-nums", fullWidth && "w-full")}
      >
        {state.walletIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.walletIcon} alt="" className="h-5 w-5 shrink-0" />
        ) : (
          <WalletGlyph aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-secondary" />
        )}
        {shortAddress(state.address)}
      </AppButton>
    );
  }

  const connecting = state.type === "connecting";
  return (
    <AppButton variant="primary" onClick={onOpen} disabled={connecting} className={fullWidth ? "w-full" : undefined}>
      {connecting ? "Connecting…" : "Connect"}
    </AppButton>
  );
}

/** The header's wallet control. A page that asks for a wallet uses `ConnectWalletAction`, not this. */
export function SolanaConnectButton() {
  const { selectedAccount, selectedWallet, isConnected, isConnecting, isReady, expectedAccount } = useSolana();
  const { openSidebar } = useWalletSidebar();

  const state: WalletButtonState =
    isConnected && selectedAccount
      ? { type: "connected", address: selectedAccount.address, walletName: selectedWallet?.name ?? "your wallet", walletIcon: selectedWallet?.icon }
      : expectedAccount
        ? { type: "restoring", address: expectedAccount.address }
        : !isReady
          ? { type: "loading" }
          : isConnecting
            ? { type: "connecting" }
            : { type: "disconnected" };

  return <WalletButton state={state} onOpen={openSidebar} />;
}
