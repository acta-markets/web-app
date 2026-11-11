import type { Address } from "@solana/kit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletTransactionSigner } from "@acta-markets/ts-sdk/ws";
import { ActaWsClient, type QuoteReceivedMessage, type TakerFillRfq } from "@/lib/rfq-client";
import { RfqFlowModal, type RfqOrderPreview } from "./rfq-flow-modal";

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
vi.mock("@/lib/sponsored-tx", () => ({
  resolveKeeper: async () => "Keeper1111111111111111111111111111111111111",
  resolveLookupTables: async () => ({}),
  // The wallet here is a stub with no real signatures, so the graft is a pass-through.
}));
vi.mock("@solana/web3.js", () => ({ VersionedTransaction: { deserialize: vi.fn(() => ({})) } }));
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const quote = {
  rfq_id: "rfq", order_id: "order", maker: "maker", side: "sell", terms: { type: "covered_call", strike: 1_000_000_000 },
  price: 1_000_000_000, valid_until: 9999999999, nonce: 1n,
} as QuoteReceivedMessage;
const preview: RfqOrderPreview = {
  asset: "SOL", terms: { type: "covered_call" as const, strike: 1_000_000_000 },
  quantity: 1_000_000_000, underlyingDecimals: 9, strikeDisplay: "$1", quantityDisplay: "1 SOL",
};

function setup(previewOverrides: Partial<RfqOrderPreview> = {}, bestQuote: QuoteReceivedMessage = quote) {
  const client = new ActaWsClient({ url: "ws://localhost", role: "taker", onDisconnect: "keep_quotes", products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"], clientName: "test", clientVersion: "0" });
  vi.spyOn(client, "isAuthenticated").mockReturnValue(true);
  vi.spyOn(client, "getSessionId").mockReturnValue("credential");
  vi.spyOn(client, "getMyActiveRfqsAsync").mockResolvedValue({ next_cursor: null, request_id: "read", rfqs: [] });
  const cancelOnServer = vi.spyOn(client, "cancelRfq").mockReturnValue("cancel");
  const status = vi.spyOn(client, "request").mockResolvedValue({
    request_id: "read", order_id: "order", state: { type: "unknown" },
  });
  const accept = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn().mockResolvedValue(undefined);
  const sign = vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) });
  const cancel = vi.fn();
  context.read.mockReturnValue({
    bestQuote, quoteSecondsRemaining: (q: QuoteReceivedMessage) => Math.max(0, Math.ceil(Number(q.valid_until) - Date.now() / 1000)), isAuthenticated: true, error: null,
    getClient: () => client, acceptQuote: accept, submitSignedTx: submit, cancelRfq: cancel,
    rfqTerms: () => ({ rfq_id: "rfq", terms: { type: "covered_call", strike: 1_000_000_000 }, side: "sell", quantity: 1_000_000_000 }) as TakerFillRfq,
  });
  const props = {
    preview: { ...preview, ...previewOverrides }, open: true, onClose: vi.fn(), requestNonce: 1,
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

  it("prices the premium with the underlying's own decimals", async () => {
    // 2 JLP (6 decimals) at a 1 USDC premium each
    setup({ asset: "JLP", quantity: 2_000_000, underlyingDecimals: 6, quantityDisplay: "2 JLP" });
    await screen.findByRole("button", { name: "Accept Quote" });
    expect(screen.getAllByText("2.00 USDC").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("0.00 USDC")).toHaveLength(0);
  });

  it("shows the thesis the order expresses", async () => {
    setup({ thesis: "SOL will be above $1 on Nov 7" });
    await screen.findByRole("button", { name: "Accept Quote" });
    expect(screen.getByText("“SOL will be above $1 on Nov 7”")).toBeTruthy();
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
    h.status.mockResolvedValue({ request_id: "read", order_id: "order", state: { type: "confirmed", position_pda: "position" as Address } });
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

describe("Buy", () => {
    const buyPreview = { side: "buy" as const, terms: { type: "covered_call" as const, strike: 150e9 }, strikeDisplay: "$150", quantity: 2e9, quantityDisplay: "2 SOL" };
    const buyQuote = { ...quote, side: "buy", terms: buyPreview.terms, price: 5e9, net_price: 4.5e9 } as QuoteReceivedMessage;
    const row = (label: string) => screen.getByText(label).parentElement;

    it("shows the gross premium, max loss and break-even for a call", async () => {
      setup(buyPreview, buyQuote);
      await screen.findByRole("button", { name: "Accept Quote" });
      expect(screen.getByText("Buy a call")).toBeTruthy();
      expect(screen.getAllByText("10.00 USDC").length).toBeGreaterThan(0);
      expect(screen.queryByText("9.00 USDC")).toBeNull();
      expect(row("Max loss")?.textContent).toContain("10.00 USDC");
      expect(row("Break-even")?.textContent).toContain("$155");
      expect(row("Deposit to exercise")?.textContent).toContain("300");
      expect(screen.queryByText("APR")).toBeNull();
    });

    it("mirrors break-even and the exercise deposit for a put", async () => {
      const terms = { type: "cash_secured_put" as const, strike: 150e9 };
      setup({ ...buyPreview, terms }, { ...buyQuote, terms });
      await screen.findByRole("button", { name: "Accept Quote" });
      expect(screen.getByText("Buy a put")).toBeTruthy();
      expect(row("Break-even")?.textContent).toContain("$145");
      expect(row("Deposit to exercise")?.textContent).toContain("2 SOL");
    });

    it("shows max loss, max gain and break-even for a bought spread, with no deposit", async () => {
      const terms = { type: "call_spread" as const, lower_strike: 150e9, upper_strike: 160e9 };
      setup({ ...buyPreview, terms }, { ...buyQuote, terms });
      await screen.findByText("Quote Received");
      expect(screen.getByText("Buy a call spread")).toBeTruthy();
      expect(screen.getByText("Max loss").nextElementSibling?.textContent).toBe("10.00 USDC");
      expect(screen.getByText("Max gain").nextElementSibling?.textContent).toBe("10.00 USDC");
      expect(screen.getByText("Break-even").nextElementSibling?.textContent).toBe("$155.00");
      expect(screen.queryByText("Deposit to exercise")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(/No deposit/)).toBeTruthy();
    });

    it("breaks even under the upper leg of a bought cash put", async () => {
      const terms = { type: "cash_put" as const, strike: 150e9 };
      setup({ ...buyPreview, terms }, { ...buyQuote, terms });
      await screen.findByText("Quote Received");
      expect(screen.getByText("Buy a cash put")).toBeTruthy();
      expect(screen.getByText("Max gain").nextElementSibling?.textContent).toBe("290.00 USDC");
      expect(screen.getByText("Break-even").nextElementSibling?.textContent).toBe("$145.00");
    });

    it("waits on a quote of the wrong side", () => {
      setup(buyPreview, { ...buyQuote, side: "sell" });
      expect(screen.queryByRole("button", { name: "Accept Quote" })).toBeNull();
    });

    it("leaves the sell panel without any buy terms", async () => {
      setup();
      await screen.findByRole("button", { name: "Accept Quote" });
      expect(screen.queryByText("Max loss")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Total premium")).toBeTruthy();
    });
});
