import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PositionInfo } from "@/lib/rfq-client";
import {
  DEFAULT_SORT,
  buildPositionRows,
  directionWord,
  nextSort,
  outcomeLabel,
  positionSentence,
  sortPositions,
  stateLabel,
  thesisStrike1e9,
} from "@/lib/portfolio-positions";
import { canWithdrawRow, fundingSummary, isWorthExercising, markWithdrawn } from "@/lib/portfolio-positions";
import { PositionsTable } from "./positions-table";

vi.mock("@/lib/share/render", () => ({
  SHARE_CARD_SIZE: { width: 1200, height: 675 },
  renderShareCard: async () => new Blob(["png"], { type: "image/png" }),
}));
URL.createObjectURL = () => "blob:card";
URL.revokeObjectURL = () => {};

const NOV28 = Math.floor(Date.UTC(2026, 10, 28, 8, 0, 0) / 1000);
const DEC5 = Math.floor(Date.UTC(2026, 11, 5, 8, 0, 0) / 1000);

function pos(over: Record<string, unknown> = {}): PositionInfo {
  return {
    pda: "p1",
    market_pda: "m1",
    underlying_mint: "sol-mint",
    underlying_decimals: 9,
    quote_mint: "usdc-mint",
    quote_decimals: 6,
    terms: { type: "covered_call", strike: "150000000000" },
    side: "sell",
    quantity: "1000000000",
    price: "1000000000",
    total_premium: "2000000",
    created_at: NOV28 - 86400,
    expiry_ts: NOV28,
    underlying_price: { type: "unavailable" },
    state: "open",
    ...over,
  } as unknown as PositionInfo;
}

describe("position sentence", () => {
  it("renders the product sentence with the asset, direction, strike and expiry", () => {
    expect(positionSentence("SOL", pos())).toBe("SOL ends below $150 by Nov 28");
  });

  it("derives the direction from the side and product", () => {
    expect(directionWord(pos({ terms: { type: "covered_call", strike: "150000000000" }, side: "sell" }))).toBe("below");
    expect(directionWord(pos({ terms: { type: "covered_call", strike: "150000000000" }, side: "buy" }))).toBe("above");
    expect(directionWord(pos({ terms: { type: "cash_secured_put", strike: "150000000000" }, side: "sell" }))).toBe("above");
    expect(directionWord(pos({ terms: { type: "cash_secured_put", strike: "150000000000" }, side: "buy" }))).toBe("below");
  });

  it("names the near leg as the thesis strike for spreads", () => {
    expect(thesisStrike1e9(pos({ terms: { type: "call_spread", lower_strike: "150000000000", upper_strike: "180000000000" } }))).toBe(150e9);
    expect(thesisStrike1e9(pos({ terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" } }))).toBe(120e9);
    expect(thesisStrike1e9(pos({ terms: { type: "cash_put", strike: "50000000000" } }))).toBe(50e9);
  });
});

describe("state label", () => {
  it("folds expired and redeemed outcomes into settled, honestly", () => {
    expect(stateLabel(pos({ state: "settled", settlement: { type: "not_exercised", settlement_price: "150000000000" } }))).toBe("Expired");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "physical", settlement_price: "150000000000", is_otm: true } }))).toBe("Expired");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "physical", settlement_price: "150000000000", is_otm: false } }))).toBe("Settled");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "cash", settlement_price: "150000000000", holder_payoff: "0", writer_return: "0" } }))).toBe("Settled");
    expect(stateLabel(pos({ state: "liquidated" }))).toBe("Liquidated");
    expect(stateLabel(pos({ state: "terminal_pending" }))).toBe("Settling");
  });
});

