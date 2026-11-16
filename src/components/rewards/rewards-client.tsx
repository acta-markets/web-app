"use client";

import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { AppPill } from "@/components/app-ui/app-pill";
import { TYPE_NOTE } from "@/components/app-ui/type-styles";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useNowSecs } from "@/components/vaults/use-vaults";
import { cn } from "@/lib/cn";
import { IS_MAINNET } from "@/lib/network";
import { LoadingStatus, NoSeason, RewardsSkeleton, SeasonFailed } from "./rewards-parts";
import { RewardsView } from "./rewards-view";
import { useRewardsSample, useRewardsUi, useSeason, useSeasonAwards, useSeasonBoard, useSeasonSubject } from "./use-season";

// The page header sets the distance from the nav and the gap above the content.
const SHELL = "mx-auto w-full max-w-[850px] pb-16 max-xl:px-[71px] max-lg:px-6 max-md:px-3";

/**
 * The Rewards page: the season the backend is running, read without a sign-in. A connected
 * wallet adds its own standing and awards, looked up by its address alone.
 */
export function RewardsClient() {
  const sample = useRewardsSample();
  const nowSecs = useNowSecs(30_000);
  const { isConnected, selectedAccount } = useSolana();
  const wallet = isConnected ? (selectedAccount?.address ?? null) : null;

  const season = useSeason(sample);
  const slug = season.data?.slug ?? null;
  const subject = useSeasonSubject(sample, slug, wallet);
  const awards = useSeasonAwards(sample, slug, wallet);
  const ui = useRewardsUi(season.data, nowSecs, IS_MAINNET);
  // the board is read only while a tab that shows it is open
  const boardWanted = ui.tab === "board" || ui.tab === "clans";
  const board = useSeasonBoard(sample, boardWanted ? slug : null, ui.boardScope, ui.currency, wallet);

  const firstLoad = season.loading && !season.data;
  const failed = season.error !== null;

  return (
    <div>
      <AppPageHeader
        title="Rewards"
        subtitle={season.data ? season.data.name : "Leagues, points and boards"}
        action={sample ? <AppPill>Sample data</AppPill> : undefined}
      />
      <div className={SHELL}>
        {firstLoad ? (
          <>
            <LoadingStatus />
            <RewardsSkeleton />
          </>
        ) : !season.data ? (
          failed ? (
            <SeasonFailed onRetry={season.refresh} />
          ) : (
            <NoSeason />
          )
        ) : (
          <>
            {failed ? (
              <p role="alert" className={cn(TYPE_NOTE, "mb-4 text-center text-error")}>
                The season could not be refreshed. These figures may be out of date.
              </p>
            ) : null}
            <RewardsView
              season={season.data}
              nowSecs={nowSecs}
              mainnet={IS_MAINNET}
              wallet={wallet}
              walletLoading={!!wallet && (subject.loading || awards.loading) && !subject.data && awards.data.awards.length === 0}
              subject={subject.data}
              awards={awards.data}
              awardsFailed={awards.error !== null}
              ui={ui}
              board={board}
              connect={<SolanaConnectButton />}
            />
          </>
        )}
      </div>
    </div>
  );
}
