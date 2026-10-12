import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActaWsClient, type QuoteReceivedMessage } from "@/lib/rfq-client";
import { RfqFlowModal } from "./rfq-flow-modal";

const context = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: context.read }));
vi.mock("@solana/web3.js", () => ({ VersionedTransaction: { deserialize: vi.fn(() => ({})) } }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

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
  const status = vi.spyOn(client, "request").mockResolvedValue({
    request_id: "read", order_id: "order", state: { type: "unknown" },
  });
  const accept = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn().mockResolvedValue(undefined);
  const sign = vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) });
  context.read.mockReturnValue({
    currentQuote: null, isAuthenticated: true, error: null,
    getClient: () => client, acceptQuote: accept, submitSignedTx: submit,
  });
  const props = {
    preview, open: true, onClose: vi.fn(), requestNonce: 1, initialQuote: quote,
    walletAddress: "wallet", backendUrl: "ws://localhost", signTransaction: sign,
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
    return render(<RfqFlowModal {...props} open={false} preview={null} initialQuote={null} />);
  };
  return { ...view, emit, send, reload, status, accept, submit, sign, props };
}

describe("RFQ order modal", () => {
  it.each(["orderAccepted", "orderSubmitted"])("shows status lookup after %s", async event => {
    const h = setup();
    await h.send();
    h.emit(event, "order", ...(event === "orderSubmitted" ? ["signature", 2] : [2]));
    expect(screen.getByRole("button", { name: "Check order status" })).toBeTruthy();
    expect(screen.queryByText("Submitting to blockchain...")).toBeNull();
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
