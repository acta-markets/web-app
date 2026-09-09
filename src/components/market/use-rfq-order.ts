import { useCallback, useEffect, useRef, useState } from "react";
import type { VersionedTransaction } from "@solana/web3.js";
import type { ActaWsClient, ActaWsClientError, ConnectionState, QuoteReceivedMessage } from "@/lib/rfq-client";

type SelectedOrder = {
  orderId: string;
  rfqId: string;
  maker: string;
  sessionId: string | null;
};
type OpenOrder =
  | { type: "awaiting_signature" | "signing" | "submitting" | "pending"; order: SelectedOrder }
  | { type: "recovering" | "unknown"; order: SelectedOrder; submission: "unsigned" | "sent" };
type OrderFlow =
  | { type: "idle" }
  | OpenOrder
  | { type: "confirmed"; orderId: string; positionPda: string }
  | { type: "failed"; orderId: string; message: string };

function isOpen(flow: OrderFlow): flow is OpenOrder {
  return flow.type !== "idle" && flow.type !== "confirmed" && flow.type !== "failed";
}
function submissionOf(flow: OpenOrder): "unsigned" | "sent" {
  if (flow.type === "recovering" || flow.type === "unknown") return flow.submission;
  return flow.type === "submitting" || flow.type === "pending" ? "sent" : "unsigned";
}

type Options = {
  getClient: () => ActaWsClient | null;
  acceptQuote: (rfqId: string, maker: string, orderId: string) => Promise<void>;
  submitSignedTx: (orderId: string, tx: string) => Promise<void>;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
};

