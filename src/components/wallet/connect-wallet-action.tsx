"use client";

import { AppButton } from "@/components/app-ui/app-button";
import { Chevron } from "@/components/app-ui/chevron";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { cn } from "@/lib/cn";
import { useWalletSidebar } from "./wallet-sidebar";

/**
 * A page asking for a wallet, the way Trade's main button does: a main action that says what
 * it is and opens the wallet panel. Every page that needs a wallet uses this one; the header's
 * wallet control (`SolanaConnectButton`) is not repeated inside a page.
 *
 * A returning wallet that is still reconnecting is not asked to connect: the button waits.
 */
export function ConnectWalletAction({
  label = "Connect wallet",
  size = "md",
  className,
}: {
  label?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const { isConnecting, expectedAccount } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const busy = isConnecting || !!expectedAccount;
  return (
    <AppButton size={size} className={cn("whitespace-nowrap", className)} disabled={busy} onClick={openSidebar}>
      {busy ? "Connecting..." : label}
      {busy ? null : <Chevron kind="go" className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />}
    </AppButton>
  );
}
