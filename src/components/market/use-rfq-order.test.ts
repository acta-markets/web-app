import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActaWsClient, type QuoteReceivedMessage } from "@/lib/rfq-client";
import type { VersionedTransaction } from "@solana/web3.js";
import { useRfqOrder } from "./use-rfq-order";

vi.mock("@solana/web3.js", () => ({ VersionedTransaction: { deserialize: vi.fn(() => ({})) } }));
afterEach(cleanup);
const quote = { rfq_id: "rfq", order_id: "order", maker: "maker", strike: 1, price: 1, valid_until: 9999999999, nonce: 1n } as QuoteReceivedMessage;
function setup() {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker" });
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  const session = vi.spyOn(client, "getSessionId").mockReturnValue("auth-session");
  const snapshot = vi.spyOn(client, "getMyActiveRfqsAsync").mockResolvedValue({ request_id: "snapshot", rfqs: [] });
  const request = vi.spyOn(client, "request").mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "unknown" } });
  const sign = vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) });
  const accept = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn().mockResolvedValue(undefined);
  const options = { getClient: () => client, acceptQuote: accept, submitSignedTx: submit, signTransaction: sign };
  const hook = renderHook(() => useRfqOrder(options));
  const emit = (event: string, ...args: unknown[]) => act(() => {
    (client as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(event, ...args);
  });
  const select = () => act(async () => { await hook.result.current.accept(quote); });
  return { ...hook, client, request, snapshot, session, sign, accept, submit, emit, select };
}

