"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { RedeemInviteForm } from "@/components/referral/redeem-invite-form";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";

export type GateState = "connect" | "loading" | "redeem";

export function ReferralGateModal({ open, state }: { open: boolean; state: GateState }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Get started"
    >
      <div className="absolute inset-0 bg-bg-primary/90 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-2xl border border-bg-border bg-bg-primary p-6 text-content-primary shadow-2xl">
        {state === "connect" && <ConnectBody />}
        {state === "loading" && <LoadingBody />}
        {state === "redeem" && <RedeemBody />}
      </div>
    </div>
  );
}

function ConnectBody() {
  return (
    <>
      <h2 className="font-mono text-xl font-medium">Connect to continue</h2>
      <div className="mt-5 space-y-4">
        <p className="text-sm text-content-secondary">
          Acta is invite-only during beta. Connect your wallet to enter your code and start trading.
        </p>
        <SolanaConnectButton fullWidth />
        <p className="font-mono text-xs text-content-tertiary">
          You&apos;ll be asked to sign a message to authenticate — no on-chain transaction required.
        </p>
      </div>
    </>
  );
}

function LoadingBody() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Loader2 className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
      <p className="font-mono text-sm text-content-secondary">Checking your access...</p>
    </div>
  );
}

function RedeemBody() {
  return (
    <>
      <h2 className="font-mono text-xl font-medium">Invite required</h2>
      <div className="mt-5 space-y-4">
        <p className="text-sm text-content-secondary">
          Trading on Acta is invite-only right now. Enter your invite code to unlock the app.
        </p>
        <RedeemInviteForm autoFocus autoSubmitFromUrl />
        <p className="font-mono text-xs text-content-tertiary">
          Don&apos;t have a code? Ask an existing trader for their referral link.
        </p>
      </div>
    </>
  );
}
