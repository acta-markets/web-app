import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EarnAssetSummary, TokenMarketsInfoData } from "@/lib/rfq-client";
import { getTokenMint } from "@/lib/tokens";
import { EasyTrade } from "./easy-trade";

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

describe("Easy mode", () => {
  it("opens on a complete thesis: SOL above the nearest priced put strike, nearest date, about $100", () => {
    render(<EasyTrade />);
    expect(select("Asset").value).toBe("SOL");
    expect(select("Direction").value).toBe("above");
    expect(select("Price").value).toBe(String(95e9));
    expect(select("Date").value).toBe(String(now + 7 * day));
    expect((screen.getByLabelText("Amount in USDC") as HTMLInputElement).value).toBe("104.5");
    // 1.1 SOL locked at $95, $1 premium per SOL
    expect(screen.getByText("≈$1.10")).toBeTruthy();
    expect(screen.getByText("Sell a put (cash-secured)")).toBeTruthy();
    // $95 is 5% under the $100 spot
    expect(screen.getByText("SOL can fall 5.0% and you're still right.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalledWith(SOL);
  });

  it("states the APR in the payout and leaves the details to the order table", () => {
    render(<EasyTrade />);
    const payout = screen.getByText(/I get paid/).closest("p") as HTMLElement;
    expect(within(payout).getByText("≈$1.10")).toBeTruthy();
    // $1 premium on a $100 spot over 7 days
    expect(within(payout).getByText("(52% APR)")).toBeTruthy();
    // other dates' and the other direction's endings are held invisibly, so a new pick keeps the line's width
    expect(within(payout).getByText(/\(39% APR\) now\.$/).closest("[aria-hidden]")).toBeTruthy();
    expect(within(payout).getAllByText(/^≈\$\d+\.\d\d \(\d+% APR\) now\.$/).length).toBeGreaterThan(1);
    expect(screen.queryByText(/^Min /)).toBeNull();
    expect(screen.queryByText(/Return by/)).toBeNull();
  });

  it("flips to a covered call, swapping the deposit and strikes but keeping a date both sides list", () => {
    render(<EasyTrade />);
    fireEvent.change(select("Date"), { target: { value: String(now + 7 * day) } });
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect(select("Price").value).toBe(String(105e9));
    expect([...select("Price").options].map((o) => o.value)).toEqual([String(105e9), String(110e9)]);
    expect(select("Date").value).toBe(String(now + 7 * day));
    expect((screen.getByLabelText("Amount in SOL") as HTMLInputElement).value).toBe("1");
    expect(screen.getByText("Sell a call (covered)")).toBeTruthy();
  });

  it("falls back to the nearest date when the other side does not list the chosen one", () => {
    render(<EasyTrade />);
    fireEvent.change(select("Date"), { target: { value: String(now + 14 * day) } });
    expect(select("Price").value).toBe(String(95e9));
    fireEvent.change(select("Direction"), { target: { value: "below" } });
    expect(select("Date").value).toBe(String(now + 7 * day));
  });

  it("never shows another asset's prices while the new snapshot loads", () => {
    render(<EasyTrade />);
    fireEvent.change(select("Asset"), { target: { value: "JLP" } });
    expect(mocks.refresh).toHaveBeenLastCalledWith(JLP);
    expect(select("Price").disabled).toBe(true);
    expect(screen.queryByText("≈$1.10")).toBeNull();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeTruthy();
  });

  it("does not present stale premiums", () => {
    connectWallet();
    mocks.context.tokenMarketsInfo = { underlyingMint: SOL, data: snapshot({ stale: true }) };
    render(<EasyTrade />);
    expect(screen.queryByText(/≈\$/)).toBeNull();
    expect((screen.getByRole("button", { name: "Prices unavailable" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requests a quote for the floored quantity at the exact wire strike", () => {
    connectWallet();
    render(<EasyTrade />);
    fireEvent.change(screen.getByLabelText("Amount in USDC"), { target: { value: "1000" } });
    // 1000 USDC at $95 is 10.526 SOL; the 0.1 SOL step floors it to 10.5 SOL, 997.50 USDC
    expect(screen.getByText("Locks 997.5 USDC (size steps of 9.5)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get quote" }));
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

  it("blocks amounts over the balance or outside the size rule", () => {
    connectWallet();
    mocks.balance = 50;
    render(<EasyTrade />);
    expect(screen.getByRole("button", { name: "Insufficient balance" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount in USDC"), { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Below min 9.5 USDC" })).toBeTruthy();
  });

  it("offers half and all of the balance from the amount pill's menu", () => {
    connectWallet();
    mocks.balance = 50;
    render(<EasyTrade />);
    // the balance's quick amounts sit behind the pill's chevron, on the 9.5 step grid
    fireEvent.click(screen.getByRole("button", { name: "Quick amounts" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /47\.5/ }));
    expect((screen.getByLabelText("Amount in USDC") as HTMLInputElement).value).toBe("47.5");
    expect(screen.getByRole("button", { name: "Get quote" })).toBeTruthy();
  });

  it("cancels the RFQ when no quote arrives within the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    connectWallet();
    render(<EasyTrade />);
    fireEvent.click(screen.getByRole("button", { name: "Get quote" }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe("No quote came back in 30 seconds. Try again.");
  });

  it("keeps the order modal mounted for recovery before any market data", () => {
    mocks.context.earnSummary = null;
    mocks.context.tokenMarketsInfo = null;
    render(<EasyTrade />);
    const props = mocks.modal.mock.lastCall?.[0] as { preview: unknown; walletAddress: unknown };
    expect(props.preview).toBeNull();
    expect(props.walletAddress).toBeNull();
  });

  it("asks a gated wallet to redeem an invite", () => {
    connectWallet();
    mocks.context.referralStatus = "required";
    render(<EasyTrade />);
    fireEvent.click(screen.getByRole("button", { name: "Redeem invite to trade" }));
    expect(mocks.context.openReferralGate).toHaveBeenCalledOnce();
  });

  describe("Buy", () => {
    const chooseBuy = () => fireEvent.click(screen.getByRole("tab", { name: "Buy" }));

    it("maps above to a bought call, sized in the asset, with no indicative price or APR", () => {
      connectWallet();
      mocks.balance = 500;
      render(<EasyTrade />);
      chooseBuy();
      expect(screen.getByText("If I buy")).toBeTruthy();
      expect(screen.getByText("I pay")).toBeTruthy();
      expect(screen.getByLabelText("Amount in SOL")).toBeTruthy();
      expect(screen.queryByText("HALF")).toBeNull();
      expect(screen.getByText("Buy a call")).toBeTruthy();
      expect(screen.queryByText("Paid to you now")).toBeNull();
      expect(screen.queryByText(/APR/)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Get quote/ }));
      const submit = mocks.context.submitRfq as ReturnType<typeof vi.fn>;
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({
        market: "call-soon", side: "buy", terms: { type: "covered_call", strike: 105e9 }, quantity: 1e9,
      }));
    });

    describe("spreads", () => {
      const list = (products: string[]) => {
        mocks.context.marketDescriptors = ["call-soon", "put-soon", "call-later", "put-later"].map((market_pda) => ({
          market: { market_pda }, products,
        }));
      };
      const chooseSpread = () => fireEvent.click(screen.getByRole("tab", { name: "Spread" }));

      it("offers no spread where the market does not list one", () => {
        list(["covered_call", "cash_secured_put"]);
        render(<EasyTrade />);
        chooseBuy();
        expect(screen.queryByRole("tab", { name: "Spread" })).toBeNull();
        expect(screen.getByText("Buy a call")).toBeTruthy();
      });

      it("buys a call spread with the chosen upper leg and no deposit", () => {
        connectWallet();
        list(["covered_call", "call_spread"]);
        render(<EasyTrade />);
        chooseBuy();
        chooseSpread();
        expect(screen.getByText("Buy a call spread")).toBeTruthy();
        expect(screen.getByText("Max payout before premium")).toBeTruthy();
        expect(screen.getByText("The premium you pay")).toBeTruthy();
        expect(screen.queryByText("To exercise")).toBeNull();
        expect(screen.getByRole("tab", { name: "Up to $110" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /Get quote/ }));
        const submit = mocks.context.submitRfq as ReturnType<typeof vi.fn>;
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({
          market: "call-soon", side: "buy", quantity: 1e9,
          terms: { type: "call_spread", lower_strike: 105e9, upper_strike: 110e9 },
        }));
      });

      it("never offers a call without an upper leg", () => {
        connectWallet();
        list(["covered_call", "call_spread"]);
        render(<EasyTrade />);
        chooseBuy();
        chooseSpread();
        fireEvent.change(select("Price"), { target: { value: String(110e9) } });
        expect(screen.queryByRole("tablist", { name: "Spread width" })).toBeNull();
        expect(screen.getByRole("button", { name: "Choose a price" })).toBeTruthy();
      });

      it("buys a cash put through its zero leg on a put market", () => {
        connectWallet();
        list(["cash_secured_put", "put_spread", "cash_put"]);
        render(<EasyTrade />);
        chooseBuy();
        fireEvent.change(select("Direction"), { target: { value: "below" } });
        chooseSpread();
        fireEvent.click(screen.getByRole("tab", { name: "To $0 (cash put)" }));
        expect(screen.getByText("Buy a cash put")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Get quote/ }));
        const submit = mocks.context.submitRfq as ReturnType<typeof vi.fn>;
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({
          side: "buy", terms: { type: "cash_put", strike: expect.any(Number) },
        }));
      });

      it("hides the cash put where the market does not list it", () => {
        list(["cash_secured_put", "put_spread"]);
        render(<EasyTrade />);
        chooseBuy();
        fireEvent.change(select("Direction"), { target: { value: "below" } });
        chooseSpread();
        expect(screen.queryByRole("tab", { name: "To $0 (cash put)" })).toBeNull();
      });
    });

    it("maps below to a bought put on the put market", () => {
      connectWallet();
      render(<EasyTrade />);
      chooseBuy();
      fireEvent.change(select("Direction"), { target: { value: "below" } });
      expect(screen.getByText("Buy a put")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Get quote/ }));
      expect(mocks.context.submitRfq).toHaveBeenCalledWith(expect.objectContaining({
        market: "put-soon", side: "buy", terms: { type: "cash_secured_put", strike: 95e9 },
      }));
    });

    it("quotes a strike whose indicative is missing or stale, and an empty USDC balance does not block it", () => {
      connectWallet();
      mocks.balance = 0;
      mocks.context = { ...mocks.context, tokenMarketsInfo: { underlyingMint: SOL, data: snapshot({ stale: true }) } };
      render(<EasyTrade />);
      chooseBuy();
      expect((screen.getByRole("button", { name: /Get quote/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("still enforces the size rule, in the asset", () => {
      connectWallet();
      render(<EasyTrade />);
      chooseBuy();
      fireEvent.change(screen.getByLabelText("Amount in SOL"), { target: { value: "101" } });
      expect((screen.getByRole("button", { name: /Above max/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("drops a typed amount and strike when switching side and goes back to the selling sentence", () => {
      render(<EasyTrade />);
      chooseBuy();
      fireEvent.change(screen.getByLabelText("Amount in SOL"), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("tab", { name: "Sell" }));
      expect(screen.getByText("If I deposit")).toBeTruthy();
      expect(screen.getByLabelText("Amount in USDC")).toBeTruthy();
    });

    it("falls to the direction whose option has markets, which flips against selling", () => {
      const data = snapshot();
      mocks.context = { ...mocks.context, tokenMarketsInfo: { underlyingMint: SOL, data: { ...data, markets: data.markets.filter((m) => m.is_put) } } };
      render(<EasyTrade />);
      chooseBuy();
      expect(screen.getByText("Buy a put")).toBeTruthy();
    });
  });
});