describe("outcome and product labels", () => {
  it("says how a closed position ended, in the trade page's words", () => {
    const physical = (is_otm: boolean, side = "sell") => pos({ side, state: "settled", settlement: { type: "physical", settlement_price: "150000000000", is_otm } });
    expect(outcomeLabel(pos())).toBeNull();
    expect(outcomeLabel(physical(true))).toBe("Expired");
    expect(outcomeLabel(physical(false))).toBe("Converted");
    expect(outcomeLabel(physical(false, "buy"))).toBe("Exercised");
    expect(outcomeLabel(pos({ side: "buy", state: "settled", settlement: { type: "not_exercised", settlement_price: "160000000000" } }))).toBe("Not exercised");
    expect(outcomeLabel(pos({ state: "settled", settlement: { type: "cash", settlement_price: "110000000000", holder_payoff: "10000000", writer_return: "10000000" } }))).toBe("Paid out");
    expect(outcomeLabel(pos({ state: "settled", settlement: { type: "cash", settlement_price: "130000000000", holder_payoff: "0", writer_return: "20000000" } }))).toBe("Expired");
    expect(outcomeLabel(pos({ state: "liquidated" }))).toBe("Liquidated");
  });

  it("names a spread as a spread, with both strikes, never as a single option", () => {
    const [putSpread] = buildPositionRows([pos({ terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" } })], () => "SOL", NOV28 * 1000);
    expect(putSpread.productLabel).toBe("Put spread");
    expect(putSpread.legsText).toBe("100/120");
    const [callSpread] = buildPositionRows([pos({ side: "buy", terms: { type: "call_spread", lower_strike: "150000000000", upper_strike: "180000000000" } })], () => "SOL", NOV28 * 1000);
    expect(callSpread.productLabel).toBe("Call spread");
    const [single] = buildPositionRows([pos()], () => "SOL", NOV28 * 1000);
    expect(single.legsText).toBeNull();
  });
});

describe("sort order", () => {
  it("opens amounts largest first and dates soonest first, and the third click returns to risk order", () => {
    const size = nextSort(DEFAULT_SORT, "size");
    expect(size).toEqual({ key: "size", dir: "desc" });
    expect(nextSort(size, "size")).toEqual({ key: "size", dir: "asc" });
    expect(nextSort(nextSort(size, "size"), "size")).toEqual(DEFAULT_SORT);
    expect(nextSort(DEFAULT_SORT, "expiry")).toEqual({ key: "expiry", dir: "asc" });
    // switching column starts that column's own order
    expect(nextSort(size, "pnl")).toEqual({ key: "pnl", dir: "desc" });
  });
});

describe("positions table rows", () => {
  it("labels premium honestly by side", () => {
    const sold = buildPositionRows([pos()], () => "SOL", NOV28 * 1000);
    expect(sold[0].premiumLabel).toBe("collected");
    expect(sold[0].side).toBe("sell");
    const bought = buildPositionRows([pos({ side: "buy" })], () => "SOL", NOV28 * 1000);
    expect(bought[0].premiumLabel).toBe("paid");
  });

  it("sorts most-at-risk first: near-expiry open ahead of long-dated and settled", () => {
    const rows = buildPositionRows(
      [
        pos({ pda: "far", expiry_ts: DEC5 }),
        pos({ pda: "settled", state: "settled", settlement: { type: "physical", settlement_price: "150000000000", is_otm: true }, created_at: NOV28 - 100 }),
        pos({ pda: "near", expiry_ts: NOV28 }),
      ],
      () => "SOL",
      NOV28 * 1000,
    );
    expect(sortPositions(rows, "risk", "asc").map((r) => r.id)).toEqual(["near", "far", "settled"]);
  });
});

describe("PositionsTable", () => {
  afterEach(cleanup);

  it("points to the trade page when nothing is open", () => {
    render(<PositionsTable rows={[]} nowMs={NOV28 * 1000} grouped={false} />);
    expect(screen.getByText("No open positions")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to trade" }).getAttribute("href")).toBe("/trade");
  });

  it("shows the caller's empty message when given one", () => {
    render(<PositionsTable variant="history" rows={[]} nowMs={NOV28 * 1000} grouped={false} empty={<p>No closed positions yet.</p>} />);
    expect(screen.getByText("No closed positions yet.")).toBeTruthy();
    expect(screen.queryByText("No open positions")).toBeNull();
  });

  it("renders the sentence, side badge and state", () => {
    render(<PositionsTable rows={buildPositionRows([pos()], () => "SOL", NOV28 * 1000)} nowMs={NOV28 * 1000} grouped={false} />);
    // The row is one line: the cell shows only the claim. The date has its own column, and a
    // title holds the whole sentence and the product for hover.
    expect(screen.getByText("ends below $150")).toBeTruthy();
    expect(screen.getByTitle("SOL ends below $150 by Nov 28 · Covered call")).toBeTruthy();
    // The product and the lifecycle state are still announced, but not drawn.
    expect(screen.getByText("Covered call").closest(".sr-only")).toBeTruthy();
    expect(screen.getByText(/, Open/).closest(".sr-only")).toBeTruthy();
  });

  it("folds a token group shut and opens it again", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      pos({ pda: `p${i}`, market_pda: i % 2 === 0 ? "m1" : "m2" }),
    );
    const symbolFor = (p: { market_pda: string }) => (p.market_pda === "m1" ? "SOL" : "HYPE");
    render(<PositionsTable rows={buildPositionRows(many, symbolFor, NOV28 * 1000)} nowMs={NOV28 * 1000} grouped />);
    const toggle = screen.getByRole("button", { name: /^SOL/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByText(/^ends /).length).toBeGreaterThan(1);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByText(/^ends /)).toHaveLength(4);
    fireEvent.click(toggle);
    expect(screen.getAllByText(/^ends /).length).toBeGreaterThan(4);
  });

  it("announces the sort direction on sortable headers and clears it on the third click", () => {
    render(<PositionsTable rows={buildPositionRows([pos()], () => "SOL", NOV28 * 1000)} nowMs={NOV28 * 1000} grouped={false} />);
    const size = screen.getByRole("button", { name: "Size" });
    fireEvent.click(size);
    expect(size.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(size);
    expect(size.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(size);
    expect(size.closest("th")?.getAttribute("aria-sort")).toBeNull();
  });

  it("shows a closed position's realised result, how it ended and the day it closed", () => {
    // sold a covered call at 150 for $2; it finished at 160, so the deposit converted: 2 - 10 = -8
    const converted = pos({ pda: "s", state: "settled", settlement: { type: "physical", settlement_price: "160000000000", is_otm: false } });
    render(<PositionsTable variant="history" rows={buildPositionRows([converted], () => "SOL", NOV28 * 1000)} nowMs={NOV28 * 1000} grouped={false} />);
    const result = screen.getByText("-$8.00");
    expect(result.className).toContain("text-additional-red-primary");
    expect(screen.getByText("Converted")).toBeTruthy();
    expect(screen.getByText("Nov 28")).toBeTruthy();
    // history has no live price, countdown or Fund action
    expect(screen.queryByText("Now")).toBeNull();
    expect(screen.getByRole("button", { name: "Result" })).toBeTruthy();
  });

  it("shows a spread's legs beside its name", () => {
    const spread = pos({ terms: { type: "put_spread", lower_strike: "100000000000", upper_strike: "120000000000" } });
    render(<PositionsTable rows={buildPositionRows([spread], () => "SOL", NOV28 * 1000)} nowMs={(NOV28 - 3600) * 1000} grouped={false} />);
    expect(screen.getByText("Put spread").textContent).toBe("Put spread 100/120");
  });

  it("says Settling once the expiry has passed instead of counting down to zero", () => {
    render(<PositionsTable rows={buildPositionRows([pos()], () => "SOL", NOV28 * 1000)} nowMs={(NOV28 + 60) * 1000} grouped={false} />);
    expect(screen.getByText("Settling")).toBeTruthy();
  });

  it("stacks each position into a block with a sort control on a phone", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
      const deposit = { pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn() };
      render(<PositionsTable rows={buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000)} nowMs={(NOV28 - 3600) * 1000} grouped={false} deposit={deposit} />);
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByText("ends above $150")).toBeTruthy();
      // the button has room to name the amount
      expect(screen.getByRole("button", { name: /^Fund/ }).textContent).toBe("Fund 150.00 USDC");
      const sortBySize = screen.getByRole("button", { name: "Size" });
      fireEvent.click(sortBySize);
      expect(sortBySize.getAttribute("aria-pressed")).toBe("true");
    } finally {
      window.matchMedia = original;
    }
  });

  it("surfaces a deposit action for a bought position that can still be exercised", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    const rows = buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000);
    const deposit = { pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn() };
    render(<PositionsTable rows={rows} nowMs={(NOV28 - 3600) * 1000} grouped={false} deposit={deposit} />);
    expect(screen.getByRole("button", { name: /^Fund/ })).toBeTruthy();
  });

  it("hides the deposit action without a deposit handler", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    render(<PositionsTable rows={buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000)} nowMs={(NOV28 - 3600) * 1000} grouped={false} />);
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("explains the Fund action with the deposit amount, deadline and consequence", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    const deposit = { pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn() };
    render(
      <PositionsTable
        rows={buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000)}
        nowMs={(NOV28 - 3600) * 1000}
        grouped={false}
        deposit={deposit}
      />,
    );

    const info = screen.getByRole("button", { name: "How funding this position works" });
    fireEvent.pointerEnter(info, { pointerType: "mouse" });

    expect(screen.getByText(/Fund it with 150\.00 USDC/)).toBeTruthy();
    expect(screen.getByText(/before Nov 28/)).toBeTruthy();
    expect(screen.getByText(/not exercised and the premium is lost/)).toBeTruthy();
    // Funding is what converts the mark into a realised result.
    expect(screen.getByText(/turns your uPnL into realised/)).toBeTruthy();
  });

  it("names the underlying units as the deposit for a bought put", () => {
    const put = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28, terms: { type: "cash_secured_put", strike: "150000000000" } });
    const deposit = { pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn() };
    render(
      <PositionsTable
        rows={buildPositionRows([put], () => "SOL", (NOV28 - 3600) * 1000)}
        nowMs={(NOV28 - 3600) * 1000}
        grouped={false}
        deposit={deposit}
      />,
    );

    const info = screen.getByRole("button", { name: "How funding this position works" });
    fireEvent.pointerEnter(info, { pointerType: "mouse" });

    expect(screen.getByText(/Fund it with 1 SOL/)).toBeTruthy();
  });

  it("does not surface the funding tooltip for a sold position", () => {
    const sold = pos();
    render(
      <PositionsTable
        rows={buildPositionRows([sold], () => "SOL", (NOV28 - 3600) * 1000)}
        nowMs={(NOV28 - 3600) * 1000}
        grouped={false}
        deposit={{ pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button", { name: "How funding this position works" })).toBeNull();
  });

  it("does not surface the funding tooltip for an already-funded position", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    const deposit = { pending: new Set<string>(), funded: new Set<string>(["p1"]), deposit: vi.fn() };
    render(
      <PositionsTable
        rows={buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000)}
        nowMs={(NOV28 - 3600) * 1000}
        grouped={false}
        deposit={deposit}
      />,
    );
    expect(screen.queryByRole("button", { name: "How funding this position works" })).toBeNull();
  });

  describe("a funded bought option", () => {
    const nowMs = (NOV28 - 3600) * 1000;
    const funded = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28, state: "funded" });
    const control = (over: Record<string, unknown> = {}) => ({ pending: new Set<string>(), funded: new Set<string>(), deposit: vi.fn(), withdraw: vi.fn(), ...over });
    const show = (deposit: ReturnType<typeof control> | undefined, at = nowMs) =>
      render(<PositionsTable rows={buildPositionRows([funded], () => "SOL", at)} nowMs={at} grouped={false} deposit={deposit} />);

    it("offers the deposit back, and announces that it is funded without drawing it twice", () => {
      const deposit = control();
      show(deposit);
      // the Withdraw button is what shows it; the word is for screen readers
      expect(screen.getByText("Funded").closest(".sr-only")).toBeTruthy();
      const button = screen.getByRole("button", { name: "Withdraw deposit, 150.00 USDC" });
      expect(button.textContent).toBe("Withdraw");
      fireEvent.click(button);
      expect(deposit.withdraw).toHaveBeenCalledWith({ pda: "p1", market: "m1" });
      expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
    });

    it("explains what taking the deposit back does", () => {
      show(control());
      fireEvent.pointerEnter(screen.getByRole("button", { name: "How withdrawing this deposit works" }), { pointerType: "mouse" });
      expect(screen.getByText(/Take 150\.00 USDC back any time before Nov 28/)).toBeTruthy();
      expect(screen.getByText(/not exercised and the premium is lost, unless you fund it again before expiry/)).toBeTruthy();
    });

    it("says Funded in the action cell, in sight, without a way to withdraw and after expiry", () => {
      show(control({ withdraw: undefined }));
      expect(screen.getByText("Funded").closest(".sr-only")).toBeNull();
      expect(screen.queryByRole("button", { name: /^Withdraw/ })).toBeNull();
      cleanup();
      show(control(), (NOV28 + 60) * 1000);
      expect(screen.getByText("Funded").closest(".sr-only")).toBeNull();
      expect(screen.queryByRole("button", { name: /^Withdraw/ })).toBeNull();
    });

    it("waits while anything is with the wallet, and says so on its own row", () => {
      show(control({ pending: new Set(["p1"]) }));
      const button = screen.getByRole("button", { name: /^Withdraw deposit/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe("Sending…");
    });

    it("names the amount on the button in the stacked phone layout", () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
      try {
        show(control());
        expect(screen.getByText("Funded")).toBeTruthy();
        expect(screen.getByRole("button", { name: /^Withdraw deposit/ }).textContent).toBe("Withdraw 150.00 USDC");
      } finally {
        window.matchMedia = original;
      }
    });
  });
});

