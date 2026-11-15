import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WalletPositionSummary } from "@/lib/portfolio-api";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { IncomeCard } from "./income-card";

vi.mock("./portfolio-earnings-chart", () => ({ PortfolioEarningsChart: ({ range }: { range: string }) => <div data-testid="income-chart">{range}</div> }));
afterEach(cleanup);

const NOW = Date.parse("2026-11-16T15:00:00Z") / 1000;
const summary: WalletPositionSummary = {
  quote_mint: TOKENS.USDC.mint[getNetwork()],
  quote_decimals: 6,
  premium_all_time: "1536000000",
  premium_30d: "352000000",
  open_positions: 3,
  daily: [
    { day: "2026-10-25", premium: "200000000" },
    { day: "2026-11-05", premium: "82000000" },
    { day: "2026-11-12", premium: "50000000" },
    { day: "2026-11-15", premium: "20000000" },
  ],
};
const header = () => screen.getByText(/all time/).textContent;

describe("IncomeCard", () => {
  it("shows all time and the chart's range, and the second total follows the 7D / 30D switch", () => {
    render(<IncomeCard summaries={[summary]} quoteMint="" onQuoteMint={() => {}} state="ready" nowSec={NOW} />);
    expect(header()).toBe("$1,536.00 all time · $352.00 in the last 30 days");
    expect(screen.getByTestId("income-chart").textContent).toBe("30d");

    fireEvent.click(screen.getByRole("tab", { name: "7D" }));
    // the two buckets inside the week; all time does not move
    expect(header()).toBe("$1,536.00 all time · $70.00 in the last 7 days");
    expect(screen.getByTestId("income-chart").textContent).toBe("7d");

    fireEvent.click(screen.getByRole("tab", { name: "30D" }));
    expect(header()).toBe("$1,536.00 all time · $352.00 in the last 30 days");
  });

  it("says zero for a week with nothing collected in it", () => {
    render(<IncomeCard summaries={[{ ...summary, daily: summary.daily.slice(0, 2) }]} quoteMint="" onQuoteMint={() => {}} state="ready" nowSec={NOW} />);
    fireEvent.click(screen.getByRole("tab", { name: "7D" }));
    expect(header()).toBe("$1,536.00 all time · $0.00 in the last 7 days");
  });
});
