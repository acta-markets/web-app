import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VersionedTransaction } from "@solana/web3.js";
import { address } from "@solana/kit";
import type { Vault } from "@acta-markets/ts-sdk";
import { fetchMakerVault, flows } from "@acta-markets/ts-sdk/chain";
import {
  ActaWsRequestError,
  verifyAndSignTakerFill,
  wsErrorMessage,
  type ActaWsClient,
  type ConnectionState,
  type MyActiveRfqsMessage,
  type QuoteReceivedMessage,
  type TakerFillRfq,
} from "@/lib/rfq-client";

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
  /** `abandonable`: known in this session not to have been submitted, so cancelling cannot orphan a live order. */
  | { type: "recovering" | "unknown"; order: SelectedOrder; submission: OrderSubmission; abandonable: boolean };
type OrderFlow =
  | { type: "idle" }
  | OpenOrder
  | { type: "confirmed"; orderId: string; positionPda: string }
  | { type: "failed"; orderId: string; message: string };

const UNFINISHED_ORDER_KEY = "acta_rfq_unfinished_order";
const FILL_BOUNDS = { maxUnitLimit: 400_000, maxUnitPriceMicroLamports: 100_000 };

function isOpen(flow: OrderFlow): flow is OpenOrder {
  return flow.type !== "idle" && flow.type !== "confirmed" && flow.type !== "failed";
}
function abandonableOf(flow: OpenOrder): boolean {
  if (flow.type === "awaiting_signature" || flow.type === "signing") return true;
  return (flow.type === "recovering" || flow.type === "unknown") && flow.submission === "unsigned" && flow.abandonable;
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
    abandonable: false,
  };
}

type Options = {
  getClient: () => ActaWsClient | null;
  acceptQuote: (rfqId: string, maker: string, orderId: string) => Promise<void>;
  submitSignedTx: (orderId: string, tx: string) => Promise<void>;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  rpc: Parameters<typeof fetchMakerVault>[0];
  scope: StorageScope;
};