describe("taker order flow", () => {
  it("ignores unrelated sponsored transactions and completion events", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "other", "AQ==", 9999999999);
    h.emit("orderSubmitted", "other", "sig"); h.emit("orderConfirmed", "other", "pda"); h.emit("orderFailed", "other", "failed");
    expect(h.sign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
    expect(h.result.current.flow.type).toBe("awaiting_signature");
  });
  it("signs and submits the selected order once, then confirms it", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    h.emit("orderSubmitted", "order", "sig"); h.emit("orderConfirmed", "order", "pda");
    expect(h.result.current.flow).toEqual({ type: "confirmed", orderId: "order", positionPda: "pda" });
    expect(h.result.current.txSignature).toBe("sig");
  });
  it("surfaces an async accept rejection", async () => {
    const h = setup(); h.accept.mockRejectedValue(new Error("not authenticated")); await h.select();
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: "not authenticated" });
  });
  it("checks execution after async submission rejection instead of claiming no execution", async () => {
    const h = setup(); h.submit.mockRejectedValue(new Error("socket closed")); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow.type).toBe("unknown"));
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it("surfaces a server rejection of AcceptQuote without waiting forever", async () => {
    const h = setup(); await h.select(); h.emit("error", { type: "QuoteExpired" });
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: "QuoteExpired" });
    expect(h.sign).not.toHaveBeenCalled();
  });
  it.each(["rfq_already_locked", "rfq_not_found", "rfq_not_active", "caps_authority_unavailable"])("handles backend Generic rejection %s", async code => {
    const h = setup(); await h.select(); h.emit("error", { type: "Generic", data: { code, message: "Accept rejected" } });
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: "Accept rejected" });
    expect(h.submit).not.toHaveBeenCalled();
  });
  it("does not submit a wallet result after the server aborts signature collection", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementation(() => new Promise(r => { resolve = r; })); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalled()); h.emit("error", { type: "SignatureTimeout" });
    h.emit("rfqAvailableAgain", { rfq_id: "rfq", reason: "signature_timeout" });
    await act(async () => resolve({ serialize: () => new Uint8Array([1]) } as VersionedTransaction));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.result.current.flow.type).toBe("failed");
  });
  it("uses the server deadline before opening the wallet", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 1);
    await waitFor(() => expect(h.result.current.flow.type).toBe("failed"));
    expect(h.sign).not.toHaveBeenCalled();
  });
  it("does not submit a signature returned after its deadline", async () => {
    const h = setup(); const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    h.sign.mockImplementation(async () => { clock.mockReturnValue(3000); return { serialize: () => new Uint8Array([1]) }; });
    try {
      await h.select(); h.emit("sponsoredTxToSign", "order", "AQ==", 2);
      await waitFor(() => expect(h.result.current.flow.type).toBe("failed"));
      expect(h.submit).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it("retains the order on reconnect and resolves a lost confirmation by lookup", async () => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    expect(h.result.current.flow.type).toBe("recovering");
    h.request.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "confirmed", position_pda: "pda" } });
    h.emit("authenticated", "session", null, null);
    await waitFor(() => expect(h.result.current.flow.type).toBe("confirmed"));
    expect(h.accept).toHaveBeenCalledTimes(1); expect(h.submit).not.toHaveBeenCalled();
  });
  it("keeps unknown and lookup failures unresolved", async () => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    h.request.mockRejectedValue(new Error("timeout")); h.emit("authenticated", "session", null, null);
    await waitFor(() => expect(h.result.current.flow.type).toBe("unknown"));
  });
  it("does not let a late unknown lookup regress a confirmed event", async () => {
    const h = setup(); let resolve!: (value: never) => void;
    h.request.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); h.emit("authenticated", "session", null, null);
    await waitFor(() => expect(h.request).toHaveBeenCalled());
    h.emit("orderConfirmed", "order", "pda");
    await act(async () => resolve({ order_id: "order", state: { type: "unknown" } } as never));
    expect(h.result.current.flow.type).toBe("confirmed");
  });
  it("invalidates a pending signature on the local SDK disconnect notification", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementation(() => new Promise(r => { resolve = r; })); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalled());
    // Public disconnect emits stateChange, not the remote-close disconnected event.
    h.emit("stateChange", "disconnected");
    expect(h.result.current.flow.type).toBe("recovering");
    await act(async () => resolve({ serialize: () => new Uint8Array([1]) } as VersionedTransaction));
    expect(h.submit).not.toHaveBeenCalled();
  });
  it("does not send a wallet result across a connection change", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementation(() => new Promise(r => { resolve = r; })); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalled()); h.emit("disconnected", 1006, "lost");
    await act(async () => resolve({ serialize: () => new Uint8Array([1]) } as VersionedTransaction));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.result.current.flow.type).toBe("recovering");
  });
});

