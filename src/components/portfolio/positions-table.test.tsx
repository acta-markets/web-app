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
import { fundingSummary } from "@/lib/portfolio-positions";
import { PositionsTable } from "./positions-table";

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
    // The date lives in its own column, so the cell keeps only the claim and a title holds
    // the whole sentence for assistive tech and hover.
    expect(screen.getByText("ends below $150")).toBeTruthy();
    expect(screen.getByTitle("SOL ends below $150 by Nov 28")).toBeTruthy();
    // The lifecycle state is still announced, but the visible label is the product type.
    expect(screen.getByText("Covered call")).toBeTruthy();
    expect(screen.getByText(/, Open/)).toBeTruthy();
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
