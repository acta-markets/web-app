import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceStrip } from "./performance-strip";
import type { OpenWrittenApr, PnlSummary, TradingStats } from "@/lib/portfolio-pnl";

vi.mock("@/lib/share/render", () => ({
  SHARE_CARD_SIZE: { width: 1200, height: 675 },
  renderShareCard: async () => new Blob(["png"], { type: "image/png" }),
}));
URL.createObjectURL = () => "blob:card";
URL.revokeObjectURL = () => {};

const pnl: PnlSummary = { realized: -6, unrealized: 4.5, hasUnrealizedMark: true, wins: 1, losses: 2, breakEven: 0, settledCount: 3 };
const apr: OpenWrittenApr = { aprPct: 18.4, collateralUsd: 300, writtenCount: 3 };
const trading: TradingStats = { collectedUsd: 20, paidUsd: 7, openSells: 2, openBuys: 1, sellCount: 5, buyCount: 2 };

describe("PerformanceStrip", () => {
  afterEach(cleanup);

  it("shares the card's figures as an image once there is a P&L to show", async () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} referralCode="TIM" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const dialog = screen.getByRole("dialog", { name: "Share your P&L" });
    const img = await within(dialog).findByRole("img");
    expect(img.getAttribute("alt")).toMatch(/^Net P&L -\$1\.50\. Realised -\$6\.00, Unrealised \+\$4\.50, APR 18\.40%, Premium collected \$20\.00/);
    const post = new URL(within(dialog).getByRole("link", { name: "Share on X" }).getAttribute("href")!);
    expect(post.searchParams.get("url")).toBe(`${window.location.origin}/?ref=TIM`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no Share before there is a P&L figure", () => {
    const none: PnlSummary = { realized: 0, unrealized: null, hasUnrealizedMark: false, wins: 0, losses: 0, breakEven: 0, settledCount: 0 };
    render(<PerformanceStrip pnl={none} apr={apr} trading={trading} unavailable={false} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("leads with net P&L and shows the realised/unrealised split", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} />);
    expect(screen.getByText("Net P&L")).toBeTruthy();
    expect(screen.getByText("-$1.50")).toBeTruthy(); // -6 + 4.5
    expect(screen.getByText("-$6.00")).toBeTruthy();
    expect(screen.getByText("+$4.50")).toBeTruthy();
    // each half says what it covers
    expect(screen.getByText("3 closed")).toBeTruthy();
    expect(screen.getByText("3 open")).toBeTruthy();
  });

  it("shows the weighted APR and its basis", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} />);
    expect(screen.getByText("18.40%")).toBeTruthy();
    expect(screen.getByText("On 3 sold positions")).toBeTruthy();
  });

  it("explains a figure on hover, focus or tap, not in a title attribute", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} />);
    expect(document.querySelector("[title]")).toBeNull();
    fireEvent.pointerEnter(screen.getByRole("button", { name: "About APR" }), { pointerType: "mouse" });
    expect(screen.getByRole("tooltip").textContent).toMatch(/Annualised premium over collateral/);
  });

  it("shows premium collected and paid", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} />);
    expect(screen.getByText("$20.00")).toBeTruthy();
    expect(screen.getByText("Premium collected")).toBeTruthy();
    expect(screen.getByText("$7.00 paid")).toBeTruthy();
  });

  it("shows em dashes, never zeros, without a mark or APR", () => {
    const noMark = { ...pnl, realized: 0, unrealized: null, hasUnrealizedMark: false, wins: 0, losses: 0, settledCount: 0 };
    const noApr = { aprPct: null, collateralUsd: 0, writtenCount: 0 };
    const noTrades = { collectedUsd: 0, paidUsd: 0, openSells: 0, openBuys: 0, sellCount: 0, buyCount: 0 };
    render(<PerformanceStrip pnl={noMark} apr={noApr} trading={noTrades} unavailable={false} />);
    expect(screen.getAllByText("—")).toHaveLength(5);
    expect(screen.getByText("No open sold positions")).toBeTruthy();
    expect(document.body.textContent).not.toContain("$0");
  });

  it("says when the figures could not be loaded", () => {
    render(<PerformanceStrip pnl={null} apr={null} trading={null} unavailable />);
    expect(screen.getByText("Performance unavailable.")).toBeTruthy();
  });

  it("says when realised figures only cover the loaded history", () => {
    render(<PerformanceStrip pnl={pnl} apr={apr} trading={trading} unavailable={false} incomplete />);
    expect(screen.getByText(/cover the history loaded so far/)).toBeTruthy();
  });
});
