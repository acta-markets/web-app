"use client";

import { useEffect, useRef, useState } from "react";
import { AppModal } from "@/components/app-ui/app-modal";
import { RFQ_TTL_SECONDS, useRfqContext } from "@/components/rfq/rfq-provider";
import type { QuoteReceivedMessage } from "@/lib/rfq-client";
import { QuoteFlowView, quoteFlowTitle, type QuoteFlowOrder, type QuoteFlowStep } from "./quote-flow-view";
import { useRfqOrder } from "./use-rfq-order";
import type { VersionedTransaction } from "@solana/web3.js";
import { IS_MAINNET } from "@/lib/tokens";

import { BUY_PRODUCT_NAME, isCashSettled, lowerStrike, productLabel, quoteMatchesProduct, type ProductTerms, type TakerSide } from "@/lib/spreads";
import { formatExpiryUtc, formatPrice, formatUsdc } from "@/lib/trade/format";
import { BUY_DEPOSIT_REMINDER, SPREAD_SETTLEMENT_NOTE, buyBreakEven, exerciseDepositText, spreadBounds, spreadBreakEven, spreadMaxGain } from "@/lib/trade/thesis";

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

type FlowStep = QuoteFlowStep;

interface RfqFlowModalProps {
  open: boolean;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Incremented by parent whenever a new quote is requested */
  requestNonce: number;
  /** Sends the same request again, for a quote that expired or an order that failed. */
  onRequote?: () => void;
  preview: RfqOrderPreview | null;
  walletAddress: string | null;
  backendUrl: string;
  /** Sign transaction function from wallet */
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  /** Raw wire signing, preferred on money paths because nothing is re-encoded. */
  signTransactionBytes?: (bytes: Uint8Array) => Promise<Uint8Array>;
  rpc: Parameters<typeof useRfqOrder>[0]["rpc"];
}

const PENDING = "\u2014";

/**
 * A bought position's terms that depend on the quoted price; dashes until the quote is in.
 * The most it can lose is the premium itself, which the headline already says.
 */
function buyQuoteFacts(preview: RfqOrderPreview, quantity: number, grossPerUnit: number | null): Array<[string, string]> {
  const isPut = preview.terms.type === "cash_secured_put";
  const strike = lowerStrike(preview.terms) / 1_000_000_000;
  const bounds = spreadBounds(preview.terms);
  const priced = grossPerUnit != null;
  if (bounds) {
    return [
      ["Max gain", priced ? formatUsdc(spreadMaxGain(quantity, bounds.upper, bounds.lower) - grossPerUnit * quantity) : PENDING],
      ["Break-even", priced ? formatPrice(preview.terms.type === "call_spread"
        ? spreadBreakEven(false, bounds.lower / 1e9, grossPerUnit)
        : spreadBreakEven(true, bounds.upper / 1e9, grossPerUnit)) : PENDING],
    ];
  }
  return [
    ["Break-even", priced ? formatPrice(buyBreakEven(isPut, strike, grossPerUnit)) : PENDING],
    ["Deposit to exercise", exerciseDepositText(isPut, quantity, strike, preview.asset)],
  ];
}