describe("withdrawing a deposit", () => {
  const now = (NOV28 - 3600) * 1000;
  const call = (over: Record<string, unknown> = {}) => pos({ side: "buy", pda: "call", market_pda: "m-call", ...over });
  const row = (p: PositionInfo) => buildPositionRows([p], () => "SOL", now)[0];

  it("is for a funded bought option before expiry, funded on chain or in this session", () => {
    expect(canWithdrawRow(row(call({ state: "funded" })), now)).toBe(true);
    expect(canWithdrawRow(row(call()), now)).toBe(false);
    expect(canWithdrawRow(row(call()), now, new Set(["call"]))).toBe(true);
    expect(canWithdrawRow(row(call({ state: "funded", expiry_ts: NOV28 - 7200 })), now)).toBe(false);
    // a sold position is funded by its buyer: nothing of the writer's to take back
    expect(canWithdrawRow(row(pos({ state: "funded" })), now)).toBe(false);
  });

  it("reads as Open, and needs funding again, until the listener reports it", () => {
    const rows = buildPositionRows([call({ state: "funded" }), call({ pda: "other", state: "funded" })], () => "SOL", now);
    expect(fundingSummary(rows, now)).toBeNull();
    const after = markWithdrawn(rows, new Set(["call"]));
    expect(after.map((r) => r.state)).toEqual(["Open", "Funded"]);
    expect(fundingSummary(after, now)?.positions).toEqual([{ pda: "call", market: "m-call" }]);
    expect(canWithdrawRow(after[0], now)).toBe(false);
  });
});

