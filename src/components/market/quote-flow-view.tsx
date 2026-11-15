"use client";

import { TYPE_LABEL } from "@/components/app-ui/type-styles";
import { Fragment } from "react";
import { Check, Loader2, X } from "lucide-react";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { ShareButton } from "@/components/share/share-card";
import { BONE } from "@/components/trade/sentence/ticket-styles";
import { cn } from "@/lib/cn";

export type QuoteFlowStep =
  | "idle"
  | "requesting_quote"
  | "quote_received"
  | "accepting_quote"
  | "signing"
  | "submitting"
  | "confirmed"
  | "failed"
  | "recovering"
  | "pending"
  | "unknown";

/** What is being traded, already in display form. */
export type QuoteFlowOrder = {
  /** the user's view in words, e.g. "BTC will be above $71,000 on Nov 20" */
  thesis: string | null;
  /** names the headline amount: "You pay premium", "You earn premium" */
  premiumLabel: string;
  /** the quoted premium; null while a quote is awaited */
  premium: string | null;
  /** what the amount means for the user, e.g. that it is the most they can lose */
  premiumNote: string | null;
  /** the rest of the terms, label then value */
  facts: ReadonlyArray<readonly [label: string, value: string]>;
  /** one quiet line under the terms, e.g. how a spread settles */
  note: string | null;
  /** what is still to do once the trade is confirmed, e.g. fund the option to exercise; it also makes Portfolio the main button there */
  nextStep: string | null;
};

export type QuoteFlowViewProps = {
  step: QuoteFlowStep;
  /** null for an order picked up again after a reload: its terms are not known here */
  order: QuoteFlowOrder | null;
  restored: boolean;
  /** seconds left to confirm, and how many there were when the quote was first shown */
  secondsRemaining: number;
  secondsTotal: number;
  /** set when the quote under review was replaced by a worse one for the user: what it was. A better one just shows. */
  priceUpdate: { from: string } | null;
  /** Confirm is held for a moment after the price moves against the user, so it cannot be clicked unread */
  confirmHeld: boolean;
  error: string | null;
  /** explorer link for the sent transaction */
  txUrl: string | null;
  accepting: boolean;
  canAbandon: boolean;
  onAccept: () => void;
  onClose: () => void;
  onAbandon: () => void;
  onCheckStatus: () => void;
  /** asks for a new quote on the same terms; without it an expired or failed quote can only be closed */
  onRequote?: () => void;
  /** opens the share card for a confirmed trade; without it the trade cannot be shared from here */
  onShare?: () => void;
};

const LABEL = "font-mono text-[12px] font-medium leading-[1.2]";

/** The modal's title for each step: it names what is happening now. */
export function quoteFlowTitle(step: QuoteFlowStep, restored: boolean): string {
  if (restored && step !== "confirmed" && step !== "failed") return "Your unfinished trade";
  switch (step) {
    case "requesting_quote":
      return "Getting a quote";
    case "accepting_quote":
      return "Locking in your quote";
    case "signing":
      return "Approve in your wallet";
    case "submitting":
    case "pending":
    case "recovering":
    case "unknown":
      return "Placing your trade";
    case "confirmed":
      return "Trade confirmed";
    case "failed":
      return "Trade not placed";
    default:
      return "Review your trade";
  }
}

const STAGES = ["Quote", "Sign", "Confirm"] as const;

/** Which of the three stages a step belongs to; 3 once everything is done. */
function stageOf(step: QuoteFlowStep): number {
  switch (step) {
    case "accepting_quote":
    case "signing":
      return 1;
    case "submitting":
    case "pending":
    case "recovering":
    case "unknown":
      return 2;
    case "confirmed":
      return 3;
    default:
      return 0;
  }
}

