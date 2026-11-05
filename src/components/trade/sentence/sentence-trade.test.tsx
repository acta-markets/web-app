import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EarnAssetSummary, TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { SentenceTrade } from "./sentence-trade";

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  account: null as { address: string } | null,
  balance: null as number | null,
  refresh: vi.fn(),
  openSidebar: vi.fn(),
  modal: vi.fn(),
}));
vi.mock("@/components/rfq/rfq-provider", () => ({ RFQ_TTL_SECONDS: 30, useRfqContext: () => mocks.context }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ selectedAccount: mocks.account, rpc: {}, signTransaction: vi.fn() }),
}));
vi.mock("@/components/wallet/wallet-sidebar", () => ({ useWalletSidebar: () => ({ openSidebar: mocks.openSidebar }) }));
vi.mock("@/components/wallet/use-token-balance", () => ({ useTokenBalance: () => mocks.balance }));
vi.mock("@/components/market/rfq-flow-modal", () => ({
  RfqFlowModal: (props: unknown) => {
    mocks.modal(props);
    return null;
  },
}));
vi.mock("./thesis-chart", () => ({ ThesisChart: () => null }));

const now = 1_800_000_000;
const day = 86400;
const SOL = getTokenMint("SOL")!;
const JLP = getTokenMint("JLP")!;

function indicatives(positionType: string, strikes: Array<[number, number | null]>, stale = false) {
  return {
    position_type: positionType, updated_at: now, is_stale: stale,
    strikes: strikes.map(([strike, premium]) => ({ strike: strike * 1e9, best_price: premium == null ? null : premium * 1e9 })),
  };
}

function snapshot({ stale = false } = {}): TokenMarketsInfoData {
  return {
    request_id: "r", underlying_symbol: "SOL", underlying_decimals: 9, quote_symbol: "USDC", quote_decimals: 6,
    reference_price: 100e9, size_rule: { min_size: 1e8, max_size: 1e11, step: 1e8 },
    markets: [
      { market_pda: "put-soon", expiry_ts: now + 7 * day, is_put: true,
        indicatives: [indicatives("cash_secured_put", [[95, 1], [90, 0.5], [80, null]], stale)] },
      { market_pda: "put-late", expiry_ts: now + 14 * day, is_put: true,
        indicatives: [indicatives("cash_secured_put", [[95, 1.5], [90, 0.8]], stale)] },
      { market_pda: "call-soon", expiry_ts: now + 7 * day, is_put: false,
        indicatives: [indicatives("covered_call", [[105, 1], [110, 0.5]], stale)] },
    ],
  } as unknown as TokenMarketsInfoData;
}

function summary(): EarnAssetSummary[] {
  const row = (symbol: string, mint: string, positionType: string): EarnAssetSummary => ({
    underlying_mint: mint, underlying_symbol: symbol, quote_mint: "usdc", quote_symbol: "USDC", position_type: positionType,
    apr: { type: "available", min: 0.1, max: 0.5 }, cap_filled_pct: 0, cap_total: 0, cap_used: 0, strikes_count: 3,
    nearest_market_pda: "pda", markets_count: 2, nearest_expiry_ts: now + 7 * day,
  } as unknown as EarnAssetSummary);
  return [row("SOL", SOL, "cash_secured_put"), row("SOL", SOL, "covered_call"), row("JLP", JLP, "covered_call")];
}

function select(name: string) {
  return screen.getByRole("combobox", { name }) as HTMLSelectElement;
}

