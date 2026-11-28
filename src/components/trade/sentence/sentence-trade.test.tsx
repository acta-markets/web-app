import { act, cleanup, fireEvent, render as renderClosed, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EarnAssetSummary, TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { publicKey } from "@/lib/state/keys";
import { tradeDraftStore, updateTradeDraft } from "@/lib/trade/draft";
import { getQueryClient } from "@/lib/state/query-client";
import { remember } from "@/lib/state/remembered";
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

/** The sentence's two lines: the belief, then the trade made on it. The quiet line now
    sits below the chart, so it is found by its own id rather than as the sentence's sibling. */
function lines() {
  const first = screen.getByRole("button", { name: /^Direction/ }).closest("div")!.querySelector("p")!;
  const second = screen.getByTestId("thesis-move");
  return [first, second] as const;
}

/**
 * The second line as it reads. A pill keeps every value it could show (hidden, to hold its
 * width), so the line's text is taken with those left out.
 */
function secondLine() {
  const copy = lines()[1].cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[aria-hidden=true], select, .invisible").forEach((el) => el.remove());
  return copy.textContent!.replace(/\s+/g, " ").trim();
}

/** The expiry pill's menu: the same control as the asset's and the strike's. */
function expiryMenu() {
  return screen.getByRole("combobox", { name: "Expiry" }) as HTMLSelectElement;
}

/** The date the expiry pill is set to. In the menu a date is followed by how far off it is ("Jan 22 · in 7 days"). */
function expiryDate() {
  return expiryMenu().selectedOptions[0]?.textContent?.split(" · ")[0] ?? null;
}

/** Choose a date in the expiry menu. */
function pickExpiry(date: string) {
  const option = [...expiryMenu().options].find((o) => o.textContent?.split(" · ")[0] === date);
  if (!option) throw new Error(`no expiry ${date}`);
  fireEvent.change(expiryMenu(), { target: { value: option.value } });
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

/** The ticket starts closed; most tests read it, so they render the page and open it. */
function render(ui: Parameters<typeof renderClosed>[0]) {
  const view = renderClosed(ui);
  const opener = screen.queryByTestId("open-ticket");
  if (opener) fireEvent.click(opener);
  return view;
}

describe("the mode switch in the line under the sentence", () => {
  it("is the line's verb, and one click asks for the other mode", () => {
    const onMode = vi.fn();
    const view = renderClosed(<SentenceTrade mode="profit" onMode={onMode} />);
    const buying = screen.getByRole("button", { name: "You are buying. Switch to selling" });
    // the word sits inside the sentence it belongs to
    expect(buying.closest("p")!.textContent).toMatch(/^You're buying a .*(call|put)/);
    fireEvent.click(buying);
    expect(onMode).toHaveBeenCalledWith("yield");
    view.unmount();

    renderClosed(<SentenceTrade mode="yield" onMode={onMode} />);
    fireEvent.click(screen.getByRole("button", { name: "You are selling. Switch to buying" }));
    expect(onMode).toHaveBeenLastCalledWith("profit");
  });

  it("tells a buyer the price is all there is to lose, the same price the ticket shows", () => {
    connectWallet();
    render(<SentenceTrade mode="profit" />);
    const [, price] = secondLine().match(/risking (\$[\d,.]+)$/)!;
    expect(screen.getByTestId("trade-headline").textContent!.replace(/\s/g, "")).toBe(price);
  });

  it("is plain text where nothing can switch the mode", () => {
    renderClosed(<SentenceTrade mode="profit" />);
    expect(screen.queryByRole("button", { name: /Switch to selling/ })).toBeNull();
    expect(secondLine()).toMatch(/^You're buying a .*(call|put)/);
  });
});

describe("a buyer's goal", () => {
  it("is the first line's price in Profit, with the strike named in the second line", () => {
    connectWallet();
    render(<SentenceTrade mode="profit" />);
    const [first, second] = lines();
    // the belief is about the goal; the strike is part of the option's name
    expect(first.contains(select("Goal"))).toBe(true);
    expect(second.contains(select("Strike"))).toBe(true);
    // a goal is a price past the strike, never the strike itself
    const strike = Number(select("Strike").value) / 1e9;
    expect(Number(select("Goal").value)).toBeGreaterThan(strike);
  });

  it("sets what the trade makes: the second line's profit is the chosen goal's", () => {
    connectWallet();
    render(<SentenceTrade mode="profit" />);
    const profit = () => secondLine().match(/to make (\$[\d,.]+) or more/)?.[1];
    // every goal on offer says what the trade makes there
    const options = [...select("Goal").options];
    expect(options.length).toBeGreaterThan(1);
    const chosen = options.find((o) => o.value === select("Goal").value)!;
    expect(chosen.textContent).toContain(profit()!);
    // a further goal makes more
    const further = options.at(-1)!;
    fireEvent.change(select("Goal"), { target: { value: further.value } });
    expect(select("Goal").value).toBe(further.value);
    expect(further.textContent).toContain(profit()!);
    expect(profit()).not.toBe(chosen.textContent!.match(/\+\$[\d,.]+/)![0]);
  });

  it("is not there in Yield: the first line's price is the strike", () => {
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByLabelText("Goal")).toBeNull();
    expect(lines()[0].contains(select("Strike"))).toBe(true);
  });
});

describe("the ticket under the chart", () => {
  const ticket = () => document.getElementById("trade-ticket") as HTMLElement;

  it("starts closed: one button naming the next step, and the trade action is not there", () => {
    connectWallet();
    renderClosed(<SentenceTrade mode="profit" />);
    expect(ticket().hidden).toBe(true);
    expect(screen.getByTestId("open-ticket").textContent).toBe("Set size");
    expect(screen.queryByRole("button", { name: "Take trade" })).toBeNull();
    expect(mocks.context.submitRfq).not.toHaveBeenCalled();
  });

  it("names the deposit in Yield, priced or not: words only, never a number", () => {
    renderClosed(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("open-ticket").textContent).toBe("Set deposit");
    cleanup();
    mocks.context = { ...mocks.context, tokenMarketsInfo: { underlyingMint: SOL, data: snapshot({ stale: true }) } };
    renderClosed(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("open-ticket").textContent).toBe("Set deposit");
  });

  it("puts the cursor in the size field on opening, and back on the button on closing", async () => {
    renderClosed(<SentenceTrade mode="profit" />);
    fireEvent.click(screen.getByTestId("open-ticket"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Amount")));
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("open-ticket")));
  });

  it("opens to the ticket and the trade action, and is closed again on the next visit", () => {
    connectWallet();
    const first = renderClosed(<SentenceTrade mode="profit" />);
    fireEvent.click(screen.getByTestId("open-ticket"));
    expect(ticket().hidden).toBe(false);
    expect(screen.queryByTestId("open-ticket")).toBeNull();
    // opening never trades: the action is a new button that has not been pressed
    expect(screen.getByRole("button", { name: "Take trade" })).toBeTruthy();
    expect(mocks.context.submitRfq).not.toHaveBeenCalled();
    first.unmount();
    renderClosed(<SentenceTrade mode="profit" />);
    expect(ticket().hidden).toBe(true);
    expect(screen.getByTestId("open-ticket")).toBeTruthy();
  });

  it("folds away again from the small chevrons at its corner", () => {
    render(<SentenceTrade mode="profit" />);
    expect(ticket().hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(ticket().hidden).toBe(true);
    expect(screen.getByTestId("open-ticket")).toBeTruthy();
  });

  it("keeps the size that was typed while it is closed", () => {
    render(<SentenceTrade mode="profit" />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByTestId("open-ticket"));
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("2");
  });
});

describe("sentence trade", () => {
  it("opens Earn on a complete thesis with the premium in the facts and one Trade button", () => {
    render(<SentenceTrade mode="yield" />);
    expect(select("Asset").value).toBe("SOL");
    expect(direction().textContent).toContain("above");
    expect(select("Strike").value).toBe(String(95e9));
    expect(expiryDate()).toBe("Jan 22");
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("104.5");
    // 1.1 SOL locked at $95, $1 premium per SOL — the premium now reads in the facts block
    // beside the size, not as a risk sentence above the CTA
    expect(screen.getAllByText(/\$1\.10/).length).toBeGreaterThan(0);
    // the ticket leads with the payout and does not repeat the sentence's strike or the size
    expect(screen.getByText("You earn premium")).toBeTruthy();
    // the outcomes sit under how far off the expiry is
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByTestId("ticket-when").textContent).toBe("In 7 days");
    expect(screen.getByTestId("trade-headline").textContent).toBe("$1.10");
    expect(screen.queryByText("Strike")).toBeNull();
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.queryByText("Expiry")).toBeNull();
    expect(screen.getByTestId("trade-headline-note").textContent).toMatch(/^APY [\d,.]+%$|^Confirmed on quote$/);
    expect(screen.getByTestId("ticket-right").textContent).toBe("Keep 104.50 USDC");
    // the sentence's second line: the option, what it earns, and what being wrong does
    expect(screen.getByText(/^You're selling a put to earn \$1\.10, and buy SOL at \$95 if wrong$/)).toBeTruthy();
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
    expect(screen.getAllByText(/\$1\.10/).length).toBeGreaterThan(0);
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

  it("snaps a typed amount onto its size step when the field is left", () => {
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    const field = screen.getByLabelText("Deposit") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1000" } });
    // while typing, the field keeps what was typed and the note says what it locks
    expect(field.value).toBe("1000");
    expect(screen.getByTestId("size-note").textContent).toBe("Locks 997.5 USDC");
    fireEvent.blur(field);
    // 1000 USDC at $95 with a 0.1 SOL step is 997.5 USDC: the field now says so, and the note goes back to the conversion
    expect(field.value).toBe("997.5");
    expect(screen.getByTestId("size-note").textContent).not.toContain("Locks");
    // an amount already on the step is left as it is
    fireEvent.blur(field);
    expect(field.value).toBe("997.5");
  });

  it("keeps the ticket open when the side is switched: what was unfolded stays unfolded", () => {
    const { rerender } = renderClosed(<SentenceTrade mode="profit" />);
    const ticket = () => document.getElementById("trade-ticket")!;
    // closed until its button is pressed
    expect(ticket().hidden).toBe(true);
    fireEvent.click(screen.getByTestId("open-ticket"));
    expect(ticket().hidden).toBe(false);
    // buying to selling and back: the same page, the ticket as it was left
    rerender(<SentenceTrade mode="yield" />);
    expect(ticket().hidden).toBe(false);
    rerender(<SentenceTrade mode="profit" />);
    expect(ticket().hidden).toBe(false);
  });

  it("keeps the size cell short: HALF and MAX beside the label, the slider right under the input, the balance on the note's line", () => {
    connectWallet();
    mocks.balance = 50; // 50 USDC in the wallet: enough for the slider and the two buttons
    render(<SentenceTrade mode="yield" />);
    const input = screen.getByLabelText("Deposit");
    const slider = screen.getByRole("slider", { name: "Size slider" });
    const note = screen.getByTestId("size-note");
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // the two buttons share the label's row, before the input
    const labelRow = screen.getByRole("button", { name: "HALF" }).parentElement!.parentElement!;
    expect(labelRow.textContent).toBe("You depositHALFMAX");
    expect(labelRow.contains(screen.getByRole("button", { name: "MAX" }))).toBe(true);
    expect(follows(labelRow, input)).toBe(true);
    // input, then the slider, then the note
    expect(follows(input, slider)).toBe(true);
    expect(follows(slider, note)).toBe(true);
    // the wallet's balance stands in the note's own line, after it
    const balance = screen.getByTestId("size-balance");
    expect(balance.parentElement).toBe(note.parentElement);
    expect(follows(note, balance)).toBe(true);
  });

  it("falls back to the nearest date when the other side does not list the chosen one", () => {
    render(<SentenceTrade mode="yield" />);
    pickExpiry("Jan 29");
    expect(select("Strike").value).toBe(String(95e9));
    fireEvent.click(direction());
    expect(expiryDate()).toBe("Jan 22");
  });

  it("opens on the middle date, with a date on each side of it in the menu", () => {
    const data = snapshot();
    const late = data.markets[1];
    (data.markets as unknown[]).push(
      { ...late, market_pda: "put-later", expiry_ts: now + 21 * day },
      { ...late, market_pda: "put-latest", expiry_ts: now + 28 * day },
    );
    mocks.context.tokenMarketsInfo = { underlyingMint: SOL, data };
    render(<SentenceTrade mode="yield" />);
    expect([...expiryMenu().options].map((o) => o.selected)).toEqual([false, true, false, false]);
  });

  it("shows the expiry as a pill with a menu of every date, like the asset's and the strike's, not a wheel", () => {
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByRole("listbox", { name: "Expiry" })).toBeNull();
    // every date on offer, each with how far off it is
    expect([...expiryMenu().options].map((o) => o.textContent)).toEqual(["Jan 22 · in 7 days", "Jan 29 · in 14 days"]);
    expect(expiryDate()).toBe("Jan 22");
    // choosing a date takes it
    pickExpiry("Jan 29");
    expect(expiryDate()).toBe("Jan 29");
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
    // the heading over it names the price, so the line is just what happens
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("Buy SOL");
  });

  it("keeps the belief on one line from md up by stepping its type down, and leaves a phone alone", () => {
    const width = (name: "clientWidth" | "scrollWidth", value: number) =>
      vi.spyOn(HTMLParagraphElement.prototype, name, "get").mockReturnValue(value);
    const box = width("clientWidth", 600);
    const words = width("scrollWidth", 800);
    const media = (wide: boolean) =>
      vi.stubGlobal("matchMedia", () => ({ matches: wide, addEventListener: () => {}, removeEventListener: () => {} }));
    const belief = () => screen.getByRole("button", { name: /^Direction/ }).closest("p")!;
    try {
      // words a third wider than the card: the type shrinks by exactly that, never a second line
      media(true);
      render(<SentenceTrade mode="profit" />);
      expect(belief().style.getPropertyValue("--fit")).toBe("0.75");
      cleanup();
      // words that fit are left at full size
      words.mockReturnValue(590);
      render(<SentenceTrade mode="profit" />);
      expect(belief().style.getPropertyValue("--fit")).toBe("");
      cleanup();
      // on a phone the sentence wraps by design
      words.mockReturnValue(800);
      media(false);
      render(<SentenceTrade mode="profit" />);
      expect(belief().style.getPropertyValue("--fit")).toBe("");
    } finally {
      box.mockRestore();
      words.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("says both outcomes in plain words while the market is still loading, never a dash", () => {
    mocks.context.tokenMarketsInfo = null;
    render(<SentenceTrade mode="profit" />);
    expect(screen.getByTestId("ticket-right").textContent).toBe("You profit");
    expect(screen.getByText("Grows with the price once the premium is covered")).toBeTruthy();
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("You lose premium");
    expect(screen.getByText("A fixed fee, the most you can lose")).toBeTruthy();
    cleanup();

    render(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("ticket-right").textContent).toBe("Keep your USDC");
    expect(screen.getByText("and the premium")).toBeTruthy();
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("Buy SOL");
    expect(screen.getByText("You keep the premium")).toBeTruthy();
  });

  it("leads Profit's summary with what the trade costs and the buy outcomes", () => {
    render(<SentenceTrade mode="profit" />);
    // the fixture lists an indicative for the buy, so the headline names it
    expect(screen.getByTestId("trade-headline").textContent).toBe("$1.00");
    // the note says the quote has the last word, and names the cell for what it is
    expect(screen.getByText("You pay premium")).toBeTruthy();
    expect(screen.getByTestId("trade-headline-note").textContent).toBe("Final quote might be different");
    expect(screen.getByTestId("ticket-wrong").textContent).toBe("You lose premium");
    expect(screen.getByText("The most you can lose is $1.00")).toBeTruthy();
    // the winning cell holds no table of its own: one link, "Breakdown", stands under "You profit"
    expect(screen.getByTestId("ticket-right").textContent).toBe("You profit");
    expect(screen.queryByTestId("ticket-profit-points")).toBeNull();
    expect(screen.getByRole("button", { name: "Breakdown" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More prices" })).toBeNull();
  });

  it("opens the profit ladder from Breakdown: the breakeven first, then what the trade makes further out", () => {
    render(<SentenceTrade mode="profit" />);
    const more = screen.getByRole("button", { name: "Breakdown" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("ticket-breakdown").className).toContain("hidden");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("ticket-breakdown").className).not.toContain("hidden");
    // the whole ladder is in the panel: breakeven first, written like the rest, then every step
    const ladder = screen.getByTestId("ticket-profit-ladder").querySelectorAll("dd");
    expect(ladder[0].textContent).toBe("breakeven");
    expect(ladder.length).toBeGreaterThan(4);
    expect(screen.getByTestId("ticket-profit-ladder").textContent).toMatch(/^\+\d+\.\d%at \$/);
    // the page's own goal is one of its lines: no words of its own, told apart by a quiet green
    const goalRows = screen.getByTestId("ticket-profit-ladder").querySelectorAll('[data-goal="true"]');
    expect(goalRows).toHaveLength(1);
    expect(goalRows[0].textContent).not.toContain("goal");
    expect(goalRows[0].className).toBe("contents text-accent-secondary");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("prices Profit from the bare indicative when the fee config is not known yet", () => {
    mocks.context.protocolFeesBySymbol = new Map();
    render(<SentenceTrade mode="profit" />);
    // no SDK preview without fees: the cell falls back to size x indicative instead of a dash
    expect(screen.getByTestId("trade-headline").textContent).toMatch(/^\$\d/);
    expect(screen.getByTestId("trade-headline-note").textContent).toBe("Final quote might be different");
  });

  it("requests a sell quote from Earn's Trade button at the floored quantity", () => {
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    fireEvent.change(screen.getByLabelText("Deposit"), { target: { value: "1000" } });
    // 1000 USDC at $95 is 10.526 SOL; the 0.1 SOL step floors it to 10.5 SOL, 997.50 USDC
    // the note says what is locked on one line; why is its tooltip
    expect(screen.getByTestId("size-note").textContent).toBe("Locks 997.5 USDC");
    expect(screen.getByTestId("size-note").getAttribute("title")).toBe("Sizes go in steps of 9.5 USDC");
    fireEvent.click(screen.getByRole("button", { name: "Take trade" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "put-soon", side: "sell", terms: { type: "cash_secured_put", strike: "95000000000" }, quantity: 10_500_000_000, timeoutSeconds: 30,
    });
    const preview = (mocks.modal.mock.lastCall?.[0] as { preview: Record<string, unknown> }).preview;
    expect(preview).toMatchObject({
      asset: "SOL", terms: { type: "cash_secured_put", strike: "95000000000" }, quantity: 10_500_000_000, underlyingDecimals: 9,
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
    expect(screen.getByTestId("trade-headline").textContent).toBe("$1.00");
    fireEvent.click(screen.getByRole("button", { name: "Take trade" }));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({
      market: "call-soon", side: "buy", terms: { type: "covered_call", strike: "105000000000" }, quantity: 1_000_000_000, timeoutSeconds: 30,
    });
  });

  it("Profit lists each strike with its move from spot and what it costs, not APR", () => {
    render(<SentenceTrade mode="profit" />);
    const rows = () => [...select("Strike").options].map((o) => o.textContent ?? "");
    const moves = () => rows().map((r) => r.split(" · ").slice(0, 2).join(" · "));
    // a call above spot lists how far the price must rise; a put below how far it must fall
    expect(moves()).toEqual(["$105 · +5.0%", "$110 · +10.0%"]);
    // and each row ends with that strike's premium at the current size, or says it has no price
    expect(rows()[0]).toBe("$105 · +5.0% · $1.00");
    expect(rows().every((r) => /· (\$[\d,.]+|no price)$/.test(r))).toBe(true);
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
    fireEvent.click(screen.getByRole("button", { name: "Take trade" }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe("No quote came back in 30 seconds. Try again.");
  });
});


describe("coming back to Trade before the socket has answered", () => {
  const notLoadedYet = () => {
    mocks.context = { ...mocks.context, earnSummary: null, tokenMarketsInfo: null };
  };

  it("draws the page from the asset list last loaded on this device", () => {
    remember(publicKey("earn-summary"), summary());
    notLoadedYet();
    renderClosed(<SentenceTrade mode="yield" />);
    expect(screen.queryByTestId("trade-skeleton")).toBeNull();
    expect(screen.getByTestId("open-ticket")).toBeTruthy();
  });

  it("cannot ask for a quote from it: prices are still loading until this session's own snapshot arrives", () => {
    remember(publicKey("earn-summary"), summary());
    notLoadedYet();
    connectWallet();
    mocks.context = { ...mocks.context, earnSummary: null, tokenMarketsInfo: null };
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByRole("button", { name: "Take trade" })).toBeNull();
    const button = screen.getByRole("button", { name: "Loading prices..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect((mocks.context.submitRfq as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("draws strikes and the premium from the market data last loaded, and still cannot quote from it", () => {
    remember(publicKey("earn-summary"), summary());
    remember(publicKey("markets", SOL), snapshot());
    notLoadedYet();
    connectWallet();
    mocks.context = { ...mocks.context, earnSummary: null, tokenMarketsInfo: null };
    render(<SentenceTrade mode="yield" />);
    expect(select("Strike").value).toBe(String(95e9));
    expect(screen.getByTestId("trade-headline").textContent).toBe("$1.10");
    expect(screen.queryByRole("button", { name: "Take trade" })).toBeNull();
    const button = screen.getByRole("button", { name: "Updating prices..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect((mocks.context.submitRfq as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("uses the saved fee schedule for that premium while the live one is on its way", () => {
    remember(publicKey("earn-summary"), summary());
    remember(publicKey("markets", SOL), snapshot());
    remember(publicKey("protocol-fees"), [["USDC", { type: "quote", premium_bps: 0, volume_bps: 0 }]]);
    notLoadedYet();
    mocks.context = { ...mocks.context, protocolFeesBySymbol: new Map() };
    render(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("trade-headline").textContent).toBe("$1.10");
  });

  it("shows no premium from market data saved more than ten minutes ago", () => {
    remember(publicKey("earn-summary"), summary());
    getQueryClient().setQueryData(publicKey("markets", SOL), snapshot(), { updatedAt: now * 1000 - 11 * 60 * 1000 });
    vi.spyOn(Date, "now").mockReturnValue(now * 1000 + 11 * 60 * 1000);
    notLoadedYet();
    render(<SentenceTrade mode="yield" />);
    // the dates and strikes are still there to look at; the paid-now figure is not
    expect(select("Strike").value).toBe(String(95e9));
    expect(screen.getByTestId("trade-headline").textContent).not.toMatch(/\$\d/);
  });

  it("draws nothing from market data saved more than a day ago", () => {
    remember(publicKey("earn-summary"), summary());
    getQueryClient().setQueryData(publicKey("markets", SOL), snapshot(), { updatedAt: now * 1000 - 25 * 60 * 60 * 1000 });
    notLoadedYet();
    connectWallet();
    mocks.context = { ...mocks.context, earnSummary: null, tokenMarketsInfo: null };
    render(<SentenceTrade mode="yield" />);
    expect(screen.getByRole("button", { name: "Loading prices..." })).toBeTruthy();
    expect(screen.queryByTestId("trade-headline")?.textContent ?? "").not.toMatch(/\$\d/);
  });

  it("takes this session's own snapshot over the saved one as soon as it arrives", () => {
    const saved = snapshot();
    (saved as unknown as { reference_price: number }).reference_price = 50e9;
    remember(publicKey("markets", SOL), saved);
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    expect(screen.getByRole("button", { name: "Take trade" })).toBeTruthy();
  });

  it("asks for the other assets' prices only once the socket is open, and again when it opens", () => {
    remember(publicKey("earn-summary"), summary());
    notLoadedYet();
    mocks.context = { ...mocks.context, connectionState: "connecting" };
    const view = render(<SentenceTrade mode="yield" />);
    expect(mocks.context.getAssetSnapshots).not.toHaveBeenCalled();
    mocks.context = { ...mocks.context, connectionState: "connected" };
    view.rerender(<SentenceTrade mode="yield" />);
    expect(mocks.context.getAssetSnapshots).toHaveBeenCalledTimes(1);
    // signing in afterwards is the same open socket: no second round of requests
    mocks.context = { ...mocks.context, connectionState: "authenticating" };
    view.rerender(<SentenceTrade mode="yield" />);
    mocks.context = { ...mocks.context, connectionState: "authenticated" };
    view.rerender(<SentenceTrade mode="yield" />);
    expect(mocks.context.getAssetSnapshots).toHaveBeenCalledTimes(1);
  });

  it("lists the other assets with the prices last read, until live ones arrive", () => {
    remember(publicKey("earn-summary"), summary());
    remember(publicKey("reference-prices"), { [JLP]: { price: 4.25, at: now * 1000 - 60_000 } });
    notLoadedYet();
    render(<SentenceTrade mode="yield" />);
    expect([...select("Asset").options].find((o) => o.value === "JLP")?.textContent).toContain("$4.25");
  });

  it("does not list a price read more than a day ago", () => {
    remember(publicKey("earn-summary"), summary());
    remember(publicKey("reference-prices"), { [JLP]: { price: 4.25, at: now * 1000 - 25 * 60 * 60 * 1000 } });
    notLoadedYet();
    render(<SentenceTrade mode="yield" />);
    expect([...select("Asset").options].find((o) => o.value === "JLP")?.textContent).not.toContain("$4.25");
  });

  it("waits for the live list when the saved one is more than a day old", () => {
    getQueryClient().setQueryData(publicKey("earn-summary"), summary(), { updatedAt: now * 1000 - 25 * 60 * 60 * 1000 });
    notLoadedYet();
    renderClosed(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("trade-skeleton")).toBeTruthy();
  });

  it("waits for the live list when nothing was saved", () => {
    notLoadedYet();
    renderClosed(<SentenceTrade mode="yield" />);
    expect(screen.getByTestId("trade-skeleton")).toBeTruthy();
  });

  it("uses the live list as soon as there is one, whatever was saved", () => {
    remember(publicKey("earn-summary"), []);
    connectWallet();
    render(<SentenceTrade mode="yield" />);
    expect(screen.queryByTestId("trade-skeleton")).toBeNull();
    expect(screen.getByRole("button", { name: "Take trade" })).toBeTruthy();
  });
});


describe("the setup a visitor left", () => {
  it("comes back after leaving the page: the direction and the typed size", () => {
    const first = render(<SentenceTrade mode="profit" />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "42" } });
    first.unmount();
    render(<SentenceTrade mode="profit" />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("42");
  });

  it("names the view in the address without asking for the page again", () => {
    window.history.replaceState(null, "", "/trade");
    renderClosed(<SentenceTrade mode="yield" />);
    expect(window.location.pathname).toBe("/trade");
    expect(new URLSearchParams(window.location.search).get("asset")).toBe("SOL");
    expect(new URLSearchParams(window.location.search).get("dir")).toBe("above");
  });

  it("leaves another page's address alone", () => {
    window.history.replaceState(null, "", "/dev/quote-flow");
    renderClosed(<SentenceTrade mode="yield" />);
    expect(window.location.search).toBe("");
    window.history.replaceState(null, "", "/");
  });

  it("starts from what the address names, not from what was remembered", () => {
    updateTradeDraft(tradeDraftStore(), { asset: "SOL", direction: "above", amount: "42", inQuote: true });
    render(<SentenceTrade mode="profit" initialAsset="JLP" initialDirection="below" />);
    // another asset than the remembered one: its size is not carried over
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).not.toBe("42");
    expect(tradeDraftStore().read()).toMatchObject({ asset: "JLP", direction: "below" });
  });

  it("does not bring back a size left more than a day ago", () => {
    updateTradeDraft(tradeDraftStore(), { asset: "SOL", amount: "42", inQuote: true }, now * 1000 - 25 * 60 * 60 * 1000);
    render(<SentenceTrade mode="profit" />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).not.toBe("42");
  });

  it("remembers the mode for a visit that does not say one", () => {
    renderClosed(<SentenceTrade mode="yield" />);
    expect(tradeDraftStore().read().mode).toBe("yield");
  });
});