export function useRfqOrder({ getClient, acceptQuote, submitSignedTx, signTransaction }: Options) {
  const client = getClient();
  const [flow, setFlow] = useState<OrderFlow>({ type: "idle" });
  const current = useRef<OrderFlow>(flow);
  const signer = useRef(signTransaction);
  const walletSigning = useRef<Promise<VersionedTransaction> | null>(null);
  useEffect(() => { signer.current = signTransaction; }, [signTransaction]);
  const connection = useRef(0);
  const statusRequest = useRef<string | null>(null);
  const invalidateConnection = useCallback(() => {
    connection.current++;
    statusRequest.current = null;
  }, []);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const update = useCallback((next: OrderFlow) => {
    current.current = next;
    setFlow(next);
  }, []);
  const reset = useCallback(() => {
    invalidateConnection();
    update({ type: "idle" });
    setTxSignature(null);
  }, [update, invalidateConnection]);
  const sendAccept = useCallback(async (order: SelectedOrder) => {
    const epoch = connection.current;
    const attempt: OpenOrder = { type: "awaiting_signature", order };
    update(attempt);
    try {
      await acceptQuote(order.rfqId, order.maker, order.orderId);
    } catch (error) {
      if (connection.current !== epoch || current.current !== attempt) return;
      update({ type: "failed", orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
    }
  }, [acceptQuote, update]);

  const checkStatus = useCallback(() => {
    const active = current.current;
    if (!isOpen(active) || !client?.isAuthenticated() || statusRequest.current) return;
    const { order } = active;
    const submission = submissionOf(active);
    const requestId = crypto.randomUUID();
    const epoch = connection.current;
    statusRequest.current = requestId;
    const isCurrent = () => statusRequest.current === requestId
      && connection.current === epoch && current.current === active;
    void (async () => {
      if (submission === "unsigned") {
        const snapshot = await client.getMyActiveRfqsAsync();
        if (!isCurrent()) return;
        const rfq = snapshot.rfqs.find(rfq => rfq.rfq_id === order.rfqId);
        if (rfq?.locked_order_id === order.orderId) {
          if (rfq.state === "enqueued") {
            update({ type: "pending", order });
            return;
          }
          if (rfq.state === "pending_signature" && (active.type === "signing" || active.type === "awaiting_signature")) return;
          if (rfq.state === "pending_signature" && order.sessionId !== null
            && client.getSessionId() === order.sessionId) {
            await sendAccept(order);
            return;
          }
        }
        if (rfq && (rfq.state === "active" || rfq.locked_order_id !== order.orderId)) {
          update({ type: "failed", orderId: order.orderId, message: "Selected quote is no longer active" });
          return;
        }
      }
      const msg = await client.request("OrderStatus", {
        type: "GetOrderStatus", data: { request_id: requestId, order_id: order.orderId },
      });
      if (!isCurrent() || msg.order_id !== order.orderId) return;
      if (msg.state.type === "confirmed") {
        update({ type: "confirmed", orderId: msg.order_id, positionPda: msg.state.position_pda });
      } else if (msg.state.type === "pending" && submission === "sent") {
        update({ type: "pending", order });
      } else {
        update({ type: "unknown", order, submission });
      }
    })().catch(() => {
      if (isCurrent()) update({ type: "unknown", order, submission });
    }).finally(() => {
      if (statusRequest.current === requestId) statusRequest.current = null;
    });
  }, [client, sendAccept, update]);

  useEffect(() => {
    if (!client) return;
    const owns = (id: string) => {
      const active = current.current;
      return isOpen(active) && active.order.orderId === id;
    };
    const onDisconnected = () => {
      invalidateConnection();
      const active = current.current;
      if (isOpen(active)) update({ type: "recovering", order: active.order, submission: submissionOf(active) });
    };
    const onStateChange = (state: ConnectionState) => {
      if (state === "disconnected") onDisconnected();
    };
    const onConfirmed = (id: string, positionPda: string) => {
      if (owns(id)) update({ type: "confirmed", orderId: id, positionPda });
    };
    const onSubmitted = (id: string, signature: string) => {
      const active = current.current;
      if (!isOpen(active) || !owns(id)) return;
      setTxSignature(signature);
      update({ type: "submitting", order: active.order });
    };
    const onFailed = (id: string, reason: string) => {
      const active = current.current;
      if (!isOpen(active) || !owns(id)) return;
      if (submissionOf(active) === "unsigned") {
        update({ type: "failed", orderId: id, message: reason });
        return;
      }
      // A lifecycle failure does not prove that a submitted transaction cannot execute.
      update({ type: "unknown", order: active.order, submission: "sent" });
      checkStatus();
    };
    const onRfqEnded = (message: { rfq_id: string; reason: string }) => {
      const active = current.current;
      if (isOpen(active) && active.order.rfqId === message.rfq_id) {
        onFailed(active.order.orderId, message.reason);
      }
    };
    const onError = (error: ActaWsClientError) => {
      const active = current.current;
      if (!isOpen(active)) return;
      if (error.type === "SignatureTimeout") {
        checkStatus();
        return;
      }
      if (active.type !== "awaiting_signature") return;
      switch (error.type) {
        case "QuoteNotFound": case "QuoteExpired": case "QuoteLocked":
        case "RfqNotFound": case "RfqNotActive": case "InviteRequired":
        case "Unauthenticated": case "Unauthorized": case "OrderIdMismatch": case "UnknownOrder":
        case "InternalError": case "KernelNotAvailable": case "ServerShuttingDown":
          update({ type: "failed", orderId: active.order.orderId, message: error.type });
          break;
        case "Generic":
          if (error.data.code === "order_already_submitted") {
            update({ type: "pending", order: active.order });
            checkStatus();
          } else if ([
            "quote_not_found", "quote_expired", "quote_locked", "quote_refresh_required",
            "rfq_not_found", "rfq_not_active", "rfq_already_locked", "rfq_invalid_state",
            "rfq_closed", "rfq_expired", "tx_build_failed", "caps_authority_unavailable",
          ].includes(error.data.code)) {
            update({ type: "failed", orderId: active.order.orderId, message: error.data.message });
          }
      }
    };
    const onSponsored = async (id: string, txBase64: string, deadline?: number) => {
      const active = current.current;
      if (active.type !== "awaiting_signature" || !owns(id)) return;
      const epoch = connection.current;
      const signing: OpenOrder = { type: "signing", order: active.order };
      update(signing);
      try {
        if (!signer.current) throw new Error("Wallet does not support transaction signing");
        if (deadline != null && Math.floor(Date.now() / 1000) >= deadline) throw new Error("Signature deadline expired");
        const { VersionedTransaction } = await import("@solana/web3.js");
        const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(txBase64), c => c.charCodeAt(0)));
        if (epoch !== connection.current || current.current !== signing) return;
        if (walletSigning.current) await walletSigning.current.catch(() => {});
        if (epoch !== connection.current || current.current !== signing) return;
        if (deadline != null && Math.floor(Date.now() / 1000) >= deadline) throw new Error("Signature deadline expired");
        const request = signer.current(tx);
        walletSigning.current = request;
        let signed: VersionedTransaction;
        try {
          signed = await request;
        } finally {
          if (walletSigning.current === request) walletSigning.current = null;
        }
        if (epoch !== connection.current || current.current !== signing) return;
        if (deadline != null && Math.floor(Date.now() / 1000) >= deadline) throw new Error("Signature deadline expired");
        update({ type: "submitting", order: active.order });
        await submitSignedTx(id, btoa(String.fromCharCode(...signed.serialize())));
      } catch (error) {
        const now = current.current;
        if (!isOpen(now) || now.order !== active.order || epoch !== connection.current) return;
        if (submissionOf(now) === "sent") {
          update({ type: "unknown", order: active.order, submission: "sent" });
          checkStatus();
        } else if (now === signing) {
          update({ type: "failed", orderId: id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    client.on("disconnected", onDisconnected);
    client.on("stateChange", onStateChange);
    client.on("authenticated", checkStatus);
    client.on("sponsoredTxToSign", onSponsored);
    client.on("orderConfirmed", onConfirmed);
    client.on("orderSubmitted", onSubmitted);
    client.on("orderFailed", onFailed);
    client.on("rfqAvailableAgain", onRfqEnded);
    client.on("rfqClosed", onRfqEnded);
    client.on("error", onError);
    return () => {
      invalidateConnection();
      client.off("disconnected", onDisconnected);
      client.off("stateChange", onStateChange);
      client.off("authenticated", checkStatus);
      client.off("sponsoredTxToSign", onSponsored);
      client.off("orderConfirmed", onConfirmed);
      client.off("orderSubmitted", onSubmitted);
      client.off("orderFailed", onFailed);
      client.off("rfqAvailableAgain", onRfqEnded);
      client.off("rfqClosed", onRfqEnded);
      client.off("error", onError);
    };
  }, [client, update, submitSignedTx, checkStatus, invalidateConnection]);

  const accept = useCallback(async (quote: QuoteReceivedMessage) => {
    if (current.current.type !== "idle") return;
    await sendAccept({ orderId: quote.order_id, rfqId: quote.rfq_id, maker: quote.maker, sessionId: client?.getSessionId() ?? null });
  }, [client, sendAccept]);

  return { flow, accept, reset, checkStatus, txSignature };
}
