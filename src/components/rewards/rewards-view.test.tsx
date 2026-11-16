import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_AWARDS } from "@/lib/rewards/api";
import { SAMPLE_TRADER, sampleAwards, sampleBoard, sampleSeason, sampleSubject } from "@/lib/rewards/sample-season";
import { boardHasMore } from "@/lib/rewards/view";
import { NoSeason } from "./rewards-parts";
import { RewardsView } from "./rewards-view";
import { useRewardsUi, type BoardState } from "./use-season";

const NOW = 1_800_000_000;
const season = sampleSeason(NOW);

afterEach(cleanup);

function Page({ wallet = SAMPLE_TRADER as string | null, ranked = true, loadMore = () => {}, board }: { wallet?: string | null; ranked?: boolean; loadMore?: () => void; board?: BoardState }) {
  const ui = useRewardsUi(season, NOW, false);
  const data =
    ui.boardScope !== null && ui.currency
      ? sampleBoard(season, { scope: ui.boardScope === "season" ? "season" : `league:${ui.boardScope}`, role: "taker", currency: ui.currency, after_rank: 0, limit: 25 }, wallet, NOW)
      : null;
  return (
    <RewardsView
      season={season}
      nowSecs={NOW}
      mainnet={false}
      wallet={wallet}
      walletLoading={false}
      subject={wallet && ranked ? sampleSubject(wallet) : null}
      awards={wallet && ranked ? sampleAwards(NOW) : NO_AWARDS}
      awardsFailed={false}
      ui={ui}
      board={board ?? { board: data, loading: false, failed: false, canLoadMore: !!data && boardHasMore(data), loadMore }}
      connect={<button type="button">Connect</button>}
    />
  );
}

const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("the Rewards page with a season", () => {
  it("opens on the live league that ends first, with its rules", () => {
    render(<Page />);
    expect(screen.getByRole("tab", { name: new RegExp(`^${season.leagues[1].name}`) }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Rules" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Long straddle")).toBeTruthy();
    expect(screen.getByText("2 hidden rules. Each shows here once someone earns it.")).toBeTruthy();
  });

  it("shows the trader's season total, rank and the three parts", () => {
    render(<Page />);
    const standing = within(screen.getByRole("region", { name: "Your points" }));
    expect(standing.getByText("134")).toBeTruthy();
    expect(standing.getByText("Rank 12 of 64")).toBeTruthy();
    expect(standing.getByText("Adjustments")).toBeTruthy();
    expect(standing.getByText("-5")).toBeTruthy();
  });

  it("ticks rules off from the wallet's awards and states the combo budget", () => {
    render(<Page />);
    const combos = within(screen.getByRole("region", { name: "Combos" }));
    expect(combos.getByText("30 of 30 trading points")).toBeTruthy();
    expect(combos.getAllByRole("img", { name: "Earned" }).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("region", { name: "Base" })).getByText("3 of 5")).toBeTruthy();
  });

  it("without a wallet shows the rules and boards, asks to connect, and marks nothing as earned", () => {
    render(<Page wallet={null} />);
    expect(screen.getByText(/Connect a wallet to see your points and rank/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /earned/i })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Combos" })).getByText("Up to 30 trading points")).toBeTruthy();
    tab("Board");
    expect(screen.getByRole("table", { name: "Traders by points" })).toBeTruthy();
    expect(screen.queryByText("You")).toBeNull();
    tab("My awards");
    expect(screen.getByText("Connect a wallet to see what it has earned.")).toBeTruthy();
  });

  it("sends a connected wallet with no points to Trade", () => {
    render(<Page ranked={false} />);
    expect(screen.getByText("No points yet", { selector: "div" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Trade" }).getAttribute("href")).toBe("/trade");
  });

  it("marks the trader's own row on the board and offers more rows", () => {
    const loadMore = vi.fn();
    render(<Page loadMore={loadMore} />);
    tab("Board");
    const row = screen.getByText("You").closest("tr")!;
    expect(within(row).getByText("9")).toBeTruthy();
    expect(within(row).getByText("59")).toBeTruthy();
    expect(screen.getByText("Provisional, updated 3m ago")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("repeats the trader's row under the board when it is further down than the rows shown", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${season.leagues[2].name}`) }));
    tab("Board");
    // rank 31 of 40, with 25 rows shown
    const own = screen.getByText("You").closest("tr")!;
    expect(own.parentElement?.tagName).toBe("TFOOT");
    expect(within(own).getByText("31")).toBeTruthy();
  });

  it("switches the board between the league and the season, and between currencies", () => {
    render(<Page />);
    tab("Board");
    tab("Season");
    expect(within(screen.getByText("You").closest("tr")!).getByText("134")).toBeTruthy();
    tab("Nice list");
    expect(within(screen.getByText("You").closest("tr")!).getByText("35")).toBeTruthy();
  });

  it("lists clans and says which do not qualify yet", () => {
    render(<Page />);
    tab("Clans");
    const table = within(screen.getByRole("table", { name: "Clans by points" }));
    expect(table.getByText("Theta Gang")).toBeTruthy();
    expect(table.getByText("2 of 4 entered. Not qualified yet")).toBeTruthy();
  });

  it("lists the wallet's awards for the league, and for the season on request", () => {
    render(<Page />);
    tab("My awards");
    expect(screen.getByText("Cap")).toBeTruthy();
    expect(screen.queryByText("P&L band")).toBeNull();
    tab("Season");
    expect(screen.getByText("P&L band")).toBeTruthy();
  });

  it("says so when the board cannot be loaded", () => {
    render(<Page board={{ board: null, loading: false, failed: true, canLoadMore: false, loadMore: () => {} }} />);
    tab("Board");
    expect(screen.getByRole("alert").textContent).toBe("The board could not be loaded.");
  });

  it("lets a finished league be opened from the past leagues", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: season.leagues[0].name }));
    tab("Board");
    expect(screen.getByText("Final")).toBeTruthy();
  });
});

describe("no season", () => {
  it("says none is running and points to Trade", () => {
    render(<NoSeason />);
    expect(screen.getByText("No season is running yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Trade" }).getAttribute("href")).toBe("/trade");
  });
});
