import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VersionedTransaction } from "@solana/web3.js";
import type { ActaWsClient, ActaWsClientError, ConnectionState, QuoteReceivedMessage } from "@/lib/rfq-client";

type OrderSubmission = "unsigned" | "sent";
type SelectedOrder = {
  orderId: string;
  rfqId: string;
  maker: string;
  originalSessionId: string | null;
};
type StoredOrder = SelectedOrder & { submission: OrderSubmission; txSignature?: string };
type StorageScope = { walletAddress: string | null; backendUrl: string };
type OpenOrder =
  | { type: "awaiting_signature" | "signing" | "submitting" | "pending"; order: SelectedOrder }
  | { type: "recovering" | "unknown"; order: SelectedOrder; submission: OrderSubmission };
type OrderFlow =
  | { type: "idle" }
  | OpenOrder
  | { type: "confirmed"; orderId: string; positionPda: string }
  | { type: "failed"; orderId: string; message: string };

const UNFINISHED_ORDER_KEY = "acta_rfq_unfinished_order";

function isOpen(flow: OrderFlow): flow is OpenOrder {
  return flow.type !== "idle" && flow.type !== "confirmed" && flow.type !== "failed";
}
function submissionOf(flow: OpenOrder): OrderSubmission {
  if (flow.type === "recovering" || flow.type === "unknown") return flow.submission;
  return flow.type === "submitting" || flow.type === "pending" ? "sent" : "unsigned";
}
function storageKeyFor(scope: StorageScope): string | null {
  const wallet = scope.walletAddress?.trim();
  const backend = scope.backendUrl.trim();
  if (!wallet || !backend || typeof window === "undefined") return null;
  return `${UNFINISHED_ORDER_KEY}:${encodeURIComponent(backend)}:${encodeURIComponent(wallet)}`;
}
function readStoredOrder(key: string): StoredOrder | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<StoredOrder>;
    if (typeof record.orderId !== "string" || typeof record.rfqId !== "string" || typeof record.maker !== "string") return null;
    if (record.originalSessionId !== null && typeof record.originalSessionId !== "string") return null;
    if (record.submission !== "unsigned" && record.submission !== "sent") return null;
    if (record.txSignature !== undefined && typeof record.txSignature !== "string") return null;
    return {
      orderId: record.orderId,
      rfqId: record.rfqId,
      maker: record.maker,
      originalSessionId: record.originalSessionId,
      submission: record.submission,
      ...(record.txSignature ? { txSignature: record.txSignature } : {}),
    };
  } catch {
    return null;
  }
}
function writeStoredOrder(key: string, order: SelectedOrder, submission: OrderSubmission, txSignature?: string | null): boolean {
  try {
    const record: StoredOrder = {
      ...order,
      submission,
      ...(txSignature ? { txSignature } : {}),
    };
    window.localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
function sameOrder(a: SelectedOrder, b: SelectedOrder): boolean {
  return a.orderId === b.orderId && a.rfqId === b.rfqId && a.maker === b.maker;
}
function recoveringFlow(stored: StoredOrder): OpenOrder {
  return {
    type: "recovering",
    order: {
      orderId: stored.orderId,
      rfqId: stored.rfqId,
      maker: stored.maker,
      originalSessionId: stored.originalSessionId,
    },
    submission: stored.submission,
  };
}

type Options = {
  getClient: () => ActaWsClient | null;
  acceptQuote: (rfqId: string, maker: string, orderId: string) => Promise<void>;
  submitSignedTx: (orderId: string, tx: string) => Promise<void>;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  scope: StorageScope;
};

export function useRfqOrder({ getClient, acceptQuote, submitSignedTx, signTransaction, scope }: Options) {
  const client = getClient();
  const storageKey = storageKeyFor(scope);
  const initialStored = useMemo(() => storageKey ? readStoredOrder(storageKey) : null, [storageKey]);
  const initialFlow: OrderFlow = initialStored ? recoveringFlow(initialStored) : { type: "idle" };
  const [flow, setFlow] = useState<OrderFlow>(initialFlow);
  const current = useRef<OrderFlow>(initialFlow);
  const signer = useRef(signTransaction);
  const walletSigning = useRef<Promise<VersionedTransaction> | null>(null);
  useEffect(() => { signer.current = signTransaction; }, [signTransaction]);
  const connection = useRef(0);
  const statusRequest = useRef<string | null>(null);
  const loadedScope = useRef<string | null>(storageKey);
  const [restoreGeneration, setRestoreGeneration] = useState(initialStored ? 1 : 0);
  const [restored, setRestored] = useState(Boolean(initialStored));
  const invalidateConnection = useCallback(() => {
    connection.current++;
    statusRequest.current = null;
  }, []);
  const [txSignature, setTxSignature] = useState<string | null>(initialStored?.txSignature ?? null);
  const clearTerminalRecord = useCallback((orderId: string) => {
    if (typeof storageKey !== "string") return;
    const existing = readStoredOrder(storageKey);
    if (!existing || existing.orderId !== orderId) return;
    try { window.localStorage.removeItem(storageKey); } catch { /* terminal cleanup is best-effort */ }
  }, [storageKey]);
  const update = useCallback((next: OrderFlow) => {
    if (next.type === "confirmed" || next.type === "failed") clearTerminalRecord(next.orderId);
    current.current = next;
    setFlow(next);
  }, [clearTerminalRecord]);
  const restoreStored = useCallback((stored: StoredOrder) => {
    setTxSignature(stored.txSignature ?? null);
    setRestored(true);
    setRestoreGeneration(value => value + 1);
    update(recoveringFlow(stored));
  }, [update]);
  const saveUnfinished = useCallback((order: SelectedOrder, submission: OrderSubmission, signature?: string | null) => {
    if (storageKey === null) return "unavailable" as const;
    const existing = readStoredOrder(storageKey);
    if (existing && !sameOrder(existing, order)) {
      restoreStored(existing);
      return "existing" as const;
    }
    if (existing?.submission === "sent") {
      if (submission === "unsigned" || signature === existing.txSignature || (!signature && existing.txSignature)) {
        restoreStored(existing);
        return "sent" as const;
      }
    }
    return writeStoredOrder(storageKey, order, submission, signature) ? "written" as const : "unavailable" as const;
  }, [storageKey, restoreStored]);
  const reset = useCallback(() => {
    invalidateConnection();
    update({ type: "idle" });
    setTxSignature(null);
    setRestored(false);
  }, [update, invalidateConnection]);

  const sendAccept = useCallback(async (order: SelectedOrder) => {
    const saved = saveUnfinished(order, "unsigned");
    if (saved === "existing" || saved === "sent") return;
    if (saved === "unavailable") {
      update({ type: "failed", orderId: order.orderId, message: "Unable to save unfinished order before accepting the quote" });
      return;
    }
    const epoch = connection.current;
    const attempt: OpenOrder = { type: "awaiting_signature", order };
    update(attempt);
    try {
      await acceptQuote(order.rfqId, order.maker, order.orderId);
    } catch (error) {
      if (connection.current !== epoch || current.current !== attempt) return;
      update({ type: "failed", orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
    }
  }, [acceptQuote, saveUnfinished, update]);

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
          if (rfq.state === "pending_signature" && order.originalSessionId !== null
            && client.getSessionId() === order.originalSessionId) {
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
    if (loadedScope.current === storageKey) return;
    loadedScope.current = storageKey;
    invalidateConnection();
    setTxSignature(null);
    if (storageKey === null) {
      setRestored(false);
      update({ type: "idle" });
      return;
    }
    const stored = readStoredOrder(storageKey);
    if (!stored) {
      setRestored(false);
      update({ type: "idle" });
      return;
    }
    restoreStored(stored);
  }, [invalidateConnection, restoreStored, storageKey, update]);

  useEffect(() => {
    if (restoreGeneration > 0 && client?.isAuthenticated()) checkStatus();
  }, [client, checkStatus, restoreGeneration]);

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
      const active = current.current;
      if (!isOpen(active) || active.order.orderId !== id) return;
      update({ type: "confirmed", orderId: id, positionPda });
    };
    const onAccepted = (id: string) => {
      const active = current.current;
      if (active.type === "submitting" && active.order.orderId === id) update({ type: "pending", order: active.order });
    };
    const onSubmitted = (id: string, signature: string) => {
      const active = current.current;
      if (!isOpen(active) || !owns(id)) return;
      if (saveUnfinished(active.order, "sent", signature) === "existing") return;
      setTxSignature(signature);
      update({ type: "pending", order: active.order });
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
        const saved = saveUnfinished(active.order, "sent");
        if (saved === "existing" || saved === "sent") return;
        if (saved === "unavailable") {
          update({ type: "unknown", order: active.order, submission: "unsigned" });
          return;
        }
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
    client.on("orderAccepted", onAccepted);
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
      client.off("orderAccepted", onAccepted);
      client.off("orderConfirmed", onConfirmed);
      client.off("orderSubmitted", onSubmitted);
      client.off("orderFailed", onFailed);
      client.off("rfqAvailableAgain", onRfqEnded);
      client.off("rfqClosed", onRfqEnded);
      client.off("error", onError);
    };
  }, [client, update, submitSignedTx, checkStatus, invalidateConnection, saveUnfinished]);

  const accept = useCallback(async (quote: QuoteReceivedMessage) => {
    if (current.current.type !== "idle") return;
    await sendAccept({
      orderId: quote.order_id,
      rfqId: quote.rfq_id,
      maker: quote.maker,
      originalSessionId: client?.getSessionId() ?? null,
    });
  }, [client, sendAccept]);

  return { flow, accept, reset, checkStatus, txSignature, restored };
}
