import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
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
vi.mock("./thesis-chart", () => ({ ThesisChart: ({ title }: { title?: ReactNode }) => title ?? null }));

const now = 1_800_000_000;
const day = 86400;
const SOL = getTokenMint("SOL")!;
const JLP = getTokenMint("JLP")!;

function indicatives(positionType: string, strikes: Array<[number, number | null]>, stale = false, side: "sell" | "buy" = "sell") {
  return {
    position_type: positionType, side, freshness: { type: stale ? "stale" : "fresh", updated_at: now },
    strikes: strikes.map(([strike, premium]) => ({ strike: strike * 1e9, price: premium == null ? { type: "none" } : { type: "quoted", price: premium * 1e9 } })),
  };
}

function snapshot({ stale = false } = {}): TokenMarketsInfoData {
  return {
    request_id: "r", underlying_symbol: "SOL", underlying_decimals: 9, quote_symbol: "USDC", quote_decimals: 6,
    reference_price: 100e9, size_rule: { min_size: 1e8, max_size: 1e11, step: 1e8 },
    markets: [
      { market_pda: "put-soon", expiry_ts: now + 7 * day, is_put: true,
        indicatives: [
          indicatives("cash_secured_put", [[95, 1], [90, 0.5], [80, null]], stale),
          indicatives("cash_secured_put", [[95, 1], [90, 0.5], [80, null]], stale, "buy"),
        ] },
      { market_pda: "put-late", expiry_ts: now + 14 * day, is_put: true,
        indicatives: [
          indicatives("cash_secured_put", [[95, 1.5], [90, 0.8]], stale),
          indicatives("cash_secured_put", [[95, 1.5], [90, 0.8]], stale, "buy"),
        ] },
      { market_pda: "call-soon", expiry_ts: now + 7 * day, is_put: false,
        indicatives: [
          indicatives("covered_call", [[105, 1], [110, 0.5]], stale),
          indicatives("covered_call", [[105, 1], [110, 0.5]], stale, "buy"),
        ] },
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
    assetSnapshots: new Map(),
    getAssetSnapshots: vi.fn(),
    connectionState: "connected", isAuthenticated: false, referralStatus: "unknown",
    bestQuote: null, error: null, submitRfq: vi.fn(), cancelRfq: vi.fn(), openReferralGate: vi.fn(),
    marketDescriptors: [],
    protocolFeesBySymbol: new Map([["USDC", { type: "quote", premium_bps: 0, volume_bps: 0 }]]),
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("sentence trade", () => {
  it("opens Earn on a complete thesis with the premium in the facts and one Trade button", () => {
    render(<SentenceTrade mode="yield" />);
    expect(select("Asset").value).toBe("SOL");
    expect(select("Direction").value).toBe("above");
    expect(select("Strike").value).toBe(String(95e9));
    expect(screen.getByRole("button", { name: "Jan 22" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
    // 1.1 SOL locked at $95, $1 premium per SOL — the premium now reads in the facts block
    // beside the size, not as a risk sentence above the CTA
    expect(screen.getByText(/≈ \$1\.10/)).toBeTruthy();
    expect(screen.getByText("SOL can fall 5.0% in 7 days and you're still right")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect wallet to trade" })).toBeTruthy();
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
    expect(select("Strike").value).toBe(String(105e9));
    expect([...select("Strike").options].map((o) => o.value)).toEqual([String(105e9), String(110e9)]);
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("1");
  });

  it("switches the amount's token, converting the quantity and keeping the summary in USDC", () => {
    render(<SentenceTrade mode="yield" />);
    const token = () => select("Size token");
    // Yield on a cash-secured put defaults to USDC, 104.50 USDC = 1.1 SOL at $95
    expect(token().value).toBe("quote");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
    // switch to SOL: the same quantity, re-expressed in the underlying
    fireEvent.change(token(), { target: { value: "underlying" } });
    expect(token().value).toBe("underlying");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("1.1");
    // the put's premium is unchanged when re-expressed in the underlying
    expect(screen.getByText(/≈ \$1\.10/)).toBeTruthy();
    // switch back round-trips to the USDC amount
    fireEvent.change(token(), { target: { value: "quote" } });
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
  });

  it("exposes the USDC / asset switch under the size, in lockstep with the in-field dropdown", () => {
    render(<SentenceTrade mode="yield" />);
    // a two-option toggle: USDC and the asset's ticker, the quote side selected by default
    expect(screen.getByRole("button", { name: "USDC", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SOL", pressed: false })).toBeTruthy();
    // clicking the asset side flips both controls together — one source of truth
    fireEvent.click(screen.getByRole("button", { name: "SOL" }));
    expect(screen.getByRole("button", { name: "SOL", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "USDC", pressed: false })).toBeTruthy();
    expect(select("Size token").value).toBe("underlying");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("1.1");
    // and the in-field dropdown drives it back
    fireEvent.change(select("Size token"), { target: { value: "quote" } });
    expect(screen.getByRole("button", { name: "USDC", pressed: true })).toBeTruthy();
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
  });

  it("anchors the slider and HALF/MAX to the wallet balance for the selected token", () => {
    connectWallet();
    mocks.balance = 50; // 50 USDC in the wallet
    render(<SentenceTrade mode="yield" />);
    const slider = screen.getByRole("slider", { name: "Size slider" }) as HTMLInputElement;
    // the range spans 0 → balance (capped by the rule's max), not the rule's own bounds
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe("50");
    // MAX fills the balance snapped onto the 9.5 USDC step; HALF fills half of that
    fireEvent.click(screen.getByRole("button", { name: "MAX" }));
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("47.5");
    fireEvent.click(screen.getByRole("button", { name: "HALF" }));
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("19");
  });

  it("falls back to the nearest date when the other side does not list the chosen one", () => {
    render(<SentenceTrade mode="yield" />);
    fireEvent.click(screen.getByRole("button", { name: "Jan 29" }));
    expect(select("Strike").value).toBe(String(95e9));
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect(screen.getByRole("button", { name: "Jan 22" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the expiry as inline date buttons, the selected one pressed and selectable", () => {
    render(<SentenceTrade mode="yield" />);
    // slash is the shipped pattern: no expiry combobox, every date its own button
    expect(screen.queryByRole("combobox", { name: "Expiry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Jan 22" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Jan 29" }).getAttribute("aria-pressed")).toBe("false");
    // picking a later date updates the thesis's expiry
    fireEvent.click(screen.getByRole("button", { name: "Jan 29" }));
    expect(screen.getByRole("button", { name: "Jan 29" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not present stale premiums, in the sentence or the summary", () => {
    connectWallet();
    mocks.context.tokenMarketsInfo = { underlyingMint: SOL, data: snapshot({ stale: true }) };
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByText(/≈\$/)).toBeNull();
    expect((screen.getByRole("button", { name: "Premium unavailable" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requests a sell quote from Earn's Trade button at the floored quantity", () => {
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    fireEvent.change(screen.getByLabelText("Deposit"), { target: { value: "1000" } });
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
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("997.5");
    expect((screen.getByRole("button", { name: "Getting quote..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(select("Strike").disabled).toBe(true);
  });

  it("Profit pays the quote: the summary states the indicative premium, the CTA gets a quote", () => {
    connectWallet();
    render(<SentenceTrade mode="profit" />);
    // a buy trades the call market for above; strikes come from the same listings
    expect(select("Strike").value).toBe(String(105e9));
    // the buy's indicative premium reads in the facts block
    expect(screen.getByText(/≈ \$1\.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get quote" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "call-soon", side: "buy", terms: { type: "covered_call", strike: 105e9 }, quantity: 1_000_000_000, timeoutSeconds: 30,
    });
  });

  it("Profit shows the move from spot in the strike list, not APR", () => {
    render(<SentenceTrade mode="profit" />);
    // a call above spot lists how far the price must rise; a put below how far it must fall
    expect([...select("Strike").options].map((o) => o.textContent)).toEqual(["$105 · +5.0%", "$110 · +10.0%"]);
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect([...select("Strike").options].map((o) => o.textContent)).toEqual(["$95 · -5.0%", "$90 · -10.0%", "$80 · -20.0%"]);
  });

  it("blocks amounts over the balance or outside the size rule", () => {
    connectWallet();
    mocks.balance = 50;
    render(<SentenceTrade mode="yield" />);
    expect(screen.getByRole("button", { name: "Insufficient balance" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Deposit"), { target: { value: "5" } });
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
