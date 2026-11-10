import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PositionCard, directionLabel, type PositionCardData } from "./position-card";

const card: PositionCardData = {
  id: "p1",
  long: false,
  type: "call",
  headline: "SOL 150 call",
  strike: "$150.00",
  expiryTs: 1_793_086_400,
  size: "2 SOL",
  premiumLabel: "$12.34",
  aprLabel: "18.20%",
  pnl: null,
};

describe("position card", () => {
  afterEach(cleanup);

  it("shows direction, underlying, strike, expiry, size, premium and APR at a glance", () => {
    render(<PositionCard data={card} />);
    expect(screen.getByText("Short call")).toBeTruthy();
    expect(screen.getByText("SOL 150 call")).toBeTruthy();
    expect(screen.getByText("$150.00")).toBeTruthy();
    expect(screen.getByText("2 SOL")).toBeTruthy();
    expect(screen.getByText("$12.34")).toBeTruthy();
    expect(screen.getByText("18.20%")).toBeTruthy();
  });

  it("marks P&L as unavailable when the position has no underlying price", () => {
    render(<PositionCard data={card} />);
    const pnl = screen.getByText("\u2014", { selector: "dd span[title]" });
    expect(pnl).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/P&L.*\+\$/);
  });

  it("shows unrealised P&L when a mark is available", () => {
    render(<PositionCard data={{ ...card, pnl: { valueUsd: 12.34, stale: false } }} />);
    expect(screen.getByText("+$12.34")).toBeTruthy();
  });

  it("flags a stale underlying mark", () => {
    render(<PositionCard data={{ ...card, pnl: { valueUsd: -2.5, stale: true } }} />);
    expect(screen.getByText("-$2.50")).toBeTruthy();
    expect(screen.getByTitle("Based on a stale underlying price.")).toBeTruthy();
  });

  it("renders the action slot for a buy's deposit control", () => {
    render(<PositionCard data={card} action={<button>Deposit</button>} />);
    expect(screen.getByRole("button", { name: "Deposit" })).toBeTruthy();
  });

  it("names long/short directions", () => {
    expect(directionLabel(true, "put")).toBe("Long put");
    expect(directionLabel(false, "call")).toBe("Short call");
  });
});