export function RfqFlowModal({
  open,
  onClose,
  onBusyChange,
  requestNonce,
  onRequote,
  preview,
  walletAddress,
  backendUrl,
  signTransaction,
  signTransactionBytes,
  rpc,
}: RfqFlowModalProps) {
  const {
    bestQuote,
    quoteSecondsRemaining,
    rfqSecondsRemaining,
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
    getClient, acceptQuote, submitSignedTx, signTransaction, signTransactionBytes, rpc,
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

  // Waiting for a quote inside the modal (the first one was withdrawn, or a fresh one was asked
  // for) must end: past the request's own lifetime nothing more can arrive.
  useEffect(() => {
    if (!modalOpen || flow.type !== "idle" || quoteStep !== "requesting_quote") return;
    const timer = window.setTimeout(() => {
      cancelRfq();
      setError(`No quote came back in ${RFQ_TTL_SECONDS} seconds.`);
      setStep("failed");
    }, RFQ_TTL_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [modalOpen, flow.type, quoteStep, cancelRfq]);

  // The time left to confirm is the RFQ's, not the quote's: makers pad a quote's validity past
  // the RFQ's close and refresh it as they requote, so counting that down ran long and jumped.
  // The RFQ's close only ever approaches. The quote's own validity still caps it.
  const quoteRemaining = quote ? quoteSecondsRemaining(quote) : 0;
  const rfqRemaining = quote ? rfqSecondsRemaining?.(quote.rfq_id) ?? null : null;
  const secondsRemaining = rfqRemaining == null ? quoteRemaining : Math.min(quoteRemaining, rfqRemaining);
  // what was left when this RFQ's quote was first shown: the countdown bar drains against it
  const countdownStart = useRef<{ rfqId: string; total: number } | null>(null);
  if (quote && countdownStart.current?.rfqId !== quote.rfq_id) {
    countdownStart.current = { rfqId: quote.rfq_id, total: Math.max(1, secondsRemaining) };
  }
  const secondsTotal = quote ? countdownStart.current?.total ?? 0 : 0;
  const handleAcceptQuote = () => {
    if (quote && quoteSecondsRemaining(quote) > 0) void accept(quote, rfqTerms(quote.rfq_id));
  };

  /** Mid-order (signing, sending, checking) the modal stays: the order has to settle first. */
  const closable = flow.type === "idle" || flow.type === "confirmed" || flow.type === "failed";
  const handleClose = () => {
    if (!closable) return;
    if (flow.type !== "confirmed") cancelRfq();
    reset();
    setRecoveredOpen(false);
    onClose();
  };

  const handleRequote = onRequote
    ? () => {
        reset();
        setError(null);
        setQuote(null);
        setStep("requesting_quote");
        onRequote();
      }
    : undefined;

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

  const order: QuoteFlowOrder | null = preview && !isRestoredOrder ? {
    thesis: preview.thesis ?? null,
    premiumLabel: isBuy ? "You pay premium" : "You earn now",
    premium: totalPremiumUsd != null ? formatUsdc(totalPremiumUsd) : null,
    premiumNote: isBuy ? "This is the most you can lose." : null,
    facts: [
      [isBuy ? "Size" : "You deposit", preview.quantityDisplay],
      // the thesis already names the strike; without one the row carries it
      ...(preview.thesis ? [] : [["Strike", preview.strikeDisplay] as [string, string]]),
      ...(isBuy ? buyQuoteFacts(preview, quoteQuantity, quoteUnitPremium) : []),
      ...(!isBuy && displayedAprPct != null ? [["APR", `${displayedAprPct.toFixed(2)}%`] as [string, string]] : []),
      ...(preview.expiryTs != null ? [["Expires", formatExpiryUtc(preview.expiryTs * 1000)] as [string, string]] : []),
      ["Type", isBuy ? BUY_PRODUCT_NAME[preview.terms.type] : productLabel(preview.terms.type)],
    ],
    note: isBuy && !exercisable ? SPREAD_SETTLEMENT_NOTE : null,
    nextStep: exercisable ? BUY_DEPOSIT_REMINDER : null,
  } : null;

  return (
    <AppModal
      open={modalOpen}
      onClose={handleClose}
      title={quoteFlowTitle(step, isRestoredOrder)}
      showHowItWorks={false}
      dismissible={closable}
      className="max-w-lg"
    >
      <QuoteFlowView
        step={step}
        order={order}
        restored={isRestoredOrder}
        secondsRemaining={secondsRemaining}
        secondsTotal={secondsTotal}
        error={flowError}
        txUrl={txSignature ? `https://solscan.io/tx/${txSignature}${IS_MAINNET ? "" : "?cluster=devnet"}` : null}
        accepting={accepting}
        canAbandon={canAbandon}
        onAccept={handleAcceptQuote}
        onClose={handleClose}
        onAbandon={abandon}
        onCheckStatus={checkStatus}
        onRequote={handleRequote}
      />
    </AppModal>
  );
}
