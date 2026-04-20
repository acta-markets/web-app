"use client";

import { AppModal } from "@/components/app-ui/app-modal";
import { RedeemInviteForm } from "@/components/referral/redeem-invite-form";

export function ReferralGateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AppModal open={open} onClose={onClose} title="Invite required" showHowItWorks={false}>
      <div className="space-y-4">
        <p className="text-sm text-content-secondary">
          Trading on Acta is invite-only right now. Enter your invite code to unlock deposits.
        </p>
        <RedeemInviteForm autoFocus autoSubmitFromUrl />
        <p className="font-mono text-xs text-content-tertiary">
          Don&apos;t have a code? Ask an existing trader for their referral link.
        </p>
      </div>
    </AppModal>
  );
}
