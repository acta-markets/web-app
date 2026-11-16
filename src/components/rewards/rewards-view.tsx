"use client";

import * as React from "react";
import type { Season, SeasonSubjectResult } from "@acta-markets/ts-sdk/http";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { AppTextTabs } from "@/components/app-ui/app-text-tabs";
import type { WalletAwards } from "@/lib/rewards/api";
import {
  awardLines,
  boardRows,
  boardStatus,
  clanRows,
  formatPoints,
  hiddenRulesText,
  leagueStandingText,
  ruleGroups,
  seasonLeagues,
  seasonStandings,
  standingFor,
} from "@/lib/rewards/view";
import { AwardsList, BoardTable, ClanTable, LeagueStrip, MyStanding, RulesList, type StandingState } from "./rewards-parts";
import type { BoardState, RewardsTab, RewardsUi } from "./use-season";

const TABS: ReadonlyArray<{ value: RewardsTab; label: string }> = [
  { value: "rules", label: "Rules" },
  { value: "board", label: "Board" },
  { value: "clans", label: "Clans" },
  { value: "awards", label: "My awards" },
];

type Reach = "league" | "season";
const REACH: Array<{ value: Reach; label: string }> = [
  { value: "league", label: "This league" },
  { value: "season", label: "Season" },
];

/**
 * A published season, top to bottom: the trader's standing, the leagues, and under the chosen
 * league its rules, board, clans and the trader's awards. Everything shown is passed in.
 */
export function RewardsView({
  season,
  nowSecs,
  mainnet,
  wallet,
  walletLoading,
  subject,
  awards,
  awardsFailed,
  ui,
  board,
  connect,
}: {
  season: Season;
  nowSecs: number;
  mainnet: boolean;
  /** The connected wallet, or null. */
  wallet: string | null;
  /** The wallet's standing and awards are still on their first read. */
  walletLoading: boolean;
  subject: SeasonSubjectResult | null;
  awards: WalletAwards;
  awardsFailed: boolean;
  ui: RewardsUi;
  board: BoardState;
  connect: React.ReactNode;
}) {
  const leagues = React.useMemo(() => seasonLeagues(season, nowSecs, { mainnet }), [season, nowSecs, mainnet]);
  const league = season.leagues.find((l) => l.id === ui.leagueId) ?? null;
  const leagueView = [...leagues.open, ...leagues.past].find((l) => l.id === ui.leagueId) ?? null;
  const currencies = league?.currencies ?? [];
  const mainCurrency = season.leagues[0]?.currencies[0]?.id ?? null;

  const standings = seasonStandings(season, subject);
  const standingState: StandingState = !wallet ? "disconnected" : walletLoading ? "loading" : subject && subject.standings.length > 0 ? "ready" : "none";

  const groups = React.useMemo(() => (league ? ruleGroups(league, awards.awards) : []), [league, awards]);
  const scopeAwards = React.useMemo(
    () => awardLines(ui.wide ? awards.awards : awards.awards.filter((a) => a.league_id === ui.leagueId), season),
    [awards, season, ui.wide, ui.leagueId],
  );

  const status = board.board ? boardStatus(board.board, nowSecs) : null;
  const ownStanding = ui.boardScope !== null && ui.currency ? standingFor(subject, ui.boardScope, ui.currency) : null;
  const own = ownStanding && ownStanding.rank > 0 ? { rank: ownStanding.rank, points: formatPoints(ownStanding.points) } : null;

  const reach = (
    <AppSegmented<Reach> value={ui.wide ? "season" : "league"} onChange={(v) => ui.setWide(v === "season")} options={REACH} stretch={false} ariaLabel="Board covers" />
  );
  const currencyPicker =
    currencies.length > 1 && ui.currency ? (
      <AppSegmented
        value={ui.currency}
        onChange={ui.setCurrency}
        options={currencies.map((c) => ({ value: c.id, label: c.title }))}
        stretch={false}
        ariaLabel="Points"
      />
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <MyStanding state={standingState} standings={standings} connect={connect} />
      <LeagueStrip
        open={leagues.open}
        past={leagues.past}
        selected={ui.leagueId}
        onSelect={ui.setLeagueId}
        standingText={(id) => (wallet && mainCurrency ? leagueStandingText(subject, id, mainCurrency) : null)}
      />
      {league && leagueView ? (
        <AppCard className="min-w-0">
          <div className="border-b border-bg-border px-5 max-md:px-4">
            <AppTextTabs
              ariaLabel={`${leagueView.name} details`}
              className="-mb-px min-w-0 max-md:w-full max-md:justify-between max-md:gap-2"
              value={ui.tab}
              onChange={ui.setTab}
              options={TABS}
            />
          </div>
          <div className="flex flex-col gap-5 p-5 max-md:p-4" role="tabpanel" aria-label={TABS.find((t) => t.value === ui.tab)?.label}>
            {ui.tab === "rules" ? (
              <RulesList groups={groups} hidden={hiddenRulesText(league)} showProgress={!!wallet && !walletLoading} />
            ) : (
              <>
                <div className="-mx-1 flex flex-wrap items-center gap-x-6 gap-y-3 overflow-x-auto px-1">
                  {reach}
                  {ui.tab === "awards" ? null : currencyPicker}
                </div>
                {ui.tab === "board" ? (
                  <BoardTable
                    rows={board.board ? boardRows(board.board, wallet) : []}
                    status={status}
                    own={own}
                    loading={board.loading}
                    failed={board.failed}
                    canLoadMore={board.canLoadMore}
                    onLoadMore={board.loadMore}
                  />
                ) : ui.tab === "clans" ? (
                  <ClanTable
                    rows={board.board && ui.currency ? clanRows(board.board, ui.currency) : []}
                    status={status}
                    loading={board.loading}
                    failed={board.failed}
                  />
                ) : (
                  <AwardsList
                    lines={scopeAwards}
                    nowSecs={nowSecs}
                    state={!wallet ? "disconnected" : walletLoading ? "loading" : awardsFailed ? "failed" : "ready"}
                    truncated={awards.truncated}
                  />
                )}
              </>
            )}
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}
