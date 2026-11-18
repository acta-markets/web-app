"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Season, SeasonBoard, SeasonSubjectResult } from "@acta-markets/ts-sdk/http";
import type { Loadable } from "@/components/vaults/use-vaults";
import { publicKey, walletKey } from "@/lib/state/keys";
import { useResource, type ResourceOptions } from "@/lib/state/use-resource";
import { useViewPref } from "@/lib/state/view-prefs";
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

/** Sample data is made up: it gets keys of its own and is never saved to the device. */
const source = (sample: boolean) => (sample ? "sample" : "live");
const SEASON_SHOW_MS = 24 * 60 * 60 * 1000;

/** The season read, shared by the Rewards page and the sign-in welcome. `enabled: false` asks for nothing. */
export function seasonResource(sample: boolean, enabled = true): ResourceOptions<Season | null> {
  return {
    key: enabled ? publicKey("season", source(sample)) : null,
    load: (signal) => loadSeason(sample, signal),
    initial: null,
    persist: !sample,
    maxShowMs: SEASON_SHOW_MS,
  };
}

export function useSeason(sample: boolean): Loadable<Season | null> {
  return useResource(seasonResource(sample));
}

export function useSeasonSubject(sample: boolean, slug: string | null, wallet: string | null): Loadable<SeasonSubjectResult | null> {
  return useResource({
    key: slug && wallet ? walletKey(wallet, "season-subject", source(sample), slug) : null,
    load: (signal) => loadSubject(sample, slug as string, wallet as string, signal),
    initial: null,
    persist: !sample,
  });
}

export function useSeasonAwards(sample: boolean, slug: string | null, wallet: string | null): Loadable<WalletAwards> {
  return useResource({
    key: slug && wallet ? walletKey(wallet, "season-awards", source(sample), slug) : null,
    load: (signal) => loadAwards(sample, slug as string, wallet as string, signal),
    initial: NO_AWARDS,
    persist: !sample,
  });
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
 * trader at the seam between two. The rows already shown stay up while the longer list loads.
 */
export function useSeasonBoard(sample: boolean, slug: string | null, scope: BoardScope | null, currency: string | null, wallet: string | null): BoardState {
  const board = slug && scope !== null && currency ? `${source(sample)}:${slug}:${scope}:${currency}` : null;
  const [asked, setAsked] = useState({ board, rows: BOARD_PAGE });
  const rows = asked.board === board ? asked.rows : BOARD_PAGE;
  const { data, loading, error, placeholder } = useResource<SeasonBoard | null>({
    // the sample board puts the connected wallet on it, so there the wallet is part of the read
    key: board ? publicKey("season-board", board, rows, sample ? wallet : null) : null,
    load: (signal) =>
      loadBoard(
        sample,
        slug as string,
        { scope: scope === "season" ? "season" : `league:${scope as number}`, role: TRADER, currency: currency as string, after_rank: 0, limit: rows },
        wallet,
        signal,
      ),
    initial: null,
    // only the first page is worth keeping on the device
    persist: !sample && rows === BOARD_PAGE,
    maxShowMs: SEASON_SHOW_MS,
    keepPrevious: true,
  });
  const loadMore = useCallback(() => setAsked({ board, rows: Math.min(BOARD_MAX, rows + BOARD_PAGE) }), [board, rows]);
  // `keepPrevious` holds on to whatever was shown last, which after a change of board is another board's rows
  const shown = placeholder && asked.board !== board ? null : data;
  return {
    board: shown,
    loading: loading || placeholder,
    failed: error !== null,
    canLoadMore: !!shown && !placeholder && boardHasMore(shown) && rows < BOARD_MAX,
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
  // which tab, which scope and which points are habits, and come back on the next visit
  const [tab, setTab] = useViewPref("rewardsTab");
  const [wide, setWide] = useViewPref("rewardsWholeSeason");
  const [chosenCurrency, setCurrency] = useViewPref("rewardsCurrency");

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
