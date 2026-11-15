import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsdSmart } from "@/lib/markets";
import type { PositionInfo } from "@/lib/rfq-client";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { PortfolioClient } from "./portfolio-client";

const mocks = vi.hoisted(() => ({ markets: [] as unknown[], buildDeposit: vi.fn(), sendTx: vi.fn(), sendAll: vi.fn(), client: {}, getClient: vi.fn(), page: vi.fn(), summary: vi.fn(), wallet: "wallet-a", live: [] as PositionInfo[], fetchPositions: vi.fn(), authenticated: true }));
vi.mock("@/lib/portfolio-api", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/portfolio-api")>(), fetchWalletPositions: mocks.page, fetchWalletPositionSummary: mocks.summary }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ isConnected: true, selectedAccount: { address: mocks.wallet } }) }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => ({ positions: mocks.live, markets: mocks.markets, marketDescriptors: [], isAuthenticated: mocks.authenticated, fetchPositions: mocks.fetchPositions, positionsFailed: false, getClient: mocks.getClient }) }));
vi.mock("./portfolio-earnings-chart", () => ({ PortfolioEarningsChart: ({ points }: { points: unknown[] }) => <div data-testid="income-chart">{JSON.stringify(points)}</div> }));

vi.mock("@/lib/trade/buy-deposit", () => ({ buildBuyDepositInstructions: mocks.buildDeposit }));
vi.mock("@/lib/vaults/transaction", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/vaults/transaction")>(), sendWalletTransaction: mocks.sendTx, sendWalletTransactions: mocks.sendAll }));

function position(pda: string, created_at: number, spread = false): PositionInfo {
  return { pda, market_pda: "market", underlying_mint: TOKENS.SOL.mint[getNetwork()], quote_mint: TOKENS.USDC.mint[getNetwork()], underlying_decimals: 9, quote_decimals: 6,
    terms: spread ? { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" } : { type: "covered_call", strike: "150000000000" },
    state: "settled", created_at, expiry_ts: created_at + 86400, quantity: "1000000000", price: "1000000000", total_premium: "2000000",
    settlement: spread ? { type: "cash", settlement_price: "110000000000", holder_payoff: "10000000", writer_return: "10000000" } : { type: "physical", is_otm: true },
  } as PositionInfo;
}
const summary = [{ quote_mint: TOKENS.USDC.mint[getNetwork()], quote_decimals: 6, premium_all_time: "123000000", premium_30d: "23000000", open_positions: 7, daily: [{ day: "2026-11-01", premium: "23000000" }] }];

beforeEach(() => {
  vi.clearAllMocks(); mocks.getClient.mockReturnValue(mocks.client); mocks.page.mockReset(); mocks.summary.mockReset(); mocks.wallet = "wallet-a"; mocks.live = []; mocks.markets = []; mocks.authenticated = true;
  mocks.summary.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("Portfolio WS history", () => {
  it("appends history and settled spreads using the returned cursor while the chart uses the summary", async () => {
    mocks.page.mockResolvedValueOnce({ positions: [position("new", 1_800_000_000)], next_cursor: "opaque-page-2" })
      .mockResolvedValueOnce({ positions: [position("old", 1_700_000_000, true)], next_cursor: null });
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    expect(screen.getByTestId("income-chart").textContent).toContain('"v":123');
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/ call$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect((await screen.findByText("Put spread")).textContent).toBe("Put spread 100/120");
    expect(screen.getByText(/ call$/)).toBeTruthy();
    expect(mocks.page).toHaveBeenLastCalledWith(mocks.client, { settled: true, limit: 50, cursor: "opaque-page-2" }, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it.each(["page", "summary"] as const)("shows an alert and no zero figures on initial %s failure", async (kind) => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks[kind].mockRejectedValue(new Error("unavailable"));
    render(<PortfolioClient />);
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load your positions");
    expect(document.body.textContent).not.toContain("$0");
    expect(screen.queryByTestId("income-chart")).toBeNull();
  });

  it("retains the cursor and existing rows for retry after a failed next page", async () => {
    mocks.page.mockResolvedValueOnce({ positions: [position("new", 1_800_000_000)], next_cursor: "retry" })
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ positions: [], next_cursor: null });
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/ call$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.page.mock.calls[2][1].cursor).toBe("retry");
  });

  it("finishes Show more without losing pages when live open positions update", async () => {
    let resolvePage!: (value: unknown) => void;
    mocks.page.mockResolvedValueOnce({ positions: [position("new", 1_800_000_000)], next_cursor: "next" })
      .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const view = render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    const pageSignal = mocks.page.mock.calls[1][2] as AbortSignal;
    mocks.live = [{ ...position("live", 1_800_100_000), state: "open" } as PositionInfo];
    view.rerender(<PortfolioClient />);
    expect(pageSignal.aborted).toBe(false);
    await act(async () => resolvePage({ positions: [position("old", 1_700_000_000, true)], next_cursor: null }));
    expect(screen.getByText(/ call$/)).toBeTruthy();
    expect(screen.getByText("Put spread")).toBeTruthy();
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });

  it("withholds an unsafe income chart and never renders zero figures", async () => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.summary.mockResolvedValue([{ ...summary[0], premium_all_time: "9007199254740993" }]);
    render(<PortfolioClient />);
    await screen.findByText("Income unavailable");
    expect(screen.queryByTestId("income-chart")).toBeNull();
    expect(document.body.textContent).not.toContain("$0");
  });

  it("does not restore the previous wallet's history when its page arrives late", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.page.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ positions: [], next_cursor: null });
    const view = render(<PortfolioClient />);
    mocks.wallet = "wallet-b";
    view.rerender(<PortfolioClient />);
    await screen.findByTestId("income-chart");
    await act(async () => resolveOld({ positions: [position("stale", 1_800_000_000)], next_cursor: "stale" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("No closed positions yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});

describe("Bought options", () => {
  // The first deposit loads the transaction code on demand, which can take over a second on a busy machine.
  const SLOW = { timeout: 5000 };
  const nowSec = () => Math.floor(Date.now() / 1000);
  const usd = formatUsdSmart;
  const bought = (over: Record<string, unknown>) => ({
    ...position("bought", nowSec() - 100), side: "buy", state: "open", market_pda: "m1", expiry_ts: nowSec() + 3600,
    terms: { type: "covered_call", strike: "150000000000" }, quantity: "2000000000", price: "5000000000", total_premium: "9000000", settlement: undefined, ...over,
  }) as unknown as PositionInfo;
  async function show(live: PositionInfo[]) {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.live = live;
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
  }

  it("shows the premium paid and asks for the exercise deposit before expiry", async () => {
    await show([bought({})]);
    expect(screen.getAllByText(usd(10)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Fund/ })).toBeTruthy();
    expect(screen.getByText("1 open")).toBeTruthy();
    expect(screen.getByText(`Nothing sold · ${usd(10)} paid`)).toBeTruthy();
  });

  it("offers the deposit action for a bought put too", async () => {
    await show([bought({ terms: { type: "cash_secured_put", strike: "150000000000" } })]);
    expect(screen.getByRole("button", { name: /^Fund/ })).toBeTruthy();
    expect(screen.getByText("Put")).toBeTruthy();
  });

  it("leaves bought options out of the APR on sold positions", async () => {
    await show([bought({})]);
    expect(screen.getByText("No open sold positions")).toBeTruthy();
  });

  it("deposits from the wallet, shows it funded at once and refreshes", async () => {
    mocks.buildDeposit.mockResolvedValue(["ix"]);
    mocks.sendTx.mockResolvedValue("sig");
    await show([bought({})]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Fund/ }));
    await screen.findByText("Funded", {}, SLOW);
    expect(mocks.buildDeposit).toHaveBeenCalledWith(undefined, "wallet-a", expect.objectContaining({ pda: "bought", market: "m1" }));
    expect(mocks.sendTx).toHaveBeenCalledWith(expect.objectContaining({ feePayer: "wallet-a", instructions: ["ix"] }));
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
  });

  it("reports a failed deposit and keeps the button", async () => {
    mocks.buildDeposit.mockResolvedValue(["ix"]);
    mocks.sendTx.mockRejectedValue(new Error("simulation failed: Error: insufficient funds"));
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/Not enough balance/);
    expect(screen.getByRole("button", { name: /^Fund/ })).toBeTruthy();
    expect(screen.queryByText("Funded")).toBeNull();
  });

  it("sums up what is unfunded and funds every option with one approval, soonest expiry first", async () => {
    mocks.buildDeposit.mockImplementation(async (_rpc: unknown, _owner: string, p: { pda: string }) => [`ix-${p.pda}`]);
    mocks.sendAll.mockResolvedValue(["sig-1", "sig-2"]);
    const priced = { underlying_price: { type: "available", price: "160000000000", published_at: nowSec() } };
    const later = bought({ pda: "later", expiry_ts: nowSec() + 7200, ...priced });
    const sooner = bought({ pda: "sooner", market_pda: "m2", expiry_ts: nowSec() + 1800, terms: { type: "cash_secured_put", strike: "150000000000" }, ...priced });
    await show([later, sooner, { ...position("sold", nowSec() - 100), state: "open", expiry_ts: nowSec() + 3600, settlement: undefined } as unknown as PositionInfo]);
    const strip = within(screen.getByRole("region", { name: "Options to fund" }));
    expect(strip.getByText("2 options are not funded")).toBeTruthy();
    // one dollar figure: the put takes its 2 SOL, $320 at the $160 price, the call 300 USDC
    expect(strip.getByText("≈ $620")).toBeTruthy();
    // the assets sit behind a link that says how many, not which; a click pins the panel open
    expect(screen.queryByTestId("fund-breakdown")).toBeNull();
    const link = strip.getByRole("button", { name: "2 assets" });
    fireEvent.click(link);
    const breakdown = within(screen.getByTestId("fund-breakdown"));
    // largest first
    expect(breakdown.getAllByText(/ (SOL|USDC)/).map((el) => el.textContent)).toEqual(["2 SOL", expect.stringMatching(/^300\.00 USDC/)]);
    expect(breakdown.getByText("≈ $320")).toBeTruthy();
    expect(breakdown.getByText("≈ $300")).toBeTruthy();
    expect(breakdown.getByText("≈ $620")).toBeTruthy();
    // it is drawn on the page body, where the filter and the table cannot cover it
    expect(screen.getByRole("region", { name: "Options to fund" }).contains(screen.getByTestId("fund-breakdown"))).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("fund-breakdown")).toBeNull();
    fireEvent.click(link);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("fund-breakdown")).toBeNull();
    // the put expires first, in half an hour
    expect(strip.getByText(/^(29|30)m$/)).toBeTruthy();
    expect(strip.getByText(usd(20))).toBeTruthy();
    mocks.fetchPositions.mockClear();
    fireEvent.click(strip.getByRole("button", { name: "Fund all 2" }));
    await waitFor(() => expect(screen.getAllByText("Funded")).toHaveLength(2), SLOW);
    expect(mocks.sendAll).toHaveBeenCalledWith(expect.objectContaining({ feePayer: "wallet-a", transactions: [["ix-sooner"], ["ix-later"]] }));
    expect(mocks.sendTx).not.toHaveBeenCalled();
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Options to fund" })).toBeNull();
  });

  it("says a batch may have funded some when it fails part way, and reloads", async () => {
    mocks.buildDeposit.mockResolvedValue(["ix"]);
    mocks.sendAll.mockRejectedValue(new Error("rpc dropped"));
    await show([bought({ pda: "a" }), bought({ pda: "b" })]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Fund all 2" }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/may have gone through/);
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fund all 2" })).toBeTruthy();
  });

  it("keeps the single Fund button on the row when only one option is unfunded", async () => {
    await show([bought({})]);
    expect(within(screen.getByRole("region", { name: "Options to fund" })).queryByRole("button", { name: /^Fund/ })).toBeNull();
    expect(screen.getByText("1 option is not funded")).toBeTruthy();
    // a single token needs no breakdown: the dollar figure, then the exact amount in words
    const strip = within(screen.getByRole("region", { name: "Options to fund" }));
    expect(strip.getByText("≈ $300")).toBeTruthy();
    expect(strip.getByText(/^300\.00 USDC/)).toBeTruthy();
    expect(strip.queryByTestId("fund-breakdown")).toBeNull();
  });

  it("names the token amount when a put to fund has no price to value it at", async () => {
    await show([bought({ terms: { type: "cash_secured_put", strike: "150000000000" } })]);
    const strip = within(screen.getByRole("region", { name: "Options to fund" }));
    expect(strip.getByText("2 SOL")).toBeTruthy();
    expect(strip.queryByText(/≈/)).toBeNull();
  });

  it("shows no funding summary when nothing bought is waiting for a deposit", async () => {
    await show([{ ...position("sold", nowSec() - 100), state: "open", expiry_ts: nowSec() + 3600, settlement: undefined } as unknown as PositionInfo]);
    expect(screen.queryByRole("region", { name: "Options to fund" })).toBeNull();
  });

  it("drops the deposit action once the position is past expiry", async () => {
    mocks.markets = [{ pda: "m1", settlement: { type: "fixed", price: "160000000000" } }];
    await show([bought({ expiry_ts: nowSec() - 10 })]);
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("stays neutral on a funded position until the price is known", async () => {
    await show([bought({ state: "funded" })]);
    expect(screen.getByText(/, Funded/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("does not show a profit for a settled unfunded ITM buy", async () => {
    const settled = bought({ state: "settled", settlement: { type: "not_exercised", settlement_price: "160000000000" } });
    mocks.page.mockResolvedValue({ positions: [settled], next_cursor: null });
    render(<PortfolioClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "History" }));
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("-$10.00").className).toContain("text-additional-red-primary");
    expect(table.getByText("Not exercised")).toBeTruthy();
  });

  it("shows the spent premium as the loss on a settled OTM buy and the gain on an exercised one", async () => {
    mocks.page.mockResolvedValue({ positions: [
      bought({ pda: "otm", state: "settled", settlement: { type: "physical", is_otm: true, settlement_price: "140000000000" } }),
      bought({ pda: "itm", state: "settled", settlement: { type: "physical", is_otm: false, settlement_price: "160000000000" } }),
    ], next_cursor: null });
    render(<PortfolioClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "History" }));
    const table = within(await screen.findByRole("table"));
    expect(within(table.getByText("-$10.00").closest("tr")!).getByText("Expired")).toBeTruthy();
    expect(within(table.getByText("+$10.00").closest("tr")!).getByText("Exercised")).toBeTruthy();
  });
});

describe("Asset filter", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const open = (pda: string, symbol?: string) => ({
    ...position(pda, nowSec() - 100), state: "open", expiry_ts: nowSec() + 3600, settlement: undefined,
    ...(symbol ? { underlying_symbol: symbol, underlying_mint: `${symbol}-mint` } : {}),
  }) as unknown as PositionInfo;
  async function show(live: PositionInfo[]) {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.live = live;
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
  }

  it("is one selector that lists every asset with its count and narrows the table", async () => {
    await show([open("s1"), open("b1", "BTC"), open("b2", "BTC")]);
    const filter = screen.getByRole("combobox", { name: "Filter positions by asset" }) as HTMLSelectElement;
    expect([...filter.options].map((o) => o.textContent)).toEqual(["All assets · 3", "BTC · 2", "SOL · 1"]);
    expect(screen.getAllByText(/ends below/)).toHaveLength(3);
    fireEvent.change(filter, { target: { value: "BTC" } });
    expect(screen.getAllByText(/ends below/)).toHaveLength(2);
    expect(filter.value).toBe("BTC");
    fireEvent.change(filter, { target: { value: "all" } });
    expect(screen.getAllByText(/ends below/)).toHaveLength(3);
    // no row of chips, one per asset, to scroll sideways
    expect(screen.queryByRole("tablist", { name: /Filter positions/ })).toBeNull();
  });

  it("is not shown for a single asset", async () => {
    await show([open("s1"), open("s2")]);
    expect(screen.queryByRole("combobox", { name: "Filter positions by asset" })).toBeNull();
  });
});

describe("Portfolio states", () => {
  const open = (pda: string) => ({ ...position(pda, Math.floor(Date.now() / 1000) - 100), state: "open", expiry_ts: Math.floor(Date.now() / 1000) + 86400, settlement: undefined }) as unknown as PositionInfo;

  it("shows a loading state, not an error, until the first response arrives", async () => {
    let resolvePage!: (value: unknown) => void;
    mocks.page.mockImplementation(() => new Promise(resolve => { resolvePage = resolve; }));
    render(<PortfolioClient />);
    expect(screen.getByRole("status").textContent).toBe("Loading your portfolio");
    expect(document.body.textContent).not.toMatch(/unavailable/i);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("No open positions")).toBeNull();
    await act(async () => resolvePage({ positions: [position("closed", 1_800_000_000)], next_cursor: null }));
    await screen.findByText("Net P&L");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps closed positions out of the Open tab and counts only open ones", async () => {
    mocks.page.mockResolvedValue({ positions: [position("closed", 1_800_000_000)], next_cursor: null });
    mocks.live = [open("live")];
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    expect(screen.getByRole("tab", { name: "Open 1" }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2); // header + the open one
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    const history = within(screen.getByRole("table"));
    expect(history.getAllByRole("row")).toHaveLength(2);
    expect(history.getByText("+$2.00")).toBeTruthy(); // the premium kept on an expired covered call
    expect(history.getByText("Expired")).toBeTruthy();
  });

  it("keeps a position that is settling on the Open tab", async () => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.live = [{ ...open("closing"), state: "terminal_pending" } as unknown as PositionInfo];
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    expect(screen.getByRole("tab", { name: "Open 1" })).toBeTruthy();
    expect(screen.getByText("Settling")).toBeTruthy();
  });

  it("gives a wallet that has never traded one explanation and a way to trade", async () => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.summary.mockResolvedValue([]);
    render(<PortfolioClient />);
    expect((await screen.findByRole("link", { name: "Make your first trade" })).getAttribute("href")).toBe("/trade");
    expect(screen.queryByText("Net P&L")).toBeNull();
    expect(screen.queryByText("Income")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(document.body.textContent).not.toMatch(/unavailable/i);
  });

  it("asks for the wallet sign-in instead of reporting errors while signed out", () => {
    mocks.authenticated = false;
    render(<PortfolioClient />);
    expect(screen.getByText("Sign in to see your positions")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/unavailable/i);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("offers 7 and 30 day income ranges and the totals behind the chart", async () => {
    mocks.page.mockResolvedValue({ positions: [position("closed", 1_800_000_000)], next_cursor: null });
    render(<PortfolioClient />);
    await screen.findByTestId("income-chart");
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(expect.arrayContaining(["7D", "30D"]));
    expect(screen.queryByRole("tab", { name: "24H" })).toBeNull();
    expect(screen.getByText("$123.00")).toBeTruthy();
    expect(screen.getByText("$23.00")).toBeTruthy();
  });
});
