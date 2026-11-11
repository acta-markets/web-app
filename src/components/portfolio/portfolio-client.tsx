"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { AppTd, AppTh } from "@/components/app-ui/app-table";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import type { PositionInfo } from "@/lib/rfq-client";
import { getRpcEndpoint } from "@/lib/network";
import { TOKENS, getNetwork, normalizeTokenSymbol } from "@/lib/tokens";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { cn } from "@/lib/cn";
import { AppButton } from "@/components/app-ui/app-button";
import { isCashSettled, lowerStrike } from "@/lib/spreads";
import { portfolioIncomeSeries } from "@/lib/portfolio-api";
import { openWrittenApr, summarizePnl, tradingStats } from "@/lib/portfolio-pnl";
import { useBuyDeposit } from "./use-buy-deposit";
import { useWalletHistory } from "./use-wallet-history";
import { spreadRowView } from "./spread-positions";
import { PortfolioEarningsChart } from "@/components/portfolio/portfolio-earnings-chart";
import { PerformanceStrip } from "@/components/portfolio/performance-strip";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { buildPositionRows } from "@/lib/portfolio-positions";

function fmtDate(ts: number) {
  const d = new Date(ts * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function fmtNumber(n: number, frac = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac
  });
}

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

type PositionsTab = "positions" | "history";
const positionsTabOptions: Array<{ value: PositionsTab; label: string }> = [
  { value: "positions", label: "Positions" },
  { value: "history", label: "History" }
];

type TableRow = {
  id: string;
  label: string;
  expiryTs: number | null;
  createdTs: number;
  size: string;
  premium: string;
  last: string;
  negative: boolean;
};

type PortfolioRow = {
  id: string;
  asset: string;
  type: "call" | "put";
  outcome: string;
  userStatus: "Open" | "Settling" | "Closed";
  createdTs: number;
  expiryTs: number | null;
  quantity: number;
  strike: number;
  premiumUsd: number;
  bought: boolean;
};

/** Result of a closed covered call or cash-secured put: premium, less the move past the strike. */
function physicalOutcome(position: PositionInfo, premiumUsd: number, strike: number, quantity: number): string {
  if (position.state === "liquidated") return "Liquidated";
  if (position.state !== "settled") return "\u2014";
  if (position.settlement.type === "not_exercised") return `Not exercised -${formatUsdSmart(premiumUsd)}`;
  if (position.settlement.type !== "physical") return "\u2014";
  const earned = position.side === "buy" ? -premiumUsd : premiumUsd;
  const signed = (value: number) => `${value < 0 ? "-" : "+"}${formatUsdSmart(Math.abs(value))}`;
  if (position.settlement.is_otm) return signed(earned);
  const settlement = Number(position.settlement.settlement_price) / 1_000_000_000;
  const moved = Math.abs(settlement - strike) * quantity;
  return `ITM ${signed(position.side === "buy" ? earned + moved : earned - moved)}`;
}

function toUserStatus(state: PositionInfo["state"]): PortfolioRow["userStatus"] {
  if (state === "open" || state === "funded") return "Open";
  if (state === "terminal_pending") return "Settling";
  return "Closed";
}

function extractDescriptorMarketPda(descriptor: unknown): string | undefined {
  if (!descriptor || typeof descriptor !== "object") return undefined;
  const d = descriptor as Record<string, unknown>;
  const nested = (d.market as Record<string, unknown> | undefined) ?? undefined;
  return (
    (typeof d.market_pda === "string" ? d.market_pda : undefined) ??
    (typeof d.pda === "string" ? d.pda : undefined) ??
    (nested && typeof nested.market_pda === "string" ? nested.market_pda : undefined) ??
    (nested && typeof nested.pda === "string" ? nested.pda : undefined)
  );
}

function extractDescriptorUnderlyingMint(descriptor: unknown): string | undefined {
  if (!descriptor || typeof descriptor !== "object") return undefined;
  const d = descriptor as Record<string, unknown>;
  const nested = (d.market as Record<string, unknown> | undefined) ?? undefined;
  return (
    (typeof d.underlying_mint === "string" ? d.underlying_mint : undefined) ??
    (typeof d.underlyingMint === "string" ? d.underlyingMint : undefined) ??
    (typeof d.underlying === "string" ? d.underlying : undefined) ??
    (nested && typeof nested.underlying_mint === "string" ? nested.underlying_mint : undefined) ??
    (nested && typeof nested.underlyingMint === "string" ? nested.underlyingMint : undefined) ??
    (nested && typeof nested.underlying === "string" ? nested.underlying : undefined)
  );
}

