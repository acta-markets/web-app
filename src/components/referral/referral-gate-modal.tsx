"use client";

import { useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { RedeemInviteForm } from "@/components/referral/redeem-invite-form";

export type GateState = "loading" | "redeem";

export function ReferralGateModal({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: GateState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Invite required"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-bg-primary/90 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl border border-bg-border bg-bg-primary p-6 text-content-primary shadow-2xl">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center text-content-tertiary hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {state === "loading" && <LoadingBody />}
        {state === "redeem" && <RedeemBody />}
      </div>
    </div>
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