describe("recovery with the current backend contract", () => {
  const pendingSignature = { rfq_id: "rfq", market: "market", position_type: "covered_call" as const, strike: 1, quantity: 1, expires_at: 9999999999, quotes_count: 1, state: "pending_signature" as const, locked_order_id: "order" };

  it.each(["OrderIdMismatch", "UnknownOrder"])("handles typed %s before submission", async type => {
    const h = setup(); await h.select(); h.emit("error", { type });
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: type });
  });

  it("handles typed SignatureTimeout using the selected RFQ state", async () => {
    const h = setup(); await h.select();
    h.snapshot.mockResolvedValue({ request_id: "snapshot", rfqs: [{ ...pendingSignature, state: "active", locked_order_id: null }] });
    h.emit("error", { type: "SignatureTimeout" });
    await waitFor(() => expect(h.result.current.flow.type).toBe("failed"));
    expect(h.sign).not.toHaveBeenCalled();
  });

  it("does not abort signing for another RFQ's timeout", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementation(() => new Promise(r => { resolve = r; }));
    h.snapshot.mockResolvedValue({ request_id: "snapshot", rfqs: [pendingSignature] });
    await h.select(); h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalled());
    h.emit("error", { type: "SignatureTimeout" });
    h.emit("rfqAvailableAgain", { rfq_id: "other", reason: "signature_timeout" });
    await act(async () => {});
    expect(h.result.current.flow.type).toBe("signing");
    expect(h.accept).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ serialize: () => new Uint8Array([1]) } as VersionedTransaction));
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  it("recovers the same selected order and signs its preserved payload", async () => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    h.snapshot.mockResolvedValue({ request_id: "snapshot", rfqs: [pendingSignature] });
    h.emit("authenticated", "auth-session", null, null);
    await waitFor(() => expect(h.accept).toHaveBeenCalledTimes(2));
    expect(h.accept).toHaveBeenLastCalledWith("rfq", "maker", "order");
    expect(h.result.current.flow.type).toBe("awaiting_signature");
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    expect(h.request).not.toHaveBeenCalled();
  });

  it.each(["changed credential", "different selected order", "missing RFQ"])("does not replay AcceptQuote for %s", async scenario => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    h.snapshot.mockResolvedValue({ request_id: "snapshot", rfqs: scenario === "missing RFQ" ? [] : [{ ...pendingSignature, locked_order_id: scenario === "different selected order" ? "other" : "order" }] });
    if (scenario === "changed credential") h.session.mockReturnValue("new-auth-session");
    h.emit("authenticated", h.client.getSessionId(), null, null);
    await waitFor(() => expect(h.result.current.flow.type).toBe(scenario === "different selected order" ? "failed" : "unknown"));
    expect(h.accept).toHaveBeenCalledTimes(1);
    expect(h.sign).not.toHaveBeenCalled();
  });

  it("waits for the old wallet prompt to settle before signing after resume", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalledTimes(1));
    h.emit("disconnected", 1006, "lost");
    h.snapshot.mockResolvedValue({ request_id: "snapshot", rfqs: [pendingSignature] });
    h.emit("authenticated", "auth-session", null, null);
    await waitFor(() => expect(h.accept).toHaveBeenCalledTimes(2));
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await act(async () => {});
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
    await act(async () => resolve({ serialize: () => new Uint8Array([99]) } as VersionedTransaction));
    await waitFor(() => expect(h.sign).toHaveBeenCalledTimes(2));
    expect(h.submit).toHaveBeenCalledExactlyOnceWith("order", "AQ==");
  });

  it("never resends acceptance or a signed transaction after submission", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    h.emit("disconnected", 1006, "lost");
    h.request.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "pending" } });
    h.emit("authenticated", "auth-session", null, null);
    await waitFor(() => expect(h.result.current.flow.type).toBe("pending"));
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    expect(h.accept).toHaveBeenCalledTimes(1);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(h.snapshot).not.toHaveBeenCalled();
  });

  it("keeps submission uncertainty after a timeout notification", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalled());
    h.emit("error", { type: "SignatureTimeout" });
    await waitFor(() => expect(h.result.current.flow.type).toBe("unknown"));
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("ignores a recovery snapshot from a connection that closed meanwhile", async () => {
    const h = setup(); let resolve!: (value: Awaited<ReturnType<typeof h.client.getMyActiveRfqsAsync>>) => void;
    h.snapshot.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); h.emit("authenticated", "auth-session", null, null);
    h.emit("disconnected", 1006, "lost again");
    await act(async () => resolve({ request_id: "snapshot", rfqs: [pendingSignature] }));
    expect(h.result.current.flow.type).toBe("recovering");
    expect(h.accept).toHaveBeenCalledTimes(1);
  });

  it("does not let a late snapshot replace a confirmed push", async () => {
    const h = setup(); let resolve!: (value: Awaited<ReturnType<typeof h.client.getMyActiveRfqsAsync>>) => void;
    h.snapshot.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); h.emit("authenticated", "auth-session", null, null);
    h.emit("orderConfirmed", "order", "pda");
    await act(async () => resolve({ request_id: "snapshot", rfqs: [pendingSignature] }));
    expect(h.result.current.flow).toEqual({ type: "confirmed", orderId: "order", positionPda: "pda" });
    expect(h.accept).toHaveBeenCalledTimes(1);
  });
});
