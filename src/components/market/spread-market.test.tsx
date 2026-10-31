import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTokenMint } from "@/lib/tokens";
import { SpreadMarket } from "./spread-market";
const mocks = vi.hoisted(() => ({ balance: 19_999_999n as bigint | null, submit: vi.fn(), cancel: vi.fn(), metadata: vi.fn(), fees: vi.fn(), enabled: true, quoteMint: null as string | null }));
vi.mock("./use-token-balance", () => ({ useTokenBalance: () => mocks.balance }));
vi.mock("./rfq-flow-modal", () => ({ RfqFlowModal: () => null }));
vi.mock("@acta-markets/ts-sdk/chain", async original => ({ ...await original<typeof import("@acta-markets/ts-sdk/chain")>(), fetchConfigAccountByAddress: mocks.fees }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ selectedAccount: { address: "wallet" }, signTransaction: vi.fn(), signMessage: vi.fn() }) }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => ({
  isConnected: true, isAuthenticated: true, referralStatus: "redeemed",
  submitRfq: mocks.submit, cancelRfq: mocks.cancel, getTokenMarketsInfo: mocks.metadata,
  marketDescriptors: [false, true].map(is_put => ({ products: mocks.enabled ? ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"] : ["covered_call", "cash_secured_put"], market: { market_pda: is_put ? "put" : "call", underlying_mint: getTokenMint("SOL"), quote_mint: mocks.quoteMint ?? getTokenMint("USDC"), expiry_ts: 9_999_999_999, is_put }, underlying_decimals: 6, quote_decimals: 6, quote_symbol: "USDC", size_rule: { min_size: 1, max_size: 1e9, step: 1 } })),
  tokenMarketsInfo: { underlyingMint: getTokenMint("SOL"), data: { reference_price: 100e9 } },
  strikeTicks: new Map([[getTokenMint("SOL"), 10_000_000n]]),
}) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.balance = 19_999_999n; mocks.enabled = true; mocks.quoteMint = null; mocks.fees.mockResolvedValue({ account: { protocolFeeBpsPremium: 100, protocolFeeBpsVolume: 100 } }); });
describe("spread ticket", () => {
  it("requires two chosen strikes and full quote balance before sending the exact spread pair", async () => {
    const busy = vi.fn();
    const view = render(<SpreadMarket asset="SOL" onBusyChange={busy} />);
    const button = screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sell at"), { target: { value: "100000000000" } });
    fireEvent.change(screen.getByLabelText("Buy at"), { target: { value: "120000000000" } });
    await waitFor(() => expect(mocks.fees).toHaveBeenCalled());
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Not enough USDC");
    mocks.balance = 20_000_000n;
    view.rerender(<SpreadMarket asset="SOL" onBusyChange={busy} />);
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith({ market: "call", terms: { type: "call_spread", lower_strike: 100e9, upper_strike: 120e9 }, quantity: 1_000_000 });
  });
  it("never reuses another quote mint's fee configuration", async () => {
    mocks.balance = 20_000_000n;
    const busy = vi.fn();
    const view = render(<SpreadMarket asset="SOL" onBusyChange={busy} />);
    fireEvent.change(screen.getByLabelText("Sell at"), { target: { value: "100000000000" } });
    fireEvent.change(screen.getByLabelText("Buy at"), { target: { value: "120000000000" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement).disabled).toBe(false));
    mocks.fees.mockImplementation(() => new Promise(() => {}));
    mocks.quoteMint = "11111111111111111111111111111111";
    view.rerender(<SpreadMarket asset="SOL" onBusyChange={busy} />);
    expect((screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Loading protocol fees…")).toBeTruthy();
  });
  it("clears both strikes on product changes, and refuses unknown balances or a disallowed product", async () => {
    mocks.balance = null;
    const view = render(<SpreadMarket asset="SOL" onBusyChange={vi.fn()} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Sell at"), { target: { value: "100000000000" } });
    fireEvent.change(screen.getByLabelText("Buy at"), { target: { value: "120000000000" } });
    expect((screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Sell put spread" }));
    expect((screen.getByLabelText("Sell at") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Buy at") as HTMLSelectElement).value).toBe("");
    mocks.balance = 20_000_000n; mocks.enabled = false;
    view.rerender(<SpreadMarket asset="SOL" onBusyChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});


describe("cash put ticket", () => {
  it("requires full strike collateral and sends cash_put rather than a zero-leg spread", async () => {
    mocks.balance = 99_999_999n;
    const busy = vi.fn();
    const view = render(<SpreadMarket asset="SOL" cashPut onBusyChange={busy} />);
    expect(screen.queryByLabelText("Buy at")).toBeNull();
    fireEvent.change(screen.getByLabelText("Strike"), { target: { value: "100000000000" } });
    await waitFor(() => expect(mocks.fees).toHaveBeenCalled());
    const button = screen.getByRole("button", { name: "Get cash put quote" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    mocks.balance = 100_000_000n;
    view.rerender(<SpreadMarket asset="SOL" cashPut onBusyChange={busy} />);
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith({ market: "put", terms: { type: "cash_put", strike: 100e9 }, quantity: 1_000_000 });
    mocks.enabled = false;
    view.rerender(<SpreadMarket asset="SOL" cashPut onBusyChange={busy} />);
    expect(button.disabled).toBe(true);
  });
});
