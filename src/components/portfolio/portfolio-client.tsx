"use client";

import { useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented, type AppSegmentedOption } from "@/components/app-ui/app-segmented";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { formatUsdSmart } from "@/lib/markets";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
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
const positionsTabOptions: Array<AppSegmentedOption<PositionsTab>> = [
  { value: "positions", label: "Positions" },
  { value: "history", label: "History" }
];

type PortfolioRow = {
  id: string;
  asset: string;
  type: "Covered call" | "Cash-secured put";
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
  const { isConnected: walletConnected } = useSolana();
  const {
    positions: rfqPositions,
    markets: rfqMarkets,
    marketDescriptors: rfqMarketDescriptors,
    isAuthenticated: rfqAuthenticated,
    fetchPositions: fetchRfqPositions,
    connectionState,
  } = useRfqContext();

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
        rfqPositions
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
    const rpcEndpoint =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      (currentNetwork === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");

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
            // Leave unresolved; UI will keep Unknown for this market.
          }
        }

        if (!cancelled && Object.keys(updates).length > 0) {
          setResolvedUnderlyingByMarket((prev) => ({ ...prev, ...updates }));
        }
      } catch {
        // ignore; fallback resolution is best-effort
      }
    };

    void resolveMissingMarkets();
    return () => {
      cancelled = true;
    };
  }, [rfqPositions, marketByPda, resolvedUnderlyingByMarket, currentNetwork]);

  const rows = useMemo<PortfolioRow[]>(() => {
    const decimals = 1_000_000_000;
    const premiumDecimals = 1_000_000; // total_premium is quote-token units (USDC 6dp)
    return rfqPositions.map((p) => {
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
      const assetSymbol =
        descriptorSymbol ??
        (underlyingMint ? mintToSymbol.get(underlyingMint) ?? "Unknown" : "Unknown");
      const strike = Number(p.strike) / decimals;
      const quantity = Number(p.quantity) / decimals;
      const premiumUsd =
        Number.isFinite(px.total_premium)
          ? Number(px.total_premium) / premiumDecimals
          : Number(p.price) / decimals;
      const notionalUsd = quantity * strike;
      const createdTs = Number(p.created_at);
      const descriptorData = descriptor as
        | { market?: { expiry_ts?: number }; expiry_ts?: number }
        | undefined;
      const descriptorExpiry = descriptorData?.market?.expiry_ts ?? descriptorData?.expiry_ts;
      const expiryTs = market?.expiry_ts ? Number(market.expiry_ts) : descriptorExpiry ? Number(descriptorExpiry) : null;
      const durationSec = expiryTs != null ? Math.max(1, expiryTs - createdTs) : 0;
      const apr =
        premiumUsd > 0 && notionalUsd > 0 && durationSec > 0
          ? (premiumUsd / notionalUsd) * (365 * 24 * 60 * 60 / durationSec) * 100
          : 0;

      return {
        id: p.pda,
        asset: assetSymbol,
        type: p.position_type === "cash_secured_put" ? "Cash-secured put" : "Covered call",
        status: (String(p.status).toLowerCase() as PortfolioRow["status"]) ?? "open",
        userStatus: toUserStatus(String(p.status)),
        createdTs,
        expiryTs,
        quantity,
        strike,
        premiumUsd,
        notionalUsd,
        apr,
      };
    });
  }, [rfqPositions, marketByPda, rfqMarketDescriptors, resolvedUnderlyingByMarket, mintToSymbol]);

  const openRows = useMemo(
    () => rows.filter((r) => r.userStatus === "Open"),
    [rows]
  );
  const historyRows = useMemo(
    () => rows.filter((r) => r.userStatus === "Closed"),
    [rows]
  );

  const totalNotionalUsd = useMemo(
    () => openRows.reduce((sum, r) => sum + (Number.isFinite(r.notionalUsd) ? r.notionalUsd : 0), 0),
    [openRows]
  );
  const totalIncomeUsd = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(r.premiumUsd) ? r.premiumUsd : 0), 0),
    [rows]
  );
  const incomeLast30dUsd = useMemo(() => {
    const since = now - 30 * 24 * 60 * 60;
    return rows
      .filter((r) => r.createdTs >= since && r.createdTs <= now)
      .reduce((sum, r) => sum + (Number.isFinite(r.premiumUsd) ? r.premiumUsd : 0), 0);
  }, [rows, now]);

  const weightedApr = useMemo(() => {
    const denom = openRows.reduce((sum, r) => sum + r.notionalUsd, 0);
    if (denom <= 0) return 0;
    const num = openRows.reduce((sum, r) => sum + r.apr * r.notionalUsd, 0);
    return num / denom;
  }, [openRows]);

  const nextMaturity = useMemo(() => {
    const expiries = openRows
      .map((r) => r.expiryTs)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    return expiries[0] ?? null;
  }, [openRows]);
  const countdown = nextMaturity ? formatCountdown(nextMaturity, nowMs) : "\u2014";

  const monthlyRate = weightedApr / 12;
  const pnlSeries = useMemo(() => {
    const earned = rows
      .filter((r) => r.premiumUsd > 0)
      .map((r) => ({ t: r.createdTs, delta: r.premiumUsd }))
      .sort((a, b) => a.t - b.t);
    let acc = 0;
    return earned.map((e) => {
      acc += e.delta;
      return { t: e.t, v: acc };
    });
  }, [rows]);
  const hasLoadedRfqData = rows.length > 0;
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

  return (
    <div className="mx-auto w-full max-w-[850px] pb-16 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-16">
      {/* Header -- centered */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-center font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
          Portfolio
        </h1>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-center font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
            Track all your positions and earnings
          </p>
          <a href="#" className="inline-flex items-center gap-0.5 font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-accent-secondary hover:text-accent-primary">
            How it works
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
              <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>

      {/* Top metrics + chart */}
      <section className="mt-[80px] flex flex-col gap-2 max-md:mt-10">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <AppCard className="p-4">
            <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Current APR</div>
            <div className="mt-2 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">
              {Number.isFinite(weightedApr) ? `${weightedApr.toFixed(2)}%` : "\u2014"}
            </div>
            <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
              Next maturity in {countdown}
            </div>
          </AppCard>

          <AppCard className="p-4">
            <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Total Earnings</div>
            <div className="mt-2 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">
              {formatUsdSmart(totalIncomeUsd)}
            </div>
            <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
              All-time income
            </div>
          </AppCard>

          <AppCard className="p-4">
            <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Value locked</div>
            <div className="mt-2 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">
              {formatUsdSmart(totalNotionalUsd)}
            </div>
            <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
              {openRows.length} open positions
            </div>
          </AppCard>

          <AppCard className="p-4">
            <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Monthly</div>
            <div className="mt-2 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">
              {formatUsdSmart(incomeLast30dUsd)}
            </div>
            <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
              {Number.isFinite(monthlyRate) ? `${monthlyRate.toFixed(2)}%` : "\u2014"} monthly APR
            </div>
          </AppCard>
        </div>

        {/* Chart */}
        <AppCard className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Income</div>
            <AppSegmented
              value={chartRange}
              onChange={setChartRange}
              options={[
                { value: "24h", label: "24H" },
                { value: "7d", label: "5D" },
                { value: "30d", label: "7D" }
              ]}
              className="sm:w-auto"
            />
          </div>

          <div className="mt-3">
            <PortfolioEarningsChart points={pnlSeries} now={now} range={chartRange} />
          </div>
        </AppCard>
      </section>

      {/* Positions / History table */}
      <section className="mt-16 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
            {positionsTab === "positions" ? `Positions: ${openRows.length}` : "Transactions"}
          </h2>
          <AppSegmented
            value={positionsTab}
            onChange={setPositionsTab}
            options={positionsTabOptions}
          />
        </div>

        {shouldShowAuthPrompt ? (
          <AppCard className="p-6 text-content-secondary">
            Connect wallet and approve RFQ auth to load live positions.
            <div className="mt-2 text-xs text-content-secondary/60">RFQ state: {connectionState}</div>
          </AppCard>
        ) : positionsTab === "positions" ? (
          <AppTable>
            <thead>
              <tr className="border-b border-bg-border">
                <AppTh>Asset</AppTh>
                <AppTh>Type</AppTh>
                <AppTh>Status</AppTh>
                <AppTh>Maturity</AppTh>
                <AppTh className="text-right">Quantity</AppTh>
                <AppTh className="text-right">Strike</AppTh>
                <AppTh className="text-right">Premium</AppTh>
                <AppTh className="text-right">APR</AppTh>
              </tr>
            </thead>
            <tbody>
              {openRows.length === 0 ? (
                <tr>
                  <AppTd colSpan={8} className="py-10 text-center text-content-secondary">
                    No open RFQ positions yet.
                  </AppTd>
                </tr>
              ) : (
                openRows.map((p) => (
                  <tr key={p.id} className="border-b border-bg-border last:border-b-0">
                    <AppTd className="font-medium text-content-primary">{p.asset}</AppTd>
                    <AppTd className="text-content-secondary">{p.type}</AppTd>
                    <AppTd className="text-content-secondary">{p.userStatus}</AppTd>
                    <AppTd className="font-mono text-content-secondary">
                      {p.expiryTs ? (
                        <div className="flex flex-col">
                          <span>{fmtDate(p.expiryTs)}</span>
                          <span className="text-xs text-content-secondary/60">{formatCountdown(p.expiryTs, nowMs)}</span>
                        </div>
                      ) : "\u2014"}
                    </AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{fmtNumber(p.quantity, 4)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{formatUsdSmart(p.strike)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{formatUsdSmart(p.premiumUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{Number.isFinite(p.apr) ? `${p.apr.toFixed(2)}%` : "\u2014"}</AppTd>
                  </tr>
                ))
              )}
            </tbody>
          </AppTable>
        ) : (
          <AppTable>
            <thead>
              <tr className="border-b border-bg-border">
                <AppTh>Asset</AppTh>
                <AppTh>Type</AppTh>
                <AppTh>Status</AppTh>
                <AppTh>Maturity</AppTh>
                <AppTh className="text-right">Quantity</AppTh>
                <AppTh className="text-right">Strike</AppTh>
                <AppTh className="text-right">Premium</AppTh>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <AppTd colSpan={7} className="py-10 text-center text-content-secondary">
                    No closed RFQ positions yet.
                  </AppTd>
                </tr>
              ) : (
                historyRows.map((p) => (
                  <tr key={p.id} className="border-b border-bg-border last:border-b-0">
                    <AppTd className="font-medium text-content-primary">{p.asset}</AppTd>
                    <AppTd className="text-content-secondary">{p.type}</AppTd>
                    <AppTd className="text-content-secondary">{p.userStatus}</AppTd>
                    <AppTd className="font-mono text-content-secondary">{fmtDate(p.expiryTs ?? p.createdTs)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{fmtNumber(p.quantity, 4)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{formatUsdSmart(p.strike)}</AppTd>
                    <AppTd className="text-right tabular-nums text-content-secondary">{formatUsdSmart(p.premiumUsd)}</AppTd>
                  </tr>
                ))
              )}
            </tbody>
          </AppTable>
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
