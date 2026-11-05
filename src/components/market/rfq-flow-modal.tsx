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

import { BUY_PRODUCT_NAME, isCashSettled, lowerStrike, productLabel, quoteMatchesProduct, type ProductTerms, type TakerSide } from "@/lib/spreads";
import { formatPrice } from "@/lib/trade/format";
import { BUY_DEPOSIT_REMINDER, BUY_ITM_WARNING, SPREAD_SETTLEMENT_NOTE, buyBreakEven, exerciseDepositText, spreadBounds, spreadBreakEven, spreadMaxGain } from "@/lib/trade/thesis";

export type RfqOrderPreview = {
  asset: string;
  terms: ProductTerms;
  side?: TakerSide;
  /** underlying atomic units */
  quantity: number;
  underlyingDecimals: number;
  strikeDisplay: string;
  quantityDisplay: string;
  /** the user's view in words, e.g. "SOL will be above $150 on Nov 7" */
  thesis?: string;
  /** Market expiry in unix seconds, shown in the spread summary line. */
  expiryTs?: number;
  lockedAprPct?: number | null;
  lockedPremiumUsd?: number | null;
};

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
  onBusyChange?: (busy: boolean) => void;
  /** Incremented by parent whenever a new quote is requested */
  requestNonce: number;
  preview: RfqOrderPreview | null;
  walletAddress: string | null;
  backendUrl: string;
  /** Sign transaction function from wallet */
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  rpc: Parameters<typeof useRfqOrder>[0]["rpc"];
}

function BuyQuoteRows({ preview, quantity, grossPerUnit, maxLoss, formatQuote }: {
  preview: RfqOrderPreview;
  quantity: number;
  grossPerUnit: number;
  maxLoss: string;
  formatQuote: (value: number) => string;
}) {
  const isPut = preview.terms.type === "cash_secured_put";
  const strike = lowerStrike(preview.terms) / 1_000_000_000;
  const bounds = spreadBounds(preview.terms);
  const rows = bounds ? [
    ["Max loss", maxLoss],
    ["Max gain", formatQuote(spreadMaxGain(quantity, bounds.upper, bounds.lower) - grossPerUnit * quantity)],
    ["Break-even", formatPrice(preview.terms.type === "call_spread"
      ? spreadBreakEven(false, bounds.lower / 1e9, grossPerUnit)
      : spreadBreakEven(true, bounds.upper / 1e9, grossPerUnit))],
  ] : [
    ["Max loss", maxLoss],
    ["Break-even", formatPrice(buyBreakEven(isPut, strike, grossPerUnit))],
    ["Deposit to exercise", exerciseDepositText(isPut, quantity, strike, preview.asset)],
  ];
  return rows.map(([label, value]) => (
    <div key={label} className="flex justify-between text-sm">
      <span className="text-content-tertiary">{label}</span>
      <span className="text-content-secondary">{value}</span>
    </div>
  ));
}

