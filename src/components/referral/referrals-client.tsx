"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppPill } from "@/components/app-ui/app-pill";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { RedeemInviteForm } from "@/components/referral/redeem-invite-form";
import { normalizeReferralCode } from "@/lib/rfq-client";

function formatNextSlot(seconds: number): string {
  if (seconds <= 0) return "available now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ReferralsClient() {
  const { isConnected: walletConnected } = useSolana();
  const {
    isAuthenticated,
    referralStatus,
    referralInfo,
    referralError,
    claimReferralCode,
    refreshReferralInfo,
    clearReferralError,
  } = useRfqContext();

  useEffect(() => {
    if (isAuthenticated) refreshReferralInfo();
  }, [isAuthenticated, refreshReferralInfo]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!referralInfo?.referral_code) return null;
    return `${window.location.origin}/?ref=${encodeURIComponent(referralInfo.referral_code)}`;
  }, [referralInfo?.referral_code]);

  return (
    <div className="mx-auto w-full max-w-[850px] px-6 pb-20 pt-10 max-md:px-3 max-md:pt-6">
      <header className="mb-6 space-y-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-content-primary">Referrals</h1>
        <p className="font-mono text-sm text-content-tertiary">
          Invite takers to Acta. Share your code to earn slots over time.
        </p>
      </header>

      {!walletConnected && (
        <AppCard className="p-6">
          <div className="space-y-4">
            <p className="text-sm text-content-secondary">Connect your wallet to view your referral code.</p>
            <SolanaConnectButton />
          </div>
        </AppCard>
      )}

      {walletConnected && !isAuthenticated && (
        <AppCard className="p-6">
          <p className="text-sm text-content-secondary">
            Waiting for wallet authentication with the RFQ server...
          </p>
        </AppCard>
      )}

      {isAuthenticated && referralStatus === "required" && (
        <AppCard className="p-6">
          <div className="space-y-4">
            <h2 className="font-mono text-lg font-semibold tracking-tight text-content-primary">
              Redeem Invite
            </h2>
            <p className="text-sm text-content-secondary">
              Trading on Acta is invite-only. Enter your invite code to unlock deposits.
            </p>
            <RedeemInviteForm autoFocus autoSubmitFromUrl />
          </div>
        </AppCard>
      )}

      {isAuthenticated && referralStatus === "redeemed" && referralInfo && (
        <div className="space-y-5">
          <YourCodeCard code={referralInfo.referral_code} shareUrl={shareUrl} status={referralInfo.status} />
          <StatsCard info={referralInfo} />
          <ClaimVanityCard
            onClaim={claimReferralCode}
            referralError={referralError}
            clearReferralError={clearReferralError}
          />
        </div>
      )}

      {isAuthenticated && referralStatus === "unknown" && (
        <AppCard className="p-6">
          <p className="text-sm text-content-secondary">Loading referral info...</p>
        </AppCard>
      )}
    </div>
  );
}

function YourCodeCard({
  code,
  shareUrl,
  status,
}: {
  code: string;
  shareUrl: string | null;
  status: "pending" | "active";
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyTo = async (value: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      setFlag(true);
      window.setTimeout(() => setFlag(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <AppCard className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm uppercase tracking-widest text-content-tertiary">Your code</h2>
        <AppPill active={status === "active"}>{status === "active" ? "Active" : "Pending"}</AppPill>
      </div>
      <div className="mb-5 break-all font-mono text-3xl font-semibold tracking-[0.1em] text-content-primary">
        {code}
      </div>
      <div className="flex flex-wrap gap-2">
        <AppButton variant="secondary" onClick={() => copyTo(code, setCopiedCode)}>
          {copiedCode ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy code
            </>
          )}
        </AppButton>
        {shareUrl && (
          <AppButton variant="primary" onClick={() => copyTo(shareUrl, setCopiedLink)}>
            {copiedLink ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Link copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy share link
              </>
            )}
          </AppButton>
        )}
      </div>
      {status === "pending" && (
        <p className="mt-4 font-mono text-xs text-content-tertiary">
          Your referrals go live after your first successful trade.
        </p>
      )}
    </AppCard>
  );
}

function StatsCard({
  info,
}: {
  info: {
    total_invited: number;
    invited_this_period: number;
    max_invites_per_period: number;
    next_slot_frees_in_seconds: number;
  };
}) {
  const used = info.invited_this_period;
  const max = info.max_invites_per_period;
  const remaining = Math.max(0, max - used);
  const countdown = formatNextSlot(info.next_slot_frees_in_seconds);

  return (
    <AppCard className="p-6">
      <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-content-tertiary">Stats</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Invited (lifetime)" value={info.total_invited.toString()} />
        <Stat label="This period" value={`${used} / ${max}`} sub={`${remaining} slots remaining`} />
        <Stat label="Next slot" value={countdown} />
      </div>
    </AppCard>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-bg-border bg-action-primary/20 p-4">
      <div className="font-mono text-xs uppercase tracking-widest text-content-tertiary">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold text-content-primary">{value}</div>
      {sub && <div className="mt-1 font-mono text-xs text-content-tertiary">{sub}</div>}
    </div>
  );
}

function ClaimVanityCard({
  onClaim,
  referralError,
  clearReferralError,
}: {
  onClaim: (raw: string) => Promise<void>;
  referralError: string | null;
  clearReferralError: () => void;
}) {
  const [vanity, setVanity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vanity || submitting) return;
    setSubmitting(true);
    try {
      await onClaim(vanity);
    } finally {
      window.setTimeout(() => setSubmitting(false), 2000);
    }
  };

  return (
    <AppCard className="p-6">
      <h2 className="mb-2 font-mono text-sm uppercase tracking-widest text-content-tertiary">Customize code</h2>
      <p className="mb-4 font-mono text-xs text-content-tertiary">
        One-time claim. 4–16 characters, A–Z and 0–9 only.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          id="vanity-code"
          value={vanity}
          onChange={(e) => {
            setVanity(normalizeReferralCode(e.target.value));
            if (referralError) clearReferralError();
          }}
          maxLength={16}
          spellCheck={false}
          autoComplete="off"
          placeholder="PICK A CODE"
          className="w-full border border-bg-border bg-bg-tertiary px-4 py-3 font-mono text-lg font-semibold tracking-[0.2em] text-content-primary placeholder:text-content-tertiary/60 focus:border-accent-primary/60 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
        />
        {referralError && (
          <p role="alert" className="font-mono text-sm text-additional-red-primary">
            {referralError}
          </p>
        )}
        <AppButton type="submit" variant="secondary" disabled={vanity.length < 4 || submitting}>
          {submitting ? "Claiming..." : "Claim code"}
        </AppButton>
      </form>
    </AppCard>
  );
}
