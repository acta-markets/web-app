import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionInfo } from "@/lib/rfq-client";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { PortfolioClient } from "./portfolio-client";

const mocks = vi.hoisted(() => ({ client: {}, getClient: vi.fn(), page: vi.fn(), summary: vi.fn(), wallet: "wallet-a", live: [] as PositionInfo[], fetchPositions: vi.fn() }));
vi.mock("@/lib/portfolio-api", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/portfolio-api")>(), fetchWalletPositions: mocks.page, fetchWalletPositionSummary: mocks.summary }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ isConnected: true, selectedAccount: { address: mocks.wallet } }) }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => ({ positions: mocks.live, markets: [], marketDescriptors: [], isAuthenticated: true, fetchPositions: mocks.fetchPositions, positionsFailed: false, getClient: mocks.getClient }) }));
vi.mock("./portfolio-earnings-chart", () => ({ PortfolioEarningsChart: ({ points }: { points: unknown[] }) => <div data-testid="income-chart">{JSON.stringify(points)}</div> }));

function position(pda: string, created_at: number, spread = false): PositionInfo {
  return { pda, market: "market", underlying_mint: TOKENS.SOL.mint[getNetwork()], quote_mint: TOKENS.USDC.mint[getNetwork()], underlying_decimals: 9, quote_decimals: 6,
    terms: spread ? { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 } : { type: "covered_call", strike: 150e9 },
    state: "settled", created_at, expiry_ts: created_at + 86400, quantity: 1e9, price: 1e9, total_premium: 2e6,
    settlement: spread ? { type: "cash", settlement_price: 110e9, maker_payoff: 10e6, taker_return: 10e6 } : { type: "physical", is_otm: true },
  } as PositionInfo;
}
const summary = [{ quote_mint: TOKENS.USDC.mint[getNetwork()], quote_decimals: 6, premium_all_time: "123000000", premium_30d: "23000000", open_positions: 7, daily: [{ day: "2026-11-01", premium: "23000000" }] }];

beforeEach(() => {
  vi.clearAllMocks(); mocks.getClient.mockReturnValue(mocks.client); mocks.page.mockReset(); mocks.summary.mockReset(); mocks.wallet = "wallet-a"; mocks.live = [];
  mocks.summary.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("Portfolio WS history", () => {
  it("appends history and settled spreads using the returned cursor while totals use the summary", async () => {
    mocks.page.mockResolvedValueOnce({ positions: [position("new", 1_800_000_000)], next_cursor: "opaque-page-2" })
      .mockResolvedValueOnce({ positions: [position("old", 1_700_000_000, true)], next_cursor: null });
    render(<PortfolioClient />);
    await screen.findByText("$123");
    expect(screen.getByText("7 open positions")).toBeTruthy();
    expect(screen.getByTestId("income-chart").textContent).toContain('"v":123');
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/covered call/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByText("SOL 100/120 put");
    expect(screen.getByText(/covered call/)).toBeTruthy();
    expect(mocks.page).toHaveBeenLastCalledWith(mocks.client, { settled: true, limit: 50, cursor: "opaque-page-2" }, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.getByText("$123")).toBeTruthy();
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
    await screen.findByText("$123");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/covered call/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.page.mock.calls[2][1].cursor).toBe("retry");
  });

  it("finishes Show more without losing pages when live open positions update", async () => {
    let resolvePage!: (value: unknown) => void;
    mocks.page.mockResolvedValueOnce({ positions: [position("new", 1_800_000_000)], next_cursor: "next" })
      .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const view = render(<PortfolioClient />);
    await screen.findByText("$123");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    const pageSignal = mocks.page.mock.calls[1][2] as AbortSignal;
    mocks.live = [{ ...position("live", 1_800_100_000), state: "open" } as PositionInfo];
    view.rerender(<PortfolioClient />);
    expect(pageSignal.aborted).toBe(false);
    await act(async () => resolvePage({ positions: [position("old", 1_700_000_000, true)], next_cursor: null }));
    expect(screen.getByText(/covered call/)).toBeTruthy();
    expect(screen.getByText("SOL 100/120 put")).toBeTruthy();
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });

  it("keeps large aggregate tiles exact and withholds an unsafe chart", async () => {
    mocks.page.mockResolvedValue({ positions: [], next_cursor: null });
    mocks.summary.mockResolvedValue([{ ...summary[0], premium_all_time: "9007199254740993" }]);
    render(<PortfolioClient />);
    await screen.findByText("$9,007,199,254.740993");
    expect(screen.queryByTestId("income-chart")).toBeNull();
  });

  it("does not restore the previous wallet's history when its page arrives late", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.page.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ positions: [], next_cursor: null });
    const view = render(<PortfolioClient />);
    mocks.wallet = "wallet-b";
    view.rerender(<PortfolioClient />);
    await screen.findByText("$123");
    await act(async () => resolveOld({ positions: [position("stale", 1_800_000_000)], next_cursor: "stale" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.queryByText("Covered call")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});