describe("funding summary", () => {
  const now = (NOV28 - 3600) * 1000;
  const spot = () => 160e9;
  const call = (over: Record<string, unknown> = {}) => pos({ side: "buy", pda: "call", market_pda: "m-call", price: "5000000000", ...over });
  const put = (over: Record<string, unknown> = {}) => pos({ side: "buy", pda: "put", market_pda: "m-put", price: "3000000000", terms: { type: "cash_secured_put", strike: "150000000000" }, ...over });
  const rows = (positions: PositionInfo[]) => buildPositionRows(positions, () => "SOL", now, spot);

  it("is null when no bought option is waiting for a deposit", () => {
    expect(fundingSummary(rows([pos()]), now)).toBeNull();
    expect(fundingSummary(rows([call({ state: "funded" })]), now)).toBeNull();
    expect(fundingSummary(rows([call()]), now, new Set(["call"]))).toBeNull();
    expect(fundingSummary(rows([call({ expiry_ts: NOV28 - 7200 })]), now)).toBeNull();
    // a spread settles in cash and takes no deposit
    expect(fundingSummary(rows([pos({ side: "buy", terms: { type: "call_spread", lower_strike: "150000000000", upper_strike: "180000000000" } })]), now)).toBeNull();
  });

  it("adds deposits per token, counts what is in the money and takes the nearest deadline", () => {
    const summary = fundingSummary(rows([call({ quantity: "2000000000" }), put({ expiry_ts: NOV28 - 1800 }), pos()]), now)!;
    expect(summary.count).toBe(2);
    // soonest expiry first
    expect(summary.positions).toEqual([{ pda: "put", market: "m-put" }, { pda: "call", market: "m-call" }]);
    expect(summary.firstExpiryTs).toBe(NOV28 - 1800);
    // the put is funded with its 1 SOL, the call with 2 SOL at $150
    expect(summary.totals).toEqual([{ symbol: "SOL", amount: 1, usd: 160 }, { symbol: expect.stringMatching(/^USDC/), amount: 300, usd: 300 }]);
    // one figure for the lot: 1 SOL at the $160 spot plus 300 USDC
    expect(summary.totalUsd).toBe(460);
    // spot is $160: the $150 call is in the money, the $150 put is not
    expect(summary).toMatchObject({ inTheMoney: 1, priced: 2 });
    expect(summary.premiumPaid).toBe(13);
  });

  it("leaves in-the-money unknown without a price", () => {
    const summary = fundingSummary(buildPositionRows([call()], () => "SOL", now), now)!;
    expect(summary).toMatchObject({ inTheMoney: 0, priced: 0, count: 1 });
  });

  it("gives no dollar total when a token to fund has no price", () => {
    const summary = fundingSummary(buildPositionRows([call(), put()], () => "SOL", now), now)!;
    expect(summary.totals).toEqual([{ symbol: expect.stringMatching(/^USDC/), amount: 150, usd: 150 }, { symbol: "SOL", amount: 1, usd: null }]);
    expect(summary.totalUsd).toBeNull();
  });
});

