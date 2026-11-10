import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PnlSummary } from "./pnl-summary";
import type { PnlSummary as Summary } from "@/lib/portfolio-pnl";

const summary: Summary = { realized: -6, unrealized: null, hasUnrealizedMark: false, wins: 1, losses: 2, breakEven: 0, settledCount: 3 };

describe("PnlSummary", () => {
  afterEach(cleanup);

  it("shows realised, unavailable unrealised and win/loss, and names the derivation", () => {
    render(<PnlSummary summary={summary} />);
    expect(screen.getByText("Realised P&L")).toBeTruthy();
    expect(screen.getByText("-$6.00")).toBeTruthy();
    expect(screen.getByText("Unrealised P&L")).toBeTruthy();
    expect(screen.getByText("no underlying price")).toBeTruthy();
    expect(screen.getByText("Win / Loss")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText(/if you executed now/)).toBeTruthy();
  });

  it("shows unrealised P&L when open positions carry a mark", () => {
    render(<PnlSummary summary={{ ...summary, unrealized: 4.5, hasUnrealizedMark: true }} />);
    expect(screen.getByText("+$4.50")).toBeTruthy();
    expect(screen.getByText("if executed now")).toBeTruthy();
  });

  it("colours a positive realised P&L green and a negative red", () => {
    const { rerender } = render(<PnlSummary summary={{ ...summary, realized: 12 }} />);
    expect(screen.getByText("+$12.00").className).toContain("text-additional-green-primary");
    rerender(<PnlSummary summary={{ ...summary, realized: -3 }} />);
    expect(screen.getByText("-$3.00").className).toContain("text-additional-red-primary");
  });

  it("shows a neutral placeholder before any settled position has loaded", () => {
    render(<PnlSummary summary={{ ...summary, realized: 0, wins: 0, losses: 0, settledCount: 0 }} />);
    expect(screen.getAllByText("\u2014").length).toBeGreaterThan(0);
  });

  it("falls back to an unavailable card when there is no summary", () => {
    render(<PnlSummary summary={null} />);
    expect(screen.getByText("Profit and loss unavailable.")).toBeTruthy();
  });
});
