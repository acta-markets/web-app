import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ActaWsClient, type QuoteReceivedMessage } from "@acta-markets/ts-sdk/ws";
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
  const create = vi.spyOn(client, "createRfq").mockResolvedValue();
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
    return create.mock.lastCall![0].clientRequestId;
  };
  const quote = (rfq: string) => ({ rfq_id: rfq, order_id: "order", maker: "maker", strike: 1, price: 1, valid_until: 9999999999, nonce: 1n } as QuoteReceivedMessage);
  return { ...hook, client, create, emit, submit, quote, metadataRequest };
}

describe("RFQ request ownership", () => {
  it("only accepts quotes after the matching RfqCreated", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "other", client_request_id: "old" });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.currentQuote).toBeNull();
    h.emit("rfqCreated", { rfq_id: "ours", client_request_id: id });
    h.emit("quoteReceived", h.quote("other")); expect(h.result.current.currentQuote).toBeNull();
    h.emit("quoteReceived", { ...h.quote("ours"), strike: 2 }); expect(h.result.current.currentQuote).toBeNull();
    h.emit("quoteReceived", h.quote("ours")); expect(h.result.current.currentQuote?.rfq_id).toBe("ours");
  });
  it("ignores stale replies from the previous Deposit action", () => {
    const h = setup(); const old = h.submit(); const latest = h.submit(); expect(latest).not.toBe(old);
    h.emit("rfqCreated", { rfq_id: "old", client_request_id: old }); h.emit("quoteReceived", h.quote("old"));
    expect(h.result.current.currentQuote).toBeNull();
    h.emit("rfqCreated", { rfq_id: "latest", client_request_id: latest }); h.emit("quoteReceived", h.quote("latest"));
    expect(h.result.current.currentQuote?.rfq_id).toBe("latest");
  });
  it("only clears the quote when its own RFQ closes", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", client_request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("rfqClosed", { rfq_id: "other" }); expect(h.result.current.currentQuote).not.toBeNull();
    h.emit("rfqClosed", { rfq_id: "ours" }); expect(h.result.current.currentQuote).toBeNull();
    expect(h.result.current.error).toBeNull();
  });
  it("discards pre-disconnect quotes and their late replies", () => {
    const h = setup(); const id = h.submit();
    h.emit("rfqCreated", { rfq_id: "ours", client_request_id: id }); h.emit("quoteReceived", h.quote("ours"));
    h.emit("disconnected", 1006, "lost"); h.emit("quoteReceived", h.quote("ours"));
    expect(h.result.current.currentQuote).toBeNull();
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
