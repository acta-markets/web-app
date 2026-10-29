import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ActaWsClient, ActaWsRequestError, type QuoteReceivedMessage } from "@acta-markets/ts-sdk/ws";
import { RfqProvider, useRfqContext } from "./rfq-provider";

const mocks = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn(), disconnect: vi.fn(), account: null as { address: string } | null, sign: vi.fn() }));
vi.mock("@/lib/rfq-client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/rfq-client")>(), createRfqClient: mocks.create,
}));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ selectedAccount: mocks.account, isConnected: mocks.account !== null, signMessage: mocks.sign, disconnectWallet: mocks.disconnect }),
}));
vi.mock("@/components/app-ui/toast", () => ({ useToast: () => ({ show: mocks.toast }) }));
vi.mock("@/components/app-ui/app-modal", () => ({ AppModal: () => null }));
vi.mock("@/components/referral/referral-gate-modal", () => ({ ReferralGateModal: () => null }));
vi.mock("@/components/referral/ref-capture", () => ({ clearPendingRefCode: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockReset(); mocks.account = null; });

async function setup() {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker", onDisconnect: "keep_quotes", products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"], clientName: "test", clientVersion: "0" });
  vi.spyOn(client, "connectAnonymous").mockImplementation(() => {});
  const create = vi.spyOn(client, "createRfq").mockResolvedValue("request");
  const cancel = vi.spyOn(client, "cancelRfq").mockReturnValue("cancel");
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  vi.spyOn(client, "getMarketDescriptors").mockReturnValue("descriptors");
  const metadataRequest = vi.spyOn(client, "request").mockImplementation(() => new Promise(() => {}));
  mocks.create.mockReturnValue(client);
  const hook = renderHook(useRfqContext, { wrapper: ({ children }: { children: ReactNode }) => <RfqProvider>{children}</RfqProvider> });
  await act(async () => {});
  const emit = (event: string, ...args: unknown[]) => act(() => {
    (client as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(event, ...args);
  });
  emit("marketDescriptors", [{ products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"], market: { market_pda: "market", underlying_mint: "underlying", is_put: false }, underlying_decimals: 6, quote_decimals: 6 }]);
  emit("tokens", [{ mint: "underlying", symbol: "U", decimals: 6, strike_tick: 1_000_000_000 }]);
  const submit = () => {
    act(() => hook.result.current.submitRfq({ market: "market", terms: { type: "covered_call", strike: 1 }, quantity: 10 }));
    return create.mock.lastCall![0].requestId!;
  };
  const quote = (rfq: string, maker = "maker", price = 1, valid_until = 9999999999) =>
    ({ rfq_id: rfq, order_id: `order-${maker}`, maker, side: "sell", terms: { type: "covered_call", strike: 1 }, price, valid_until, nonce: 1n } as QuoteReceivedMessage);
  return { ...hook, client, create, cancel, emit, submit, quote, metadataRequest };
}

describe("RFQ request ownership", () => {
  it("returns the market, type and quantity of its own created RFQ for fill verification", async () => {
    const h = await setup(); const id = h.submit();
    expect(h.result.current.rfqTerms("ours")).toBeNull();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    expect(h.result.current.rfqTerms("other")).toBeNull();
    expect(h.result.current.rfqTerms("ours")).toEqual({
      rfq_id: "ours", market: { market_pda: "market", underlying_mint: "underlying", is_put: false }, terms: { type: "covered_call", strike: 1 }, side: "sell", quantity: 10, order_options: [{ type: "covered_call", strike: 1 }],
    });
  });
  it("only accepts quotes after the matching RfqCreated", async () => {
    const h = await setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "other", request_id: "old" });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.bestQuote).toBeNull();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.bestQuote).toBeNull();
    h.emit("quoteReceived", { ...h.quote("ours"), terms: { type: "covered_call", strike: 2 } }); expect(h.result.current.bestQuote).toBeNull();
    h.emit("quoteReceived", h.quote("ours")); expect(h.result.current.bestQuote?.rfq_id).toBe("ours");
  });
  it("ignores stale replies from the previous Deposit action and cancels its RFQ", async () => {
    const h = await setup(); const old = h.submit(); const latest = h.submit(); expect(latest).not.toBe(old);
    h.emit("rfqCreated", { rfq_id: "old", request_id: old }); h.emit("quoteReceived", h.quote("old"));
    expect(h.result.current.bestQuote).toBeNull();
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("old");
    h.emit("rfqCreated", { rfq_id: "latest", request_id: latest }); h.emit("quoteReceived", h.quote("latest"));
    expect(h.result.current.bestQuote?.rfq_id).toBe("latest");
  });
  it("only clears the quote when its own RFQ closes", async () => {
    const h = await setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("rfqClosed", { rfq_id: "other" }); expect(h.result.current.bestQuote).not.toBeNull();
    h.emit("rfqClosed", { rfq_id: "ours" }); expect(h.result.current.bestQuote).toBeNull();
    expect(h.result.current.error).toBeNull();
  });
  it("does not turn an unrelated order failure into a global RFQ error", async () => {
    const h = await setup();
    const requestId = h.submit();
    h.emit("orderFailed", "old-order", "relay error");
    expect(h.result.current.error).toBeNull();
    h.emit("rfqCreated", { rfq_id: "new-rfq", request_id: requestId });
    h.emit("quoteReceived", h.quote("new-rfq"));
    expect(h.result.current.bestQuote?.rfq_id).toBe("new-rfq");
  });
  it("discards pre-disconnect quotes and their late replies", async () => {
    const h = await setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("disconnected", 1006, "lost"); h.emit("quoteReceived", h.quote("ours"));
    expect(h.result.current.bestQuote).toBeNull();
  });
  it("shows the best quote, replaces a maker's quote and follows QuotesUpdate snapshots", async () => {
    const h = await setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("ours", "a", 5));
    h.emit("quoteReceived", h.quote("ours", "b", 3));
    expect(h.result.current.bestQuote?.maker).toBe("a");
    h.emit("quoteReceived", h.quote("ours", "a", 2));
    expect(h.result.current.bestQuote?.maker).toBe("b");
    h.emit("quotesUpdate", { rfq_id: "ours", quotes: [h.quote("ours", "c", 4), { ...h.quote("ours", "d", 9), terms: { type: "covered_call", strike: 2 } }] });
    expect(h.result.current.bestQuote?.maker).toBe("c");
    h.emit("quotesUpdate", { rfq_id: "ours", quotes: [] });
    expect(h.result.current.bestQuote).toBeNull();
  });
  it("drops a quote at its valid_until", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const h = await setup(); const id = h.submit(); const now = Math.floor(Date.now() / 1000);
      h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
      h.emit("quoteReceived", h.quote("ours", "a", 5, now + 2));
      h.emit("quoteReceived", h.quote("ours", "b", 3, now + 60));
      expect(h.result.current.bestQuote?.maker).toBe("a");
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(h.result.current.bestQuote?.maker).toBe("b");
    } finally { vi.useRealTimers(); }
  });
  it("cancels its RFQ, including one created after the cancel", async () => {
    const h = await setup(); const first = h.submit();
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
  it("judges quote expiry by the server clock", async () => {
    const h = await setup(); const id = h.submit(); const now = Math.floor(Date.now() / 1000);
    h.emit("welcome", { server_time_unix_ms: (now - 60) * 1000 });
    h.emit("rfqCreated", { rfq_id: "ours", request_id: id });
    h.emit("quoteReceived", h.quote("ours", "a", 5, now - 30));
    expect(h.result.current.bestQuote?.maker).toBe("a");
    expect(h.result.current.quoteSecondsRemaining(h.result.current.bestQuote!)).toBe(30);
  });
  it("cancels an unconfirmed RFQ whose receipt timed out once it is created", async () => {
    const h = await setup();
    let reject!: (error: unknown) => void;
    h.create.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const id = h.submit();
    await act(async () => reject(new ActaWsRequestError("timeout", id)));
    expect(h.result.current.error?.message).toBe("Request timeout");
    h.emit("rfqCreated", { rfq_id: "late", request_id: id });
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("late");
  });
  it("keeps a created RFQ and its quotes when only the receipt times out", async () => {
    const h = await setup();
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
    const h = await setup();
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
    const h = await setup();
    h.create.mockRejectedValueOnce(new ActaWsRequestError("request_error", "r", { type: "Generic", data: { code: "market_expired", message: "Market expired" } }));
    h.submit();
    await act(async () => {});
    expect(h.result.current.error?.message).toBe("Market expired");
    expect(h.result.current.error?.cause).toBeInstanceOf(ActaWsRequestError);
  });
  it("propagates asynchronous trading errors through the context", async () => {
    const h = await setup(); vi.spyOn(h.client, "isAuthenticated").mockReturnValue(true);
    vi.spyOn(h.client, "acceptQuote").mockRejectedValue(new Error("accept failed"));
    vi.spyOn(h.client, "submitSignedSponsoredTx").mockRejectedValue(new Error("submit failed"));
    await expect(h.result.current.acceptQuote("rfq", "maker", "order")).rejects.toThrow("accept failed");
    await expect(h.result.current.submitSignedTx("order", "tx")).rejects.toThrow("submit failed");
  });
});

