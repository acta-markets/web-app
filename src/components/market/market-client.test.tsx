import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { MarketClient } from "./market-client";

const mocks = vi.hoisted(() => ({ context: {} as Record<string, unknown>, refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), modal: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams("type=call") }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => mocks.context }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ selectedAccount: null }) }));
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
function setSnapshot(data: TokenMarketsInfoData) {
  mocks.context.tokenMarketsInfo = { underlyingMint: getTokenMint("SOL"), data };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  mocks.context = {
    markets: [], marketDescriptors: [], tokenCaps: [], currentQuote: null, error: null,
    isConnected: true, isAuthenticated: false, connectionState: "connected", referralStatus: "unknown",
    getTokenMarketsInfo: mocks.refresh, clearTransientState: vi.fn(), submitRfq: vi.fn(),
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
    expect(props.backendUrl).toBe("wss://beta-api.acta.markets");
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
});