describe("worth exercising", () => {
  const now = (NOV28 - 3600) * 1000;
  const at = (spot1e9: number) => (positions: PositionInfo[]) => buildPositionRows(positions, () => "SOL", now, () => spot1e9);
  const call = (over: Record<string, unknown> = {}) => pos({ side: "buy", pda: "call", ...over });
  const put = (over: Record<string, unknown> = {}) => pos({ side: "buy", pda: "put", terms: { type: "cash_secured_put", strike: "150000000000" }, ...over });

  it("is a bought option in the money at the current price: a call above its strike, a put below", () => {
    // spot $160 against a $150 strike
    const [c, p] = at(160e9)([call(), put()]);
    expect(isWorthExercising(c, now)).toBe(true);
    expect(isWorthExercising(p, now)).toBe(false);
    const [c2, p2] = at(140e9)([call(), put()]);
    expect(isWorthExercising(c2, now)).toBe(false);
    expect(isWorthExercising(p2, now)).toBe(true);
  });

  it("counts a funded one too, since it is the same answer to the same question", () => {
    expect(isWorthExercising(at(160e9)([call({ state: "funded" })])[0], now)).toBe(true);
  });

  it("is never a sold position, a spread, an expired option or one without a price", () => {
    expect(isWorthExercising(at(160e9)([pos()])[0], now)).toBe(false);
    expect(isWorthExercising(at(160e9)([pos({ side: "buy", terms: { type: "call_spread", lower_strike: "150000000000", upper_strike: "180000000000" } })])[0], now)).toBe(false);
    expect(isWorthExercising(at(160e9)([call({ expiry_ts: NOV28 - 7200 })])[0], now)).toBe(false);
    expect(isWorthExercising(buildPositionRows([call()], () => "SOL", now)[0], now)).toBe(false);
  });
});

