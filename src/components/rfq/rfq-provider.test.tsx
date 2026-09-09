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
  return { ...hook, client, create, emit, submit, quote };
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
    const request = vi.spyOn(h.client, "getTokenMarketsInfo").mockReturnValueOnce("request-A").mockReturnValueOnce("request-B");
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    h.emit("tokenMarketsInfo", info("request-A", "market-A"));
    expect(h.result.current.tokenMarketsInfo?.underlyingMint).toBe("mint-A");
    act(() => h.result.current.getTokenMarketsInfo("mint-B"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info("request-A", "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
    h.emit("tokenMarketsInfo", info("request-B", "market-B"));
    expect(h.result.current.tokenMarketsInfo).toEqual({ underlyingMint: "mint-B", data: info("request-B", "market-B") });
    expect(request).toHaveBeenLastCalledWith("mint-B");
  });
  it("invalidates in-flight metadata on disconnect", () => {
    const h = setup(); vi.spyOn(h.client, "getTokenMarketsInfo").mockReturnValue("request-A");
    act(() => h.result.current.getTokenMarketsInfo("mint-A"));
    h.emit("disconnected", 1006, "lost");
    h.emit("tokenMarketsInfo", info("request-A", "market-A"));
    expect(h.result.current.tokenMarketsInfo).toBeNull();
  });
});
