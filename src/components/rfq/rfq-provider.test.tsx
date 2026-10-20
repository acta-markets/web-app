import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ActaWsClient, ActaWsRequestError, type QuoteReceivedMessage } from "@acta-markets/ts-sdk/ws";
import { RfqProvider, useRfqContext } from "./rfq-provider";

const mocks = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/lib/rfq-client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/rfq-client")>(), createRfqClient: mocks.create,
}));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ selectedAccount: null, isConnected: false, signMessage: null, disconnectWallet: mocks.disconnect }),
}));
vi.mock("@/components/app-ui/toast", () => ({ useToast: () => ({ show: mocks.toast }) }));
vi.mock("@/components/app-ui/app-modal", () => ({ AppModal: () => null }));
vi.mock("@/components/referral/referral-gate-modal", () => ({ ReferralGateModal: () => null }));
vi.mock("@/components/referral/ref-capture", () => ({ clearPendingRefCode: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

function setup() {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker" });
  vi.spyOn(client, "connectAnonymous").mockImplementation(() => {});
  const create = vi.spyOn(client, "createRfq").mockResolvedValue("request");
  const cancel = vi.spyOn(client, "cancelRfq").mockReturnValue("cancel");
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  vi.spyOn(client, "getMarketDescriptors").mockReturnValue("descriptors");
  const metadataRequest = vi.spyOn(client, "request").mockImplementation(() => new Promise(() => {}));
  mocks.create.mockReturnValue(client);
  const hook = renderHook(useRfqContext, { wrapper: ({ children }: { children: ReactNode }) => <RfqProvider>{children}</RfqProvider> });
  const emit = (event: string, ...args: unknown[]) => act(() => {
    (client as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(event, ...args);
  });
  emit("marketDescriptors", [{ market: { market_pda: "market" } }]);
  const submit = () => {
    act(() => hook.result.current.submitRfq({ market: "market", positionType: "covered_call", strike: 1, quantity: 10 }));
    return create.mock.lastCall![0].requestId!;
  };
  const quote = (rfq: string, maker = "maker", price = 1, valid_until = 9999999999) =>
    ({ rfq_id: rfq, order_id: `order-${maker}`, maker, strike: 1, price, valid_until, nonce: 1n } as QuoteReceivedMessage);
  return { ...hook, client, create, cancel, emit, submit, quote, metadataRequest };
}

describe("RFQ request ownership", () => {
  it("returns the market, type and quantity of its own created RFQ for fill verification", () => {
    const h = setup(); const id = h.submit();
    expect(h.result.current.rfqTerms("ours")).toBeNull();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    expect(h.result.current.rfqTerms("other")).toBeNull();
    expect(h.result.current.rfqTerms("ours")).toEqual({
      market: { market_pda: "market" }, position_type: "covered_call", quantity: 10,
    });
  });
  it("only accepts quotes after the matching RfqCreated", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "other", request_id: "old" });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.bestQuote).toBeNull();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.bestQuote).toBeNull();
    h.emit("quoteReceived", { ...h.quote("ours"), strike: 2 }); expect(h.result.current.bestQuote).toBeNull();
    h.emit("quoteReceived", h.quote("ours")); expect(h.result.current.bestQuote?.rfq_id).toBe("ours");
  });
  it("ignores stale replies from the previous Deposit action and cancels its RFQ", () => {
    const h = setup(); const old = h.submit(); const latest = h.submit(); expect(latest).not.toBe(old);
    h.emit("rfqCreated", { rfq_id: "old", request_id: old }); h.emit("quoteReceived", h.quote("old"));
    expect(h.result.current.bestQuote).toBeNull();
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("old");
    h.emit("rfqCreated", { rfq_id: "latest", request_id: latest }); h.emit("quoteReceived", h.quote("latest"));
    expect(h.result.current.bestQuote?.rfq_id).toBe("latest");
  });
  it("only clears the quote when its own RFQ closes", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("rfqClosed", { rfq_id: "other" }); expect(h.result.current.bestQuote).not.toBeNull();
    h.emit("rfqClosed", { rfq_id: "ours" }); expect(h.result.current.bestQuote).toBeNull();
    expect(h.result.current.error).toBeNull();
  });
  it("does not turn an unrelated order failure into a global RFQ error", () => {
    const h = setup();
    const requestId = h.submit();
    h.emit("orderFailed", "old-order", "relay error");
    expect(h.result.current.error).toBeNull();
    h.emit("rfqCreated", { rfq_id: "new-rfq", request_id: requestId });
    h.emit("quoteReceived", h.quote("new-rfq"));
    expect(h.result.current.bestQuote?.rfq_id).toBe("new-rfq");
  });
  it("discards pre-disconnect quotes and their late replies", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("disconnected", 1006, "lost"); h.emit("quoteReceived", h.quote("ours"));
    expect(h.result.current.bestQuote).toBeNull();
  });
  it("shows the best quote, replaces a maker's quote and follows QuotesUpdate snapshots", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("ours", "a", 5));
    h.emit("quoteReceived", h.quote("ours", "b", 3));
    expect(h.result.current.bestQuote?.maker).toBe("a");
    h.emit("quoteReceived", h.quote("ours", "a", 2));
    expect(h.result.current.bestQuote?.maker).toBe("b");
    h.emit("quotesUpdate", { rfq_id: "ours", quotes: [h.quote("ours", "c", 4), { ...h.quote("ours", "d", 9), strike: 2 }] });
    expect(h.result.current.bestQuote?.maker).toBe("c");
    h.emit("quotesUpdate", { rfq_id: "ours", quotes: [] });
    expect(h.result.current.bestQuote).toBeNull();
  });
  it("drops a quote at its valid_until", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const h = setup(); const id = h.submit(); const now = Math.floor(Date.now() / 1000);
      h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
      h.emit("quoteReceived", h.quote("ours", "a", 5, now + 2));
      h.emit("quoteReceived", h.quote("ours", "b", 3, now + 60));
      expect(h.result.current.bestQuote?.maker).toBe("a");
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(h.result.current.bestQuote?.maker).toBe("b");
    } finally { vi.useRealTimers(); }
  });
  it("cancels its RFQ, including one created after the cancel", () => {
    const h = setup(); const first = h.submit();
    act(() => h.result.current.cancelRfq());
    expect(h.cancel).not.toHaveBeenCalled();
    h.emit("rfqCreated", { rfq_id: "late", request_id: first });
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("late");
    const second = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: second }); h.emit("quoteReceived", h.quote("ours"));
    act(() => h.result.current.cancelRfq());
    expect(h.cancel).toHaveBeenLastCalledWith("ours");
    expect(h.result.current.bestQuote).toBeNull();
  });
  it("judges quote expiry by the server clock", () => {
    const h = setup(); const id = h.submit(); const now = Math.floor(Date.now() / 1000);
    h.emit("welcome", { server_time_unix_ms: (now - 60) * 1000 });
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("ours", "a", 5, now - 30));
    expect(h.result.current.bestQuote?.maker).toBe("a");
  });
  it("cancels an unconfirmed RFQ whose receipt timed out once it is created", async () => {
    const h = setup();
    let reject!: (error: unknown) => void;
    h.create.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const id = h.submit();
    await act(async () => reject(new ActaWsRequestError("timeout", id)));
    expect(h.result.current.error?.message).toBe("Request timeout");
    h.emit("rfqCreated", { rfq_id: "late", request_id: id });
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("late");
  });
  it("keeps a created RFQ and its quotes when only the receipt times out", async () => {
    const h = setup();
    let reject!: (error: unknown) => void;
    h.create.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    await act(async () => reject(new ActaWsRequestError("timeout", id)));
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.bestQuote?.rfq_id).toBe("ours");
  });
  it("accepts RfqCreated before the CommandAccepted receipt", async () => {
    const h = setup();
    let resolve!: (id: string) => void;
    h.create.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    await act(async () => resolve(id));
    expect(h.result.current.bestQuote?.rfq_id).toBe("ours");
    expect(h.result.current.error).toBeNull();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("surfaces a correlated RfqRequest rejection", async () => {
    const h = setup();
    h.create.mockRejectedValueOnce(new ActaWsRequestError("request_error", "r", { type: "Generic", data: { code: "market_expired", message: "Market expired" } }));
    h.submit();
    await act(async () => {});
    expect(h.result.current.error?.message).toBe("Market expired");
  });
  it("propagates asynchronous trading errors through the context", async () => {
    const h = setup(); vi.spyOn(h.client, "isAuthenticated").mockReturnValue(true);
    vi.spyOn(h.client, "acceptQuote").mockRejectedValue(new Error("accept failed"));
    vi.spyOn(h.client, "submitSignedSponsoredTx").mockRejectedValue(new Error("submit failed"));
    await expect(h.result.current.acceptQuote("rfq", "maker", "order")).rejects.toThrow("accept failed");
    await expect(h.result.current.submitSignedTx("order", "tx")).rejects.toThrow("submit failed");
  });
});