function extractDescriptorUnderlyingSymbol(descriptor: unknown): string | undefined {
  if (!descriptor || typeof descriptor !== "object") return undefined;
  const d = descriptor as Record<string, unknown>;
  return (
    (typeof d.underlying_symbol === "string" ? d.underlying_symbol : undefined) ??
    (typeof d.underlyingSymbol === "string" ? d.underlyingSymbol : undefined)
  );
}

export function PortfolioClient() {
  const [chartRange, setChartRange] = useState<"24h" | "7d" | "30d">("30d");
  const [positionsTab, setPositionsTab] = useState<PositionsTab>("positions");
  const [resolvedUnderlyingByMarket, setResolvedUnderlyingByMarket] = useState<Record<string, string>>({});
  const nowMs = useNow(1000);
  const { isConnected: walletConnected, selectedAccount } = useSolana();
  const {
    positions: rfqPositions,
    markets: rfqMarkets,
    marketDescriptors: rfqMarketDescriptors,
    isAuthenticated: rfqAuthenticated,
    fetchPositions: fetchRfqPositions,
    positionsFailed,
    getClient,
    assetSnapshots,
    getAssetSnapshots,
  } = useRfqContext();

  const history = useWalletHistory(walletConnected && rfqAuthenticated ? selectedAccount?.address ?? null : null, rfqPositions, getClient);
  const allPositions = useMemo(() => [...rfqPositions.filter(p => p.state === "open" || p.state === "funded"), ...history.positions], [rfqPositions, history.positions]);
  const [quoteMint, setQuoteMint] = useState("");
  const summary = history.summary?.find(s => s.quote_mint === quoteMint)
    ?? history.summary?.find(s => s.quote_mint === TOKENS.USDC.mint[getNetwork()])
    ?? history.summary?.[0];
  const figuresUnavailable = positionsFailed || history.failed || history.summary === null;
  const quoteSymbol = Object.values(TOKENS).find(t => t.mint[getNetwork()] === summary?.quote_mint)?.symbol;
  const formatIncome = (value: number) => !summary || quoteSymbol === "USDC"
    ? formatUsdSmart(value)
    : `${fmtNumber(value, summary.quote_decimals)} ${quoteSymbol ?? summary.quote_mint}`;

  useEffect(() => {
    if (!rfqAuthenticated) return;
    fetchRfqPositions();
  }, [rfqAuthenticated, fetchRfqPositions]);

  const buyDeposit = useBuyDeposit(fetchRfqPositions);

  const now = Math.floor(nowMs / 1000);
  const currentNetwork = getNetwork();

  const mintToSymbol = useMemo(() => {
    const map = new Map<string, string>();
    for (const token of Object.values(TOKENS)) {
      const mint = token.mint[currentNetwork];
      if (mint) {
        map.set(mint, token.symbol);
      }
    }
    return map;
  }, [currentNetwork]);

  const marketByPda = useMemo(() => {
    const map = new Map<string, (typeof rfqMarkets)[number]>();
    for (const m of rfqMarkets) map.set(m.pda, m);
    return map;
  }, [rfqMarkets]);

  /** The position's underlying mint, from the same sources the symbol resolver uses. */
  const underlyingMintFor = useCallback((p: PositionInfo): string | undefined => {
    const px = p as unknown as { underlying_mint?: string };
    const market = marketByPda.get(p.market);
    const descriptor = rfqMarketDescriptors.find((d) => {
      const marketPda = extractDescriptorMarketPda(d);
      return typeof marketPda === "string" && marketPda === p.market;
    });
    return (
      px.underlying_mint ??
      market?.underlying ??
      extractDescriptorUnderlyingMint(descriptor) ??
      resolvedUnderlyingByMarket[p.market] ??
      undefined
    );
  }, [marketByPda, rfqMarketDescriptors, resolvedUnderlyingByMarket]);

  const resolveUnderlyingSymbol = useCallback((p: PositionInfo): string => {
    const px = p as unknown as { underlying_mint?: string };
    const market = marketByPda.get(p.market);
    const descriptor = rfqMarketDescriptors.find((d) => {
      const marketPda = extractDescriptorMarketPda(d);
      return typeof marketPda === "string" && marketPda === p.market;
    });
    const descriptorUnderlying = extractDescriptorUnderlyingMint(descriptor);
    const descriptorSymbol = extractDescriptorUnderlyingSymbol(descriptor);
    const underlyingMint =
      px.underlying_mint ??
      market?.underlying ??
      descriptorUnderlying ??
      resolvedUnderlyingByMarket[p.market];
    const rawSymbol =
      descriptorSymbol ??
      (underlyingMint ? mintToSymbol.get(underlyingMint) ?? "Unknown" : "Unknown");
    return normalizeTokenSymbol(rawSymbol);
  }, [marketByPda, rfqMarketDescriptors, resolvedUnderlyingByMarket, mintToSymbol]);

  useEffect(() => {
    const unresolvedMarketPdas = Array.from(
      new Set(
        allPositions
          .filter((p) => {
            const pp = p as unknown as { underlying_mint?: string };
            return !pp.underlying_mint;
          })
          .map((p) => p.market)
          .filter((marketPda) => !marketByPda.has(marketPda) && !resolvedUnderlyingByMarket[marketPda])
      )
    );
    if (unresolvedMarketPdas.length === 0) return;

    let cancelled = false;
    const rpcEndpoint = getRpcEndpoint();

    const resolveMissingMarkets = async () => {
      try {
        const [{ fetchMarket }, { createSolanaRpc }] = await Promise.all([
          import("@acta-markets/ts-sdk"),
          import("@solana/kit"),
        ]);
        const rpc = createSolanaRpc(rpcEndpoint);
        const updates: Record<string, string> = {};

        for (const marketPda of unresolvedMarketPdas) {
          try {
            const marketAccount = await fetchMarket(rpc as any, marketPda as any);
            const underlyingMint = String(
              (marketAccount as any)?.data?.underlyingMint ??
              (marketAccount as any)?.underlyingMint ??
              ""
            );
            if (underlyingMint) {
              updates[marketPda] = underlyingMint;
            }
          } catch {
          }
        }

        if (!cancelled && Object.keys(updates).length > 0) {
          setResolvedUnderlyingByMarket((prev) => ({ ...prev, ...updates }));
        }
      } catch {
      }
    };

    void resolveMissingMarkets();
    return () => {
      cancelled = true;
    };
  }, [allPositions, marketByPda, resolvedUnderlyingByMarket, currentNetwork]);

  const rows = useMemo<PortfolioRow[]>(() => {
    const strikeScale = 1_000_000_000;
    return allPositions.filter(p => !isCashSettled(p.terms.type)).map((p) => {
      const px = p as unknown as { total_premium?: number; underlying_mint?: string; quote_mint?: string };
      const market = marketByPda.get(p.market);
      const descriptor = rfqMarketDescriptors.find((d) => {
        const marketPda = extractDescriptorMarketPda(d);
        return typeof marketPda === "string" && marketPda === p.market;
      });
      const descriptorUnderlying = extractDescriptorUnderlyingMint(descriptor);
      const descriptorSymbol = extractDescriptorUnderlyingSymbol(descriptor);
      const underlyingMint =
        px.underlying_mint ??
        market?.underlying ??
        descriptorUnderlying ??
        resolvedUnderlyingByMarket[p.market];
      const rawSymbol =
        descriptorSymbol ??
        (underlyingMint ? mintToSymbol.get(underlyingMint) ?? "Unknown" : "Unknown");
      const assetSymbol = normalizeTokenSymbol(rawSymbol);
      const strike = Number(lowerStrike(p.terms)) / strikeScale;
      const quantity = Number(p.quantity) / 10 ** p.underlying_decimals;
      const bought = p.side === "buy";
      const isPut = p.terms.type === "cash_secured_put";
      // total_premium is what the writer received; a buyer spent the gross price
      const premiumUsd =
        bought
          ? (Number(p.price) / strikeScale) * quantity
          : Number.isFinite(px.total_premium)
            ? Number(px.total_premium) / 10 ** p.quote_decimals
            : Number(p.price) / strikeScale;
      const createdTs = Number(p.created_at);
      const expiryTs = Number(p.expiry_ts) > 0 ? Number(p.expiry_ts) : null;
      return {
        id: p.pda,
        asset: assetSymbol,
        type: isPut ? "put" : "call",
        outcome: physicalOutcome(p, premiumUsd, strike, quantity),
        userStatus: toUserStatus(p.state),
        createdTs,
        expiryTs,
        quantity,
        strike,
        premiumUsd,
        bought,
      };
    });
  }, [allPositions, marketByPda, rfqMarketDescriptors, resolvedUnderlyingByMarket, mintToSymbol]);

  // Live marks: the position rows only carry the price that existed at fetch time, so the
  // underlying snapshots are refreshed while the page is open and used as the uPnL mark.
  useEffect(() => {
    if (!rfqAuthenticated || !getAssetSnapshots) return;
    const refresh = () => {
      if (document.hidden) return;
      // Refetch the rows too: the mark baked into each position is refreshed by the server on
      // every fetch, so this is the dependable path when the snapshot map has no mint yet.
      fetchRfqPositions();
      const mints = Array.from(
        new Set(
          allPositions
            .filter((p) => p.state === "open" || p.state === "funded")
            .map((p) => underlyingMintFor(p))
            .filter((mint): mint is string => !!mint),
        ),
      );
      if (mints.length && getAssetSnapshots) getAssetSnapshots(mints);
    };
    refresh();
    const id = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [rfqAuthenticated, allPositions, getAssetSnapshots, underlyingMintFor, fetchRfqPositions]);

  const liveSpotFor = useCallback(
    (p: PositionInfo) => {
      const mint = underlyingMintFor(p);
      const spot = mint ? assetSnapshots?.get(mint)?.reference_price : null;
      return spot != null && Number(spot) > 0 ? Number(spot) : undefined;
    },
    [assetSnapshots, underlyingMintFor],
  );

  const positionTableRows = useMemo(
    () => buildPositionRows(allPositions, resolveUnderlyingSymbol, nowMs, liveSpotFor),
    [allPositions, resolveUnderlyingSymbol, nowMs]
  );
  const groupedByUnderlying = useMemo(
    () => positionTableRows.length >= 8 && new Set(positionTableRows.map((r) => r.symbol)).size >= 2,
    [positionTableRows]
  );

  const historyRows = useMemo(
    () => rows.filter((r) => r.userStatus !== "Open").sort((a, b) => b.createdTs - a.createdTs),
    [rows]
  );

  const pnlSummary = useMemo(() => summarizePnl(allPositions, liveSpotFor), [allPositions, liveSpotFor]);
  const openApr = useMemo(() => openWrittenApr(allPositions), [allPositions]);
  const tradeStats = useMemo(() => tradingStats(allPositions), [allPositions]);

  const pnlSeries = useMemo(() => summary ? portfolioIncomeSeries(summary) : [], [summary]);
  const closedTable = useMemo(() => {
    const physical = (r: PortfolioRow): TableRow => ({
      id: r.id,
      label: `${r.bought ? "Bought " : ""}${r.asset} ${formatStrikePrice(r.strike)} ${r.type}`,
      expiryTs: r.expiryTs ?? r.createdTs,
      createdTs: r.createdTs,
      size: `${fmtNumber(r.quantity, 4)} ${r.asset}`,
      premium: r.bought ? `${formatUsdSmart(r.premiumUsd)} paid` : formatUsdSmart(r.premiumUsd),
      last: r.outcome,
      negative: r.outcome.includes("-"),
    });
    const spreads = allPositions.flatMap((p): TableRow[] => {
      const view = spreadRowView(p, rfqMarketDescriptors);
      return view && view.status !== "Open"
        ? [{ ...view, id: p.pda, createdTs: Number(p.created_at), last: view.result }]
        : [];
    });
    return [...historyRows.map(physical), ...spreads].sort((a, b) => b.createdTs - a.createdTs);
  }, [allPositions, rfqMarketDescriptors, historyRows]);
  const hasLoadedRfqData = rfqPositions.length > 0;
  const shouldShowAuthPrompt = !rfqAuthenticated && !hasLoadedRfqData;

  if (!walletConnected) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[850px] items-center justify-center pb-16 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-16">
        <AppCard className="w-full max-w-md p-6">
          <h1 className="font-space text-2xl font-semibold text-content-primary">Connect wallet</h1>
          <p className="mt-2 font-mono text-sm text-content-secondary">
            Connect your wallet to view your dashboard positions and earnings.
          </p>
          <div className="mt-5">
            <SolanaConnectButton fullWidth />
          </div>
        </AppCard>
      </div>
    );
  }

  const tableRows = closedTable;

  return (
    <div className="mx-auto w-full max-w-[850px] pb-16 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-center font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
          Portfolio
        </h1>
        <p className="text-center font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
          Track all your positions and earnings
        </p>
        <a href="/docs" className="inline-flex items-center gap-0.5 font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-accent-secondary hover:text-accent-primary">
          How it works
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
            <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {positionsFailed || history.failed ? (
        <p role="alert" className="mt-4 text-center font-mono text-sm text-error">
          Couldn&apos;t load your positions. The figures below may be incomplete.
        </p>
      ) : null}
      {history.summary && history.summary.length > 1 ? (
        <label className="mt-4 flex gap-2 font-mono text-sm">Income currency
          <select aria-label="Income currency" value={summary?.quote_mint ?? ""} onChange={event => setQuoteMint(event.target.value)}>
            {history.summary.map(s => <option key={s.quote_mint} value={s.quote_mint}>{mintToSymbol.get(s.quote_mint) ?? s.quote_mint}</option>)}
          </select>
        </label>
      ) : null}

      <section className="mt-8 flex flex-col gap-2">
        <PerformanceStrip
          pnl={figuresUnavailable ? null : pnlSummary}
          apr={figuresUnavailable ? null : openApr}
          trading={figuresUnavailable ? null : tradeStats}
          unavailable={figuresUnavailable}
          hasPositions={allPositions.length > 0}
          incomplete={!!history.nextCursor}
        />

        <AppCard className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Income</div>
            <AppSegmented
              value={chartRange}
              onChange={setChartRange}
              options={[
                { value: "24h", label: "24H" },
                { value: "7d", label: "7D" },
                { value: "30d", label: "30D" }
              ]}
              className="sm:w-auto"
            />
          </div>
          <div className="mt-3">
            {figuresUnavailable || pnlSeries === null ? <p className="font-mono text-sm text-content-secondary">Income unavailable</p> : <PortfolioEarningsChart points={pnlSeries} now={now} range={chartRange} formatValue={formatIncome} />}
          </div>
        </AppCard>
      </section>

      <section className="mt-8 flex flex-col gap-4">
        {buyDeposit.error ? <p role="alert" className="font-mono text-sm text-error">{buyDeposit.error}</p> : null}
        <div className="flex items-center justify-between">
          <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
            {positionsTab === "positions" ? `Positions: ${positionTableRows.length}` : "Transactions"}
          </h2>
          <div className="flex items-center gap-2">
            <AppSegmented value={positionsTab} onChange={setPositionsTab} options={positionsTabOptions} />
          </div>
        </div>

        {shouldShowAuthPrompt && positionsTab === "positions" ? (
          <AppCard className="p-6 text-content-secondary">
            Connect wallet and approve RFQ auth to load live positions.
          </AppCard>
        ) : positionsTab === "positions" ? (
          <PositionsTable rows={positionTableRows} nowMs={nowMs} grouped={groupedByUnderlying} deposit={buyDeposit} />
        ) : (
          <div className="max-h-[440px] overflow-y-auto border border-bg-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-bg-border">
                  {["Position", "Maturity", "Size", "Premium", "Result"].map((title, index) => (
                    <AppTh key={title} className={cn("sticky top-0 z-10 bg-bg-primary", index > 1 && "text-right")}>{title}</AppTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <AppTd colSpan={5} className="py-10 text-center text-content-secondary">
                      {history.loading ? "Loading positions..." : history.failed ? "Positions unavailable" : "No closed positions yet."}
                    </AppTd>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr key={row.id} className="border-b border-bg-border last:border-b-0">
                      <AppTd className="font-medium text-content-primary">{row.label}</AppTd>
                      <AppTd className="font-mono text-content-secondary">
                        {row.expiryTs ? (
                          <div className="flex flex-col">
                            <span>{fmtDate(row.expiryTs)}</span>
                          </div>
                        ) : "\u2014"}
                      </AppTd>
                      <AppTd className="text-right tabular-nums text-content-secondary">{row.size}</AppTd>
                      <AppTd className="text-right tabular-nums text-content-secondary">{row.premium}</AppTd>
                      <AppTd className={row.negative ? "text-right tabular-nums text-error" : "text-right tabular-nums text-content-secondary"}>
                        {row.last}
                      </AppTd>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {history.nextCursor ? (
              <AppButton variant="ghost" className="m-2" disabled={history.loading} onClick={() => void history.loadMore()}>
                {history.loading ? "Loading..." : "Show more"}
              </AppButton>
            ) : null}
          </div>
        )}
        {!rfqAuthenticated && hasLoadedRfqData ? (
          <div className="text-xs text-content-secondary/60">
            Showing last synced positions while RFQ session reconnects.
          </div>
        ) : null}
      </section>
    </div>
  );
}
