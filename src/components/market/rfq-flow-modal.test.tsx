import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletTransactionSigner } from "@acta-markets/ts-sdk/ws";
import { ActaWsClient, type QuoteReceivedMessage, type TakerFillRfq } from "@/lib/rfq-client";
import { RfqFlowModal } from "./rfq-flow-modal";

const context = vi.hoisted(() => ({ read: vi.fn(), makerVault: vi.fn(async () => null) }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: context.read }));
vi.mock("@acta-markets/ts-sdk/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@acta-markets/ts-sdk/chain")>()),
  fetchMakerVault: () => context.makerVault(),
}));
vi.mock("@/lib/rfq-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rfq-client")>()),
  verifyAndSignTakerFill: async ({ txBase64, signer }: { txBase64: string; signer: WalletTransactionSigner }) =>
    btoa(String.fromCharCode(...await signer.signTransaction(Uint8Array.from(atob(txBase64), c => c.charCodeAt(0))))),
}));
vi.mock("@solana/web3.js", () => ({ VersionedTransaction: { deserialize: vi.fn(() => ({})) } }));
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const quote = {
  rfq_id: "rfq", order_id: "order", maker: "maker", strike: 1_000_000_000,
  price: 1_000_000_000, valid_until: 9999999999, nonce: 1n,
} as QuoteReceivedMessage;
const preview = {
  asset: "SOL", positionType: "covered_call" as const, strike: 1_000_000_000,
  quantity: 1_000_000_000, strikeDisplay: "$1", quantityDisplay: "1 SOL",
};

function setup() {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker" });
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  vi.spyOn(client, "getSessionId").mockReturnValue("credential");
  vi.spyOn(client, "getMyActiveRfqsAsync").mockResolvedValue({ request_id: "read", rfqs: [] });
  const cancelOnServer = vi.spyOn(client, "cancelRfq").mockReturnValue("cancel");
  const status = vi.spyOn(client, "request").mockResolvedValue({
    request_id: "read", order_id: "order", state: { type: "unknown" },
  });
  const accept = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn().mockResolvedValue(undefined);
  const sign = vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) });
  const cancel = vi.fn();
  context.read.mockReturnValue({
    bestQuote: quote, quoteSecondsRemaining: (q: QuoteReceivedMessage) => Math.max(0, Math.ceil(Number(q.valid_until) - Date.now() / 1000)), isAuthenticated: true, error: null,
    getClient: () => client, acceptQuote: accept, submitSignedTx: submit, cancelRfq: cancel,
    rfqTerms: () => ({ position_type: "covered_call", quantity: 1_000_000_000 }) as TakerFillRfq,
  });
  const props = {
    preview, open: true, onClose: vi.fn(), requestNonce: 1,
    walletAddress: "So11111111111111111111111111111111111111112", backendUrl: "ws://localhost", signTransaction: sign,
    rpc: {} as Parameters<typeof RfqFlowModal>[0]["rpc"],
  };
  const view = render(<RfqFlowModal {...props} />);
  const emit = (event: string, ...args: unknown[]) => act(() => {
    (client as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(event, ...args);
  });
  const send = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Accept Quote" }));
    await waitFor(() => expect(accept).toHaveBeenCalledOnce());
    emit("sponsoredTxToSign", "order", "AQ==", 9999999999);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  };
  const reload = () => {
    view.unmount();
    return render(<RfqFlowModal {...props} open={false} preview={null} />);
  };
  return { ...view, emit, send, reload, status, accept, submit, sign, cancel, cancelOnServer, props };
}

