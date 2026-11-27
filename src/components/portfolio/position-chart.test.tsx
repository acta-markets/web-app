import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PositionInfo } from "@/lib/rfq-client";
import { buildPositionRows, canChartRow } from "@/lib/portfolio-positions";
import { PositionChart, PositionChartModal } from "./position-chart";

// The chart is Trade's own and is tested there; here it is what a position hands it.
const drawn = vi.hoisted(() => vi.fn());
vi.mock("@/components/trade/sentence/thesis-chart", () => ({
  ThesisChart: (props: Record<string, unknown>) => {
    drawn(props);
    return <div data-testid="thesis-chart" />;
  },
}));

const NOV28 = Math.floor(Date.UTC(2026, 10, 28, 8, 0, 0) / 1000);
const NOW = (NOV28 - 2 * 86400 - 3 * 3600) * 1000;

function pos(over: Record<string, unknown> = {}): PositionInfo {
  return {
    pda: "p1",
    market_pda: "m1",
    underlying_mint: "sol-mint",
    underlying_decimals: 9,
    quote_mint: "usdc-mint",
    quote_decimals: 6,
    terms: { type: "cash_secured_put", strike: "150000000000" },
    side: "sell",
    quantity: "8000000000",
    price: "2400000000",
    total_premium: "19200000",
    created_at: NOV28 - 7 * 86400,
    expiry_ts: NOV28,
    underlying_price: { type: "unavailable" },
    state: "open",
    ...over,
  } as unknown as PositionInfo;
}

const row = (over: Record<string, unknown> = {}, price: number | null = 148) =>
  buildPositionRows([pos(over)], () => "SOL", NOW, price == null ? undefined : () => price * 1e9)[0];
const last = () => drawn.mock.calls[drawn.mock.calls.length - 1][0];

afterEach(() => {
  cleanup();
  drawn.mockClear();
});

describe("a position on the chart", () => {
  it("draws a sold put as Trade drew it: above its strike, with the profit at each price", () => {
    render(<PositionChart row={row()} />);
    expect(last()).toMatchObject({
      readOnly: true,
      symbol: "SOL",
      spot: 148,
      strike: 150,
      expiryMs: NOV28 * 1000,
      direction: "above",
      side: "sell",
      // the row's own size and premium: the rail then agrees with the row's uPnL
      pnl: { side: "sell", quantity: 8, premium: 19.2 },
      previewStrike: null,
      right: { title: "Keep your USDC" },
      wrong: { title: "Buy SOL at $150" },
    });
    expect(last().zoneWords).toBeUndefined();
    // nothing a position's chart can change
    expect(last().onDirection).toBeUndefined();
    expect(last().strikes).toBeUndefined();
    expect(last().onStrike).toBeUndefined();
  });

  it("draws a bought call above its strike, with what was paid as the premium", () => {
    render(<PositionChart row={row({ terms: { type: "covered_call", strike: "160000000000" }, side: "buy", quantity: "2000000000", price: "1500000000" }, 171)} />);
    expect(last()).toMatchObject({
      direction: "above",
      side: "buy",
      strike: 160,
      spot: 171,
      pnl: { side: "buy", quantity: 2, premium: 3 },
      right: { title: "SOL above $160 \u2014 profit" },
    });
    expect(last().zoneWords).toBeUndefined();
  });

  it("draws a bought put below its strike", () => {
    render(<PositionChart row={row({ side: "buy" })} />);
    expect(last()).toMatchObject({ direction: "below", side: "buy", strike: 150 });
  });

  it("draws a sold put spread with its far leg, prices only, and says the wrong side pays out", () => {
    const spread = row({ terms: { type: "put_spread", lower_strike: "130000000000", upper_strike: "145000000000" }, quantity: "20000000000", price: "1100000000", total_premium: "22000000" });
    render(<PositionChart row={spread} />);
    expect(last()).toMatchObject({
      direction: "above",
      side: "sell",
      // the sentence's strike is the near leg; the far one is the dashed line
      strike: 145,
      previewStrike: 130,
      // the rail's sum does not stop at the far leg, so it gives no profit figures here
      pnl: null,
      // cash-settled: nothing is bought at the strike
      zoneWords: { right: "YIELD ZONE", wrong: "YOU PAY OUT" },
      right: { title: "Keep the premium" },
      wrong: { title: "Pay out past $145" },
    });
  });

  it("gives the rail no profit figures when the premium is unknown", () => {
    render(<PositionChart row={{ ...row(), premiumNum: null }} />);
    expect(last().pnl).toBeNull();
  });

  it("draws nothing without a current price", () => {
    const { container } = render(<PositionChart row={row({}, null)} />);
    expect(container.innerHTML).toBe("");
    expect(drawn).not.toHaveBeenCalled();
  });
});

describe("the position's chart window", () => {
  it("is titled with the position's sentence and carries the row's figures under the chart", () => {
    render(<PositionChartModal row={row()} nowMs={NOW} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "SOL ends above $150 by Nov 28" });
    expect(dialog.querySelector('[data-testid="thesis-chart"]')).toBeTruthy();
    const facts = [...dialog.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]);
    expect(facts).toEqual([
      ["Position", "Secured put"],
      ["Size", "8 SOL"],
      ["Premium", "$19.20"],
      // SOL at $148 under a $150 put: 8 x $2 against the $19.20 collected
      ["uPnL", "+$3.20"],
      ["Expiry", "2d 3h"],
    ]);
  });

  it("names both strikes of a spread", () => {
    const spread = row({ terms: { type: "put_spread", lower_strike: "130000000000", upper_strike: "145000000000" } });
    render(<PositionChartModal row={spread} nowMs={NOW} onClose={() => {}} />);
    expect(screen.getByText("Put spread 130/145")).toBeTruthy();
  });
});

describe("which positions have a chart", () => {
  it("is an open one with a current price and an expiry still ahead", () => {
    expect(canChartRow(row(), NOW)).toBe(true);
    expect(canChartRow(row({ state: "funded" }), NOW)).toBe(true);
    // no price to put the NOW mark on
    expect(canChartRow(row({}, null), NOW)).toBe(false);
    // past its expiry, waiting to settle, or closed
    expect(canChartRow(row(), (NOV28 + 1) * 1000)).toBe(false);
    expect(canChartRow(row({ state: "terminal_pending" }), NOW)).toBe(false);
    expect(canChartRow(row({ state: "settled", settlement: { type: "physical", settlement_price: "149000000000", is_otm: false } }), NOW)).toBe(false);
  });

  it("carries the numbers the chart draws", () => {
    expect(row()).toMatchObject({ strikeNum: 150, farStrikeNum: null, markNum: 148, cashSettled: false });
    expect(row({ terms: { type: "call_spread", lower_strike: "100000000000", upper_strike: "120000000000" } })).toMatchObject({ strikeNum: 100, farStrikeNum: 120, cashSettled: true });
    expect(row({}, null).markNum).toBeNull();
  });
});
