import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { writeSession } from "@/lib/state/session-store";
import { walletKey } from "@/lib/state/keys";
import { recall, remember } from "@/lib/state/remembered";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsdSmart } from "@/lib/markets";
import type { PositionInfo } from "@/lib/rfq-client";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { PortfolioClient } from "./portfolio-client";

const mocks = vi.hoisted(() => ({ markets: [] as unknown[], buildDeposit: vi.fn(), buildWithdraw: vi.fn(), sendTx: vi.fn(), sendAll: vi.fn(), client: {}, getClient: vi.fn(), page: vi.fn(), summary: vi.fn(), wallet: "wallet-a", live: [] as PositionInfo[], fetchPositions: vi.fn(), authenticated: true, connected: true, expected: null as { address: string } | null }));
vi.mock("@/lib/portfolio-api", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/portfolio-api")>(), fetchWalletPositions: mocks.page, fetchWalletPositionSummary: mocks.summary }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ isConnected: mocks.connected, selectedAccount: mocks.connected ? { address: mocks.wallet } : null, expectedAccount: mocks.expected }) }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => ({ positions: mocks.live, markets: mocks.markets, marketDescriptors: [], isAuthenticated: mocks.authenticated, fetchPositions: mocks.fetchPositions, positionsFailed: false, getClient: mocks.getClient }) }));
vi.mock("./portfolio-earnings-chart", () => ({ PortfolioEarningsChart: ({ points }: { points: unknown[] }) => <div data-testid="income-chart">{JSON.stringify(points)}</div> }));

vi.mock("@/lib/trade/buy-deposit", () => ({ buildBuyDepositBatch: mocks.buildDeposit, buildBuyWithdrawInstructions: mocks.buildWithdraw }));
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
  // one group of instructions per position, and one transaction per group unless a test packs them
  // one transaction per position unless a test packs them
  mocks.buildDeposit.mockReset().mockImplementation(async (_rpc: unknown, _owner: string, positions: Array<{ pda: string }>) => ({
    transactions: positions.map((p) => [`ix-${p.pda}`]),
    funded: positions.map((p) => p.pda),
    skipped: [],
  }));
  mocks.sendTx.mockReset(); mocks.sendAll.mockReset(); mocks.buildWithdraw.mockReset();
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
    expect(screen.getByRole("button", { name: /^Fund(?! \d)/ })).toBeTruthy();
    expect(screen.getByText("1 open")).toBeTruthy();
    expect(screen.getByText(`Nothing sold · ${usd(10)} paid`)).toBeTruthy();
  });

  it("offers the deposit action for a bought put too", async () => {
    await show([bought({ terms: { type: "cash_secured_put", strike: "150000000000" } })]);
    expect(screen.getByRole("button", { name: /^Fund(?! \d)/ })).toBeTruthy();
    expect(screen.getByText("Put")).toBeTruthy();
  });

  it("leaves bought options out of the APR on sold positions", async () => {
    await show([bought({})]);
    expect(screen.getByText("No open sold positions")).toBeTruthy();
  });

  it("deposits from the wallet, shows it funded at once and refreshes", async () => {
    mocks.sendTx.mockResolvedValue("sig");
    await show([bought({})]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    await screen.findByText("Funded", {}, SLOW);
    expect(mocks.buildDeposit).toHaveBeenCalledWith(undefined, "wallet-a", [expect.objectContaining({ pda: "bought", market: "m1" })]);
    expect(mocks.sendTx).toHaveBeenCalledWith(expect.objectContaining({ feePayer: "wallet-a", instructions: ["ix-bought"] }));
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
  });

  it("reports a failed deposit and keeps the button", async () => {
    mocks.sendTx.mockRejectedValue(new Error("simulation failed: Error: insufficient funds"));
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/Not enough balance/);
    expect(screen.getByRole("button", { name: /^Fund(?! \d)/ })).toBeTruthy();
    expect(screen.queryByText("Funded")).toBeNull();
  });

  it("sums up what is unfunded and funds every option with one approval, soonest expiry first", async () => {
    mocks.sendAll.mockResolvedValue(["sig-1", "sig-2"]);
    const priced = { underlying_price: { type: "available", price: "160000000000", published_at: nowSec() } };
    const later = bought({ pda: "later", expiry_ts: nowSec() + 7200, ...priced });
    const sooner = bought({ pda: "sooner", market_pda: "m2", expiry_ts: nowSec() + 1800, terms: { type: "cash_secured_put", strike: "150000000000" }, ...priced });
    await show([later, sooner, { ...position("sold", nowSec() - 100), state: "open", expiry_ts: nowSec() + 3600, settlement: undefined } as unknown as PositionInfo]);
    const strip = within(screen.getByRole("region", { name: "Options to fund" }));
    // the button only says what it does; how many and how much are in the figure beside it
    expect(strip.getByRole("button", { name: "Fund 2 options, ≈ $620" }).textContent).toBe("Fund");
    expect(strip.getByText(/^2 options/)).toBeTruthy();
    expect(strip.getByRole("button", { name: "Fund 2 options, ≈ $620" })).toBeTruthy();
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
    fireEvent.click(strip.getByRole("button", { name: "Fund 2 options, ≈ $620" }));
    await waitFor(() => expect(screen.getAllByText("Funded")).toHaveLength(2), SLOW);
    expect(mocks.sendAll).toHaveBeenCalledWith(expect.objectContaining({ feePayer: "wallet-a", transactions: [["ix-sooner"], ["ix-later"]] }));
    expect(mocks.sendTx).not.toHaveBeenCalled();
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Options to fund" })).toBeNull();
  });

  it("keeps the asset filter in the table's header, and the card funds what it leaves", async () => {
    mocks.sendTx.mockResolvedValue("sig");
    const sol = bought({ pda: "sol-call" });
    const btc = bought({ pda: "btc-call", market_pda: "m2", underlying_symbol: "BTC", underlying_mint: "BTC-mint" });
    await show([sol, btc]);
    const card = within(screen.getByRole("region", { name: "Options to fund" }));
    const filter = screen.getByRole("combobox", { name: "Filter positions by asset" });
    // it filters the Position column, so that is where it is: not among the card's controls
    expect(within(screen.getByRole("columnheader", { name: /Position/ })).getByRole("combobox")).toBe(filter);
    expect(card.queryByRole("combobox")).toBeNull();
    expect(card.getByRole("button", { name: /^Fund 2 options/ })).toBeTruthy();
    fireEvent.change(filter, { target: { value: "BTC" } });
    fireEvent.click(card.getByRole("button", { name: /^Fund 1 option/ }));
    await waitFor(() => expect(mocks.sendTx).toHaveBeenCalledWith(expect.objectContaining({ instructions: ["ix-btc-call"] })), SLOW);
    expect(mocks.buildDeposit).toHaveBeenCalledTimes(1);
  });

  it("says a batch may have funded some when it fails after sending began, and reloads", async () => {
    mocks.sendAll.mockImplementation(async ({ onSending }: { onSending: () => void }) => {
      onSending();
      throw new Error("rpc dropped");
    });
    await show([bought({ pda: "a" }), bought({ pda: "b" })]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Fund 2 options/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/may have gone through/);
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /^Fund 2 options/ })).toBeTruthy();
  });

  it("says nothing was sent when the batch stops before the wallet is asked", async () => {
    // a public RPC refusing the reads for rate, which is how thirty options used to fail
    mocks.buildDeposit.mockRejectedValue(new Error("HTTP error (429): Too Many Requests"));
    await show([bought({ pda: "a" }), bought({ pda: "b" })]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Fund 2 options/ }));
    const alert = (await screen.findByRole("alert", {}, SLOW)).textContent;
    expect(alert).toBe("The network is busy and did not answer. Nothing was sent. Try again in a moment.");
    expect(mocks.sendAll).not.toHaveBeenCalled();
    expect(mocks.fetchPositions).not.toHaveBeenCalled();
  });

  it("leaves out an option the chain will not take a deposit for, funds the rest and says so", async () => {
    mocks.buildDeposit.mockImplementation(async (_rpc: unknown, _owner: string, positions: Array<{ pda: string }>) => {
      const ready = positions.filter((p) => p.pda !== "stale");
      return {
        transactions: ready.map((p) => [`ix-${p.pda}`]),
        funded: ready.map((p) => p.pda),
        skipped: [{ pda: "stale", reason: "funding requires a matching Open position held by a wallet or Maker" }],
      };
    });
    mocks.sendAll.mockResolvedValue(["sig-1", "sig-2"]);
    await show([bought({ pda: "a" }), bought({ pda: "stale", market_pda: "m2" }), bought({ pda: "b", market_pda: "m3" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund 3 options/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toBe("1 of 3 options were left out: no longer open on chain. The rest are funded.");
    expect(mocks.sendAll).toHaveBeenCalledWith(expect.objectContaining({ transactions: [["ix-a"], ["ix-b"]] }));
    // the two that went out read as funded; the stale one still offers funding
    await waitFor(() => expect(screen.getAllByText("Funded")).toHaveLength(2));
    expect(screen.getByRole("button", { name: /^Fund 1 option/ })).toBeTruthy();
  });

  it("names the reason when the one option asked for cannot be funded", async () => {
    mocks.buildDeposit.mockResolvedValue({ transactions: [], funded: [], skipped: [{ pda: "bought", reason: "position not found on chain" }] });
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toBe("This option is not found on chain. Nothing was sent.");
    expect(mocks.sendTx).not.toHaveBeenCalled();
  });

  it("quotes an error it has no words for, instead of a blank 'could not prepare'", async () => {
    mocks.sendTx.mockRejectedValue(new Error("Wallet changed the simulated transaction"));
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/^Your wallet changed the transaction before signing it/);
    cleanup();
    mocks.sendTx.mockRejectedValue(new Error("Unexpected error"));
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toBe("Could not prepare this: Unexpected error. Nothing was sent.");
  });

  it("sends several options as one transaction when they fit, through the single-transaction path", async () => {
    mocks.buildDeposit.mockImplementation(async (_rpc: unknown, _owner: string, positions: Array<{ pda: string }>) => ({
      transactions: [positions.map((p) => `ix-${p.pda}`)],
      funded: positions.map((p) => p.pda),
      skipped: [],
    }));
    mocks.sendTx.mockResolvedValue("sig");
    await show([bought({ pda: "a" }), bought({ pda: "b", market_pda: "m2" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund 2 options/ }));
    await waitFor(() => expect(mocks.sendTx).toHaveBeenCalledWith(expect.objectContaining({ instructions: ["ix-a", "ix-b"] })), SLOW);
    expect(mocks.buildDeposit).toHaveBeenCalledTimes(1);
    expect(mocks.sendAll).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByText("Funded")).toHaveLength(2));
  });

  it("says what a lone unfunded option takes, with the same button", async () => {
    await show([bought({})]);
    expect(within(screen.getByRole("region", { name: "Options to fund" })).getByRole("button", { name: "Fund 1 option, ≈ $300" })).toBeTruthy();
    // the card's header is the same two choices as ever; nothing is worth exercising without a price
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("tab", { name: /^Worth exercising/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/not funded/)).toBeNull();
    // a single token needs no breakdown: the dollar figure, then how many options and the exact amount
    const strip = within(screen.getByRole("region", { name: "Options to fund" }));
    expect(strip.getByText("≈ $300")).toBeTruthy();
    expect(strip.getByText("1 option, 300.00 USDC")).toBeTruthy();
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
    expect(screen.getByText("Funded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("takes a funded option's deposit back, shows it unfunded at once and refreshes", async () => {
    mocks.buildWithdraw.mockResolvedValue(["withdraw-ix"]);
    mocks.sendTx.mockResolvedValue("sig");
    await show([bought({ state: "funded" })]);
    mocks.fetchPositions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Withdraw deposit/ }));
    // Open again: the row offers funding and the card counts it
    await screen.findByRole("button", { name: /^Fund exercise/ }, SLOW);
    expect(mocks.buildWithdraw).toHaveBeenCalledWith(undefined, "wallet-a", expect.objectContaining({ pda: "bought", market: "m1" }));
    expect(mocks.sendTx).toHaveBeenCalledWith(expect.objectContaining({ feePayer: "wallet-a", instructions: ["withdraw-ix"] }));
    expect(mocks.fetchPositions).toHaveBeenCalledOnce();
    expect(screen.queryByText("Funded")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Withdraw deposit/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Options to fund" })).toBeTruthy();
  });

  it("offers the deposit back on an option funded a moment ago, before the listener reports it", async () => {
    mocks.buildWithdraw.mockResolvedValue(["withdraw-ix"]);
    mocks.sendTx.mockResolvedValue("sig");
    await show([bought({})]);
    fireEvent.click(screen.getByRole("button", { name: /^Fund(?! \d)/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Withdraw deposit/ }, SLOW));
    await screen.findByRole("button", { name: /^Fund exercise/ }, SLOW);
    expect(screen.queryByText("Funded")).toBeNull();
  });

  it("reports a failed withdrawal and leaves the option funded", async () => {
    mocks.buildWithdraw.mockResolvedValue(["withdraw-ix"]);
    mocks.sendTx.mockRejectedValue(new Error("User rejected the request"));
    await show([bought({ state: "funded" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Withdraw deposit/ }));
    expect((await screen.findByRole("alert", {}, SLOW)).textContent).toMatch(/declined in your wallet/);
    expect(screen.getByText("Funded")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Withdraw deposit/ })).toBeTruthy();
  });

  it("does not offer the deposit back once the option is past expiry", async () => {
    await show([bought({ state: "funded", expiry_ts: nowSec() - 60 })]);
    expect(screen.getByText("Funded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Withdraw deposit/ })).toBeNull();
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

describe("Worth exercising filter", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  // a price of $160: a $150 call is in the money, a $150 put is not
  const priced = { underlying_price: { type: "available", price: "160000000000", published_at: nowSec() } };
  const option = (pda: string, over: Record<string, unknown> = {}) => ({
    ...position(pda, nowSec() - 100), side: "buy", state: "open", market_pda: `m-${pda}`, expiry_ts: nowSec() + 3600, settlement: undefined,
    terms: { type: "covered_call", strike: "150000000000" }, ...priced, ...over,
  }) as unknown as PositionInfo;
  const put = (pda: string, over: Record<string, unknown> = {}) => option(pda, { terms: { type: "cash_secured_put", strike: "150000000000" }, ...over });
  const sold = (pda: string) => ({ ...position(pda, nowSec() - 100), state: "open", expiry_ts: nowSec() + 3600, settlement: undefined, ...priced }) as unknown as PositionInfo;
  async function show(live: PositionInfo[]) {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.live = live;
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
  }
  const rows = () => screen.getAllByText(/ends (above|below)/).length;
  const chip = () => screen.queryByRole("tab", { name: /^Worth exercising/ });
  const all = () => screen.getByRole("tab", { name: /^All/ });

  it("narrows the table to the bought options in the money, and back", async () => {
    await show([option("itm-call"), put("otm-put"), sold("sold")]);
    expect(rows()).toBe(3);
    expect(chip()!.textContent).toBe("Worth exercising1");
    expect(all().textContent).toBe("All3");
    expect(chip()!.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(chip()!);
    expect(chip()!.getAttribute("aria-selected")).toBe("true");
    expect(rows()).toBe(1);
    expect(screen.getByText(/ends above/)).toBeTruthy();
    fireEvent.click(all());
    expect(rows()).toBe(3);
  });

  it("works with the asset filter and counts inside it", async () => {
    await show([option("sol-call"), option("btc-call", { underlying_symbol: "BTC", underlying_mint: "BTC-mint" }), put("btc-put", { underlying_symbol: "BTC", underlying_mint: "BTC-mint" })]);
    expect(chip()!.textContent).toBe("Worth exercising2");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter positions by asset" }), { target: { value: "BTC" } });
    expect(chip()!.textContent).toBe("Worth exercising1");
    fireEvent.click(chip()!);
    expect(rows()).toBe(1);
  });

  it("stays in the card with a zero, and cannot be chosen, when nothing qualifies", async () => {
    await show([put("otm-put"), sold("sold")]);
    expect(chip()!.textContent).toBe("Worth exercising0");
    expect((chip() as HTMLButtonElement).disabled).toBe(true);
    expect(all().getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the card's header the same from one asset to the next", async () => {
    // SOL has a call worth exercising, BTC only a put that is not, ETH nothing bought at all
    await show([option("sol-call"), put("btc-put", { underlying_symbol: "BTC", underlying_mint: "BTC-mint" }), { ...sold("eth-sold"), underlying_symbol: "ETH", underlying_mint: "ETH-mint" } as PositionInfo]);
    const header = () => within(screen.getByRole("tablist", { name: "Which positions to show and fund" })).getAllByRole("tab").map((tab) => tab.textContent);
    expect(header()).toEqual(["All3", "Worth exercising1"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter positions by asset" }), { target: { value: "BTC" } });
    expect(header()).toEqual(["All1", "Worth exercising0"]);
    expect(screen.queryByText(/not funded/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Fund 1 option/ })).toBeTruthy();
    // nothing to fund in ETH: the card stays where it is, with the same header and no button
    fireEvent.change(screen.getByRole("combobox", { name: "Filter positions by asset" }), { target: { value: "ETH" } });
    expect(header()).toEqual(["All1", "Worth exercising0"]);
    expect(within(screen.getByRole("region", { name: "Filter positions" })).getByText("Nothing to fund")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Fund \d/ })).toBeNull();
  });

  it("is not drawn, card and all, when there is nothing bought to fund or exercise", async () => {
    await show([sold("sold")]);
    expect(chip()).toBeNull();
    expect(screen.queryByRole("region", { name: "Options to fund" })).toBeNull();
  });

  it("is offered for a single asset too, where there is no asset filter", async () => {
    await show([option("itm-call"), sold("sold")]);
    expect(screen.queryByRole("combobox", { name: "Filter positions by asset" })).toBeNull();
    expect(chip()).toBeTruthy();
  });

  it("switches itself off when the last qualifying position stops qualifying, so the table is never left empty", async () => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.live = [option("itm-call"), sold("sold")];
    const view = render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    fireEvent.click(chip()!);
    expect(rows()).toBe(1);
    // the price falls under the strike while the filter is on
    mocks.live = [option("itm-call", { underlying_price: { type: "available", price: "140000000000", published_at: nowSec() } }), sold("sold")];
    view.rerender(<PortfolioClient />);
    await waitFor(() => expect(all().getAttribute("aria-selected")).toBe("true"));
    expect((chip() as HTMLButtonElement).disabled).toBe(true);
    expect(rows()).toBe(2);
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

  it("shows a returning wallet its page loading, not a request to connect, while the wallet reconnects", () => {
    mocks.connected = false;
    mocks.expected = { address: "wallet-a" };
    mocks.authenticated = false;
    try {
      render(<PortfolioClient />);
      expect(screen.getByRole("status").textContent).toBe("Loading your portfolio");
      expect(screen.queryByText("Connect wallet")).toBeNull();
      expect(screen.queryByText("Sign in to see your positions")).toBeNull();
    } finally {
      mocks.connected = true;
      mocks.expected = null;
    }
  });

  it("asks a wallet nobody remembers to connect", () => {
    mocks.connected = false;
    mocks.authenticated = false;
    try {
      render(<PortfolioClient />);
      expect(screen.getByText("Connect wallet")).toBeTruthy();
    } finally {
      mocks.connected = true;
    }
  });

  it("shows the page loading, not a sign-in request, while a stored session is being resumed", () => {
    mocks.authenticated = false;
    writeSession(getRfqBackendUrl(), mocks.wallet, "stored", 4_000_000_000);
    try {
      render(<PortfolioClient />);
      expect(screen.getByRole("status").textContent).toBe("Loading your portfolio");
      expect(screen.queryByText("Sign in to see your positions")).toBeNull();
    } finally {
      window.localStorage.clear();
    }
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


describe("a returning wallet's last-loaded portfolio", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const bought = (pda = "bought") => ({
    ...position(pda, nowSec() - 100), side: "buy", state: "open", market_pda: "m1", expiry_ts: nowSec() + 3600,
    terms: { type: "covered_call", strike: "150000000000" }, quantity: "2000000000", price: "5000000000", total_premium: "9000000", settlement: undefined,
  }) as unknown as PositionInfo;
  /** What an earlier visit left on this device for a wallet. */
  function saved(wallet: string) {
    remember(walletKey(wallet, "positions"), [bought()]);
    remember(walletKey(wallet, "history"), { positions: [position("closed", 1_800_000_000)], nextCursor: "more" });
    remember(walletKey(wallet, "income-summary"), summary);
  }
  const away = () => { mocks.connected = false; mocks.expected = { address: "wallet-a" }; mocks.authenticated = false; };
  afterEach(() => { mocks.connected = true; mocks.expected = null; });

  it("is on screen before the wallet has reconnected, said to be last-loaded, with nothing to fund from it", () => {
    saved("wallet-a");
    away();
    render(<PortfolioClient />);
    expect(screen.getByText("Net P&L")).toBeTruthy();
    expect(screen.getByTestId("income-chart").textContent).toContain('"v":123');
    expect(screen.getByText(/^Your portfolio as of .+\. Updating\.$/)).toBeTruthy();
    expect(screen.queryByText("Connect wallet")).toBeNull();
    expect(screen.queryByText("Sign in to see your positions")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    // the card's Fund button is there but off, and the row offers none
    const fund = screen.getAllByRole("button", { name: /^Fund/ }) as HTMLButtonElement[];
    expect(fund.length).toBeGreaterThan(0);
    expect(fund.every((button) => button.disabled)).toBe(true);
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("is on screen for a connected wallet while its sign-in is still under way", () => {
    saved("wallet-a");
    mocks.authenticated = false;
    render(<PortfolioClient />);
    expect(screen.getByText("Net P&L")).toBeTruthy();
    expect(screen.getByText(/^Your portfolio as of /)).toBeTruthy();
    expect((screen.getAllByRole("button", { name: /^Fund/ }) as HTMLButtonElement[]).every((button) => button.disabled)).toBe(true);
  });

  it("is never shown for another wallet", () => {
    saved("wallet-b");
    away();
    render(<PortfolioClient />);
    expect(screen.queryByText("Net P&L")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading your portfolio");
  });

  it("gives way to the live portfolio once signed in, with its actions back and no marker", async () => {
    saved("wallet-a");
    mocks.live = [bought()];
    mocks.page.mockResolvedValue({ positions: [position("closed", 1_800_000_000)], next_cursor: null });
    render(<PortfolioClient />);
    await waitFor(() => expect(mocks.page).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/^Your portfolio as of /)).toBeNull());
    expect((screen.getAllByRole("button", { name: /^Fund/ }) as HTMLButtonElement[]).some((button) => !button.disabled)).toBe(true);
  });

  it("keeps the first page and the income summary for the next visit once they load", async () => {
    mocks.page.mockResolvedValue({ positions: [position("closed", 1_800_000_000)], next_cursor: "page-2" });
    render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    await waitFor(() => expect(recall(walletKey("wallet-a", "income-summary"))).toEqual(summary));
    expect(recall<{ positions: PositionInfo[]; nextCursor: string | null }>(walletKey("wallet-a", "history"))).toMatchObject({ nextCursor: "page-2", positions: [{ pda: "closed" }] });
  });

  it("keeps the history on screen while it is read again after a position settles", async () => {
    mocks.page.mockResolvedValueOnce({ positions: [position("closed", 1_800_000_000)], next_cursor: null });
    const view = render(<PortfolioClient />);
    await screen.findByText("Net P&L");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/ call$/)).toBeTruthy();
    // a position settles: the settled history is read again, and must not blank meanwhile
    mocks.page.mockImplementation(() => new Promise(() => {}));
    mocks.live = [{ ...position("just-settled", 1_800_000_100), revision: { slot: 1 } } as unknown as PositionInfo];
    view.rerender(<PortfolioClient />);
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/ call$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading positions...")).toBeNull();
  });
});