describe("RFQ order modal", () => {
  it("shows the best quote and cancels the RFQ when closed before accepting", async () => {
    const h = setup();
    await screen.findByRole("button", { name: "Accept Quote" });
    expect(screen.getAllByText("1.00 USDC").length).toBeGreaterThan(0);
    context.read.mockReturnValue({ ...context.read(), bestQuote: { ...quote, price: 2_000_000_000 } });
    h.rerender(<RfqFlowModal {...h.props} />);
    expect(screen.queryAllByText("1.00 USDC")).toHaveLength(0);
    expect(screen.getAllByText("2.00 USDC").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.cancel).toHaveBeenCalledOnce();
    expect(h.props.onClose).toHaveBeenCalledOnce();
  });

  it("removes a withdrawn quote before its expiry", () => {
    const h = setup();
    context.read.mockReturnValue({ ...context.read(), bestQuote: null });
    h.rerender(<RfqFlowModal {...h.props} />);
    expect(screen.queryByRole("button", { name: "Accept Quote" })).toBeNull();
    expect(screen.getByText("Getting quote from market makers")).toBeTruthy();
  });

  it("keeps the accepted quote displayed while its maker is looked up", async () => {
    let lookedUp!: (vault: null) => void;
    context.makerVault.mockImplementationOnce(() => new Promise(resolve => { lookedUp = resolve; }));
    const h = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Quote" }));
    context.read.mockReturnValue({ ...context.read(), bestQuote: { ...quote, order_id: "other", price: 2_000_000_000 } });
    h.rerender(<RfqFlowModal {...h.props} />);
    expect(screen.getAllByText("1.00 USDC").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("2.00 USDC")).toHaveLength(0);
    await act(async () => lookedUp(null));
    await waitFor(() => expect(h.accept).toHaveBeenCalledWith("rfq", "maker", "order"));
  });

  it.each(["orderAccepted", "orderSubmitted"])("shows status lookup after %s", async event => {
    const h = setup();
    await h.send();
    h.emit(event, "order", ...(event === "orderSubmitted" ? ["signature", 2] : [2]));
    expect(screen.getByRole("button", { name: "Check order status" })).toBeTruthy();
    expect(screen.queryByText("Submitting to blockchain...")).toBeNull();
  });

  it("links the sent transaction while confirmation is pending", async () => {
    const h = setup();
    await h.send();
    expect(screen.getByText("Order submitted. Waiting for on-chain confirmation.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View on Solscan" })).toBeNull();
    h.emit("orderSubmitted", "order", "sig123", 2);
    expect(screen.getByText("Transaction sent. Waiting for on-chain confirmation.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View on Solscan" }).getAttribute("href")).toContain("/tx/sig123");
  });

  it("lets an order waiting on AcceptQuote be cancelled and closed", async () => {
    const h = setup();
    h.accept.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(await screen.findByRole("button", { name: "Accept Quote" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(h.cancelOnServer).toHaveBeenCalledWith("rfq");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(h.props.onClose).toHaveBeenCalledOnce();
  });

  it("lets a restored, never-signed order be cancelled and closed", async () => {
    const h = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Quote" }));
    await waitFor(() => expect(h.accept).toHaveBeenCalledOnce());
    h.reload();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(h.cancelOnServer).toHaveBeenCalledWith("rfq");
    expect(h.sign).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(screen.getByText("Order cancelled. Nothing was submitted.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores a sent order without a market preview and keeps confirmation visible", async () => {
    const h = setup();
    await h.send();
    h.emit("orderSubmitted", "order", "signature", 2);
    h.reload();
    await screen.findByRole("button", { name: "Check order status" });
    expect(screen.getByText("Recovered order")).toBeTruthy();
    expect(screen.queryByText("1 SOL")).toBeNull();
    expect(h.accept).toHaveBeenCalledOnce();
    expect(h.submit).toHaveBeenCalledOnce();
    expect(h.sign).toHaveBeenCalledOnce();
    h.emit("orderConfirmed", "order", "position", 3);
    expect(screen.getByText("Order Confirmed!")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View on Solscan" }).getAttribute("href")).toContain("signature");
    expect(localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows confirmation when reload lookup completes immediately", async () => {
    const h = setup();
    await h.send();
    h.status.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "confirmed", position_pda: "position" } });
    h.reload();
    await screen.findByText("Order Confirmed!");
    expect(h.submit).toHaveBeenCalledOnce();
  });
});


it("counts down the server-adjusted validity, disables expiry, and refreshes for a new quote", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  const h = setup();
  const remaining = (q: QuoteReceivedMessage) => Math.max(0, Math.ceil(Number(q.valid_until) - (Date.now() / 1000 + 5)));
  const expiring = { ...quote, valid_until: Date.now() / 1000 + 8 };
  context.read.mockReturnValue({ ...context.read(), bestQuote: expiring, quoteSecondsRemaining: remaining });
  h.rerender(<RfqFlowModal {...h.props} />);
  expect(screen.getByRole("timer").textContent).toBe("Quote expires in 3s");
  act(() => vi.advanceTimersByTime(3000));
  context.read.mockReturnValue({ ...context.read(), bestQuote: null });
  h.rerender(<RfqFlowModal {...h.props} />);
  expect(screen.getByRole("timer").textContent).toBe("Quote expired. Request a fresh quote.");
  expect((screen.getByRole("button", { name: "Accept Quote" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Accept Quote" }));
  expect(h.accept).not.toHaveBeenCalled();
  context.read.mockReturnValue({ ...context.read(), bestQuote: { ...expiring, valid_until: Date.now() / 1000 + 15 } });
  h.rerender(<RfqFlowModal {...h.props} />);
  expect(screen.getByRole("timer").textContent).toBe("Quote expires in 10s");
  expect((screen.getByRole("button", { name: "Accept Quote" }) as HTMLButtonElement).disabled).toBe(false);
});
