import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PositionInfo } from "@/lib/rfq-client";
import {
  buildPositionRows,
  directionWord,
  positionSentence,
  sortPositions,
  stateLabel,
  thesisStrike1e9,
} from "@/lib/portfolio-positions";
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
    terms: { type: "covered_call", strike: 150e9 },
    side: "sell",
    quantity: 1e9,
    price: 1e9,
    total_premium: 2e6,
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
    expect(directionWord(pos({ terms: { type: "covered_call", strike: 150e9 }, side: "sell" }))).toBe("below");
    expect(directionWord(pos({ terms: { type: "covered_call", strike: 150e9 }, side: "buy" }))).toBe("above");
    expect(directionWord(pos({ terms: { type: "cash_secured_put", strike: 150e9 }, side: "sell" }))).toBe("above");
    expect(directionWord(pos({ terms: { type: "cash_secured_put", strike: 150e9 }, side: "buy" }))).toBe("below");
  });

  it("names the near leg as the thesis strike for spreads", () => {
    expect(thesisStrike1e9(pos({ terms: { type: "call_spread", lower_strike: 150e9, upper_strike: 180e9 } }))).toBe(150e9);
    expect(thesisStrike1e9(pos({ terms: { type: "put_spread", lower_strike: 100e9, upper_strike: 120e9 } }))).toBe(120e9);
    expect(thesisStrike1e9(pos({ terms: { type: "cash_put", strike: 50e9 } }))).toBe(50e9);
  });
});

describe("state label", () => {
  it("folds expired and redeemed outcomes into settled, honestly", () => {
    expect(stateLabel(pos({ state: "settled", settlement: { type: "not_exercised", settlement_price: 150e9 } }))).toBe("Expired");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "physical", settlement_price: 150e9, is_otm: true } }))).toBe("Expired");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "physical", settlement_price: 150e9, is_otm: false } }))).toBe("Settled");
    expect(stateLabel(pos({ state: "settled", settlement: { type: "cash", settlement_price: 150e9, holder_payoff: 0, writer_return: 0 } }))).toBe("Settled");
    expect(stateLabel(pos({ state: "liquidated" }))).toBe("Liquidated");
    expect(stateLabel(pos({ state: "terminal_pending" }))).toBe("Settling");
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
        pos({ pda: "settled", state: "settled", settlement: { type: "physical", settlement_price: 150e9, is_otm: true }, created_at: NOV28 - 100 }),
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

  it("teaches the empty state instead of shrugging", () => {
    render(<PositionsTable rows={[]} nowMs={NOV28 * 1000} grouped={false} />);
    expect(screen.getByText("No positions yet")).toBeTruthy();
    expect(screen.getByText(/after an RFQ fills/)).toBeTruthy();
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
      pos({ pda: `p${i}`, market: i % 2 === 0 ? "m1" : "m2" }),
    );
    const symbolFor = (p: { market: string }) => (p.market === "m1" ? "SOL" : "HYPE");
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

  it("announces the sort direction on sortable headers", () => {
    render(<PositionsTable rows={buildPositionRows([pos()], () => "SOL", NOV28 * 1000)} nowMs={NOV28 * 1000} grouped={false} />);
    const size = screen.getByRole("button", { name: "Size" });
    fireEvent.click(size);
    expect(size.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(size);
    expect(size.closest("th")?.getAttribute("aria-sort")).toBe("descending");
  });

  it("recesses settled rows while keeping them readable", () => {
    const settled = pos({ pda: "s", state: "settled", settlement: { type: "physical", settlement_price: 150e9, is_otm: true } });
    render(<PositionsTable rows={buildPositionRows([settled], () => "SOL", NOV28 * 1000)} nowMs={NOV28 * 1000} grouped={false} />);
    expect(screen.getByText(/, Expired/).closest("tr")?.className).toContain("bg-action-secondary/20");
  });

  it("surfaces a deposit action for a bought position that can still be exercised", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    const rows = buildPositionRows([buy], () => "SOL", (NOV28 - 3600) * 1000);
    const deposit = { pending: null, funded: new Set<string>(), deposit: vi.fn() };
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
    const deposit = { pending: null, funded: new Set<string>(), deposit: vi.fn() };
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

    expect(screen.getByText(/Deposit 150\.00 USDC/)).toBeTruthy();
    expect(screen.getByText(/before Nov 28/)).toBeTruthy();
    expect(screen.getByText(/not exercised and the premium is lost/)).toBeTruthy();
    // Funding is what converts the mark into a realised result.
    expect(screen.getByText(/turns your uPnL into realised/)).toBeTruthy();
  });

  it("names the underlying units as the deposit for a bought put", () => {
    const put = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28, terms: { type: "cash_secured_put", strike: 150e9 } });
    const deposit = { pending: null, funded: new Set<string>(), deposit: vi.fn() };
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

    expect(screen.getByText(/Deposit 1 SOL/)).toBeTruthy();
  });

  it("does not surface the funding tooltip for a sold position", () => {
    const sold = pos();
    render(
      <PositionsTable
        rows={buildPositionRows([sold], () => "SOL", (NOV28 - 3600) * 1000)}
        nowMs={(NOV28 - 3600) * 1000}
        grouped={false}
        deposit={{ pending: null, funded: new Set<string>(), deposit: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button", { name: "How funding this position works" })).toBeNull();
  });

  it("does not surface the funding tooltip for an already-funded position", () => {
    const buy = pos({ side: "buy", market_pda: "m1", expiry_ts: NOV28 });
    const deposit = { pending: null, funded: new Set<string>(["p1"]), deposit: vi.fn() };
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