export function useRfqOrder({ getClient, acceptQuote, submitSignedTx, signTransaction, rpc, scope }: Options) {
  const client = getClient();
  const storageKey = storageKeyFor(scope);
  const initialStored = useMemo(() => storageKey ? readStoredOrder(storageKey) : null, [storageKey]);
  const initialFlow: OrderFlow = initialStored ? recoveringFlow(initialStored) : { type: "idle" };
  const [flow, setFlow] = useState<OrderFlow>(initialFlow);
  const current = useRef<OrderFlow>(initialFlow);
  const signer = useRef(signTransaction);
  const accepted = useRef<{
    quote: QuoteReceivedMessage;
    rfq: TakerFillRfq;
    taker: string;
    makerVault: Vault | null;
  } | null>(null);
  const walletSigning = useRef<Promise<VersionedTransaction> | null>(null);
  useEffect(() => { signer.current = signTransaction; }, [signTransaction]);
  const connection = useRef(0);
  const statusRequest = useRef<string | null>(null);
  const loadedScope = useRef<string | null>(storageKey);
  const [restoreGeneration, setRestoreGeneration] = useState(initialStored ? 1 : 0);
  const [restored, setRestored] = useState(Boolean(initialStored));
  const preparing = useRef<{ orderId: string; rfqId: string } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const stopPreparing = useCallback(() => {
    preparing.current = null;
    setAccepting(false);
  }, []);
  const invalidateConnection = useCallback(() => {
    connection.current++;
    statusRequest.current = null;
    stopPreparing();
  }, [stopPreparing]);
  const [txSignature, setTxSignature] = useState<string | null>(initialStored?.txSignature ?? null);
  const clearTerminalRecord = useCallback((orderId: string) => {
    if (typeof storageKey !== "string") return;
    const existing = readStoredOrder(storageKey);
    if (!existing || existing.orderId !== orderId) return;
    try { window.localStorage.removeItem(storageKey); } catch {                                       }
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
    accepted.current = null;
    update({ type: "idle" });
    setTxSignature(null);
    setRestored(false);
  }, [update, invalidateConnection]);

  /** The server holds this order's signed transaction: record it as sent so no later session offers to abandon it. */
  const promoteSent = useCallback((order: SelectedOrder) => {
    const existing = storageKey === null ? null : readStoredOrder(storageKey);
    if (existing && !sameOrder(existing, order)) {
      restoreStored(existing);
      return;
    }
    if (storageKey !== null && existing?.submission !== "sent") {
      writeStoredOrder(storageKey, order, "sent", existing?.txSignature);
    }
    update({ type: "pending", order });
  }, [storageKey, restoreStored, update]);

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
      if (error instanceof ActaWsRequestError && error.kind === "timeout") return;
      update({ type: "failed", orderId: order.orderId, message: wsErrorMessage(error) });
    }
  }, [acceptQuote, saveUnfinished, update]);

  const reconcile = useCallback((pushed?: MyActiveRfqsMessage) => {
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
      let awaitingSignature = false;
      if (submission === "unsigned") {
        const snapshot = pushed ?? await client.getMyActiveRfqsAsync();
        if (!isCurrent()) return;
        const rfq = snapshot.rfqs.find(rfq => rfq.rfq_id === order.rfqId);
        if (rfq?.locked_order_id === order.orderId) {
          if (rfq.state === "enqueued") {
            promoteSent(order);
            return;
          }
          if (rfq.state === "pending_signature" && (active.type === "signing" || active.type === "awaiting_signature")) return;
          awaitingSignature = rfq.state === "pending_signature";
          if (rfq.state === "pending_signature" && order.originalSessionId !== null
            && client.getSessionId() === order.originalSessionId
            && accepted.current?.quote.order_id === order.orderId) {
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
      } else if (msg.state.type === "pending" && !awaitingSignature) {
        promoteSent(order);
      } else {
        update({ type: "unknown", order, submission, abandonable: submission === "unsigned" });
      }
    })().catch(() => {
      if (isCurrent()) update({ type: "unknown", order, submission, abandonable: abandonableOf(active) });
    }).finally(() => {
      if (statusRequest.current === requestId) statusRequest.current = null;
    });
  }, [client, promoteSent, sendAccept, update]);
  const checkStatus = useCallback(() => reconcile(), [reconcile]);

  useEffect(() => {
    if (loadedScope.current === storageKey) return;
    loadedScope.current = storageKey;
    invalidateConnection();
    accepted.current = null;
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
    if (restoreGeneration > 0 && client?.isAuthenticated()) reconcile();
  }, [client, reconcile, restoreGeneration]);

  useEffect(() => {
    if (!client) return;
    const owns = (id: string) => {
      const active = current.current;
      return isOpen(active) && active.order.orderId === id;
    };
    const onDisconnected = () => {
      invalidateConnection();
      const active = current.current;
      if (isOpen(active)) {
        update({ type: "recovering", order: active.order, submission: submissionOf(active), abandonable: abandonableOf(active) });
      }
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
      if (active.type === "confirmed" && active.orderId === id) {
        setTxSignature(signature);
        return;
      }
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
      update({ type: "unknown", order: active.order, submission: "sent", abandonable: false });
      reconcile();
    };
    const onRfqEnded = (message: { rfq_id: string; reason: string }) => {
      if (preparing.current?.rfqId === message.rfq_id) stopPreparing();
      const active = current.current;
      if (isOpen(active) && active.order.rfqId === message.rfq_id) {
        onFailed(active.order.orderId, message.reason);
      }
    };
    const onAvailableAgain = (message: { rfq_id: string; reason: string }) => {
      if (message.reason !== "tx_failed") {
        onRfqEnded(message);
        return;
      }
      if (preparing.current?.rfqId === message.rfq_id) stopPreparing();
      const active = current.current;
      if (isOpen(active) && active.order.rfqId === message.rfq_id) {
        update({ type: "failed", orderId: active.order.orderId, message: "The transaction failed and was not executed. Request a fresh quote." });
      }
    };
    const onSponsored = async (id: string, txBase64: string, deadline?: number) => {
      const active = current.current;
      if (active.type !== "awaiting_signature" || !owns(id)) return;
      const epoch = connection.current;
      const signing: OpenOrder = { type: "signing", order: active.order };
      update(signing);
      const live = () => epoch === connection.current && current.current === signing;
      const expired = () => deadline != null && Math.floor(Date.now() / 1000) >= deadline;
      try {
        const sign = signer.current;
        if (!sign) throw new Error("Wallet does not support transaction signing");
        if (expired()) throw new Error("Signature deadline expired");
        const fill = accepted.current;
        if (!fill || fill.quote.order_id !== id) {
          throw new flows.VaultIntentError({ kind: "intent", reason: "the accepted quote is not available in this session" });
        }
        const { VersionedTransaction } = await import("@solana/web3.js");
        if (!live()) return;
        if (walletSigning.current) await walletSigning.current.catch(() => {});
        if (!live()) return;
        if (expired()) throw new Error("Signature deadline expired");
        const signed = await verifyAndSignTakerFill({
          txBase64,
          quote: fill.quote,
          rfq: fill.rfq,
          taker: address(fill.taker),
          tables: {},
          bounds: FILL_BOUNDS,
          makerVault: fill.makerVault,
          signer: {
            signTransaction: async (wire) => {
              if (!live()) throw new Error("Signing was abandoned before the wallet was opened");
              if (expired()) throw new Error("Signature deadline expired");
              const request = sign(VersionedTransaction.deserialize(wire));
              walletSigning.current = request;
              try {
                return (await request).serialize();
              } finally {
                if (walletSigning.current === request) walletSigning.current = null;
              }
            },
          },
        });
        if (!live()) return;
        if (expired()) throw new Error("Signature deadline expired");
        const saved = saveUnfinished(active.order, "sent");
        if (saved === "existing" || saved === "sent") return;
        if (saved === "unavailable") {
          update({ type: "unknown", order: active.order, submission: "unsigned", abandonable: true });
          return;
        }
        const submitting: OpenOrder = { type: "submitting", order: active.order };
        update(submitting);
        await submitSignedTx(id, signed);
        if (current.current === submitting) update({ type: "pending", order: active.order });
      } catch (error) {
        const now = current.current;
        if (!isOpen(now) || now.order !== active.order || epoch !== connection.current) return;
        if (submissionOf(now) === "sent") {
          if (error instanceof ActaWsRequestError && error.delivery === "not_forwarded") {
            update({ type: "failed", orderId: id, message: wsErrorMessage(error) });
            return;
          }
          update({ type: "pending", order: active.order });
          reconcile();
        } else if (now === signing && error instanceof flows.VaultIntentError) {
          if (client.isAuthenticated()) client.cancelRfq(active.order.rfqId);
          update({
            type: "failed",
            orderId: id,
            message: error.mismatch.kind === "walletMessage"
              ? "The wallet returned a different transaction than the verified one. It was not submitted; the RFQ was cancelled."
              : `Transaction does not match the accepted quote (${error.message}). Nothing was signed; the RFQ was cancelled.`,
          });
        } else if (now === signing) {
          update({ type: "failed", orderId: id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    client.on("disconnected", onDisconnected);
    client.on("stateChange", onStateChange);
    client.on("myActiveRfqs", reconcile);
    client.on("sponsoredTxToSign", onSponsored);
    client.on("orderAccepted", onAccepted);
    client.on("orderConfirmed", onConfirmed);
    client.on("orderSubmitted", onSubmitted);
    client.on("orderFailed", onFailed);
    client.on("rfqAvailableAgain", onAvailableAgain);
    client.on("rfqClosed", onRfqEnded);
    return () => {
      invalidateConnection();
      client.off("disconnected", onDisconnected);
      client.off("stateChange", onStateChange);
      client.off("myActiveRfqs", reconcile);
      client.off("sponsoredTxToSign", onSponsored);
      client.off("orderAccepted", onAccepted);
      client.off("orderConfirmed", onConfirmed);
      client.off("orderSubmitted", onSubmitted);
      client.off("orderFailed", onFailed);
      client.off("rfqAvailableAgain", onAvailableAgain);
      client.off("rfqClosed", onRfqEnded);
    };
  }, [client, update, submitSignedTx, reconcile, invalidateConnection, saveUnfinished, stopPreparing]);

  const accept = useCallback(async (quote: QuoteReceivedMessage, rfq: TakerFillRfq | null) => {
    if (current.current.type !== "idle" || preparing.current) return;
    const taker = scope.walletAddress;
    if (!rfq || !taker) {
      update({ type: "failed", orderId: quote.order_id, message: "The quote's RFQ is no longer open. Request a fresh quote." });
      return;
    }
    const attempt = { orderId: quote.order_id, rfqId: quote.rfq_id };
    const epoch = connection.current;
    preparing.current = attempt;
    setAccepting(true);
    const settle = () => {
      if (preparing.current !== attempt) return false;
      stopPreparing();
      return connection.current === epoch && current.current.type === "idle";
    };
    let makerVault: Vault | null;
    try {
      makerVault = await fetchMakerVault(rpc, quote.maker);
    } catch (error) {
      if (!settle()) return;
      update({ type: "failed", orderId: quote.order_id, message: `Unable to read the quote's maker: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    if (!settle()) return;
    accepted.current = { quote, rfq, taker, makerVault };
    await sendAccept({
      orderId: quote.order_id,
      rfqId: quote.rfq_id,
      maker: quote.maker,
      originalSessionId: client?.getSessionId() ?? null,
    });
  }, [client, rpc, sendAccept, scope.walletAddress, stopPreparing, update]);

  /** Exit for an order known not to have been submitted: drops any pending wallet result and cancels its RFQ. */
  const abandon = useCallback(() => {
    const active = current.current;
    if (!isOpen(active) || !abandonableOf(active)) return;
    const stored = storageKey === null ? null : readStoredOrder(storageKey);
    if (stored && (!sameOrder(stored, active.order) || stored.submission === "sent")) {
      restoreStored(stored);
      return;
    }
    invalidateConnection();
    accepted.current = null;
    if (client?.isAuthenticated()) client.cancelRfq(active.order.rfqId);
    update({ type: "failed", orderId: active.order.orderId, message: "Order cancelled. Nothing was submitted." });
  }, [client, invalidateConnection, restoreStored, storageKey, update]);
  const canAbandon = isOpen(flow) && abandonableOf(flow);

  return { flow, accept, accepting, abandon, canAbandon, reset, checkStatus, txSignature, restored };
}