function connectWallet() {
  mocks.account = { address: "11111111111111111111111111111111" };
  mocks.context = { ...mocks.context, isAuthenticated: true, connectionState: "authenticated", referralStatus: "redeemed" };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  mocks.account = null;
  mocks.balance = null;
  mocks.context = {
    earnSummary: summary(),
    tokenMarketsInfo: { underlyingMint: SOL, data: snapshot() },
    getTokenMarketsInfo: mocks.refresh,
    connectionState: "connected", isAuthenticated: false, referralStatus: "unknown",
    bestQuote: null, error: null, submitRfq: vi.fn(), cancelRfq: vi.fn(), openReferralGate: vi.fn(),
    marketDescriptors: [],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("sentence trade", () => {
  it("opens Earn on a complete thesis with the one-line summary and one Trade button", () => {
    render(<SentenceTrade mode="yield" />);
    expect(select("Asset").value).toBe("SOL");
    expect(select("Direction").value).toBe("above");
    expect(select("Price").value).toBe(String(95e9));
    expect(select("Date").value).toBe(String(now + 7 * day));
    expect((screen.getByLabelText("Amount in USDC") as HTMLInputElement).value).toBe("104.5");
    // 1.1 SOL locked at $95, $1 premium per SOL
    expect(screen.getByText("≈$1.10")).toBeTruthy();
    expect(screen.getByText("$104.50")).toBeTruthy();
    expect(screen.getByText("SOL can fall 5.0% and you're still right.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeTruthy();
    // the deposit/payout line left the sentence: it is the summary now
    expect(screen.queryByText(/I get paid/)).toBeNull();
    expect(screen.queryByText(/If I deposit/)).toBeNull();
    // no options-chain furniture
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("Break-even")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledWith(SOL);
  });

  it("flips to a covered call, swapping the amount symbol and strikes", () => {
    render(<SentenceTrade mode="yield" />);
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect(select("Price").value).toBe(String(105e9));
    expect([...select("Price").options].map((o) => o.value)).toEqual([String(105e9), String(110e9)]);
    expect((screen.getByLabelText("Amount in SOL") as HTMLInputElement).value).toBe("1");
  });

  it("falls back to the nearest date when the other side does not list the chosen one", () => {
    render(<SentenceTrade mode="yield" />);
    fireEvent.change(select("Date"), { target: { value: String(now + 14 * day) } });
    expect(select("Price").value).toBe(String(95e9));
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect(select("Date").value).toBe(String(now + 7 * day));
  });

  it("does not present stale premiums, in the sentence or the summary", () => {
    connectWallet();
    mocks.context.tokenMarketsInfo = { underlyingMint: SOL, data: snapshot({ stale: true }) };
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByText(/≈\$/)).toBeNull();
    expect((screen.getByRole("button", { name: "Prices unavailable" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requests a sell quote from Earn's Trade button at the floored quantity", () => {
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    fireEvent.change(screen.getByLabelText("Amount in USDC"), { target: { value: "1000" } });
    // 1000 USDC at $95 is 10.526 SOL; the 0.1 SOL step floors it to 10.5 SOL, 997.50 USDC
    expect(screen.getByText("Locks 997.5 USDC (size steps of 9.5)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "put-soon", side: "sell", terms: { type: "cash_secured_put", strike: 95e9 }, quantity: 10_500_000_000, timeoutSeconds: 30,
    });
    const preview = (mocks.modal.mock.lastCall?.[0] as { preview: Record<string, unknown> }).preview;
    expect(preview).toMatchObject({
      asset: "SOL", terms: { type: "cash_secured_put", strike: 95e9 }, quantity: 10_500_000_000, underlyingDecimals: 9,
      thesis: "SOL will be above $95 on Jan 22",
    });
    expect((screen.getByLabelText("Amount in USDC") as HTMLInputElement).value).toBe("997.5");
    expect((screen.getByRole("button", { name: "Getting quote..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(select("Price").disabled).toBe(true);
  });

  it("Profit pays the quote: the summary states the premium, the Trade button buys", () => {
    connectWallet();
    render(<SentenceTrade mode="profit" />);
    // a buy trades the call market for above; strikes come from the same listings
    expect(select("Price").value).toBe(String(105e9));
    expect(screen.getByText("the quoted premium")).toBeTruthy();
    expect(screen.getByText("max loss")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "call-soon", side: "buy", terms: { type: "covered_call", strike: 105e9 }, quantity: 1_000_000_000, timeoutSeconds: 30,
    });
  });

  it("blocks amounts over the balance or outside the size rule", () => {
    connectWallet();
    mocks.balance = 50;
    render(<SentenceTrade mode="yield" />);
    expect(screen.getByRole("button", { name: "Insufficient balance" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount in USDC"), { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Below min 9.5 USDC" })).toBeTruthy();
  });

  it("cancels the RFQ when no quote arrives within the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe("No quote came back in 30 seconds. Try again.");
  });
});