describe("sharing an open position", () => {
  afterEach(cleanup);
  const NOW = (NOV28 - 3600) * 1000;
  // sold a covered call at $150 for $2; SOL at $140 keeps the premium, so uPnL is +$2.00
  const priced = () => buildPositionRows([pos()], () => "SOL", NOW, () => 140e9);

  it("opens the position's card from its row, with the uPnL as the headline", async () => {
    render(<PositionsTable rows={priced()} nowMs={NOW} grouped={false} share={{ referralCode: "TIM" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Share SOL position, uPnL +$2.00" }));
    const dialog = screen.getByRole("dialog", { name: "Share your position" });
    const img = await screen.findByRole("img", { name: /^Unrealised P&L/ });
    expect(img.getAttribute("alt")).toBe("Unrealised P&L +$2.00. SOL ends below $150 by Nov 28. Type Covered call, Now $140, Premium collected $2.00, Expires Nov 28. Devnet test funds");
    expect(dialog.contains(img)).toBe(true);
    const post = new URL(screen.getByRole("link", { name: "Share on X" }).getAttribute("href")!);
    const page = new URL(post.searchParams.get("url")!);
    expect(page.origin + page.pathname).toBe(`${window.location.origin}/share`);
    expect(page.searchParams.get("ref")).toBe("TIM");
    expect(page.searchParams.get("c")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has nothing to share without a current price, in history, or when sharing is not offered", () => {
    const share = () => screen.queryByRole("button", { name: /^Share SOL position/ });
    const { unmount } = render(<PositionsTable rows={buildPositionRows([pos()], () => "SOL", NOW)} nowMs={NOW} grouped={false} share={{}} />);
    expect(share()).toBeNull();
    unmount();
    const closed = render(<PositionsTable variant="history" rows={priced()} nowMs={NOW} grouped={false} share={{}} />);
    expect(share()).toBeNull();
    closed.unmount();
    render(<PositionsTable rows={priced()} nowMs={NOW} grouped={false} />);
    expect(share()).toBeNull();
  });

  it("offers it in the stacked phone layout too", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      render(<PositionsTable rows={priced()} nowMs={NOW} grouped={false} share={{}} />);
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByRole("button", { name: "Share SOL position, uPnL +$2.00" })).toBeTruthy();
    } finally {
      window.matchMedia = original;
    }
  });
});