describe("token market response ownership", () => {
  const info = (request_id: string, market: string) => ({ request_id, underlying_decimals: 9, markets: [{ market_pda: market, is_put: false, indicatives: [] }] });
  it("clears the old asset and ignores its late response after selecting another asset", () => {
    const h = setup();
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    const idA = h.metadataRequest.mock.lastCall![1].data.request_id;
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo?.underlyingMint).toBe("mint-A");
    act(() => h.result.current.getTokenMarketsInfo("mint-B"));
    const idB = h.metadataRequest.mock.lastCall![1].data.request_id;
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info(idB, "market-B"));
    expect(h.result.current.tokenMarketsInfo).toEqual({ underlyingMint: "mint-B", data: info(idB, "market-B") });
    expect(h.metadataRequest).toHaveBeenLastCalledWith("TokenMarketsInfo", { type: "GetTokenMarketsInfo", data: { request_id: idB, underlying_mint: "mint-B" } });
  });
  it.each(["disconnected", "stateChange"])("invalidates in-flight metadata on %s", event => {
    const h = setup();
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    const idA = h.metadataRequest.mock.lastCall![1].data.request_id;
    if (event === "stateChange") h.emit(event, "disconnected");
    else h.emit(event, 1006, "lost");
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
  });
  it("keeps the same mint visible while refreshing, then clears it on failure", async () => {
    const h = setup();
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    const firstId = h.metadataRequest.mock.lastCall![1].data.request_id;
    h.emit("tokenMarketsInfo", info(firstId, "market-A"));
    let reject!: (error: Error) => void;
    h.metadataRequest.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    expect(h.result.current.tokenMarketsInfo?.underlyingMint).toBe("mint-A");
    await act(async () => reject(new Error("request timed out")));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
  });
  it("preserves indicative freshness in the shared cache", () => {
    const h = setup();
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    const id = h.metadataRequest.mock.lastCall![1].data.request_id;
    const data = info(id, "market-A");
    h.emit("tokenMarketsInfo", { ...data, markets: [{ ...data.markets[0], indicatives: [{ position_type: "covered_call", updated_at: 100, is_stale: true, strikes: [{ strike: 100, best_price: 1 }] }] }] });
    expect(h.result.current.getIndicativePricesCached("market-A", "covered_call")).toMatchObject({ request_id: id, is_stale: true, updated_at: 100 });
  });

});

describe("stored resume credential expiry", () => {
  afterEach(() => window.localStorage.removeItem("acta_rfq_ws_session"));

  it.each([undefined, null, 0, 1_000, 4_000_000_000])(
    "resumes only with a future expiry (%s)", async expiresAt => {
      const h = setup();
      const wallet = "11111111111111111111111111111111";
      window.localStorage.setItem("acta_rfq_ws_session", JSON.stringify({
        walletAddress: wallet, sessionId: "stored", expiresAt,
      }));
      vi.spyOn(h.client, "getMyReferralInfo").mockReturnValue("referral-request");
      const connect = vi.spyOn(h.client, "connectAndAuthenticate").mockImplementation(() => {
        h.emit("authenticated", "fresh", 4_000_000_000);
      });
      await act(() => h.result.current.authenticate(wallet, async () => new Uint8Array(64)));
      expect(connect.mock.lastCall?.[1]).toEqual(
        expiresAt === 4_000_000_000 ? { sessionId: "stored" } : undefined,
      );
    },
  );
});
