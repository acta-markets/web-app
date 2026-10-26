import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { address } from "@solana/kit";
import { deriveAta, TOKEN_PROGRAM_ID } from "@acta-markets/ts-sdk/chain";
import { Connection, PublicKey } from "@solana/web3.js";
import { ActaWsRequestError } from "@acta-markets/ts-sdk/ws";
import { MarketClient } from "./market-client";

const mocks = vi.hoisted(() => ({ params: "type=call", context: {} as Record<string, unknown>, account: null as { address: string } | null, refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), modal: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock("@/components/rfq/rfq-provider", () => ({ RFQ_TTL_SECONDS: 30, useRfqContext: () => mocks.context }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ selectedAccount: mocks.account }) }));
vi.mock("@/components/wallet/wallet-sidebar", () => ({ useWalletSidebar: () => ({ openSidebar: vi.fn() }) }));
vi.mock("./rfq-flow-modal", () => ({ RfqFlowModal: (props: unknown) => { mocks.modal(props); return null; } }));
const now = 1_800_000_000;
function snapshot(spot = 100, stale = false): TokenMarketsInfoData {
  return {
    request_id: "metadata", underlying_symbol: "SOL", underlying_decimals: 9,
    quote_symbol: "USDC", quote_decimals: 6,
    reference_price: spot * 1e9, size_rule: { min_size: 1e8, max_size: 1e10, step: 1e8 },
    markets: [{ market_pda: "market", expiry_ts: now + 365 * 86400, is_put: false,
      indicatives: [{ position_type: "covered_call", updated_at: now, is_stale: stale,
        strikes: [{ strike: 110e9, best_price: 10e9 }] }] }],
  };
}
async function tokenAccount(symbol: string, amount: string, canonical = true, state = "initialized") {
  const owner = new PublicKey("11111111111111111111111111111111");
  const program = new PublicKey(TOKEN_PROGRAM_ID);
  const mint = new PublicKey(getTokenMint(symbol)!);
  const ata = new PublicKey(await deriveAta({ owner: address(owner.toBase58()), mint: address(mint.toBase58()), tokenProgram: TOKEN_PROGRAM_ID }));
  return { pubkey: canonical ? ata : owner, account: { owner: program, data: { parsed: { info: { state, tokenAmount: { amount } } } } } };
}
function setSnapshot(data: TokenMarketsInfoData) {
  mocks.context.tokenMarketsInfo = { underlyingMint: getTokenMint("SOL"), data };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account = null;
  mocks.params = "type=call";
  vi.spyOn(Connection.prototype, "getParsedTokenAccountsByOwner").mockResolvedValue({ context: { slot: 1 }, value: [] });
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  mocks.context = {
    markets: [], marketDescriptors: [], tokenCaps: [], bestQuote: null, error: null,
    isConnected: true, isAuthenticated: false, connectionState: "connected", referralStatus: "unknown",
    getTokenMarketsInfo: mocks.refresh, cancelRfq: vi.fn(), submitRfq: vi.fn(),
  };
  setSnapshot(snapshot());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("market APR from backend prices", () => {
  it("distinguishes fractional strikes and keeps the selected outcome price exact", () => {
    const data = snapshot();
    data.markets[0].indicatives[0].strikes = [
      { strike: 101.1e9, best_price: 10e9 },
      { strike: 101.4e9, best_price: 9e9 },
    ];
    setSnapshot(data);
    render(<MarketClient asset="SOL" />);
    expect(screen.getByRole("button", { name: /\$101\.1\s*APR/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /\$101\.4\s*APR/ }));
    expect(screen.getByText("If spot below $101.4")).toBeTruthy();
    expect(screen.getByText("If spot above $101.4")).toBeTruthy();
  });

  it("keeps the RFQ recovery modal mounted while live market metadata is unavailable", () => {
    mocks.context.tokenMarketsInfo = null;
    render(<MarketClient asset="SOL" />);
    const props = mocks.modal.mock.lastCall?.[0] as { preview: unknown; walletAddress: unknown; backendUrl: string };
    expect(props.preview).toBeNull();
    expect(props.walletAddress).toBeNull();
    expect(props.backendUrl).toBe("wss://devnet-api.acta.markets");
  });
  it("renders APR without calling Hermes and recalculates when backend spot changes", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Hermes unavailable"));
    const page = render(<MarketClient asset="SOL" />);
    expect(screen.getByText("You earn 10% APR")).toBeTruthy();
    setSnapshot(snapshot(200));
    page.rerender(<MarketClient asset="SOL" />);
    expect(screen.getByText("You earn 5% APR")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not present stale premiums as a current APR", () => {
    setSnapshot(snapshot(100, true));
    render(<MarketClient asset="SOL" />);
    expect(screen.getByText("APR unavailable")).toBeTruthy();
    expect(screen.queryByText(/You earn .* APR/)).toBeNull();
  });
  it("removes the previous APR when the metadata is invalidated", () => {
    const page = render(<MarketClient asset="SOL" />);
    expect(screen.getByText("You earn 10% APR")).toBeTruthy();
    mocks.context.tokenMarketsInfo = null;
    page.rerender(<MarketClient asset="SOL" />);
    expect(screen.queryByText(/You earn .* APR/)).toBeNull();
  });
  it("refreshes the combined spot and premium snapshot every 30 seconds and stops on disconnect", () => {
    vi.useFakeTimers();
    const page = render(<MarketClient asset="SOL" />);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    mocks.context.connectionState = "disconnected";
    mocks.context.isConnected = false;
    mocks.context.tokenMarketsInfo = null;
    page.rerender(<MarketClient asset="SOL" />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
  it("cancels the RFQ when no quote arrives within the RFQ TTL", async () => {
    vi.useFakeTimers();
    mocks.context = {
      ...mocks.context, isAuthenticated: true, connectionState: "authenticated",
      marketDescriptors: [{ market: { market_pda: "market" }, underlying: { size_rule: { min_size: 1e8, max_size: 1e10, step: 1e8 } } }],
    };
    mocks.account = { address: "11111111111111111111111111111111" };
    vi.spyOn(Connection.prototype, "getBalance").mockResolvedValue(10e9);
    await act(async () => { render(<MarketClient asset="SOL" />); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(29_000));
    expect(mocks.context.cancelRfq).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe("No quotes arrived within 30 seconds. Try another strike or size.");
  });
  it("pauses the snapshot refresh while the tab is hidden and refreshes when it is shown", () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    render(<MarketClient asset="SOL" />);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    hidden = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => vi.advanceTimersByTime(90_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    hidden = false;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
});


describe("RFQ request feedback and collateral", () => {
  function connect() {
    mocks.account = { address: "11111111111111111111111111111111" };
    Object.assign(mocks.context, { isAuthenticated: true, connectionState: "authenticated" });
  }
  it("disables a call deposit above balance using the aligned request quantity", async () => {
    connect();
    vi.spyOn(Connection.prototype, "getBalance").mockResolvedValue(151_200_000);
    await act(async () => { render(<MarketClient asset="SOL" />); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0.16" } });
    expect(screen.getByRole("alert").textContent).toBe("Not enough SOL to post collateral: need 0.2, have 0.15");
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(mocks.context.submitRfq).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0.1" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("includes wrapped SOL when checking native collateral", async () => {
    connect();
    vi.spyOn(Connection.prototype, "getBalance").mockResolvedValue(101_200_000);
    vi.mocked(Connection.prototype.getParsedTokenAccountsByOwner).mockResolvedValue({ context: { slot: 1 }, value: [
      await tokenAccount("SOL", "900000000"),
    ] } as any);
    await act(async () => { render(<MarketClient asset="SOL" />); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    await screen.findByText("1 SOL");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    [1_000_000_000, false, "initialized", "0.9988"],
    [101_200_000, false, "initialized", "0.1"],
    [2_000_000_000, true, "frozen", "0"],
  ])("uses the canonical ATA, native reserve and frozen-account rules (%s, %s, %s)", async (native, canonical, state, available) => {
    connect();
    vi.spyOn(Connection.prototype, "getBalance").mockResolvedValue(native);
    vi.mocked(Connection.prototype.getParsedTokenAccountsByOwner).mockResolvedValue({ context: { slot: 1 }, value: [
      await tokenAccount("SOL", "900000000", canonical, state),
    ] } as any);
    await act(async () => { render(<MarketClient asset="SOL" />); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(`Not enough SOL to post collateral: need 1, have ${available}`));
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("checks put collateral against the maximum advertised strike, not just the selected strike", async () => {
    connect();
    mocks.params = "type=csp&strike=100";
    const data = snapshot();
    data.markets[0].is_put = true;
    data.markets[0].indicatives[0].position_type = "cash_secured_put";
    data.markets[0].indicatives[0].strikes = [{ strike: 100e9, best_price: 10e9 }, { strike: 200e9, best_price: 10e9 }];
    setSnapshot(data);
    vi.mocked(Connection.prototype.getParsedTokenAccountsByOwner).mockResolvedValue({ context: { slot: 1 }, value: [
      await tokenAccount("USDC", "150000000"),
    ] } as any);
    await act(async () => { render(<MarketClient asset="SOL" />); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "100" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not enough USDC to post collateral: need 200, have 150"));
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.context.submitRfq).not.toHaveBeenCalled();
  });
  it.each(["insufficient_collateral", "time_overflow"])("shows %s at the request site without opening the quote modal", async code => {
    connect();
    vi.spyOn(Connection.prototype, "getBalance").mockResolvedValue(10e9);
    const page = render(<MarketClient asset="SOL" />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledOnce();
    mocks.context.error = new Error("server rejection", { cause: new ActaWsRequestError("request_error", "r", {
      type: "Generic", data: { code, message: "insufficient collateral: required=1000000000, available=123000000 (collateral atoms)" },
    }) });
    page.rerender(<MarketClient asset="SOL" />);
    expect(screen.getByRole("alert").textContent).toBe(code === "insufficient_collateral"
      ? "Not enough SOL to post collateral: need 1, have 0.123"
      : "Could not request a quote. Please try again.");
    expect((mocks.modal.mock.lastCall?.[0] as { open: boolean }).open).toBe(false);
    expect(screen.getByRole("button", { name: "Deposit" })).toBeTruthy();
  });
});
