import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flows } from "@acta-markets/ts-sdk/chain";
import type { Vault } from "@acta-markets/ts-sdk";
import type { WalletTransactionSigner } from "@acta-markets/ts-sdk/ws";
import { ActaWsClient, ActaWsRequestError, type QuoteReceivedMessage, type TakerFillRfq } from "@/lib/rfq-client";
import type { VersionedTransaction } from "@solana/web3.js";
import { useRfqOrder } from "./use-rfq-order";

const sdk = vi.hoisted(() => ({ verify: vi.fn(), makerVault: vi.fn() }));
vi.mock("@acta-markets/ts-sdk/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@acta-markets/ts-sdk/chain")>()),
  fetchMakerVault: sdk.makerVault,
}));
vi.mock("@/lib/rfq-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rfq-client")>()),
  verifyAndSignTakerFill: sdk.verify,
}));
vi.mock("@solana/web3.js", () => ({ VersionedTransaction: { deserialize: vi.fn(() => ({})) } }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
const quote = { rfq_id: "rfq", order_id: "order", maker: "maker", strike: 1, price: 1, valid_until: 9999999999, nonce: 1n } as QuoteReceivedMessage;
const rfq = { position_type: "covered_call", quantity: 1 } as TakerFillRfq;
const defaultScope = { walletAddress: "So11111111111111111111111111111111111111112", backendUrl: "wss://backend.example" };
type ActiveRfqSnapshot = Awaited<ReturnType<ActaWsClient["getMyActiveRfqsAsync"]>>;
function storageKey(scope = defaultScope) {
  return `acta_rfq_unfinished_order:${encodeURIComponent(scope.backendUrl)}:${encodeURIComponent(scope.walletAddress)}`;
}
function setup({
  scope = defaultScope,
  snapshotResult = { request_id: "snapshot", rfqs: [] } as ActiveRfqSnapshot,
}: { scope?: typeof defaultScope; snapshotResult?: ActiveRfqSnapshot } = {}) {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker" });
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  const session = vi.spyOn(client, "getSessionId").mockReturnValue("auth-session");
  const snapshot = vi.spyOn(client, "getMyActiveRfqsAsync").mockResolvedValue(snapshotResult);
  const request = vi.spyOn(client, "request").mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "unknown" } });
  const sign = vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) });
  const cancel = vi.spyOn(client, "cancelRfq").mockReturnValue("cancel");
  sdk.verify.mockReset().mockImplementation(async ({ txBase64, signer }: { txBase64: string; signer: WalletTransactionSigner }) => {
    const signed = await signer.signTransaction(Uint8Array.from(atob(txBase64), c => c.charCodeAt(0)));
    return btoa(String.fromCharCode(...signed));
  });
  const accept = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn().mockResolvedValue(undefined);
  sdk.makerVault.mockReset().mockResolvedValue(null);
  const rpc = {} as Parameters<typeof useRfqOrder>[0]["rpc"];
  const options = { getClient: () => client, acceptQuote: accept, submitSignedTx: submit, signTransaction: sign, rpc, scope };
  const hook = renderHook(() => useRfqOrder(options));
  const emit = (event: string, ...args: unknown[]) => act(() => {
    (client as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(event, ...args);
  });
  const select = (terms: TakerFillRfq | null = rfq) => act(async () => { await hook.result.current.accept(quote, terms); });
  const reauth = (rfqs: ActiveRfqSnapshot["rfqs"] = []) => emit("myActiveRfqs", { request_id: "reconcile", rfqs });
  return { ...hook, client, request, snapshot, session, sign, cancel, accept, submit, emit, select, reauth, scope, options };
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
  it("signs only through the fill verifier with the accepted quote and RFQ terms", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledExactlyOnceWith("order", "AQ=="));
    expect(sdk.verify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      txBase64: "AQ==", quote, rfq, taker: defaultScope.walletAddress, tables: {},
    }));
  });
  it("verifies a vault-maker quote against the vault account read at accept", async () => {
    const h = setup();
    const vault = { discriminator: 9 } as Vault;
    sdk.makerVault.mockResolvedValue(vault);
    const vaultQuote = { ...quote, maker: "Vau1tPda1111111111111111111111111111111111" } as QuoteReceivedMessage;
    await act(async () => { await h.result.current.accept(vaultQuote, rfq); });
    expect(sdk.makerVault).toHaveBeenCalledExactlyOnceWith(h.options.rpc, vaultQuote.maker);
    expect(h.accept).toHaveBeenCalledExactlyOnceWith("rfq", vaultQuote.maker, "order");
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledExactlyOnceWith("order", "AQ=="));
    expect(sdk.verify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ quote: vaultQuote, rfq, makerVault: vault }));
  });
  it("verifies an ordinary maker's quote without a vault account", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledOnce());
    expect(sdk.verify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ makerVault: null }));
  });
  describe("while the maker account is being read", () => {
    function deferred(h: ReturnType<typeof setup>) {
      let finish!: (vault: Vault | null) => void;
      let fail!: (error: Error) => void;
      sdk.makerVault.mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
      const start = () => act(() => { void h.result.current.accept(quote, rfq); });
      return { start, finish: (v: Vault | null = null) => act(async () => finish(v)), fail: (e: Error) => act(async () => fail(e)) };
    }
    it("accepts once for repeated clicks and reports accepting", async () => {
      const h = setup(); const d = deferred(h);
      d.start(); d.start();
      expect(h.result.current.accepting).toBe(true);
      expect(sdk.makerVault).toHaveBeenCalledTimes(1);
      await d.finish();
      expect(h.accept).toHaveBeenCalledTimes(1);
      expect(h.result.current.accepting).toBe(false);
    });
    it.each([
      ["reset", (h: ReturnType<typeof setup>) => act(() => h.result.current.reset())],
      ["unmount", (h: ReturnType<typeof setup>) => h.unmount()],
      ["disconnect", (h: ReturnType<typeof setup>) => h.emit("disconnected", 1006, "lost")],
      ["RFQ close", (h: ReturnType<typeof setup>) => h.emit("rfqClosed", { rfq_id: "rfq", reason: "expired" })],
      ["wallet change", (h: ReturnType<typeof setup>) => {
        h.options.scope = { walletAddress: "11111111111111111111111111111112", backendUrl: defaultScope.backendUrl };
        h.rerender();
      }],
    ])("drops the read after %s", async (_name, interrupt) => {
      const h = setup(); const d = deferred(h);
      d.start();
      interrupt(h);
      await d.finish();
      expect(h.accept).not.toHaveBeenCalled();
      expect(h.result.current.flow.type).not.toBe("awaiting_signature");
    });
    it("releases a never-answered read on disconnect so a new wallet can accept", async () => {
      const h = setup();
      sdk.makerVault.mockImplementation(() => new Promise(() => {}));
      act(() => { void h.result.current.accept(quote, rfq); });
      expect(h.result.current.accepting).toBe(true);
      h.emit("disconnected", 1006, "lost");
      expect(h.result.current.accepting).toBe(false);
      h.options.scope = { walletAddress: "11111111111111111111111111111112", backendUrl: defaultScope.backendUrl };
      h.rerender();
      act(() => { void h.result.current.accept(quote, rfq); });
      expect(sdk.makerVault).toHaveBeenCalledTimes(2);
    });
    it("does not report a read failure after reset", async () => {
      const h = setup(); const d = deferred(h);
      d.start();
      act(() => h.result.current.reset());
      await d.fail(new Error("rpc down"));
      expect(h.result.current.flow.type).toBe("idle");
      expect(h.result.current.accepting).toBe(false);
    });
  });
  describe("while the served transaction is being verified", () => {
    function pendingVerification(h: ReturnType<typeof setup>) {
      let release!: () => void;
      sdk.verify.mockImplementation(async ({ txBase64, signer }: { txBase64: string; signer: WalletTransactionSigner }) => {
        await new Promise<void>((resolve) => { release = resolve; });
        const signed = await signer.signTransaction(Uint8Array.from(atob(txBase64), c => c.charCodeAt(0)));
        return btoa(String.fromCharCode(...signed));
      });
      return () => act(async () => release());
    }
    it.each([
      ["reset", (h: ReturnType<typeof setup>) => act(() => h.result.current.reset())],
      ["disconnect", (h: ReturnType<typeof setup>) => h.emit("disconnected", 1006, "lost")],
      ["RFQ close", (h: ReturnType<typeof setup>) => h.emit("rfqClosed", { rfq_id: "rfq", reason: "expired" })],
      ["wallet change", (h: ReturnType<typeof setup>) => {
        h.options.scope = { walletAddress: "11111111111111111111111111111112", backendUrl: defaultScope.backendUrl };
        h.rerender();
      }],
    ])("never opens the wallet after %s", async (_name, interrupt) => {
      const h = setup(); await h.select();
      const release = pendingVerification(h);
      h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
      await waitFor(() => expect(sdk.verify).toHaveBeenCalledOnce());
      await interrupt(h);
      await release();
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.submit).not.toHaveBeenCalled();
    });
    it("never opens the wallet once the signature deadline passed", async () => {
      const h = setup(); await h.select();
      const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      try {
        const release = pendingVerification(h);
        h.emit("sponsoredTxToSign", "order", "AQ==", 1_001);
        await waitFor(() => expect(sdk.verify).toHaveBeenCalledOnce());
        clock.mockReturnValue(2_000_000);
        await release();
        await waitFor(() => expect(h.result.current.flow).toMatchObject({ type: "failed", message: "Signature deadline expired" }));
        expect(h.sign).not.toHaveBeenCalled();
      } finally { clock.mockRestore(); }
    });
  });
  it("tells a wallet that changed the transaction apart from a pre-sign rejection", async () => {
    const h = setup(); await h.select();
    sdk.verify.mockRejectedValueOnce(new flows.VaultIntentError({ kind: "walletMessage" }));
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow).toMatchObject({
      type: "failed", message: expect.stringContaining("It was not submitted"),
    }));
    expect(h.submit).not.toHaveBeenCalled();
  });
  it("does not accept when the maker account cannot be read", async () => {
    const h = setup(); sdk.makerVault.mockRejectedValue(new Error("rpc down"));
    await h.select();
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: expect.stringContaining("rpc down") });
    expect(h.accept).not.toHaveBeenCalled();
  });
  it("never opens the wallet for a fill that fails verification and cancels the RFQ", async () => {
    const h = setup(); await h.select();
    sdk.verify.mockRejectedValueOnce(new flows.VaultIntentError({ kind: "orderId" }));
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow).toMatchObject({
      type: "failed", message: expect.stringContaining("does not match the accepted quote"),
    }));
    expect(h.sign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("rfq");
  });
  it("does not accept a quote whose RFQ terms are unknown", async () => {
    const h = setup(); await h.select(null);
    expect(h.result.current.flow).toMatchObject({ type: "failed", orderId: "order" });
    expect(h.accept).not.toHaveBeenCalled();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    expect(sdk.verify).not.toHaveBeenCalled(); expect(h.sign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
  });
  it("does not skip wallet signing when OrderAccepted arrives before sponsorship", async () => {
    const h = setup(); await h.select();
    h.emit("orderAccepted", "order");
    expect(h.result.current.flow.type).toBe("awaiting_signature");
    expect(h.sign).not.toHaveBeenCalled();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalledTimes(1));
  });
  it.each(["orderAccepted", "orderSubmitted"] as const)("moves the owned submitting order to pending on %s", async event => {
    const h = setup(); h.submit.mockReturnValue(new Promise(() => {})); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    expect(h.result.current.flow.type).toBe("submitting");
    if (event === "orderAccepted") h.emit(event, "order");
    else h.emit(event, "order", "sig");
    expect(h.result.current.flow.type).toBe("pending");
  });
  it("keeps the unfinished record when reset closes a local flow", async () => {
    const h = setup(); await h.select();
    const key = storageKey(h.scope);
    expect(window.localStorage.getItem(key)).toContain('"submission":"unsigned"');
    act(() => h.result.current.reset());
    expect(window.localStorage.getItem(key)).toContain('"orderId":"order"');
  });
  it("does not accept when unfinished storage cannot be saved", async () => {
    const h = setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
    await h.select();
    expect(h.accept).not.toHaveBeenCalled();
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: "Unable to save unfinished order before accepting the quote" });
  });
  it("does not send a signed transaction when its sent state cannot be saved", async () => {
    const h = setup(); await h.select();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalledTimes(1));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.result.current.flow).toMatchObject({ type: "unknown", submission: "unsigned" });
  });
  it("does not overwrite another unfinished order that appears while signing", async () => {
    const h = setup(); await h.select();
    window.localStorage.setItem(storageKey(h.scope), JSON.stringify({
      orderId: "other-order", rfqId: "other-rfq", maker: "other-maker",
      originalSessionId: "auth-session", submission: "unsigned",
    }));
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow).toMatchObject({ type: "recovering", order: { orderId: "other-order" } }));
    expect(h.submit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(storageKey(h.scope))).toContain('"orderId":"other-order"');
  });
  it("preserves a same-order sent record and never accepts or resends it", async () => {
    window.localStorage.setItem(storageKey(), JSON.stringify({
      orderId: "order", rfqId: "rfq", maker: "maker",
      originalSessionId: "auth-session", submission: "sent", txSignature: "saved-signature",
    }));
    const h = setup();
    h.request.mockImplementation(() => new Promise(() => {}));
    act(() => h.result.current.reset());
    await h.select();
    expect(h.result.current.flow).toMatchObject({ type: "recovering", submission: "sent" });
    expect(h.accept).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(storageKey()) ?? "{}")).toMatchObject({
      submission: "sent", txSignature: "saved-signature",
    });
  });
  it("does not clear a different stored order when this order reaches a terminal event", async () => {
    const h = setup(); await h.select();
    window.localStorage.setItem(storageKey(h.scope), JSON.stringify({
      orderId: "other-order", rfqId: "other-rfq", maker: "other-maker",
      originalSessionId: "auth-session", submission: "unsigned",
    }));
    h.emit("orderConfirmed", "order", "pda");
    expect(h.result.current.flow.type).toBe("confirmed");
    expect(window.localStorage.getItem(storageKey(h.scope))).toContain('"orderId":"other-order"');
  });
  it("does not let OrderSubmitted overwrite a different restored record", async () => {
    const h = setup(); await h.select();
    window.localStorage.setItem(storageKey(h.scope), JSON.stringify({
      orderId: "other-order", rfqId: "other-rfq", maker: "other-maker",
      originalSessionId: "auth-session", submission: "unsigned",
    }));
    h.emit("orderSubmitted", "order", "sig");
    expect(h.result.current.flow).toMatchObject({ type: "recovering", order: { orderId: "other-order" } });
    expect(h.result.current.txSignature).toBeNull();
  });
  it("surfaces an async accept rejection", async () => {
    const h = setup(); h.accept.mockRejectedValue(new Error("not authenticated")); await h.select();
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: "not authenticated" });
  });
  it.each([
    ["an unknown delivery", new ActaWsRequestError("request_error", "r", { type: "InternalError" }, "unknown")],
    ["no delivery", new ActaWsRequestError("timeout", "r")],
    ["a transport error", new Error("socket closed")],
  ])("shows pending and checks execution after a submission rejection with %s", async (_, error) => {
    const h = setup(); let resolve!: (value: never) => void;
    h.request.mockImplementation(() => new Promise(r => { resolve = r; }));
    h.submit.mockRejectedValue(error); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow.type).toBe("pending"));
    expect(h.request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ request_id: "read", order_id: "order", state: { type: "confirmed", position_pda: "pda" } } as never));
    expect(h.result.current.flow.type).toBe("confirmed");
  });
  it("fails a submission the server did not forward", async () => {
    const h = setup();
    h.submit.mockRejectedValue(new ActaWsRequestError("request_error", "r", { type: "Generic", data: { code: "invalid_signed_tx", message: "Invalid signed transaction" } }, "not_forwarded"));
    await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow).toMatchObject({ type: "failed", message: "Invalid signed transaction" }));
    expect(h.request).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(storageKey(h.scope))).toBeNull();
  });
  it.each([
    ["QuoteExpired", { type: "QuoteExpired" }],
    ["OrderIdMismatch", { type: "OrderIdMismatch" }],
    ["UnknownOrder", { type: "UnknownOrder" }],
    ["Accept rejected", { type: "Generic", data: { code: "caps_authority_unavailable", message: "Accept rejected" } }],
  ] as const)("fails on a correlated AcceptQuote rejection (%s)", async (message, error) => {
    const h = setup(); h.accept.mockRejectedValue(new ActaWsRequestError("request_error", "r", error)); await h.select();
    expect(h.result.current.flow).toMatchObject({ type: "failed", message });
    expect(h.sign).not.toHaveBeenCalled();
  });
  it("cancels an order whose AcceptQuote never answers", async () => {
    const h = setup(); h.accept.mockImplementation(() => new Promise(() => {}));
    act(() => { void h.result.current.accept(quote, rfq); });
    await waitFor(() => expect(h.result.current.flow.type).toBe("awaiting_signature"));
    expect(h.result.current.canAbandon).toBe(true);
    act(() => h.result.current.abandon());
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("rfq");
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: expect.stringContaining("Nothing was submitted") });
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    expect(sdk.verify).not.toHaveBeenCalled();
  });
  it("cancels while the wallet prompt hangs and drops its late result", async () => {
    const h = setup(); let resolve!: (tx: VersionedTransaction) => void;
    h.sign.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.sign).toHaveBeenCalled());
    expect(h.result.current.canAbandon).toBe(true);
    act(() => h.result.current.abandon());
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("rfq");
    await act(async () => resolve({ serialize: () => new Uint8Array([1]) } as VersionedTransaction));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.result.current.flow.type).toBe("failed");
  });
  it("attaches a transaction signature that arrives after confirmation", async () => {
    const h = setup(); await h.select();
    h.emit("orderConfirmed", "order", "pda");
    h.emit("orderSubmitted", "order", "late-sig");
    expect(h.result.current.flow).toEqual({ type: "confirmed", orderId: "order", positionPda: "pda" });
    expect(h.result.current.txSignature).toBe("late-sig");
  });
  it("keeps waiting for the sponsored transaction after an AcceptQuote timeout", async () => {
    const h = setup(); h.accept.mockRejectedValue(new ActaWsRequestError("timeout", "r")); await h.select();
    expect(h.result.current.flow.type).toBe("awaiting_signature");
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
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
    expect(window.localStorage.getItem(storageKey(h.scope))).toBeNull();
  });
  it("clears the unfinished record when wallet signing fails", async () => {
    const h = setup(); h.sign.mockRejectedValue(new Error("wallet rejected")); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.result.current.flow).toMatchObject({ type: "failed", message: "wallet rejected" }));
    expect(window.localStorage.getItem(storageKey(h.scope))).toBeNull();
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
    h.reauth();
    await waitFor(() => expect(h.result.current.flow.type).toBe("confirmed"));
    expect(h.accept).toHaveBeenCalledTimes(1); expect(h.submit).not.toHaveBeenCalled();
  });
  it("keeps unknown and lookup failures unresolved", async () => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    h.request.mockRejectedValue(new Error("timeout")); h.reauth();
    await waitFor(() => expect(h.result.current.flow.type).toBe("unknown"));
  });
  it("does not let a late unknown lookup regress a confirmed event", async () => {
    const h = setup(); let resolve!: (value: never) => void;
    h.request.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); h.reauth();
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
  const enqueued = { ...pendingSignature, state: "enqueued" as const };

  it("persists an enqueued order as sent and never offers to abandon it after reload", async () => {
    const first = setup(); await first.select(); first.unmount();
    const stale = setup({ scope: defaultScope, snapshotResult: { request_id: "snapshot", rfqs: [] } });
    expect(stale.result.current.canAbandon).toBe(false);
    stale.unmount();

    const reconciled = setup({ snapshotResult: { request_id: "snapshot", rfqs: [enqueued] } });
    await waitFor(() => expect(reconciled.result.current.flow.type).toBe("pending"));
    expect(JSON.parse(window.localStorage.getItem(storageKey()) ?? "{}")).toMatchObject({ submission: "sent" });
    reconciled.unmount();

    const reloaded = setup({ snapshotResult: { request_id: "snapshot", rfqs: [pendingSignature] } });
    await waitFor(() => expect(reloaded.request).toHaveBeenCalled());
    expect(reloaded.result.current.flow).toMatchObject({ submission: "sent" });
    expect(reloaded.result.current.canAbandon).toBe(false);
    act(() => reloaded.result.current.abandon());
    expect(reloaded.cancel).not.toHaveBeenCalled();
  });

  it("does not abandon an order another tab already recorded as sent", async () => {
    const a = setup(); a.accept.mockImplementation(() => new Promise(() => {}));
    act(() => { void a.result.current.accept(quote, rfq); });
    await waitFor(() => expect(a.result.current.flow.type).toBe("awaiting_signature"));
    const b = setup({ snapshotResult: { request_id: "snapshot", rfqs: [enqueued] } });
    await waitFor(() => expect(b.result.current.flow.type).toBe("pending"));

    act(() => a.result.current.abandon());
    expect(a.cancel).not.toHaveBeenCalled();
    expect(a.result.current.flow).toMatchObject({ type: "recovering", submission: "sent" });
    expect(a.result.current.canAbandon).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(storageKey()) ?? "{}")).toMatchObject({ orderId: "order", submission: "sent" });
  });

  it("treats a failed transaction for its RFQ as a definitive failure", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledOnce());
    h.emit("rfqAvailableAgain", { rfq_id: "rfq", reason: "tx_failed" });
    expect(h.result.current.flow).toMatchObject({ type: "failed", message: expect.stringContaining("not executed") });
    expect(window.localStorage.getItem(storageKey())).toBeNull();
    expect(h.request).not.toHaveBeenCalled();
  });

  it("keeps an enqueued order's obligation when it cannot be persisted", async () => {
    const first = setup(); await first.select(); first.unmount();
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const h = setup({ snapshotResult: { request_id: "snapshot", rfqs: [enqueued] } });
    await waitFor(() => expect(h.result.current.flow.type).toBe("pending"));
    expect(h.result.current.canAbandon).toBe(false);
    write.mockRestore();
  });

  it("promotes an unsigned order the status lookup reports pending", async () => {
    const first = setup(); await first.select(); first.unmount();
    const h = setup();
    h.request.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "pending" } });
    h.emit("myActiveRfqs", { request_id: "x", rfqs: [] });
    await waitFor(() => expect(h.result.current.flow.type).toBe("pending"));
    expect(JSON.parse(window.localStorage.getItem(storageKey()) ?? "{}")).toMatchObject({ submission: "sent" });
  });

  it("does not offer to abandon a restored unsigned order before it is reconciled", () => {
    const first = setup(); act(() => { void first.result.current.accept(quote, rfq); });
    first.unmount();
    window.localStorage.setItem(storageKey(), JSON.stringify({
      orderId: "order", rfqId: "rfq", maker: "maker", originalSessionId: null, submission: "unsigned",
    }));
    const h = setup();
    h.snapshot.mockImplementation(() => new Promise(() => {}));
    expect(h.result.current.flow).toMatchObject({ type: "recovering", submission: "unsigned" });
    expect(h.result.current.canAbandon).toBe(false);
  });

  it("restores the scoped identifier-only unsigned record without re-accepting a quote it cannot verify", async () => {
    const first = setup(); await first.select();
    const record = JSON.parse(window.localStorage.getItem(storageKey(first.scope)) ?? "{}");
    expect(record).toEqual({
      orderId: "order", rfqId: "rfq", maker: "maker",
      originalSessionId: "auth-session", submission: "unsigned",
    });
    first.unmount();

    const restored = setup({
      scope: first.scope,
      snapshotResult: { request_id: "snapshot", rfqs: [pendingSignature] },
    });
    restored.request.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "pending" } });
    await waitFor(() => expect(restored.result.current.flow.type).toBe("unknown"));
    expect(JSON.parse(window.localStorage.getItem(storageKey(first.scope)) ?? "{}")).toMatchObject({ submission: "unsigned" });
    expect(restored.accept).not.toHaveBeenCalled();
    expect(restored.sign).not.toHaveBeenCalled();
    expect(restored.submit).not.toHaveBeenCalled();

    act(() => restored.result.current.abandon());
    expect(restored.cancel).toHaveBeenCalledExactlyOnceWith("rfq");
    expect(restored.result.current.flow).toMatchObject({ type: "failed", message: expect.stringContaining("Nothing was submitted") });
    expect(window.localStorage.getItem(storageKey(first.scope))).toBeNull();
  });

  it("never abandons an order whose transaction was sent", async () => {
    const h = setup(); await h.select();
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledOnce());
    h.emit("disconnected", 1006, "lost");
    expect(h.result.current.flow).toMatchObject({ type: "recovering", submission: "sent" });
    act(() => h.result.current.abandon());
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.result.current.flow.type).toBe("recovering");
  });

  it("preserves the old scope record and fences its late recovery snapshot after a wallet switch", async () => {
    const h = setup(); await h.select();
    let resolve!: (value: ActiveRfqSnapshot) => void;
    h.snapshot.mockImplementation(() => new Promise(r => { resolve = r; }));
    h.emit("disconnected", 1006, "lost");
    act(() => h.result.current.checkStatus());
    await waitFor(() => expect(h.snapshot).toHaveBeenCalledTimes(1));

    const nextScope = { walletAddress: "wallet-B", backendUrl: "wss://backend.example" };
    h.options.scope = nextScope;
    h.rerender();
    expect(h.result.current.flow.type).toBe("idle");
    await act(async () => resolve({ request_id: "snapshot", rfqs: [pendingSignature] }));
    expect(h.result.current.flow.type).toBe("idle");
    expect(window.localStorage.getItem(storageKey(h.scope))).toContain('"orderId":"order"');
    expect(window.localStorage.getItem(storageKey(nextScope))).toBeNull();
  });

  it("fails the selected order when its RFQ is available again after a signature timeout", async () => {
    const h = setup(); await h.select();
    h.emit("rfqAvailableAgain", { rfq_id: "rfq", reason: "signature_timeout" });
    await waitFor(() => expect(h.result.current.flow.type).toBe("failed"));
    expect(h.sign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(storageKey(h.scope))).toBeNull();
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
    h.reauth([pendingSignature]);
    await waitFor(() => expect(h.accept).toHaveBeenCalledTimes(2));
    expect(h.accept).toHaveBeenLastCalledWith("rfq", "maker", "order");
    expect(h.result.current.flow.type).toBe("awaiting_signature");
    h.emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    expect(h.request).not.toHaveBeenCalled();
  });

  it.each(["changed credential", "different selected order", "missing RFQ"])("does not replay AcceptQuote for %s", async scenario => {
    const h = setup(); await h.select(); h.emit("disconnected", 1006, "lost");
    if (scenario === "changed credential") h.session.mockReturnValue("new-auth-session");
    h.reauth(scenario === "missing RFQ" ? [] : [{ ...pendingSignature, locked_order_id: scenario === "different selected order" ? "other" : "order" }]);
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
    h.reauth([pendingSignature]);
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
    h.reauth();
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
    h.emit("rfqAvailableAgain", { rfq_id: "rfq", reason: "signature_timeout" });
    await waitFor(() => expect(h.result.current.flow.type).toBe("unknown"));
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("ignores a recovery snapshot from a connection that closed meanwhile", async () => {
    const h = setup(); let resolve!: (value: Awaited<ReturnType<typeof h.client.getMyActiveRfqsAsync>>) => void;
    h.snapshot.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); act(() => h.result.current.checkStatus());
    h.emit("disconnected", 1006, "lost again");
    await act(async () => resolve({ request_id: "snapshot", rfqs: [pendingSignature] }));
    expect(h.result.current.flow.type).toBe("recovering");
    expect(h.accept).toHaveBeenCalledTimes(1);
  });

  it("does not let a late snapshot replace a confirmed push", async () => {
    const h = setup(); let resolve!: (value: Awaited<ReturnType<typeof h.client.getMyActiveRfqsAsync>>) => void;
    h.snapshot.mockImplementation(() => new Promise(r => { resolve = r; }));
    await h.select(); h.emit("disconnected", 1006, "lost"); act(() => h.result.current.checkStatus());
    h.emit("orderConfirmed", "order", "pda");
    await act(async () => resolve({ request_id: "snapshot", rfqs: [pendingSignature] }));
    expect(h.result.current.flow).toEqual({ type: "confirmed", orderId: "order", positionPda: "pda" });
    expect(h.accept).toHaveBeenCalledTimes(1);
  });
});