/** Quote, sign, confirm: where the trade is, as three bars that fill left to right. */
function Stages({ step }: { step: QuoteFlowStep }) {
  const at = stageOf(step);
  const failed = step === "failed";
  return (
    <ol aria-label="Progress" className="grid grid-cols-3 gap-1.5">
      {STAGES.map((label, i) => {
        const reached = !failed && i <= at;
        const current = !failed && i === at;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="flex flex-col gap-2">
            <span aria-hidden="true" className={cn("h-0.5", reached ? "bg-accent-primary" : "bg-action-primary")} />
            <span className={cn(LABEL, current ? "text-content-primary" : "text-content-tertiary")}>
              {i < at && !failed ? <Check aria-hidden="true" className="mr-1 inline h-3 w-3 -translate-y-px text-accent-primary" /> : null}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One line of status under the terms: an icon, what is happening, and a quiet second line. */
function Status({
  tone,
  title,
  action,
  children,
}: {
  tone: "busy" | "done" | "failed" | "idle";
  title: string;
  /** a small control at the right end of the line, e.g. Share on a confirmed trade */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {tone === "busy" ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
        ) : tone === "done" ? (
          <Check className="h-5 w-5 text-additional-green-primary-deep" />
        ) : tone === "failed" ? (
          <X className="h-5 w-5 text-additional-red-primary" />
        ) : (
          <span className="h-1.5 w-1.5 bg-content-tertiary" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm font-semibold leading-[1.4] text-content-primary">{title}</p>
          {/* pulled into the line's own height: a control here must not make the block taller and move the buttons */}
          {action ? <div className="-my-1.5 shrink-0">{action}</div> : null}
        </div>
        {children ? <div className="mt-1 font-mono text-sm leading-[1.4] text-content-secondary">{children}</div> : null}
      </div>
    </div>
  );
}

/** How long is left to confirm: a bar that only ever drains, and the seconds in words. */
function QuoteTimer({
  secondsRemaining,
  secondsTotal,
  priceUpdate,
}: {
  secondsRemaining: number;
  secondsTotal: number;
  priceUpdate: QuoteFlowViewProps["priceUpdate"];
}) {
  const live = secondsRemaining > 0;
  const left = secondsTotal > 0 ? Math.min(1, secondsRemaining / secondsTotal) : 0;
  return (
    <div>
      <div aria-hidden="true" className="h-0.5 w-full bg-action-primary">
        <div
          className={cn("h-full transition-[width] duration-1000 ease-linear", live ? "bg-accent-primary" : "bg-transparent")}
          style={{ width: `${left * 100}%` }}
        />
      </div>
      {/* the words come first and the number last, so the countdown never moves the words */}
      <p role="timer" className="mt-3 font-mono text-sm leading-[1.4] text-content-secondary">
        {live ? (
          <>
            Confirm within <span className="tabular-nums text-content-primary">{secondsRemaining}s</span>
          </>
        ) : (
          "This quote expired. Get a fresh one to continue."
        )}
      </p>
      {/* market makers can replace a quote while it is being read: a worse one is said, never swapped in silently */}
      {live && priceUpdate ? (
        <p role="status" className="mt-1 font-mono text-sm leading-[1.4] text-additional-orange-primary-deep">
          The quote changed. It was <span className="tabular-nums">{priceUpdate.from}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Everything inside the order modal, as a pure function of the step: no sockets, no wallet.
 * `RfqFlowModal` feeds it; it can be rendered on its own to review every state.
 */
export function QuoteFlowView({
  step,
  order,
  restored,
  secondsRemaining,
  secondsTotal,
  priceUpdate,
  confirmHeld,
  error,
  txUrl,
  accepting,
  canAbandon,
  onAccept,
  onClose,
  onAbandon,
  onCheckStatus,
  onRequote,
  onShare,
}: QuoteFlowViewProps) {
  const expired = step === "quote_received" && secondsRemaining === 0;
  const processing = step === "accepting_quote" || step === "signing" || step === "submitting";
  const waiting = step === "recovering" || step === "pending" || step === "unknown";
  const txLink = txUrl ? (
    <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-accent-primary underline underline-offset-2">
      View on Solscan
    </a>
  ) : null;

  return (
    <div className="space-y-6">
      <Stages step={step} />

      {order ? (
        <div className="space-y-5">
          {order.thesis ? (
            <p className="font-space text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary">{order.thesis}</p>
          ) : null}
          <div>
            <div className={cn(TYPE_LABEL, "text-content-tertiary")}>{order.premiumLabel}</div>
            {/* a bone the size of the number while it is awaited, so its arrival moves nothing */}
            <div className="mt-2 flex h-9 items-center font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-content-primary">
              {order.premium ?? <span data-testid="quote-premium-pending" className={cn(BONE, "h-8 w-40")} />}
            </div>
            {order.premiumNote ? <p className="mt-2 font-mono text-sm leading-[1.4] text-content-secondary">{order.premiumNote}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm leading-[1.4]">
            {order.facts.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-content-secondary">{label}</dt>
                <dd className="whitespace-nowrap text-right tabular-nums text-content-primary">{value}</dd>
              </Fragment>
            ))}
          </dl>
          {order.note ? <p className="font-mono text-sm leading-[1.4] text-content-secondary">{order.note}</p> : null}
        </div>
      ) : null}

      {/* one status at a time, in a block tall enough for any of them, so the buttons hold still */}
      <div className="min-h-[68px]">
        {step === "requesting_quote" ? (
          <Status tone="busy" title="Asking market makers for a price">
            This usually takes a few seconds.
          </Status>
        ) : step === "quote_received" ? (
          <QuoteTimer secondsRemaining={secondsRemaining} secondsTotal={secondsTotal} priceUpdate={priceUpdate} />
        ) : step === "accepting_quote" ? (
          <Status tone="busy" title="Locking in your quote">
            Your wallet will ask you to approve next.
          </Status>
        ) : step === "signing" ? (
          <Status tone="busy" title="Approve the transaction in your wallet">
            Waiting for your signature.
          </Status>
        ) : step === "submitting" ? (
          <Status tone="busy" title="Sending your trade to Solana">
            This usually takes a few seconds.
          </Status>
        ) : step === "confirmed" ? (
          <Status tone="done" title="Your trade is confirmed" action={onShare ? <ShareButton onClick={onShare} /> : null}>
            {order?.nextStep ? <p>{order.nextStep}</p> : null}
            {txLink ? <p className={order?.nextStep ? "mt-1" : undefined}>{txLink}</p> : null}
          </Status>
        ) : step === "failed" ? (
          <Status tone="failed" title="Nothing was traded">
            {error ?? "Something went wrong."}
          </Status>
        ) : waiting ? (
          <Status
            tone={step === "unknown" ? "idle" : "busy"}
            title={
              step === "recovering"
                ? "Connection lost"
                : step === "pending"
                  ? "Waiting for on-chain confirmation"
                  : "We could not confirm this trade yet"
            }
          >
            <p>
              {step === "recovering"
                ? "Your trade will be checked as soon as the connection is back."
                : step === "pending"
                  ? txUrl
                    ? "Your transaction was sent."
                    : "Your trade was submitted."
                  : "Check its status before placing another trade."}
            </p>
            {step === "pending" && txLink ? <p className="mt-1">{txLink}</p> : null}
          </Status>
        ) : null}
      </div>

      {/* Two buttons split the row exactly in half whatever their padding or border, and a label
          never breaks onto a second line: the row looks the same at every step. */}
      <div className="flex gap-2 max-md:flex-col-reverse [&>*]:basis-1/2 [&>*]:whitespace-nowrap">
        {step === "requesting_quote" ? (
          <AppButton variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </AppButton>
        ) : null}

        {step === "quote_received" && !expired ? (
          <>
            <AppButton variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton className="flex-1" onClick={onAccept} disabled={accepting || confirmHeld}>
              Confirm trade
            </AppButton>
          </>
        ) : null}

        {expired ? (
          <>
            <AppButton variant="secondary" className="flex-1" onClick={onClose}>
              Back
            </AppButton>
            {onRequote ? (
              <AppButton className="flex-1" onClick={onRequote}>
                Get a fresh quote
              </AppButton>
            ) : null}
          </>
        ) : null}

        {processing ? (
          <>
            {canAbandon ? (
              <AppButton variant="secondary" className="flex-1" onClick={onAbandon}>
                Cancel trade
              </AppButton>
            ) : null}
            {/* tighter sides: the spinner and the longest label fit in half the row, next to Cancel trade */}
            <AppButton className="flex-1 px-3" disabled>
              <Loader2 aria-hidden="true" className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />
              {step === "accepting_quote" ? "Locking in" : step === "signing" ? "Waiting for wallet" : "Sending"}
            </AppButton>
          </>
        ) : null}

        {waiting ? (
          <>
            {canAbandon ? (
              <AppButton variant="secondary" className="flex-1" onClick={onAbandon}>
                Cancel trade
              </AppButton>
            ) : null}
            <AppButton className="flex-1" onClick={onCheckStatus}>
              Check status
            </AppButton>
          </>
        ) : null}

        {step === "confirmed" && order?.nextStep ? (
          // funding is the next thing to do, so it is the main button
          <>
            <AppButton variant="secondary" className="flex-1" onClick={onClose}>
              Done
            </AppButton>
            <AppButtonLink href="/portfolio" className="flex-1" onClick={onClose}>
              Fund in Portfolio
            </AppButtonLink>
          </>
        ) : step === "confirmed" ? (
          <>
            <AppButtonLink href="/portfolio" variant="secondary" className="flex-1" onClick={onClose}>
              View in Portfolio
            </AppButtonLink>
            <AppButton className="flex-1" onClick={onClose}>
              Done
            </AppButton>
          </>
        ) : null}

        {step === "failed" ? (
          <>
            <AppButton variant="secondary" className="flex-1" onClick={onClose}>
              Back
            </AppButton>
            {onRequote && !restored ? (
              <AppButton className="flex-1" onClick={onRequote}>
                Try again
              </AppButton>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
