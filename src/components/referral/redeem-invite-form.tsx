"use client";

import { useEffect, useRef, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { normalizeReferralCode } from "@/lib/rfq-client";
import { readPendingRefCode } from "@/components/referral/ref-capture";

interface RedeemInviteFormProps {
  autoFocus?: boolean;
  autoSubmitFromUrl?: boolean;
}

export function RedeemInviteForm({
  autoFocus = false,
  autoSubmitFromUrl = true,
}: RedeemInviteFormProps) {
  const { isAuthenticated, redeemInvite, referralError, referralStatus, clearReferralError } =
    useRfqContext();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    const pending = readPendingRefCode();
    if (pending) {
      setCode(normalizeReferralCode(pending));
    }
  }, []);

  // Any response (server error or status flip away from "required") clears the pending flag.
  useEffect(() => {
    if (referralError) setSubmitting(false);
  }, [referralError]);
  useEffect(() => {
    if (referralStatus !== "required") setSubmitting(false);
  }, [referralStatus]);

  useEffect(() => {
    if (!autoSubmitFromUrl) return;
    if (autoSubmittedRef.current) return;
    if (!isAuthenticated) return;
    if (code.length < 4) return;
    autoSubmittedRef.current = true;
    setSubmitting(true);
    redeemInvite(code);
  }, [autoSubmitFromUrl, isAuthenticated, code, redeemInvite]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || submitting) return;
    setSubmitting(true);
    redeemInvite(code);
  };

  const canSubmit = isAuthenticated && code.length >= 4 && !submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="invite-code" className="block font-mono text-sm text-content-secondary">
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(e) => {
            setCode(normalizeReferralCode(e.target.value));
            if (referralError) clearReferralError();
          }}
          maxLength={16}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          placeholder="Enter code"
          className="w-full border border-bg-border bg-bg-tertiary px-4 py-3 font-mono text-lg font-semibold tracking-[0.15em] text-content-primary placeholder:tracking-normal placeholder:text-content-tertiary/60 focus:border-accent-primary/60 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
        />
      </div>
      {!isAuthenticated && (
        <p className="font-mono text-xs text-content-tertiary">
          Connect your wallet to redeem an invite.
        </p>
      )}
      {referralError && (
        <p role="alert" className="font-mono text-sm text-additional-red-primary">
          {referralError}
        </p>
      )}
      <AppButton type="submit" variant="primary" disabled={!canSubmit} className="w-full">
        {submitting ? "Redeeming..." : "Redeem invite"}
      </AppButton>
    </form>
  );
}
