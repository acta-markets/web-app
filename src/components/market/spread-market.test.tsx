import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTokenMint } from "@/lib/tokens";
import { SpreadMarket } from "./spread-market";
const mocks = vi.hoisted(() => ({ balance: 19_999_999n as bigint | null, submit: vi.fn(), cancel: vi.fn(), metadata: vi.fn(), fees: vi.fn(), replace: vi.fn(), enabled: true, quoteMint: null as string | null, descriptors: null as Array<Record<string, unknown>> | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("./use-token-balance", () => ({ useTokenBalance: () => mocks.balance }));
vi.mock("./rfq-flow-modal", () => ({ RfqFlowModal: () => null }));
vi.mock("@acta-markets/ts-sdk/chain", async original => ({ ...await original<typeof import("@acta-markets/ts-sdk/chain")>(), fetchConfigAccountByAddress: mocks.fees }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ selectedAccount: { address: "wallet" }, signTransaction: vi.fn(), signMessage: vi.fn() }) }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => ({
  isConnected: true, isAuthenticated: true, referralStatus: "redeemed",
  submitRfq: mocks.submit, cancelRfq: mocks.cancel, getTokenMarketsInfo: mocks.metadata,
  marketDescriptors: mocks.descriptors ?? [false, true].map(is_put => ({ underlying_symbol: "SOL", products: mocks.enabled ? ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"] : ["covered_call", "cash_secured_put"], market: { market_pda: is_put ? "put" : "call", underlying_mint: getTokenMint("SOL"), quote_mint: mocks.quoteMint ?? getTokenMint("USDC"), expiry_ts: 9_999_999_999, is_put }, underlying_decimals: 6, quote_decimals: 6, quote_symbol: "USDC", size_rule: { min_size: 1, max_size: 1e9, step: 1 } })),
  tokenMarketsInfo: { underlyingMint: getTokenMint("SOL"), data: { reference_price: 100e9 } },
  strikeTicks: new Map([[getTokenMint("SOL"), 10_000_000n]]),
}) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.balance = 19_999_999n; mocks.enabled = true; mocks.quoteMint = null; mocks.descriptors = null; mocks.fees.mockResolvedValue({ account: { protocolFeeBpsPremium: 100, protocolFeeBpsVolume: 100 } }); });
describe("spread ticket", () => {
  it("uses descriptor metadata for an asset outside the static token list", async () => {
    const dynamicMint = getTokenMint("SOL")!;
    mocks.descriptors = [{
      underlying_symbol: "DYNAMIC",
      products: ["call_spread"],
      market: { market_pda: "dynamic-call", underlying_mint: dynamicMint, quote_mint: getTokenMint("USDC"), expiry_ts: 9_999_999_999, is_put: false },
      underlying_decimals: 6,
      quote_decimals: 6,
      quote_symbol: "USDC",
      size_rule: { min_size: 1, max_size: 1e9, step: 1 },
    }];

    render(<SpreadMarket asset="DYNAMIC" initialMarketId="dynamic-call" onBusyChange={vi.fn()} />);

    expect(screen.getByLabelText("Expiry")).toBeTruthy();
    await waitFor(() => expect(mocks.metadata).toHaveBeenCalledWith(dynamicMint));
  });

  it("uses a keyboard-accessible strike picker while retaining the expiry select", () => {
    render(<SpreadMarket asset="SOL" onBusyChange={vi.fn()} />);
    const sellAt = within(screen.getByRole("radiogroup", { name: "Sell at" }));
    const oneHundred = sellAt.getByRole("radio", { name: "$100" });
    fireEvent.keyDown(oneHundred, { key: "ArrowRight" });
    expect(sellAt.getByRole("radio", { name: "$105" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Expiry").tagName).toBe("SELECT");
  });

  it("keeps the selected spread product and expiry in the URL", () => {
    render(<SpreadMarket asset="SOL" onBusyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Sell put spread" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/market/SOL?product=put_spread");

    fireEvent.change(screen.getByLabelText("Expiry"), { target: { value: "put" } });
    expect(mocks.replace).toHaveBeenLastCalledWith("/market/SOL?product=put_spread&market=put");
  });

  it("requires two chosen strikes and full quote balance before sending the exact spread pair", async () => {
    const busy = vi.fn();
    const view = render(<SpreadMarket asset="SOL" onBusyChange={busy} />);
    const button = screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sell at" })).getByRole("radio", { name: "$100" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Buy at" })).getByRole("radio", { name: "$120" }));
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
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sell at" })).getByRole("radio", { name: "$100" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Buy at" })).getByRole("radio", { name: "$120" }));
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
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sell at" })).getByRole("radio", { name: "$100" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Buy at" })).getByRole("radio", { name: "$120" }));
    expect((screen.getByRole("button", { name: "Get spread quote" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Sell put spread" }));
    expect(within(screen.getByRole("radiogroup", { name: "Sell at" })).getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    expect(within(screen.getByRole("radiogroup", { name: "Buy at" })).getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
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
    expect(screen.queryByRole("radiogroup", { name: "Buy at" })).toBeNull();
    const strike = within(screen.getByRole("radiogroup", { name: "Strike" })).getByRole("radio", { name: "$100" });
    fireEvent.click(strike);
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
