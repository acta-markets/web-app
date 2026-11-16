"use client";

import Link from "next/link";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { AppModal } from "@/components/app-ui/app-modal";
import { Chevron } from "@/components/app-ui/chevron";
import { TYPE_DENSE, TYPE_LABEL, TYPE_LINK, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { cn } from "@/lib/cn";
import { signInSteps, type SignInStep, type SignInView } from "@/lib/onboarding";

const TITLES: Record<Exclude<SignInView, "hidden">, string> = {
  sign: "Sign in with your wallet",
  checking: "Sign in with your wallet",
  failed: "Sign-in was not completed",
  welcome: "You are signed in",
};

export type SignInBalance = { symbol: string; amount: string };

function StepMark({ state }: { state: SignInStep["state"] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-[3px] block h-3 w-3 shrink-0 border",
        state === "done" ? "border-accent-primary bg-accent-primary" : state === "now" ? "animate-pulse border-accent-primary bg-accent-primary/30" : "border-content-tertiary",
      )}
    />
  );
}

const STATE_WORDS: Record<SignInStep["state"], string> = { done: "done", now: "in progress", next: "to come" };

function Steps({ steps, detail }: { steps: SignInStep[]; detail?: Partial<Record<SignInStep["id"], React.ReactNode>> }) {
  return (
    <ol className="border-t border-bg-border">
      {steps.map((step) => (
        <li key={step.id} className="flex gap-3 border-b border-bg-border py-3">
          <StepMark state={step.state} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn(TYPE_LABEL, step.state === "next" ? "text-content-secondary" : "text-content-primary")}>
              {step.label}
              <span className="sr-only">, {STATE_WORDS[step.state]}</span>
            </span>
            {detail?.[step.id] ? <span className={cn(TYPE_NOTE, "tabular-nums text-content-secondary")}>{detail[step.id]}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The modal that asks a wallet to sign in, and what it becomes afterwards. For a wallet that
 * has traded before it is a prompt that closes by itself. For a new one it stays to say what
 * the trader now has and where a first trade is made. A sign-in that did not happen says so
 * and offers another go, instead of leaving the wallet connected and signed out.
 *
 * Presentational: the view and everything it shows are passed in (`signInView` in
 * `src/lib/onboarding.ts` decides the view).
 */
export function SignInModal({
  view,
  isNew,
  mainnet,
  failure,
  balances,
  funded,
  league,
  onTrade,
  onRetry,
  onClose,
}: {
  view: SignInView;
  /** A wallet this browser has not welcomed: the prompt lists what comes after the signature. */
  isNew: boolean;
  mainnet: boolean;
  /** Why the sign-in did not complete, in plain words. */
  failure: string;
  /** What the wallet holds, as the chain reports it; empty until it holds something. */
  balances: SignInBalance[];
  funded: boolean;
  /** A league that is live right now, when a season is running. */
  league: { name: string; endsText: string } | null;
  /** The main button was used: the visitor is on the way to a first trade. */
  onTrade: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (view === "hidden") return null;
  return (
    <AppModal open onClose={onClose} title={TITLES[view]} showHowItWorks={false} className="max-w-lg">
      {view === "failed" ? (
        <>
          <p className={cn(TYPE_NOTE, "text-content-secondary")}>{failure} You are not signed in, and nothing was charged or moved.</p>
          <AppButton onClick={onRetry} className="self-start">
            Try again
            <Chevron kind="go" className="h-4 w-4" />
          </AppButton>
        </>
      ) : view === "welcome" ? (
        <>
          <Steps
            steps={signInSteps("welcome", { mainnet, funded })}
            detail={{
              funds: funded ? balances.map((b) => `${b.amount} ${b.symbol}`).join(", ") : "Arriving. This can take a minute.",
              trade: "Say where a price will be on a date, and get a quote.",
            }}
          />
          {mainnet ? null : <p className={cn(TYPE_DENSE, "text-content-tertiary")}>Devnet: test funds only. Nothing here is real money.</p>}
          {league ? (
            <p className={cn(TYPE_NOTE, "text-content-secondary")}>
              {league.name} is open until {league.endsText}. Your trades earn points.{" "}
              <Link href="/rewards" onClick={onClose} className={cn(TYPE_LINK, "align-baseline text-[14px]")}>
                See rewards
                <Chevron kind="go" className="h-4 w-4" />
              </Link>
            </p>
          ) : null}
          <AppButtonLink href="/trade" onClick={onTrade} className="self-start">
            Make your first trade
            <Chevron kind="go" className="h-4 w-4" />
          </AppButtonLink>
        </>
      ) : (
        <>
          <p className={cn(TYPE_NOTE, "text-content-secondary")}>
            {view === "checking"
              ? "Signed in. One moment."
              : "Approve the message in your wallet. It is a signature only: it costs nothing and moves no funds."}
          </p>
          {isNew ? <Steps steps={signInSteps(view, { mainnet, funded: false })} /> : null}
          <p className={cn(TYPE_DENSE, "text-content-tertiary")}>
            {isNew ? "Keep this tab open while your wallet asks." : "Keep this tab open. This closes by itself once you are signed in."}
          </p>
        </>
      )}
    </AppModal>
  );
}
