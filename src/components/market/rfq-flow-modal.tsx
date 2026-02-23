"use client";

import { useEffect, useState, useCallback } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppModal } from "@/components/app-ui/app-modal";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import type { QuoteReceivedMessage } from "@/lib/rfq-client";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type PositionType = "covered_call" | "cash_secured_put";

type FlowStep = 
  | "idle"
  | "requesting_quote"
  | "quote_received"
  | "accepting_quote"
  | "signing"
  | "submitting"
  | "confirmed"
  | "failed";

interface RfqFlowModalProps {
  open: boolean;
  onClose: () => void;
  /** Incremented by parent whenever a new quote is requested */
  requestNonce: number;
  /** Market PDA to request quote for */
  marketPda?: string;
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
  signTransaction?: (tx: any) => Promise<any>;
}

export function RfqFlowModal({
  open,
  onClose,
  requestNonce,
  marketPda,
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
    error: rfqError,
    acceptQuote,
    submitSignedTx,
    getClient,
  } = useRfqContext();

  const [step, setStep] = useState<FlowStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteReceivedMessage | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [positionPda, setPositionPda] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(initialQuote ? "quote_received" : "requesting_quote");
      setError(null);
      setQuote(initialQuote ?? null);
      setRetryCount(0);
      setOrderId(null);
      setTxSignature(null);
      setPositionPda(null);
    }
  }, [open, requestNonce, initialQuote]);

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
    if (!rfqError || step === "idle" || step === "confirmed") {
      return;
    }

    const message = rfqError.message;
    const lower = message.toLowerCase();
    const isRecoverableQuoteError =
      lower.includes("quote_not_found") ||
      lower.includes("quote_expired") ||
      lower.includes("quote_refresh_required");

    if (isRecoverableQuoteError) {
      setRetryCount((c) => c + 1);
      setQuote(null);
      setError("Quote expired. Close this modal and click Deposit again to request a fresh quote.");
      setStep("failed");
      return;
    }

    setError(message);
    setStep("failed");
  }, [rfqError, step, retryCount]);

  // Handle accepting quote
  const handleAcceptQuote = useCallback(async () => {
    if (!quote) return;

    setStep("accepting_quote");
    setOrderId(quote.order_id);

    try {
      acceptQuote(quote.rfq_id, quote.maker, quote.order_id);
      setStep("signing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept quote");
      setStep("failed");
    }
  }, [quote, acceptQuote]);

  // Listen for sponsored tx to sign
  // Listen for sponsored tx to sign (active during signing step)
  useEffect(() => {
    const client = getClient();
    if (!client || step !== "signing") return;

    const handleSponsoredTx = async (orderIdHex: string, txBase64: string) => {
      console.log("[RFQ] Got sponsored tx to sign:", orderIdHex);
      
      if (!signTransaction) {
        setError("Wallet does not support transaction signing");
        setStep("failed");
        return;
      }

      try {
        // Import web3.js for tx deserialization
        const { VersionedTransaction } = await import("@solana/web3.js");
        
        // Decode base64 -> VersionedTransaction
        const txBytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
        const tx = VersionedTransaction.deserialize(txBytes);
        
        console.log("[RFQ] Signing transaction with wallet...");
        // Sign with wallet (shows preview UI)
        const signedTx = await signTransaction(tx);
        
        // Serialize back to base64
        const signedBytes = signedTx.serialize();
        const signedTxBase64 = btoa(String.fromCharCode(...signedBytes));
        
        console.log("[RFQ] Sending signed tx back to server...");
        // Submit signed tx back to server (server will submit to blockchain)
        setStep("submitting");
        submitSignedTx(orderIdHex, signedTxBase64);
      } catch (e) {
        console.error("[RFQ] Failed to sign tx:", e);
        setError(e instanceof Error ? e.message : "Failed to sign transaction");
        setStep("failed");
      }
    };

    client.on("sponsoredTxToSign", handleSponsoredTx);

    return () => {
      client.off("sponsoredTxToSign", handleSponsoredTx);
    };
  }, [step, signTransaction, submitSignedTx, getClient]);
  
  // Listen for order confirmation (active during signing and submitting)
  useEffect(() => {
    const client = getClient();
    if (!client || (step !== "signing" && step !== "submitting")) return;

    const handleConfirmed = (orderIdHex: string, pda: string) => {
      console.log("[RFQ] Order confirmed:", orderIdHex, pda);
      setPositionPda(pda);
      setStep("confirmed");
    };

    const handleSubmitted = (orderIdHex: string, sig: string) => {
      console.log("[RFQ] Order submitted:", orderIdHex, sig);
      setTxSignature(sig);
    };
    
    const handleFailed = (orderIdHex: string, reason: string) => {
      console.error("[RFQ] Order failed:", orderIdHex, reason);
      setError(reason);
      setStep("failed");
    };

    client.on("orderConfirmed", handleConfirmed);
    client.on("orderSubmitted", handleSubmitted);
    client.on("orderFailed", handleFailed);

    return () => {
      client.off("orderConfirmed", handleConfirmed);
      client.off("orderSubmitted", handleSubmitted);
      client.off("orderFailed", handleFailed);
    };
  }, [step, getClient]);

  const handleClose = () => {
    if (step === "signing" || step === "submitting") {
      return;
    }
    onClose();
  };

  const formatUsdc = (value: number) => {
    return `${value.toLocaleString(undefined, {
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
            : "Order failed";
  const panelClass = "rounded-xl border border-white/10 bg-white/5 p-4";

  return (
    <AppModal open={open} onClose={handleClose} title="Submit Order" showHowItWorks={false}>
      <div className="space-y-4">
        {/* Order Summary */}
        <div className={panelClass}>
          <div className="text-sm font-medium text-content-secondary">Order</div>
          <div className="mt-2 space-y-2">
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
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 text-sm">
          {(step === "requesting_quote" || step === "accepting_quote" || step === "signing" || step === "submitting") ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
          ) : step === "confirmed" ? (
            <CheckCircle2 className="h-4 w-4 text-additional-green-primary" />
          ) : step === "failed" ? (
            <XCircle className="h-4 w-4 text-additional-red-primary" />
          ) : (
            <div className="h-2.5 w-2.5 rounded-full border border-content-tertiary" />
          )}
          <span className="text-content-secondary">{progressText}</span>
        </div>

        {/* Initial quote wait state */}
        {step === "requesting_quote" && (
          <div className={panelClass}>
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Getting quote from market makers
            </div>
            <div className="mt-1 text-xs text-content-secondary">
              This usually takes a few seconds.
            </div>
          </div>
        )}

        {/* Quote Details */}
        {quote && step === "quote_received" && (
          <div className={panelClass}>
            <div className="text-sm font-semibold text-accent-primary">Quote Received</div>
            <div className="mt-3 space-y-2">
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
              <div className="flex justify-between text-sm">
                <span className="text-content-tertiary">Expires in</span>
                <span className="text-content-secondary">
                  {Math.max(0, Math.floor((Number(quote.valid_until) * 1000 - Date.now()) / 1000))}s
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {step === "confirmed" && (
          <div className={`${panelClass} text-center`}>
            <CheckCircle2 className="mx-auto h-12 w-12 text-additional-green-primary" />
            <div className="mt-3 font-semibold text-content-primary">Order Confirmed!</div>
            {positionPda && (
              <div className="mt-1 text-xs text-content-secondary">
                Position opened successfully.
              </div>
            )}
            {txSignature && (
              <div className="mt-2 text-sm text-content-secondary">
                <a
                  href={`https://solscan.io/tx/${txSignature}?cluster=testnet`}
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
        {step === "failed" && error && (
          <div className={panelClass}>
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 shrink-0 text-additional-red-primary" />
              <div>
                <div className="font-semibold text-content-primary">Order Failed</div>
                <div className="mt-1 text-sm text-content-secondary">{error}</div>
              </div>
            </div>
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

        {/* Demo Notice */}
        <div className="flex items-start gap-2 border-t border-white/10 pt-2 text-xs text-content-tertiary">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Connected to testnet. Quotes come from test market makers.
          </span>
        </div>
      </div>
    </AppModal>
  );
}