describe("token market response ownership", () => {
  const info = (request_id: string, market: string) => ({ request_id, underlying_decimals: 9, markets: [{ market_pda: market, is_put: false, indicatives: [] }] });
  it("clears the old asset and ignores its late response after selecting another asset", async () => {
    const h = await setup();
    act(() => h.result.current.getTokenMarketsInfo("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs"));
    const idA = h.metadataRequest.mock.lastCall![1].data.request_id;
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo?.underlyingMint).toBe("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs");
    act(() => h.result.current.getTokenMarketsInfo("7CD4aXXHH8wRoggACBuF8Wpdvs3sfngFbcuvufbxYLHM"));
    const idB = h.metadataRequest.mock.lastCall![1].data.request_id;
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info(idB, "market-B"));
    expect(h.result.current.tokenMarketsInfo).toEqual({ underlyingMint: "7CD4aXXHH8wRoggACBuF8Wpdvs3sfngFbcuvufbxYLHM", data: info(idB, "market-B") });
    expect(h.metadataRequest).toHaveBeenLastCalledWith("TokenMarketsInfo", { type: "GetTokenMarketsInfo", data: { request_id: idB, underlying_mint: "7CD4aXXHH8wRoggACBuF8Wpdvs3sfngFbcuvufbxYLHM" } });
  });
  it.each(["disconnected", "stateChange"])("invalidates in-flight metadata on %s", async event => {
    const h = await setup();
    act(() => h.result.current.getTokenMarketsInfo("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs"));
    const idA = h.metadataRequest.mock.lastCall![1].data.request_id;
    if (event === "stateChange") h.emit(event, "disconnected");
    else h.emit(event, 1006, "lost");
    h.emit("tokenMarketsInfo", info(idA, "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
  });
  it("keeps the same mint visible while refreshing, then clears it on failure", async () => {
    const h = await setup();
    act(() => h.result.current.getTokenMarketsInfo("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs"));
    const firstId = h.metadataRequest.mock.lastCall![1].data.request_id;
    h.emit("tokenMarketsInfo", info(firstId, "market-A"));
    let reject!: (error: Error) => void;
    h.metadataRequest.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    act(() => h.result.current.getTokenMarketsInfo("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs"));
    expect(h.result.current.tokenMarketsInfo?.underlyingMint).toBe("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs");
    await act(async () => reject(new Error("request timed out")));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
  });
  it("preserves indicative freshness in the shared cache", async () => {
    const h = await setup();
    act(() => h.result.current.getTokenMarketsInfo("GQ1XdBnJURK2w8fs1jxiTdQATgKSTy3rnx4PfMttvKMs"));
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
      const wallet = "11111111111111111111111111111111";
      mocks.account = { address: wallet };
      const h = await setup();
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


it.each([0, 250])("shares manual/automatic auth and retries after rejection (%sms)", async retryDelay => {
  vi.useFakeTimers();
  try {
    mocks.account = { address: "11111111111111111111111111111111" };
    const h = await setup();
    vi.spyOn(h.client, "getEarnSummary").mockReturnValue("summary");
    vi.spyOn(h.client, "getMyReferralInfo").mockReturnValue("referral");
    const connect = vi.spyOn(h.client, "connectAndAuthenticate").mockImplementation(() => {});
    h.emit("connected");
    let first!: Promise<void>;
    let same!: Promise<void>;
    await act(async () => {
      first = h.result.current.authenticate(mocks.account!.address, mocks.sign);
      same = h.result.current.authenticate(mocks.account!.address, mocks.sign);
    });
    expect(first).toBe(same);
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(connect).toHaveBeenCalledOnce();
    const rejected = expect(first).rejects.toBeTruthy();
    await act(async () => {
      h.emit("error", { type: "client_generic", data: { message: "Signature declined" } });
      await rejected;
    });
    await act(async () => { vi.advanceTimersByTime(retryDelay); });
    expect(h.client.connectAnonymous).toHaveBeenCalledTimes(retryDelay === 0 ? 1 : 2);
    expect(h.result.current.connectionState).not.toBe("authenticating");
    connect.mockImplementation(() => { h.emit("authenticated", "session", 4_000_000_000); });
    await act(() => h.result.current.authenticate(mocks.account!.address, mocks.sign));
    expect(connect).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(h.client.connectAnonymous).toHaveBeenCalledTimes(retryDelay === 0 ? 1 : 2);
    h.unmount();
  } finally { vi.useRealTimers(); }
});


it("invalidates pending authentication when the selected wallet changes", async () => {
  vi.useFakeTimers();
  try {
    const walletA = "11111111111111111111111111111111";
    const walletB = "So11111111111111111111111111111111111111112";
    mocks.account = { address: walletA };
    const h = await setup();
    vi.spyOn(h.client, "getEarnSummary").mockReturnValue("summary");
    vi.spyOn(h.client, "getMyReferralInfo").mockReturnValue("referral");
    const connect = vi.spyOn(h.client, "connectAndAuthenticate").mockImplementation(() => {});
    h.emit("connected");
    let pending!: Promise<void>;
    await act(async () => { pending = h.result.current.authenticate(walletA, mocks.sign); });
    const rejected = expect(pending).rejects.toThrow("Wallet changed");
    mocks.account = { address: walletB };
    h.rerender();
    await act(async () => { await rejected; });
    h.emit("authenticated", "wallet-A-session", 4_000_000_000);
    expect(h.result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem("acta_rfq_ws_session")).not.toContain("wallet-A-session");
    connect.mockImplementation(() => { h.emit("authenticated", "wallet-B-session", 4_000_000_000); });
    await act(() => h.result.current.authenticate(walletB, mocks.sign));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.localStorage.getItem("acta_rfq_ws_session")!)).toMatchObject({ walletAddress: walletB, sessionId: "wallet-B-session" });
    expect(h.result.current.isAuthenticated).toBe(true);
    mocks.account = { address: walletA };
    h.rerender();
    expect(h.result.current.isAuthenticated).toBe(false);
    expect(h.result.current.connectionState).toBe("disconnected");
    h.unmount();
  } finally { vi.useRealTimers(); window.localStorage.clear(); }
});

describe("spread capability and quote separation", () => {
  it("requires the server strike tick for both spread strikes", async () => {
    const h = await setup();
    h.emit("welcome", { server_time_unix_ms: Date.now() });
    act(() => h.result.current.submitRfq({ market: "market", terms: { type: "call_spread", lower_strike: 100e9, upper_strike: 120.5e9 }, quantity: 1_000_000 }));
    expect(h.create).not.toHaveBeenCalled();
    expect(h.result.current.error?.message).toContain("strike tick");
  });
  it("binds the spread product and complete pair in live and snapshot quotes", async () => {
    const h = await setup();
    h.emit("marketDescriptors", [{ products: ["cash_secured_put", "put_spread", "cash_put"], market: { market_pda: "market", underlying_mint: "underlying", is_put: true }, underlying_decimals: 6, quote_decimals: 6 }]);
    h.emit("welcome", { server_time_unix_ms: Date.now() });
    act(() => h.result.current.submitRfq({ market: "market", terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 }, quantity: 1_000_000 }));
    const request = h.create.mock.lastCall![0];
    expect(request).toMatchObject({ side: "sell", terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 } });
    h.emit("rfqCreated", { rfq_id: "spread", request_id: request.requestId });
    const quote = { ...h.quote("spread"), side: "sell", terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 }, price: 1e9 };
    for (const wrong of [{ side: undefined }, { side: "buy" }, { terms: undefined }, { terms: { type: "cash_secured_put", strike: 100e9 } }, { terms: { type: "put_spread", lower_strike: 100e9 } }, { terms: { ...quote.terms, upper_strike: 130e9 } }]) {
      h.emit("quoteReceived", { ...quote, ...wrong });
      expect(h.result.current.bestQuote).toBeNull();
      h.emit("quotesUpdate", { rfq_id: "spread", quotes: [{ ...quote, ...wrong }] });
      expect(h.result.current.bestQuote).toBeNull();
    }
    h.emit("quoteReceived", quote);
    expect(h.result.current.bestQuote).toEqual(quote);
    h.emit("quoteReceived", { ...quote, maker: "invalid", price: 20e9 });
    expect(h.result.current.bestQuote).toEqual(quote);
    h.emit("quotesUpdate", { rfq_id: "spread", quotes: [quote, { ...quote, maker: "invalid", price: 21e9 }] });
    expect(h.result.current.bestQuote).toEqual(quote);
    expect(h.result.current.rfqTerms("spread")).toMatchObject({ rfq_id: "spread", side: "sell", terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 } });
    h.emit("stateChange", "connecting");
    expect(h.result.current.bestQuote).toBeNull();
    h.emit("quoteReceived", quote);
    expect(h.result.current.bestQuote).toBeNull();
    h.emit("marketDescriptors", [{ products: ["covered_call"], market: { market_pda: "market", underlying_mint: "underlying", is_put: false }, underlying_decimals: 6, quote_decimals: 6 }]);
    h.submit();
    h.emit("rfqCreated", { rfq_id: "physical", request_id: h.create.mock.lastCall![0].requestId });
    h.emit("quoteReceived", { ...quote, rfq_id: "physical", terms: { ...quote.terms, lower_strike: 1 } });
    expect(h.result.current.bestQuote).toBeNull();
  });
});

it("does not connect a late venue-discovery result after unmount", async () => {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker", onDisconnect: "keep_quotes", products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"], clientName: "test", clientVersion: "0" });
  const connect = vi.spyOn(client, "connectAnonymous").mockImplementation(() => {});
  const disconnect = vi.spyOn(client, "disconnect");
  let resolve!: (client: ActaWsClient) => void;
  mocks.create.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(useRfqContext, { wrapper: ({ children }: { children: ReactNode }) => <RfqProvider>{children}</RfqProvider> });
  view.unmount();
  await act(async () => resolve(client));
  expect(connect).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalledOnce();
});