export function RfqFlowModal({
  open,
  onClose,
  onBusyChange,
  requestNonce,
  preview,
  walletAddress,
  backendUrl,
  signTransaction,
  rpc,
}: RfqFlowModalProps) {
  const {
    bestQuote,
    quoteSecondsRemaining,
    isAuthenticated,
    error: rfqError,
    acceptQuote,
    submitSignedTx,
    cancelRfq,
    getClient,
    rfqTerms,
  } = useRfqContext();

  const [quoteStep, setStep] = useState<"idle" | "requesting_quote" | "quote_received" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteReceivedMessage | null>(null);
  const [, tick] = useState(0);
  const [recoveredOpen, setRecoveredOpen] = useState(false);
  const { flow, accept, accepting, abandon, canAbandon, reset, checkStatus, txSignature, restored } = useRfqOrder({
    getClient, acceptQuote, submitSignedTx, signTransaction, rpc,
    scope: { walletAddress, backendUrl },
  });
  const step: FlowStep = flow.type === "idle" ? quoteStep
    : flow.type === "awaiting_signature" ? "accepting_quote" : flow.type;
  const positionPda = flow.type === "confirmed" ? flow.positionPda : null;
  const flowError = flow.type === "failed" ? flow.message : error;
  const isRestoredOrder = restored;
  const modalOpen = open || recoveredOpen;
  useEffect(() => {
    onBusyChange?.(modalOpen);
    return () => onBusyChange?.(false);
  }, [modalOpen, onBusyChange]);

  useEffect(() => {
    if (flow.type === "idle") setRecoveredOpen(false);
  }, [backendUrl, flow.type, walletAddress]);

  useEffect(() => {
    if (isRestoredOrder && isAuthenticated && flow.type !== "idle") setRecoveredOpen(true);
  }, [flow.type, isAuthenticated, isRestoredOrder]);

  useEffect(() => {
    if (open && preview && !isRestoredOrder) {
      setStep("requesting_quote");
      setError(null);
      setQuote(null);
      reset();
    }
  }, [open, requestNonce, preview, isRestoredOrder, reset]);

  useEffect(() => {
    if (!preview || accepting || flow.type !== "idle" || (quoteStep !== "requesting_quote" && quoteStep !== "quote_received")) return;
    if (bestQuote && quoteMatchesProduct(bestQuote, preview.terms, preview.side)) {
      setQuote(bestQuote);
      setStep("quote_received");
    } else if (!bestQuote && quote && quoteSecondsRemaining(quote) === 0) {
      setStep("quote_received");
    } else {
      setQuote(null);
      setStep("requesting_quote");
    }
  }, [bestQuote, preview, accepting, flow.type, quoteStep, quote, quoteSecondsRemaining]);

  useEffect(() => {
    if (!rfqError || flow.type !== "idle" || step === "idle") {
      return;
    }
    setError(rfqError.message);
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

  useEffect(() => {
    if (!modalOpen || flow.type !== "idle" || accepting || !quote) return;
    const timer = window.setInterval(() => tick(value => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [modalOpen, flow.type, accepting, quote]);

  const secondsRemaining = quote ? quoteSecondsRemaining(quote) : 0;
  const handleAcceptQuote = () => {
    if (quote && quoteSecondsRemaining(quote) > 0) void accept(quote, rfqTerms(quote.rfq_id));
  };

  const handleClose = () => {
    if (flow.type !== "idle" && flow.type !== "confirmed" && flow.type !== "failed") {
      return;
    }
    if (flow.type !== "confirmed") cancelRfq();
    reset();
    setRecoveredOpen(false);
    onClose();
  };

  const solscanLink = txSignature && (
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
  );

  const formatUsdc = (value: number) => {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDC`;
  };
  const quoteQuantity = preview ? preview.quantity / 10 ** preview.underlyingDecimals : 0;
  const isBuy = preview?.side === "buy";
  // a bought spread pays its premium and owes nothing else
  const exercisable = isBuy && !isCashSettled(preview.terms.type);
  const quoteUnitPremium = quote ? Number(isBuy ? quote.price : quote.net_price ?? quote.price) / 1_000_000_000 : null;
  const totalPremiumUsd =
    preview?.lockedPremiumUsd != null
      ? preview.lockedPremiumUsd
      : quoteUnitPremium != null
        ? quoteUnitPremium * quoteQuantity
        : null;
  const displayedAprPct = preview?.lockedAprPct ?? null;

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
    <AppModal open={modalOpen} onClose={handleClose} title="Submit Order" showHowItWorks={false}>
      <div className="space-y-4">

        {isRestoredOrder ? (
          <div className={panelClass}>
            <div className="font-mono text-sm font-medium text-content-secondary">Recovered order</div>
          </div>
        ) : preview ? <div className={panelClass}>
          <div className="font-mono text-sm font-medium text-content-secondary">Order</div>
          {preview.thesis ? (
            <p className="mt-2 font-space text-lg font-semibold leading-[1.2] text-content-primary">
              &ldquo;{preview.thesis}&rdquo;
            </p>
          ) : null}
          <div className="mt-2 space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-content-secondary">Asset</span>
              <span className="font-semibold text-content-primary">{preview.asset}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Type</span>
              <span className="font-semibold text-content-primary">
                {isBuy ? BUY_PRODUCT_NAME[preview.terms.type] : productLabel(preview.terms.type)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Strike</span>
              <span className="font-semibold text-content-primary">{preview.strikeDisplay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Quantity</span>
              <span className="font-semibold text-content-primary">{preview.quantityDisplay}</span>
            </div>
            {totalPremiumUsd != null && (
              <div className="flex justify-between">
                <span className="text-content-secondary">{isBuy ? "Premium you pay" : "Premium"}</span>
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
        </div> : null}

        <>
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

        {!isRestoredOrder && quote && step === "quote_received" && (
          <div className={panelClass}>
            <div className="font-mono text-sm font-semibold text-accent-primary">Quote Received</div>
            <p role="timer" className="mt-1 font-mono text-sm text-content-secondary">
              {secondsRemaining > 0 ? `Quote expires in ${secondsRemaining}s` : "Quote expired. Request a fresh quote."}
            </p>
            <div className="mt-3 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-content-secondary">{isBuy ? "Premium you pay" : "Total premium"}</span>
                <span className="text-lg font-bold text-accent-primary">
                  {totalPremiumUsd != null ? formatUsdc(totalPremiumUsd) : "—"}
                </span>
              </div>
              {isBuy && preview && quoteUnitPremium != null ? (
                <BuyQuoteRows
                  preview={preview}
                  quantity={quoteQuantity}
                  grossPerUnit={quoteUnitPremium}
                  maxLoss={totalPremiumUsd != null ? formatUsdc(totalPremiumUsd) : "—"}
                  formatQuote={formatUsdc}
                />
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-content-tertiary">APR</span>
                  <span className="text-content-secondary">{displayedAprPct != null ? `${displayedAprPct.toFixed(2)}%` : "—"}</span>
                </div>
              )}
            </div>
            {exercisable ? <p role="alert" className="mt-3 border border-error p-3 font-mono text-sm leading-[1.4] text-error">{BUY_ITM_WARNING}</p> : null}
            {isBuy && !exercisable ? <p className="mt-3 font-mono text-sm leading-[1.4] text-content-secondary">{SPREAD_SETTLEMENT_NOTE}</p> : null}
          </div>
        )}
        </>

        {step === "confirmed" && (
          <div className={`${panelClass} text-center`}>
            <CheckCircle2 className="mx-auto h-12 w-12 text-additional-green-primary" />
            <div className="mt-3 font-mono font-semibold text-content-primary">Order Confirmed!</div>
            {positionPda && (
              <div className="mt-1 text-xs text-content-secondary">
                Position opened successfully.
              </div>
            )}
            {exercisable ? <div className="mt-1 text-xs text-content-secondary">{BUY_DEPOSIT_REMINDER}</div> : null}
            {solscanLink}
          </div>
        )}

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
                : step === "pending" ? (txSignature ? "Transaction sent. Waiting for on-chain confirmation." : "Order submitted. Waiting for on-chain confirmation.")
                : "The order outcome is not yet known. Check its status before placing another order."}
            </p>
            {step === "pending" && solscanLink}
            <div className="mt-3 flex gap-2">
              <AppButton onClick={checkStatus}>Check order status</AppButton>
              {canAbandon && <AppButton variant="secondary" onClick={abandon}>Cancel order</AppButton>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {step === "quote_received" && (
            <>
              <AppButton variant="secondary" className="flex-1" onClick={handleClose}>
                Cancel
              </AppButton>
              <AppButton className="flex-1" onClick={handleAcceptQuote} disabled={accepting || secondsRemaining === 0}>
                Accept Quote
              </AppButton>
            </>
          )}

          {(step === "accepting_quote" || step === "signing" || step === "submitting") && (
            <>
              {canAbandon && (
                <AppButton variant="secondary" className="flex-1" onClick={abandon}>Cancel order</AppButton>
              )}
              <AppButton className="flex-1" disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {processingLabel}
              </AppButton>
            </>
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
