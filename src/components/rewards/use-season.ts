"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Season, SeasonBoard, SeasonSubjectResult } from "@acta-markets/ts-sdk/http";
import { usePolled, type Loadable } from "@/components/vaults/use-vaults";
import { NO_AWARDS, type WalletAwards } from "@/lib/rewards/api";
import { isRewardsSample, loadAwards, loadBoard, loadSeason, loadSubject } from "@/lib/rewards/source";
import { TRADER, boardHasMore, defaultLeagueId, seasonLeagues } from "@/lib/rewards/view";

/** Rows a board shows first, and how many each "Show more" adds. */
export const BOARD_PAGE = 25;
/** The most one request returns, so the most a board shows. */
export const BOARD_MAX = 500;

/** Sample mode, known only in the browser: false on the server and on the first paint. */
export function useRewardsSample(): boolean {
  const [sample, setSample] = useState(false);
  useEffect(() => setSample(isRewardsSample()), []);
  return sample;
}

export function useSeason(sample: boolean): Loadable<Season | null> {
  return usePolled((signal) => loadSeason(sample, signal), null, `season:${sample}`);
}

export function useSeasonSubject(sample: boolean, slug: string | null, wallet: string | null): Loadable<SeasonSubjectResult | null> {
  return usePolled(
    (signal) => loadSubject(sample, slug as string, wallet as string, signal),
    null,
    slug && wallet ? `subject:${sample}:${slug}:${wallet}` : null,
  );
}

export function useSeasonAwards(sample: boolean, slug: string | null, wallet: string | null): Loadable<WalletAwards> {
  return usePolled(
    (signal) => loadAwards(sample, slug as string, wallet as string, signal),
    NO_AWARDS,
    slug && wallet ? `awards:${sample}:${slug}:${wallet}` : null,
  );
}

export type BoardScope = "season" | number;

export type BoardState = {
  board: SeasonBoard | null;
  loading: boolean;
  failed: boolean;
  /** More rows can be asked for. */
  canLoadMore: boolean;
  loadMore: () => void;
};

/**
 * One board from its top. "Show more" asks for the same board with more rows rather than for
 * the next page: a board moves while it is open, and one request cannot repeat or skip a
 * trader at the seam between two.
 */
export function useSeasonBoard(sample: boolean, slug: string | null, scope: BoardScope | null, currency: string | null, wallet: string | null): BoardState {
  const key = slug && scope !== null && currency ? `board:${sample}:${slug}:${scope}:${currency}` : null;
  const [asked, setAsked] = useState({ key, rows: BOARD_PAGE });
  const rows = asked.key === key ? asked.rows : BOARD_PAGE;
  const { data, loading, error, refresh } = usePolled<SeasonBoard | null>(
    (signal) =>
      loadBoard(
        sample,
        slug as string,
        { scope: scope === "season" ? "season" : `league:${scope as number}`, role: TRADER, currency: currency as string, after_rank: 0, limit: rows },
        wallet,
        signal,
      ),
    null,
    key,
  );
  const loadMore = useCallback(() => {
    setAsked({ key, rows: Math.min(BOARD_MAX, rows + BOARD_PAGE) });
    refresh();
  }, [key, rows, refresh]);
  return {
    board: data,
    loading,
    failed: error !== null,
    canLoadMore: !!data && boardHasMore(data) && rows < BOARD_MAX,
    loadMore,
  };
}

export type RewardsTab = "rules" | "board" | "clans" | "awards";

export type RewardsUi = {
  leagueId: number | null;
  setLeagueId: (id: number) => void;
  tab: RewardsTab;
  setTab: (tab: RewardsTab) => void;
  /** The board, the clans and the awards look at the chosen league or at the whole season. */
  wide: boolean;
  setWide: (wide: boolean) => void;
  currency: string | null;
  setCurrency: (currency: string) => void;
  /** What the board is asked for, from the three choices above. */
  boardScope: BoardScope | null;
};

/** What the visitor has chosen on the page. A choice the season no longer offers falls back to the default. */
export function useRewardsUi(season: Season | null, nowSecs: number, mainnet: boolean): RewardsUi {
  const [chosenLeague, setLeagueId] = useState<number | null>(null);
  const [tab, setTab] = useState<RewardsTab>("rules");
  const [wide, setWide] = useState(false);
  const [chosenCurrency, setCurrency] = useState<string | null>(null);

  // only the leagues' ids and phases matter here, so the clock is not a dependency
  const fallback = useMemo(
    () => (season ? defaultLeagueId(seasonLeagues(season, nowSecs, { mainnet })) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [season, mainnet],
  );
  const leagueId = season?.leagues.some((l) => l.id === chosenLeague && l.phase.kind !== "draft") ? chosenLeague : fallback;
  const league = season?.leagues.find((l) => l.id === leagueId) ?? null;
  const currencies = league?.currencies ?? [];
  const currency = currencies.some((c) => c.id === chosenCurrency) ? chosenCurrency : (currencies[0]?.id ?? null);

  return {
    leagueId,
    setLeagueId,
    tab,
    setTab,
    wide,
    setWide,
    currency,
    setCurrency,
    boardScope: wide ? "season" : leagueId,
  };
}
