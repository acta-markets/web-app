"use client";

import { useEffect, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppModal } from "@/components/app-ui/app-modal";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import type { QuoteReceivedMessage } from "@/lib/rfq-client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useRfqOrder } from "./use-rfq-order";
import type { VersionedTransaction } from "@solana/web3.js";
import { IS_MAINNET } from "@/lib/tokens";

type PositionType = "covered_call" | "cash_secured_put";

type FlowStep = 
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

interface RfqFlowModalProps {
  open: boolean;
  onClose: () => void;
  /** Incremented by parent whenever a new quote is requested */
  requestNonce: number;
  /** Asset symbol for display */
  asset: string;
  /** Position type */
  positionType: PositionType;
  /** Strike price in smallest units */
  strike: number;
  /** Quantity in smallest units */
  quantity: number;
  /** Display strike price */
  strikeDisplay: string;
  /** Display quantity */
  quantityDisplay: string;
  /** Optional quote to lock modal to exact market-page preview */
  initialQuote?: QuoteReceivedMessage | null;
  /** Locked APR from market page at click time */
  lockedAprPct?: number | null;
  /** Locked total premium from market page at click time */
  lockedPremiumUsd?: number | null;
  /** Sign transaction function from wallet */
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

export function RfqFlowModal({
  open,
  onClose,
  requestNonce,
  asset,
  positionType,
  strike,
  quantity,
  strikeDisplay,
  quantityDisplay,
  initialQuote,
  lockedAprPct,
  lockedPremiumUsd,
  signTransaction,
}: RfqFlowModalProps) {
  const {
    currentQuote,
    isAuthenticated,
    error: rfqError,
    acceptQuote,
    submitSignedTx,
    getClient,
  } = useRfqContext();

  const [quoteStep, setStep] = useState<"idle" | "requesting_quote" | "quote_received" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteReceivedMessage | null>(null);
  const { flow, accept, reset, checkStatus, txSignature } = useRfqOrder({
    getClient, acceptQuote, submitSignedTx, signTransaction,
  });
  const step: FlowStep = flow.type === "idle" ? quoteStep
    : flow.type === "awaiting_signature" ? "accepting_quote" : flow.type;
  const positionPda = flow.type === "confirmed" ? flow.positionPda : null;
  const flowError = flow.type === "failed" ? flow.message : error;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(initialQuote ? "quote_received" : "requesting_quote");
      setError(null);
      setQuote(initialQuote ?? null);
      reset();
    }
  }, [open, requestNonce, initialQuote, reset]);

  // Handle quote received
  useEffect(() => {
    if (
      currentQuote &&
      step === "requesting_quote" &&
      Number(currentQuote.strike) === strike
    ) {
      setQuote(currentQuote);
      setStep("quote_received");
    }
  }, [currentQuote, step, strike]);

  // Handle RFQ errors
  useEffect(() => {
    if (!rfqError || flow.type !== "idle" || step === "idle") {
      return;
    }

    const message = rfqError.message;
    const lower = message.toLowerCase();
    const isRecoverableQuoteError =
      lower.includes("quote_not_found") ||
      lower.includes("quote_expired") ||
      lower.includes("quote_refresh_required");

    if (isRecoverableQuoteError) {
      setQuote(null);
      setError("Quote expired. Close this modal and click Deposit again to request a fresh quote.");
      setStep("failed");
      return;
    }

    setError(message);
    setStep("failed");
  }, [rfqError, step, flow.type]);

  useEffect(() => {
    if (flow.type !== "idle" || quoteStep !== "quote_received") return;
    if (!isAuthenticated) {
      setError("Connection lost. Request a fresh quote after reconnect.");
      setStep("failed");
    }
  }, [isAuthenticated, flow.type, quoteStep]);

  useEffect(() => {
    const client = getClient();
    if (!client || flow.type !== "idle" || !quote) return;
    const onClosed = (msg: { rfq_id: string }) => {
      if (msg.rfq_id !== quote.rfq_id) return;
      setError("RFQ closed. Request a fresh quote.");
      setStep("failed");
    };
    client.on("rfqClosed", onClosed);
    return () => { client.off("rfqClosed", onClosed); };
  }, [getClient, flow.type, quote]);

  const handleAcceptQuote = () => { if (quote) void accept(quote); };

  const handleClose = () => {
    if (flow.type !== "idle" && flow.type !== "confirmed" && flow.type !== "failed") {
      return;
    }
    onClose();
  };

  const formatUsdc = (value: number) => {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDC`;
  };
  const quoteQuantity = quantity / 1_000_000_000;
  const quoteUnitPremium = quote ? Number(quote.net_price ?? quote.price) / 1_000_000_000 : null;
  const totalPremiumUsd =
    lockedPremiumUsd != null
      ? lockedPremiumUsd
      : quoteUnitPremium != null
        ? quoteUnitPremium * quoteQuantity
        : null;
  const displayedAprPct = lockedAprPct ?? null;

  const processingLabel =
    step === "accepting_quote"
      ? "Accepting quote..."
      : step === "signing"
        ? "Waiting for wallet signature..."
        : "Submitting to blockchain...";

  const progressText =
    step === "requesting_quote"
      ? "Getting quote..."
      : step === "quote_received" || step === "accepting_quote"
        ? "Review & accept quote"
        : step === "signing" || step === "submitting"
          ? "Sign & submit transaction"
          : step === "confirmed"
            ? "Order confirmed"
            : step === "failed" ? "Order failed" : "Checking order status";
  const panelClass = "border border-bg-border bg-action-primary/30 p-4";

  return (
    <AppModal open={open} onClose={handleClose} title="Submit Order" showHowItWorks={false}>
      <div className="space-y-4">
        {/* Order Summary */}
        <div className={panelClass}>
          <div className="font-mono text-sm font-medium text-content-secondary">Order</div>
          <div className="mt-2 space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-content-secondary">Asset</span>
              <span className="font-semibold text-content-primary">{asset}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Type</span>
              <span className="font-semibold text-content-primary">
                {positionType === "covered_call" ? "Covered Call" : "Cash-Secured Put"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Strike</span>
              <span className="font-semibold text-content-primary">{strikeDisplay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Quantity</span>
              <span className="font-semibold text-content-primary">{quantityDisplay}</span>
            </div>
            {totalPremiumUsd != null && (
              <div className="flex justify-between">
                <span className="text-content-secondary">Premium</span>
                <span className="font-semibold text-content-primary">{formatUsdc(totalPremiumUsd)}</span>
              </div>
            )}
            {displayedAprPct != null && (
              <div className="flex justify-between">
                <span className="text-content-secondary">APR</span>
                <span className="font-semibold text-content-primary">{displayedAprPct.toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 font-mono text-sm">
          {(step === "requesting_quote" || step === "accepting_quote" || step === "signing" || step === "submitting") ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
          ) : step === "confirmed" ? (
            <CheckCircle2 className="h-4 w-4 text-additional-green-primary" />
          ) : step === "failed" ? (
            <XCircle className="h-4 w-4 text-additional-red-primary" />
          ) : (
            <div className="h-2.5 w-2.5 border border-content-tertiary" />
          )}
          <span className="text-content-secondary">{progressText}</span>
        </div>

        {/* Initial quote wait state */}
        {step === "requesting_quote" && (
          <div className={panelClass}>
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-accent-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Getting quote from market makers
            </div>
            <div className="mt-1 font-mono text-xs text-content-secondary">
              This usually takes a few seconds.
            </div>
          </div>
        )}

        {/* Quote Details */}
        {quote && step === "quote_received" && (
          <div className={panelClass}>
            <div className="font-mono text-sm font-semibold text-accent-primary">Quote Received</div>
            <div className="mt-3 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-content-secondary">Total premium</span>
                <span className="text-lg font-bold text-accent-primary">
                  {totalPremiumUsd != null ? formatUsdc(totalPremiumUsd) : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-content-tertiary">APR</span>
                <span className="text-content-secondary">{displayedAprPct != null ? `${displayedAprPct.toFixed(2)}%` : "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {step === "confirmed" && (
          <div className={`${panelClass} text-center`}>
            <CheckCircle2 className="mx-auto h-12 w-12 text-additional-green-primary" />
            <div className="mt-3 font-mono font-semibold text-content-primary">Order Confirmed!</div>
            {positionPda && (
              <div className="mt-1 text-xs text-content-secondary">
                Position opened successfully.
              </div>
            )}
            {txSignature && (
              <div className="mt-2 text-sm text-content-secondary">
                <a
                  href={`https://solscan.io/tx/${txSignature}${IS_MAINNET ? "" : "?cluster=devnet"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary underline"
                >
                  View on Solscan
                </a>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {step === "failed" && flowError && (
          <div className={panelClass}>
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 shrink-0 text-additional-red-primary" />
              <div>
                <div className="font-mono font-semibold text-content-primary">Order Failed</div>
                <div className="mt-1 font-mono text-sm text-content-secondary">{flowError}</div>
              </div>
            </div>
          </div>
        )}

        {(step === "recovering" || step === "pending" || step === "unknown") && (
          <div className={panelClass}>
            <p className="font-mono text-sm text-content-secondary">
              {step === "recovering" ? "Connection lost. Your order will be checked after reconnect."
                : step === "pending" ? "Your order is still pending. Waiting for execution confirmation."
                : "The order outcome is not yet known. Check its status before placing another order."}
            </p>
            <AppButton className="mt-3" onClick={checkStatus}>Check order status</AppButton>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {step === "quote_received" && (
            <>
              <AppButton variant="secondary" className="flex-1" onClick={handleClose}>
                Cancel
              </AppButton>
              <AppButton className="flex-1" onClick={handleAcceptQuote}>
                Accept Quote
              </AppButton>
            </>
          )}

          {(step === "accepting_quote" || step === "signing" || step === "submitting") && (
            <AppButton className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {processingLabel}
            </AppButton>
          )}

          {(step === "confirmed" || step === "failed") && (
            <AppButton className="w-full" onClick={handleClose}>
              {step === "confirmed" ? "Done" : "Close"}
            </AppButton>
          )}
        </div>

      </div>
    </AppModal>
  );
}
