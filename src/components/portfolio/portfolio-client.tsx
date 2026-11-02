"use client";

import { useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { AppTd, AppTh } from "@/components/app-ui/app-table";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import type { PositionInfo } from "@/lib/rfq-client";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { getRpcEndpoint } from "@/lib/network";
import { TOKENS, getNetwork, normalizeTokenSymbol } from "@/lib/tokens";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { cn } from "@/lib/cn";
import { AppButton } from "@/components/app-ui/app-button";
import { isCashSettled, lowerStrike } from "@/lib/spreads";
import { formatPortfolioPremium, portfolioIncomeSeries } from "@/lib/portfolio-api";
import { useWalletHistory } from "./use-wallet-history";
import { spreadRowView } from "./spread-positions";
import { PortfolioEarningsChart } from "@/components/portfolio/portfolio-earnings-chart";

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

function formatCountdown(targetTs: number, nowMs: number) {
  const diff = Math.max(0, targetTs * 1000 - nowMs);
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${days}d  ${hours}h  ${mins}m  ${secs}s`;
}

type PositionsTab = "positions" | "history";
const positionsTabOptions: Array<{ value: PositionsTab; label: string }> = [
  { value: "positions", label: "Positions" },
  { value: "history", label: "History" }
];

type TableRow = {
  id: string;
  label: string;
  status: string;
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
  status: "open" | "funded" | "liquidated" | "settled";
  userStatus: "Open" | "Closed";
  createdTs: number;
  expiryTs: number | null;
  quantity: number;
  strike: number;
  premiumUsd: number;
  notionalUsd: number;
  apr: number;
};

/** Result of a closed covered call or cash-secured put: premium, less the move past the strike. */
function physicalOutcome(position: PositionInfo, premiumUsd: number, strike: number, quantity: number): string {
  if (position.state === "liquidated") return "Liquidated";
  if (position.state !== "settled" || position.settlement.type !== "physical") return "\u2014";
  const earned = position.side === "buy" ? -premiumUsd : premiumUsd;
  const signed = (value: number) => `${value < 0 ? "-" : "+"}${formatUsdSmart(Math.abs(value))}`;
  if (position.settlement.is_otm) return signed(earned);
  const settlement = Number(position.settlement.settlement_price) / 1_000_000_000;
  const moved = Math.abs(settlement - strike) * quantity;
  return `ITM ${signed(position.side === "buy" ? earned + moved : earned - moved)}`;
}

function toUserStatus(status: string): "Open" | "Closed" {
  const s = status.toLowerCase();
  if (s === "open" || s === "funded") return "Open";
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
      const premiumUsd =
        Number.isFinite(px.total_premium)
          ? Number(px.total_premium) / 10 ** p.quote_decimals
          : Number(p.price) / strikeScale;
      const notionalUsd = quantity * strike;
      const createdTs = Number(p.created_at);
      const expiryTs = Number(p.expiry_ts) > 0 ? Number(p.expiry_ts) : null;
      const durationSec = expiryTs != null ? Math.max(1, expiryTs - createdTs) : 0;
      const apr =
        premiumUsd > 0 && notionalUsd > 0 && durationSec > 0
          ? (premiumUsd / notionalUsd) * (365 * 24 * 60 * 60 / durationSec) * 100
          : 0;

      return {
        id: p.pda,
        asset: assetSymbol,
        type: p.terms.type === "cash_secured_put" ? "put" : "call",
        outcome: physicalOutcome(p, premiumUsd, strike, quantity),
        status: p.state,
        userStatus: toUserStatus(p.state),
        createdTs,
        expiryTs,
        quantity,
        strike,
        premiumUsd,
        notionalUsd,
        apr,
      };
    });
  }, [allPositions, marketByPda, rfqMarketDescriptors, resolvedUnderlyingByMarket, mintToSymbol]);

  const openRows = useMemo(
    () => rows.filter((r) => r.userStatus === "Open"),
    [rows]
  );
  const historyRows = useMemo(
    () => rows.filter((r) => r.userStatus === "Closed").sort((a, b) => b.createdTs - a.createdTs),
    [rows]
  );

  const openSpreads = useMemo(
    () => allPositions.flatMap((p) => {
      const view = spreadRowView(p, rfqMarketDescriptors);
      return view?.status === "Open" ? [view] : [];
    }),
    [allPositions, rfqMarketDescriptors]
  );
  const totalNotionalUsd = useMemo(
    () => openRows.reduce((sum, r) => sum + (Number.isFinite(r.notionalUsd) ? r.notionalUsd : 0), 0)
      + openSpreads.reduce((sum, r) => sum + r.collateralUsd, 0),
    [openRows, openSpreads]
  );
  const weightedApr = useMemo(() => {
    if (totalNotionalUsd <= 0) return 0;
    const physical = openRows.reduce((sum, r) => sum + r.apr * r.notionalUsd, 0);
    return (physical + openSpreads.reduce((sum, r) => sum + r.aprPct * r.collateralUsd, 0)) / totalNotionalUsd;
  }, [openRows, openSpreads, totalNotionalUsd]);

  const nextMaturity = useMemo(() => {
    const expiries = [...openRows, ...openSpreads]
      .map((r) => r.expiryTs)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    return expiries[0] ?? null;
  }, [openRows, openSpreads]);
  const countdown = nextMaturity ? formatCountdown(nextMaturity, nowMs) : "\u2014";

  const monthlyRate = weightedApr / 12;
  const pnlSeries = useMemo(() => summary ? portfolioIncomeSeries(summary) : [], [summary]);
  const { openTable, closedTable } = useMemo(() => {
    const physical = (r: PortfolioRow): TableRow => ({
      id: r.id,
      label: `${r.asset} ${formatStrikePrice(r.strike)} ${r.type}`,
      status: r.userStatus,
      expiryTs: r.expiryTs ?? r.createdTs,
      createdTs: r.createdTs,
      size: `${fmtNumber(r.quantity, 4)} ${r.asset}`,
      premium: formatUsdSmart(r.premiumUsd),
      last: r.userStatus === "Open" ? (Number.isFinite(r.apr) ? `${r.apr.toFixed(2)}%` : "\u2014") : r.outcome,
      negative: r.outcome.includes("-"),
    });
    const spreads = allPositions.flatMap((p): TableRow[] => {
      const view = spreadRowView(p, rfqMarketDescriptors);
      return view ? [{ ...view, id: p.pda, createdTs: Number(p.created_at), last: view.status === "Open" ? view.apr : view.result }] : [];
    });
    const open = spreads.filter(r => r.status === "Open");
    const closed = spreads.filter(r => r.status !== "Open");
    return {
      openTable: [...openRows.map(physical), ...open].sort((a, b) => (a.expiryTs ?? 0) - (b.expiryTs ?? 0)),
      closedTable: [...historyRows.map(physical), ...closed].sort((a, b) => b.createdTs - a.createdTs),
    };
  }, [allPositions, rfqMarketDescriptors, openRows, historyRows]);
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

  const tiles = [
    {
      label: "Current APR",
      value: !figuresUnavailable && Number.isFinite(weightedApr) ? `${weightedApr.toFixed(2)}%` : "\u2014",
      sub: `Next maturity in ${countdown}`,
    },
    {
      label: "Total Earnings",
      value: figuresUnavailable ? "\u2014" : summary ? formatPortfolioPremium(summary.premium_all_time, summary.quote_decimals, quoteSymbol ?? summary.quote_mint) : "$0",
      sub: `All-time income${quoteSymbol ? ` (${quoteSymbol})` : ""}`,
    },
    {
      label: "Value locked",
      value: figuresUnavailable ? "\u2014" : formatUsdSmart(totalNotionalUsd),
      sub: `${figuresUnavailable ? "\u2014" : history.summary?.reduce((sum, s) => sum + s.open_positions, 0)} open positions`,
    },
    {
      label: "Monthly",
      value: figuresUnavailable ? "\u2014" : summary ? formatPortfolioPremium(summary.premium_30d, summary.quote_decimals, quoteSymbol ?? summary.quote_mint) : "$0",
      sub: `${!figuresUnavailable && Number.isFinite(monthlyRate) ? `${monthlyRate.toFixed(2)}%` : "\u2014"} monthly APR`,
    },
  ];
  const tableRows = positionsTab === "history" ? closedTable : openTable;

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
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <AppCard key={tile.label} className="p-4">
              <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{tile.label}</div>
              <div className="mt-2 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">{tile.value}</div>
              <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">{tile.sub}</div>
            </AppCard>
          ))}
        </div>

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
        <div className="flex items-center justify-between">
          <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
            {positionsTab === "positions" ? `Positions: ${openTable.length}` : "Transactions"}
          </h2>
          <AppSegmented value={positionsTab} onChange={setPositionsTab} options={positionsTabOptions} />
        </div>

        {shouldShowAuthPrompt && positionsTab === "positions" ? (
          <AppCard className="p-6 text-content-secondary">
            Connect wallet and approve RFQ auth to load live positions.
          </AppCard>
        ) : (
          <div className="max-h-[440px] overflow-y-auto border border-bg-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-bg-border">
                  {["Position", "Maturity", "Size", "Premium", positionsTab === "history" ? "Result" : "APR"].map((title, index) => (
                    <AppTh key={title} className={cn("sticky top-0 z-10 bg-bg-primary", index > 1 && "text-right")}>{title}</AppTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <AppTd colSpan={5} className="py-10 text-center text-content-secondary">
                      {positionsTab === "positions" ? "No open positions yet." : history.loading ? "Loading positions..." : history.failed ? "Positions unavailable" : "No closed positions yet."}
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
                            {positionsTab === "positions" ? <span className="text-xs text-content-secondary/60">{formatCountdown(row.expiryTs, nowMs)}</span> : null}
                          </div>
                        ) : "\u2014"}
                      </AppTd>
                      <AppTd className="text-right tabular-nums text-content-secondary">{row.size}</AppTd>
                      <AppTd className="text-right tabular-nums text-content-secondary">{row.premium}</AppTd>
                      <AppTd className={row.negative ? "text-right tabular-nums text-error" : "text-right tabular-nums text-content-secondary"}>{row.last}</AppTd>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {positionsTab === "history" && history.nextCursor ? (
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
