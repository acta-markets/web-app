import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PerformanceStrip } from "./performance-strip";
import type { OpenWrittenApr, PnlSummary, TradingStats } from "@/lib/portfolio-pnl";

const pnl: PnlSummary = { realized: -6, unrealized: 4.5, hasUnrealizedMark: true, wins: 1, losses: 2, breakEven: 0, settledCount: 3 };
const apr: OpenWrittenApr = { aprPct: 18.4, collateralUsd: 300, writtenCount: 3 };
const trading: TradingStats = { collectedUsd: 20, paidUsd: 7, openSells: 2, openBuys: 1, sellCount: 5, buyCount: 2 };

describe("PerformanceStrip", () => {
  afterEach(cleanup);

  it("leads with net P&L and shows the realised/unrealised split", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} hasPositions />);
    expect(screen.getByText("Net P&L")).toBeTruthy();
    expect(screen.getByText("-$1.50")).toBeTruthy(); // -6 + 4.5
    expect(screen.getByText("-$6.00")).toBeTruthy();
    expect(screen.getByText("+$4.50")).toBeTruthy();
  });

  it("shows the weighted APR and its basis", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} hasPositions />);
    expect(screen.getByText("18.40%")).toBeTruthy();
    expect(screen.getByText("Annualised premium over collateral · 3 written")).toBeTruthy();
  });

  it("shows collected/paid premium and the open split", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} hasPositions />);
    expect(screen.getByText("Buy / sell")).toBeTruthy();
    expect(screen.getByText("$20.00")).toBeTruthy();
    expect(screen.getByText("$7.00")).toBeTruthy();
    expect(screen.getByText("2 sell · 1 buy open")).toBeTruthy();
  });

  it("shows em dashes, never zeros, without a mark or APR", () => {
    const noMark = { ...pnl, realized: 0, unrealized: null, hasUnrealizedMark: false, wins: 0, losses: 0, settledCount: 0 };
    const noApr = { aprPct: null, collateralUsd: 0, writtenCount: 0 };
    const noTrades = { collectedUsd: 0, paidUsd: 0, openSells: 0, openBuys: 0, sellCount: 0, buyCount: 0 };
    render(<PerformanceStrip pnl={noMark} apr={noApr} trading={noTrades} unavailable={false} hasPositions />);
    expect(screen.getAllByText("\u2014").length).toBeGreaterThan(0);
    expect(screen.getByText("No open written positions")).toBeTruthy();
    expect(document.body.textContent).not.toContain("$0");
  });

  it("explains an empty portfolio and an unavailable one", () => {
    const { rerender } = render(<PerformanceStrip pnl={null} apr={null} trading={null} unavailable={false} hasPositions={false} />);
    expect(screen.getByText("No positions yet")).toBeTruthy();
    rerender(<PerformanceStrip pnl={null} apr={null} trading={null} unavailable hasPositions={false} />);
    expect(screen.getByText("Performance unavailable.")).toBeTruthy();
  });
});
