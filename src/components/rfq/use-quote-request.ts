"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RFQ_TTL_SECONDS, useRfqContext } from "@/components/rfq/rfq-provider";
import type { RfqOrderPreview } from "@/components/market/rfq-flow-modal";

export type QuoteRfq = {
  market: string;
  terms: RfqOrderPreview["terms"];
  side?: RfqOrderPreview["side"];
  quantity: number;
};

export type QuoteFailure = { kind: "error"; message: string } | { kind: "timeout" };

/**
 * Fresh quote on click: `request` sends the RFQ and waits. The first quote opens the
 * order modal, an RFQ error ends the wait, and with no quote after RFQ_TTL_SECONDS the
 * RFQ is cancelled. Spread `modalProps` onto `RfqFlowModal`; from there an expired quote or a
 * failed order can ask again without leaving the modal.
 */
export function useQuoteRequest({ cancelOnUnmount = false }: { cancelOnUnmount?: boolean } = {}) {
  const { bestQuote, error, submitRfq, cancelRfq } = useRfqContext();
  const [isRequesting, setIsRequesting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [requestNonce, setRequestNonce] = useState(0);
  const [preview, setPreview] = useState<RfqOrderPreview | null>(null);
  const [failure, setFailure] = useState<QuoteFailure | null>(null);

  useEffect(() => {
    if (!isRequesting || modalOpen) return;
    if (error) {
      setIsRequesting(false);
      setFailure({ kind: "error", message: error.message });
      return;
    }
    if (!bestQuote) return;
    setIsRequesting(false);
    setRequestNonce((n) => n + 1);
    setModalOpen(true);
  }, [isRequesting, modalOpen, error, bestQuote]);

  useEffect(() => {
    if (!isRequesting || modalOpen) return;
    const timeoutId = window.setTimeout(() => {
      setIsRequesting(false);
      setFailure({ kind: "timeout" });
      cancelRfq();
    }, RFQ_TTL_SECONDS * 1000);
    return () => window.clearTimeout(timeoutId);
  }, [isRequesting, modalOpen, cancelRfq]);

  const requesting = useRef(false);
  const cancelRef = useRef(cancelRfq);
  useEffect(() => {
    requesting.current = isRequesting;
    cancelRef.current = cancelRfq;
  });
  useEffect(() => {
    if (!cancelOnUnmount) return;
    return () => {
      if (requesting.current) cancelRef.current();
    };
  }, [cancelOnUnmount]);

  const lastRfq = useRef<QuoteRfq | null>(null);
  const request = useCallback((rfq: QuoteRfq, orderPreview: RfqOrderPreview) => {
    lastRfq.current = rfq;
    setFailure(null);
    setPreview(orderPreview);
    submitRfq({ ...rfq, timeoutSeconds: RFQ_TTL_SECONDS });
    setIsRequesting(true);
  }, [submitRfq]);

  /** The same request again, from inside the open modal: it waits there for the new quote. */
  const requote = useCallback(() => {
    if (lastRfq.current) submitRfq({ ...lastRfq.current, timeoutSeconds: RFQ_TTL_SECONDS });
  }, [submitRfq]);

  const onClose = useCallback(() => {
    setModalOpen(false);
    setIsRequesting(false);
  }, []);

  return {
    isRequesting,
    failure,
    request,
    modalProps: { open: modalOpen, onClose, requestNonce, preview, onRequote: requote },
  };
}
