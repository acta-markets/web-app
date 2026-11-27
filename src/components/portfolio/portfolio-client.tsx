"use client";

import { cn } from "@/lib/cn";
import { TYPE_LINK } from "@/components/app-ui/type-styles";
import { Chevron } from "@/components/app-ui/chevron";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppPageHeader, AppPageHeaderLink } from "@/components/app-ui/app-page-header";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import type { PositionInfo } from "@/lib/rfq-client";
import { TOKENS, getNetwork, normalizeTokenSymbol } from "@/lib/tokens";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { asOfText } from "@/lib/state/freshness";
import { walletKey } from "@/lib/state/keys";
import { useRemembered } from "@/lib/state/remembered";
import { useViewPref } from "@/lib/state/view-prefs";
import { readSessionId } from "@/lib/state/session-store";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { openWrittenApr, summarizePnl, tradingStats } from "@/lib/portfolio-pnl";
import { buildPositionRows, canFundRow, fundingSummary, isWorthExercising, markWithdrawn } from "@/lib/portfolio-positions";
import { useBuyDeposit } from "./use-buy-deposit";
import { useWalletHistory } from "./use-wallet-history";
import { AssetFilter } from "./asset-filter";
import { ExerciseFilter } from "./exercise-filter";
import { FundingStrip } from "./funding-strip";
import { IncomeCard } from "./income-card";
import { PerformanceStrip } from "./performance-strip";
import { PositionsTable } from "./positions-table";
import { LoadingStatus, PerformanceSkeleton, PortfolioEmpty, PortfolioSignIn, PositionsSkeleton } from "./portfolio-states";

// The page header sets the distance from the nav and the gap above the content.
const SHELL = "mx-auto w-full max-w-page px-6 pb-16 max-md:px-3";
const SLOW_TICK_MS = 30_000;
const FAST_TICK_MS = 1_000;
/** Inside this window a countdown shows minutes and then seconds, so the clock has to keep up. */
const URGENT_WINDOW_MS = 120_000;

/** Still running, or closing: everything that is not yet in the settled history. */
const isLive = (p: PositionInfo) => p.state === "open" || p.state === "funded" || p.state === "terminal_pending";
const isOpen = (p: PositionInfo) => p.state === "open" || p.state === "funded";

/**
 * The page's clock. Nothing on it changes faster than a minute until an expiry is close, so it
 * ticks every 30 seconds, and every second only while one of `expiriesMs` is under two minutes
 * away. A one-second clock re-rendered every row and redrew the chart for no visible change.
 */
function useNow(expiriesMs: readonly number[]): number {
  const [now, setNow] = useState(() => Date.now());
  const urgent = expiriesMs.some((at) => at > now && at - now < URGENT_WINDOW_MS);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), urgent ? FAST_TICK_MS : SLOW_TICK_MS);
    return () => window.clearInterval(id);
  }, [urgent]);
  return now;
}

type PositionsTab = "open" | "history";

function PageHeader() {
  return (
    <AppPageHeader
      title="Portfolio"
      subtitle="Track all your positions and earnings"
      action={<AppPageHeaderLink href="/docs">How protocol works</AppPageHeaderLink>}
    />
  );
}

