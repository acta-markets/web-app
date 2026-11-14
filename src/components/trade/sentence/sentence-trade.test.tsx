import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EarnAssetSummary, TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { SentenceTrade, splitOutcome } from "./sentence-trade";

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

/** The direction is a one-click switch; its accessible name starts with the current value. */
function direction() {
  return screen.getByRole("button", { name: /^Direction: / });
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

describe("outcome line break", () => {
  it("breaks a sell outcome at one fixed point, whatever the numbers", () => {
    expect(splitOutcome("Buy 0.1 BTC at $66,500")).toEqual(["Buy 0.1 BTC", "at $66,500"]);
    expect(splitOutcome("Buy 1.0204 jitoSOL at $98")).toEqual(["Buy 1.0204 jitoSOL", "at $98"]);
    expect(splitOutcome("Sold for 6,650.00 USDC")).toEqual(["Sold for", "6,650.00 USDC"]);
    expect(splitOutcome("Keep 99.75 USDC")).toEqual(["Keep", "99.75 USDC"]);
    expect(splitOutcome("Keep 6,650.00 USDC")).toEqual(["Keep", "6,650.00 USDC"]);
    expect(splitOutcome("Keep")).toBeNull();
  });
});

describe("sentence trade", () => {
  it("opens Earn on a complete thesis with the premium in the facts and one Trade button", () => {
    render(<SentenceTrade mode="yield" />);
    expect(select("Asset").value).toBe("SOL");
    expect(direction().textContent).toContain("above");
    expect(select("Strike").value).toBe(String(95e9));
    expect(screen.getByRole("button", { name: "Jan 22" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
    // 1.1 SOL locked at $95, $1 premium per SOL — the premium now reads in the facts block
    // beside the size, not as a risk sentence above the CTA
    expect(screen.getByText(/≈ \$1\.10/)).toBeTruthy();
    // the ticket leads with the payout and does not repeat the sentence's strike or the size
    expect(screen.getByText("You earn")).toBeTruthy();
    // the outcomes sit under how far off the expiry is
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByTestId("ticket-when").textContent).toBe("In 7 days");
    expect(screen.getByTestId("trade-headline").textContent).toBe("≈ $1.10");
    expect(screen.queryByText("Strike")).toBeNull();
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.queryByText("Expiry")).toBeNull();
    expect(screen.getByTestId("trade-headline-note").textContent).toMatch(/^Return |^Confirmed on quote$/);
    expect(screen.getByTestId("ticket-right").textContent).toBe("Keep 104.50 USDC");
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
    fireEvent.click(direction());
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
    fireEvent.click(direction());
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
    // unpriced, a sell still speaks the sell outcomes and says there is no price
    expect(screen.getByTestId("trade-headline").textContent).toBe("\u2014");
    expect(screen.getByTestId("trade-headline-note").textContent).toBe("No price for this strike right now");
    expect(screen.getByTestId("ticket-right").textContent).toBe("Keep your USDC");
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("Buy SOL at $95");
  });

  it("leads Profit's summary with what the trade costs and the buy outcomes", () => {
    render(<SentenceTrade mode="profit" />);
    // the fixture lists an indicative for the buy, so the headline names it
    expect(screen.getByTestId("trade-headline").textContent).toBe("≈ $1.00");
    // the note says the quote has the last word, and names the cell for what it is
    expect(screen.getByText("You pay premium")).toBeTruthy();
    expect(screen.getByTestId("trade-headline-note").textContent).toBe("Final quote might be different");
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("Premium lost");
    expect(screen.getByText("The most you can lose is $1.00")).toBeTruthy();
    // the winning cell lists the breakeven and what the trade makes at three moves past it
    expect(screen.getByTestId("ticket-right").textContent).toBe("You profit");
    // the breakeven is the table's first line, written like the rest, then three profit points
    const rows = screen.getByTestId("ticket-profit-points").querySelectorAll("dd");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toBe("breakeven");
    expect(screen.getByTestId("ticket-profit-points").textContent).toMatch(/^\+\d+\.\d%at \$/);
  });

  it("opens the longer profit ladder from More prices without touching the cell's own table", () => {
    render(<SentenceTrade mode="profit" />);
    const more = screen.getByRole("button", { name: "More prices" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("ticket-more-prices").className).toContain("hidden");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("ticket-more-prices").className).not.toContain("hidden");
    // the same ladder, further out: breakeven first, then more steps than the cell shows
    const ladder = screen.getByTestId("ticket-profit-ladder").querySelectorAll("dd");
    expect(ladder[0].textContent).toBe("breakeven");
    expect(ladder.length).toBeGreaterThan(4);
    expect(screen.getByTestId("ticket-profit-points").querySelectorAll("dd")).toHaveLength(4);
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("prices Profit from the bare indicative when the fee config is not known yet", () => {
    mocks.context.protocolFeesBySymbol = new Map();
    render(<SentenceTrade mode="profit" />);
    // no SDK preview without fees: the cell falls back to size x indicative instead of a dash
    expect(screen.getByTestId("trade-headline").textContent).toMatch(/^\u2248 \$\d/);
    expect(screen.getByTestId("trade-headline-note").textContent).toBe("Final quote might be different");
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
    // the buy's premium reads in the strip (the strike list carries each strike's cost too)
    expect(screen.getByTestId("trade-headline").textContent).toBe("≈ $1.00");
    fireEvent.click(screen.getByRole("button", { name: "Get quote" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "call-soon", side: "buy", terms: { type: "covered_call", strike: 105e9 }, quantity: 1_000_000_000, timeoutSeconds: 30,
    });
  });

  it("Profit lists each strike with its move from spot and what it costs, not APR", () => {
    render(<SentenceTrade mode="profit" />);
    const rows = () => [...select("Strike").options].map((o) => o.textContent ?? "");
    const moves = () => rows().map((r) => r.split(" · ").slice(0, 2).join(" · "));
    // a call above spot lists how far the price must rise; a put below how far it must fall
    expect(moves()).toEqual(["$105 · +5.0%", "$110 · +10.0%"]);
    // and each row ends with that strike's premium at the current size, or says it has no price
    expect(rows()[0]).toBe("$105 · +5.0% · ≈ $1.00");
    expect(rows().every((r) => /· (≈ \$[\d,.]+|no price)$/.test(r))).toBe(true);
    expect(rows().some((r) => r.includes("APR"))).toBe(false);
    fireEvent.click(direction());
    expect(moves()).toEqual(["$95 · -5.0%", "$90 · -10.0%", "$80 · -20.0%"]);
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
