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
  | "authenticating"
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
  /** Wallet public key */
  walletPublicKey?: string;
  /** Sign message function from wallet */
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  /** Sign transaction function from wallet */
  signTransaction?: (tx: any) => Promise<any>;
}

export function RfqFlowModal({
  open,
  onClose,
  marketPda,
  asset,
  positionType,
  strike,
  quantity,
  strikeDisplay,
  quantityDisplay,
  walletPublicKey,
  signMessage,
  signTransaction,
}: RfqFlowModalProps) {
  const {
    isConnected,
    isAuthenticated,
    currentQuote,
    error: rfqError,
    authenticate,
    submitRfq,
    acceptQuote,
    submitSignedTx,
    getClient,
  } = useRfqContext();

  const [step, setStep] = useState<FlowStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteReceivedMessage | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [positionPda, setPositionPda] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("idle");
      setError(null);
      setQuote(null);
      setOrderId(null);
      setTxSignature(null);
      setPositionPda(null);
    }
  }, [open]);

  // Handle quote received
  useEffect(() => {
    if (currentQuote && step === "requesting_quote") {
      setQuote(currentQuote);
      setStep("quote_received");
    }
  }, [currentQuote, step]);

  // Handle RFQ errors
  useEffect(() => {
    if (rfqError && step !== "idle" && step !== "confirmed") {
      setError(rfqError.message);
      setStep("failed");
    }
  }, [rfqError, step]);

  // Start the flow: authenticate if not already
  const startFlow = useCallback(async () => {
    if (!walletPublicKey || !signMessage) {
      setError("Please connect your wallet first");
      setStep("failed");
      return;
    }
    
    if (!marketPda) {
      setError("No market available. Please wait for markets to load.");
      setStep("failed");
      return;
    }
    
    if (!isConnected) {
      setError("RFQ server not connected. Please try again.");
      setStep("failed");
      return;
    }

    setError(null);
    
    // If already authenticated, skip to requesting quote
    if (isAuthenticated) {
      setStep("requesting_quote");
      const rfqParams = {
        market: marketPda,
        positionType,
        strike,
        quantity,
        timeoutSeconds: 30,
      };
      console.log("[RFQ] Already authenticated, submitting RFQ:", rfqParams);
      submitRfq(rfqParams);
      return;
    }
    
    // Need to authenticate first
    setStep("authenticating");
    try {
      await authenticate(walletPublicKey, signMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setStep("failed");
    }
  }, [walletPublicKey, signMessage, marketPda, isConnected, isAuthenticated, authenticate, submitRfq, positionType, strike, quantity]);

  // When authenticated, proceed to request quote
  useEffect(() => {
    if (isAuthenticated && step === "authenticating") {
      if (!marketPda) {
        setError("No market available");
        setStep("failed");
        return;
      }
      
      setStep("requesting_quote");
      const rfqParams = {
        market: marketPda,
        positionType,
        strike,
        quantity,
        timeoutSeconds: 30,
      };
      console.log("[RFQ] Authenticated, submitting RFQ:", rfqParams);
      submitRfq(rfqParams);
    }
  }, [isAuthenticated, step, marketPda, positionType, strike, quantity, submitRfq]);

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

  // Format price (u64 in lamports, 9 decimals)
  const formatPrice = (price: number | string) => {
    const value = typeof price === "string" ? Number(price) : price;
    return `${(value / 1_000_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDC`;
  };

  return (
    <AppModal open={open} onClose={handleClose} title="Submit Order">
      <div className="space-y-6">
        {/* Order Summary */}
        <div className="rounded-xl border border-bg-border bg-action-primary/20 p-4">
          <div className="text-sm font-medium text-content-secondary">Order Summary</div>
          <div className="mt-3 space-y-2">
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

        {/* Flow Steps */}
        <div className="space-y-3">
          <FlowStepRow
            label="Authenticate wallet"
            status={getStepStatus(step, ["authenticating"], [])}
            isActive={step === "authenticating"}
          />
          <FlowStepRow
            label="Request quote from market makers"
            status={getStepStatus(step, ["requesting_quote"], ["authenticating"])}
            isActive={step === "requesting_quote"}
          />
          <FlowStepRow
            label="Review & accept quote"
            status={getStepStatus(step, ["quote_received", "accepting_quote"], ["authenticating", "requesting_quote"])}
            isActive={step === "quote_received" || step === "accepting_quote"}
          />
          <FlowStepRow
            label="Sign transaction"
            status={getStepStatus(step, ["signing"], ["authenticating", "requesting_quote", "quote_received", "accepting_quote"])}
            isActive={step === "signing"}
          />
          <FlowStepRow
            label="Submit to blockchain"
            status={getStepStatus(step, ["submitting", "confirmed"], ["authenticating", "requesting_quote", "quote_received", "accepting_quote", "signing"])}
            isActive={step === "submitting"}
          />
        </div>

        {/* Quote Details */}
        {quote && step === "quote_received" && (
          <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/10 p-4">
            <div className="text-sm font-semibold text-accent-primary">Quote Received</div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-content-secondary">Price</span>
                <span className="text-lg font-bold text-accent-primary">
                  {formatPrice(quote.price)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-content-tertiary">Strike</span>
                <span className="text-content-secondary">
                  {formatPrice(quote.strike)}
                </span>
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
          <div className="rounded-xl border border-additional-green-primary/30 bg-additional-green-primary/10 p-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-additional-green-primary" />
            <div className="mt-3 font-semibold text-content-primary">Order Confirmed!</div>
            {txSignature && (
              <div className="mt-2 text-sm text-content-secondary">
                <a
                  href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
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
          <div className="rounded-xl border border-additional-red-primary/30 bg-additional-red-primary/10 p-4">
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
        <div className="flex gap-3">
          {step === "idle" && (
            <AppButton className="w-full" onClick={startFlow}>
              Request Quote
            </AppButton>
          )}

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

          {(step === "authenticating" || step === "requesting_quote" || step === "accepting_quote" || step === "signing" || step === "submitting") && (
            <AppButton className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </AppButton>
          )}

          {(step === "confirmed" || step === "failed") && (
            <AppButton className="w-full" onClick={handleClose}>
              {step === "confirmed" ? "Done" : "Close"}
            </AppButton>
          )}
        </div>

        {/* Demo Notice */}
        <div className="flex items-start gap-2 rounded-lg bg-additional-gold-primary/10 p-3 text-xs text-additional-gold-primary">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Connected to devnet. Quotes come from test market makers.
          </span>
        </div>
      </div>
    </AppModal>
  );
}

// Helper component for flow steps
function FlowStepRow({
  label,
  status,
  isActive,
}: {
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  isActive: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {status === "completed" && (
          <CheckCircle2 className="h-5 w-5 text-additional-green-primary" />
        )}
        {status === "active" && (
          <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
        )}
        {status === "pending" && (
          <div className="h-3 w-3 rounded-full border-2 border-content-tertiary" />
        )}
        {status === "failed" && (
          <XCircle className="h-5 w-5 text-additional-red-primary" />
        )}
      </div>
      <span
        className={
          status === "completed"
            ? "text-content-primary"
            : status === "active"
              ? "font-medium text-accent-primary"
              : "text-content-tertiary"
        }
      >
        {label}
      </span>
    </div>
  );
}

function getStepStatus(
  currentStep: FlowStep,
  activeSteps: FlowStep[],
  completedWhen: FlowStep[] = []
): "pending" | "active" | "completed" | "failed" {
  if (currentStep === "failed") return "failed";
  if (activeSteps.includes(currentStep)) return "active";
  
  const allStepsOrder: FlowStep[] = [
    "idle",
    "authenticating",
    "requesting_quote",
    "quote_received",
    "accepting_quote",
    "signing",
    "submitting",
    "confirmed",
  ];
  
  const currentIdx = allStepsOrder.indexOf(currentStep);
  const stepIdx = Math.max(...activeSteps.map(s => allStepsOrder.indexOf(s)));
  
  if (currentIdx > stepIdx) return "completed";
  
  if (completedWhen.length > 0) {
    const completedIdx = Math.max(...completedWhen.map(s => allStepsOrder.indexOf(s)));
    if (currentIdx > completedIdx) return "completed";
  }
  
  return "pending";
}