export function PortfolioClient() {
  const [positionsTab, setPositionsTab] = useViewPref("portfolioTab");
  /** Asset filter for the open positions; null means every asset. */
  const [tokenFilter, setTokenFilter] = useState<string | null>(null);
  /** Show only the bought options worth exercising at the current price. */
  const [exerciseOnly, setExerciseOnly] = useState(false);
  const [quoteMint, setQuoteMint] = useViewPref("incomeMint");
  const { isConnected: walletConnected, selectedAccount, expectedAccount } = useSolana();
  const {
    positions: rfqPositions,
    isAuthenticated: rfqAuthenticated,
    fetchPositions: fetchRfqPositions,
    positionsFailed,
    positionsLoaded,
    getClient,
    assetSnapshots,
    getAssetSnapshots,
    referralInfo,
  } = useRfqContext();
  const address = selectedAccount?.address ?? null;
  // Whose page this is. On a return visit that is known before the wallet has reconnected.
  const viewAddress = address ?? expectedAccount?.address ?? null;

  // Until this session's own positions have arrived, the list last loaded for this wallet
  // stands in for them. It is for looking at: nothing can be funded or withdrawn from it.
  const savedPositions = useRemembered<PositionInfo[]>(viewAddress ? walletKey(viewAddress, "positions") : null);
  const positionsLive = rfqAuthenticated && positionsLoaded !== false;
  const positionsFromDevice = !positionsLive && rfqPositions.length === 0 && !!savedPositions.data;
  const shownPositions = positionsFromDevice ? savedPositions.data! : rfqPositions;

  const history = useWalletHistory(walletConnected && rfqAuthenticated ? address : null, rfqPositions, getClient, viewAddress);
  const lastKnownAt = positionsFromDevice ? savedPositions.updatedAt : history.lastKnownAt;
  const fromDevice = positionsFromDevice || history.lastKnown;

  // Live positions come from the socket, closed ones from the paged history. A position that
  // has just closed can be in both for a moment; the history copy carries its outcome.
  const allPositions = useMemo(() => {
    const closed = new Set(history.positions.map((p) => p.pda));
    return [...shownPositions.filter((p) => isLive(p) && !closed.has(p.pda)), ...history.positions];
  }, [shownPositions, history.positions]);

  const openExpiriesMs = useMemo(
    () => allPositions.filter(isOpen).map((p) => Number(p.expiry_ts) * 1000).filter((at) => at > 0),
    [allPositions],
  );
  const nowMs = useNow(openExpiriesMs);

  useEffect(() => {
    if (!rfqAuthenticated) return;
    fetchRfqPositions();
  }, [rfqAuthenticated, fetchRfqPositions]);

  const buyDeposit = useBuyDeposit(fetchRfqPositions);

  // The backend names the underlying on every position; the mint lookup only covers a row
  // that arrives without its symbol.
  const symbolFor = useCallback((p: PositionInfo): string => {
    const network = getNetwork();
    const known = Object.values(TOKENS).find((t) => t.mint[network] === p.underlying_mint)?.symbol;
    return normalizeTokenSymbol(p.underlying_symbol || known || "Unknown");
  }, []);

  // Live marks: a position row only carries the price that existed when it was fetched, so the
  // underlying snapshots are refreshed while the page is open and used as the uPnL mark.
  const positionsRef = useRef(allPositions);
  useEffect(() => {
    positionsRef.current = allPositions;
  }, [allPositions]);

  // One stable timer. Every dependency lives behind a ref because recreating the interval on
  // each render meant the 15s tick could be cleared before it ever fired, which is why uPnL
  // looked frozen even though the venue was publishing new marks.
  const refreshMarks = useRef<() => void>(() => {});
  useEffect(() => {
    refreshMarks.current = () => {
      if (document.hidden) return;
      fetchRfqPositions();
      const mints = Array.from(new Set(positionsRef.current.filter(isOpen).map((p) => p.underlying_mint).filter(Boolean)));
      if (mints.length && getAssetSnapshots) getAssetSnapshots(mints);
    };
  });

  useEffect(() => {
    if (!rfqAuthenticated) return;
    const tick = () => refreshMarks.current();
    const id = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [rfqAuthenticated]);

  const liveSpotFor = useCallback(
    (p: PositionInfo) => {
      const spot = assetSnapshots?.get(p.underlying_mint)?.reference_price;
      return spot != null && Number(spot) > 0 ? Number(spot) : undefined;
    },
    [assetSnapshots],
  );

  const rows = useMemo(
    () => markWithdrawn(buildPositionRows(allPositions, symbolFor, nowMs, liveSpotFor), buyDeposit.withdrawn),
    [allPositions, symbolFor, nowMs, liveSpotFor, buyDeposit.withdrawn],
  );
  // "Settling" has passed its expiry but is not in the history yet, so it still belongs with
  // what is live.
  const openRows = useMemo(() => rows.filter((r) => r.isOpen || r.state === "Settling"), [rows]);
  const closedRows = useMemo(() => rows.filter((r) => !r.isOpen && r.state !== "Settling"), [rows]);

  const tokenCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of openRows) counts.set(row.symbol, (counts.get(row.symbol) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [openRows]);

  const assetRows = useMemo(
    () => (tokenFilter ? openRows.filter((r) => r.symbol === tokenFilter) : openRows),
    [openRows, tokenFilter],
  );
  // Counted inside the asset filter, so the chip's number is the number of rows it would leave.
  const worthExercising = useMemo(() => assetRows.filter((r) => isWorthExercising(r, nowMs)), [assetRows, nowMs]);
  const visibleOpenRows = exerciseOnly ? worthExercising : assetRows;

  // A filter that no longer matches anything (position settled) falls back to every token
  // instead of leaving an empty table with no way back.
  useEffect(() => {
    if (tokenFilter && !tokenCounts.some(([symbol]) => symbol === tokenFilter)) setTokenFilter(null);
  }, [tokenFilter, tokenCounts]);
  // The same for the exercise filter: the price moved, or the last one was funded and settled.
  useEffect(() => {
    if (exerciseOnly && worthExercising.length === 0) setExerciseOnly(false);
  }, [exerciseOnly, worthExercising.length]);

  const groupedByUnderlying = !tokenFilter && !exerciseOnly && openRows.length >= 8 && tokenCounts.length >= 2;
  // The filters decide what is seen and what is funded: the summary and its button follow them.
  const funding = useMemo(() => fundingSummary(visibleOpenRows, nowMs, buyDeposit.funded), [visibleOpenRows, nowMs, buyDeposit.funded]);
  // Decided on every open position, not on what the filters leave: the card is there for the
  // wallet, so picking an asset with nothing to fund empties it instead of taking it away.
  const hasFundingCard = useMemo(
    () => openRows.some((row) => canFundRow(row, nowMs, buyDeposit.funded) || isWorthExercising(row, nowMs)),
    [openRows, nowMs, buyDeposit.funded],
  );

  const pnlSummary = useMemo(() => summarizePnl(allPositions, liveSpotFor), [allPositions, liveSpotFor]);
  const openApr = useMemo(() => openWrittenApr(allPositions), [allPositions]);
  const tradeStats = useMemo(() => tradingStats(allPositions), [allPositions]);

  // Three different things that used to look the same: still loading, failed, and nothing there.
  const failed = positionsFailed || history.failed;
  const pending = !failed && (history.summary === null || (history.loading && history.positions.length === 0));
  // Skeletons are for the first load of a wallet only. A later refetch keeps what is on screen.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!pending && address) setLoadedFor(address);
  }, [pending, address]);
  const firstLoad = pending && loadedFor !== address;
  const hasIncome = history.summary?.some((s) => s.premium_all_time !== "0") ?? false;
  const nothingYet = !failed && !pending && allPositions.length === 0 && !hasIncome;

  // A returning wallet is on its way back: reconnecting, or connected and resuming its
  // session without a signature. Neither is a moment to ask for a wallet or a sign-in.
  const returning =
    (!walletConnected && !!expectedAccount) || (walletConnected && !rfqAuthenticated && !!address && readSessionId(getRfqBackendUrl(), address) !== null);
  if (returning && shownPositions.length === 0 && !history.lastKnown) {
    return (
      <div>
        <PageHeader />
        <div className={SHELL}>
          <LoadingStatus />
          <section className="flex flex-col gap-2">
            <PerformanceSkeleton />
          </section>
          <section className="mt-8">
            <PositionsSkeleton />
          </section>
        </div>
      </div>
    );
  }

  if (!walletConnected && !expectedAccount) {
    return (
      <div>
        <PageHeader />
        <div className={SHELL}>
        <AppCard className="mx-auto w-full max-w-md p-6">
          <h2 className="font-space text-2xl font-semibold text-content-primary">Connect wallet</h2>
          <p className="mt-2 font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
            Connect your wallet to see your positions, income and P&L.
          </p>
          <div className="mt-5">
            <SolanaConnectButton fullWidth />
          </div>
        </AppCard>
        </div>
      </div>
    );
  }

  const signedOut = !rfqAuthenticated;
  // Funding and withdrawing sign with the wallet and act on the live list: only for a wallet that is here and signed in.
  const actionable = walletConnected && rfqAuthenticated;

  return (
    <div>
      <PageHeader />
      <div className={SHELL}>

      {failed ? (
        <p role="alert" className="mb-6 text-center font-mono text-sm tracking-[-0.02em] text-error">
          Couldn&apos;t load your positions. The figures below may be incomplete.
        </p>
      ) : null}

      {signedOut && shownPositions.length === 0 && !history.lastKnown ? (
        <PortfolioSignIn />
      ) : nothingYet ? (
        <PortfolioEmpty />
      ) : (
        <>
          {firstLoad ? <LoadingStatus /> : null}
          <section className="flex flex-col gap-2">
            {firstLoad ? (
              <PerformanceSkeleton />
            ) : (
              <PerformanceStrip
                pnl={pnlSummary}
                apr={openApr}
                trading={tradeStats}
                unavailable={failed}
                incomplete={!!history.nextCursor}
                referralCode={referralInfo?.referral_code}
              />
            )}
            <IncomeCard
              summaries={history.summary}
              quoteMint={quoteMint}
              onQuoteMint={setQuoteMint}
              state={failed ? "unavailable" : history.summary === null ? "pending" : "ready"}
              nowSec={Math.floor(nowMs / 3_600_000) * 3600}
            />
          </section>

          <section className="mt-8 flex flex-col gap-4">
            {buyDeposit.error ? <p role="alert" className="font-mono text-sm tracking-[-0.02em] text-error">{buyDeposit.error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Positions</h2>
              <AppSegmented
                value={positionsTab}
                onChange={setPositionsTab}
                ariaLabel="Positions view"
                stretch={false}
                options={[
                  { value: "open", label: <>Open <span className="ml-1.5 tabular-nums text-content-tertiary">{openRows.length}</span></> },
                  { value: "history", label: "History" },
                ]}
              />
            </div>

            {positionsTab === "open" ? (
              firstLoad && openRows.length === 0 ? (
                <PositionsSkeleton />
              ) : (
                <div className="flex flex-col gap-3">
                  {/* one card: which positions to see, what they take to fund, and the button that funds them */}
                  <FundingStrip
                    summary={funding}
                    nowMs={nowMs}
                    pending={buyDeposit.action === "fund"}
                    busy={buyDeposit.action === "withdraw" || !actionable}
                    onFund={(positions) => void buyDeposit.depositAll(positions)}
                    // the same two choices whenever the card is drawn, so its header does not change with the asset
                    filters={
                      hasFundingCard ? (
                        <ExerciseFilter total={assetRows.length} count={worthExercising.length} active={exerciseOnly} onChange={setExerciseOnly} />
                      ) : undefined
                    }
                  />
                  <PositionsTable
                    rows={visibleOpenRows}
                    nowMs={nowMs}
                    grouped={groupedByUnderlying}
                    deposit={actionable ? buyDeposit : undefined}
                    share={{ referralCode: referralInfo?.referral_code }}
                    // the asset filter is the table's: the card above counts and funds what it leaves
                    filter={
                      tokenCounts.length > 1 ? (
                        <AssetFilter counts={tokenCounts} total={openRows.length} value={tokenFilter} onChange={setTokenFilter} />
                      ) : undefined
                    }
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col items-start gap-2">
                <div className="w-full">
                  <PositionsTable
                    variant="history"
                    rows={closedRows}
                    nowMs={nowMs}
                    grouped={false}
                    empty={
                      <p className="border border-bg-border p-8 text-center font-mono text-sm tracking-[-0.02em] text-content-secondary">
                        {history.loading || firstLoad ? "Loading positions..." : history.failed ? "Positions unavailable" : "No closed positions yet."}
                      </p>
                    }
                  />
                </div>
                {history.nextCursor ? (
                  <button type="button" disabled={history.loading} onClick={() => void history.loadMore()} className={cn(TYPE_LINK, "self-start text-sm disabled:opacity-50")}>
                    {history.loading ? "Loading..." : "Show more"}
                    <Chevron kind="go" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            )}
            {signedOut || fromDevice ? (
              <p className="font-mono text-[14px] leading-[1.45] tracking-[-0.02em] text-content-secondary">
                {fromDevice && lastKnownAt ? `Your portfolio ${asOfText(lastKnownAt)}. Updating.` : "Reconnecting. These are your last loaded positions."}
              </p>
            ) : null}
          </section>
        </>
      )}
      </div>
    </div>
  );
}
