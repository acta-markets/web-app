"use client";

import { useEffect, useMemo, useState } from "react";
import type { Season, SeasonBoard } from "@acta-markets/ts-sdk/http";
import { AppButton } from "@/components/app-ui/app-button";
import { Chevron } from "@/components/app-ui/chevron";
import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { AppPill } from "@/components/app-ui/app-pill";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { LoadingStatus, NoSeason, RewardsSkeleton, SeasonFailed } from "@/components/rewards/rewards-parts";
import { RewardsView } from "@/components/rewards/rewards-view";
import { BOARD_PAGE, useRewardsUi, type BoardState } from "@/components/rewards/use-season";
import { NO_AWARDS } from "@/lib/rewards/api";
import { SAMPLE_TRADER, sampleAwards, sampleBoard, sampleSeason, sampleSubject } from "@/lib/rewards/sample-season";
import { TRADER, boardHasMore } from "@/lib/rewards/view";

type Scene = "live" | "disconnected" | "not-ranked" | "wallet-loading" | "settling" | "final" | "long" | "board-failed" | "loading" | "no-season" | "failed";
const SCENES: Array<{ value: Scene; label: string }> = [
  { value: "live", label: "Live, with points" },
  { value: "disconnected", label: "No wallet" },
  { value: "not-ranked", label: "No points yet" },
  { value: "wallet-loading", label: "Wallet loading" },
  { value: "settling", label: "Settling" },
  { value: "final", label: "Final" },
  { value: "long", label: "Long names" },
  { value: "board-failed", label: "Board failed" },
  { value: "loading", label: "Loading" },
  { value: "no-season", label: "No season" },
  { value: "failed", label: "Failed" },
];

const LONG = "The Extraordinarily Long Named League Of Devnet Traders";

/** The same season with names as long as a backend might ever send, to see what gives. */
function stretched(season: Season): Season {
  return {
    ...season,
    name: "Devnet leagues, the winter season of twenty twenty six",
    leagues: season.leagues.map((league) => ({
      ...league,
      name: `${LONG} ${league.id}`,
      currencies: league.currencies.map((c) => ({ ...c, title: `${c.title} of the season` })),
      rules: league.rules.map((rule, i) =>
        i % 3 === 0
          ? { ...rule, title: `${rule.title} with a considerably longer title than usual`, description: `${rule.description} ${rule.description} ${rule.description}` }
          : rule,
      ),
    })),
  };
}

function stretchedBoard(board: SeasonBoard): SeasonBoard {
  return {
    ...board,
    rows: board.rows.map((row) => (row.entrant.kind === "participant" ? { ...row, entrant: { ...row.entrant, display_name: `${row.entrant.display_name}_the_longest_display_name_on_the_board` } } : row)),
    clans: board.clans.map((clan) => ({ ...clan, name: `${clan.name} And Their Very Many Friends From Everywhere` })),
  };
}

/** The Rewards page from a sample season, composed the way `RewardsClient` composes it. */
export function RewardsGallery() {
  // `?scene=` picks the starting state, so each one can be opened (or screenshotted) directly.
  const [scene, setScene] = useState<Scene>("live");
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("scene");
    if (SCENES.some((s) => s.value === wanted)) setScene(wanted as Scene);
  }, []);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [rows, setRows] = useState(BOARD_PAGE);

  const season = useMemo(() => {
    const base = sampleSeason(now, scene === "settling" ? { nearest: { kind: "settling", pending: 3 } } : {});
    return scene === "long" ? stretched(base) : base;
  }, [now, scene]);
  const ui = useRewardsUi(season, now, false);
  // the Final scene is about a finished league: open on it
  const { setLeagueId, setTab } = ui;
  useEffect(() => {
    if (scene === "final") {
      setLeagueId(1);
      setTab("board");
    } else if (scene === "board-failed") setTab("board");
  }, [scene, setLeagueId, setTab]);

  const wallet = scene === "disconnected" ? null : SAMPLE_TRADER;
  const ranked = scene !== "disconnected" && scene !== "not-ranked" && scene !== "wallet-loading";
  const board: BoardState = useMemo(() => {
    if (scene === "board-failed") return { board: null, loading: false, failed: true, canLoadMore: false, loadMore: () => {} };
    if (ui.boardScope === null || !ui.currency) return { board: null, loading: false, failed: false, canLoadMore: false, loadMore: () => {} };
    const raw = sampleBoard(
      season,
      { scope: ui.boardScope === "season" ? "season" : `league:${ui.boardScope}`, role: TRADER, currency: ui.currency, after_rank: 0, limit: rows },
      ranked ? wallet : "nobody",
      now,
    );
    const data = scene === "long" ? stretchedBoard(raw) : raw;
    return { board: data, loading: false, failed: false, canLoadMore: boardHasMore(data), loadMore: () => setRows((n) => n + BOARD_PAGE) };
  }, [scene, season, ui.boardScope, ui.currency, rows, ranked, wallet, now]);

  return (
    <div>
      <div className="mx-auto w-full max-w-[850px] pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-8">
        <p className="font-mono text-xs text-content-tertiary">Dev harness · rewards states from a sample season</p>
        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
          <AppSegmented value={scene} onChange={setScene} options={SCENES} stretch={false} ariaLabel="Scene" />
        </div>
      </div>
      <AppPageHeader title="Rewards" subtitle={scene === "no-season" || scene === "failed" || scene === "loading" ? "Leagues, points and boards" : season.name} action={<AppPill>Sample data</AppPill>} />
      <div className="mx-auto w-full max-w-[850px] pb-16 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        {scene === "loading" ? (
          <>
            <LoadingStatus />
            <RewardsSkeleton />
          </>
        ) : scene === "no-season" ? (
          <NoSeason />
        ) : scene === "failed" ? (
          <SeasonFailed onRetry={() => setScene("live")} />
        ) : (
          <RewardsView
            season={season}
            nowSecs={now}
            mainnet={false}
            wallet={wallet}
            walletLoading={scene === "wallet-loading"}
            subject={ranked ? sampleSubject(SAMPLE_TRADER) : null}
            awards={ranked ? sampleAwards(now) : NO_AWARDS}
            awardsFailed={false}
            ui={ui}
            board={board}
            connect={<AppButton>Connect wallet<Chevron kind="go" className="h-5 w-5" /></AppButton>}
          />
        )}
      </div>
    </div>
  );
}
