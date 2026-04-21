"use client";

import { useEffect } from "react";
import { RedeemInviteForm } from "@/components/referral/redeem-invite-form";

export function ReferralGateModal({ open }: { open: boolean }) {
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
      aria-label="Invite required"
    >
      <div className="absolute inset-0 bg-bg-primary/90 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-2xl border border-bg-border bg-bg-primary p-6 text-content-primary shadow-2xl">
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
      </div>
    </div>
  );
}
