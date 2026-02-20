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
  return n.toLocaleString(undefined, {
    minimumFractionDigits: frac,
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
  { value: "positions", label: "positions" },
  { value: "history", label: "history" }
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
      (currentNetwork === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.testnet.solana.com");

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
      .filter((x): x is number => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    return expiries[0] ?? null;
  }, [openRows]);
  const countdown = nextMaturity ? formatCountdown(nextMaturity, nowMs) : "—";

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <AppCard className="w-full max-w-md border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-semibold text-white">Connect wallet</h1>
          <p className="mt-2 text-sm text-white/70">
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
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Portfolio</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-white/60">
          <span>Track all your positions and earnings</span>
          <a href="#" className="text-yuzu-main hover:text-yuzu-main/80">
            Learn more <span aria-hidden>›</span>
          </a>
        </div>
      </div>

      {/* Top metrics row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Current APR</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {Number.isFinite(weightedApr) ? `${weightedApr.toFixed(2)}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">
            Next maturity in {countdown}
          </div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Total Earnings</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(totalIncomeUsd)}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">
            All-time income
          </div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Value locked</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(totalNotionalUsd)}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">{openRows.length} open positions</div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Monthly</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(incomeLast30dUsd)}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">
            {Number.isFinite(monthlyRate) ? `${monthlyRate.toFixed(2)}%` : "—"} monthly APR
          </div>
        </AppCard>
      </section>

      {/* Chart */}
      <section className="space-y-3">
        <AppCard className="border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-white/70">Income</div>
            <AppSegmented
              value={chartRange}
              onChange={setChartRange}
              options={[
                { value: "24h", label: "24 hours" },
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" }
              ]}
              className="bg-black/40 sm:w-auto"
            />
          </div>

          <div className="mt-4">
            <PortfolioEarningsChart points={pnlSeries} now={now} range={chartRange} />
          </div>
        </AppCard>
      </section>

      {/* Positions table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <AppSegmented
            value={positionsTab}
            onChange={setPositionsTab}
            options={positionsTabOptions}
            className="bg-black/40"
          />
          <div className="text-sm text-white/50">
            {positionsTab === "positions" ? `${openRows.length} open` : `${historyRows.length} closed`}
          </div>
        </div>

        {shouldShowAuthPrompt ? (
          <AppCard className="border-white/10 bg-white/5 p-6 text-white/70">
            Connect wallet and approve RFQ auth to load live positions.
            <div className="mt-2 text-xs text-white/50">RFQ state: {connectionState}</div>
          </AppCard>
        ) : positionsTab === "positions" ? (
          <AppTable className="border-white/10 bg-white/5">
            <thead>
              <tr className="border-b border-white/10">
                <AppTh className="text-white/50">Asset</AppTh>
                <AppTh className="text-white/50">Type</AppTh>
                <AppTh className="text-white/50">Status</AppTh>
                <AppTh className="text-white/50">Maturity</AppTh>
                <AppTh className="text-right text-white/50">Quantity</AppTh>
                <AppTh className="text-right text-white/50">Strike</AppTh>
                <AppTh className="text-right text-white/50">Premium</AppTh>
                <AppTh className="text-right text-white/50">APR</AppTh>
              </tr>
            </thead>
            <tbody>
              {openRows.length === 0 ? (
                <tr>
                  <AppTd colSpan={8} className="py-10 text-center text-white/50">
                    No open RFQ positions yet.
                  </AppTd>
                </tr>
              ) : (
                openRows.map((p) => (
                  <tr key={p.id} className="border-b border-white/10 last:border-b-0">
                    <AppTd className="font-semibold text-white">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 p-1"
                          style={
                            {
                              ["--brand-a" as any]: getTokenBrand(p.asset).a,
                              ["--brand-b" as any]: getTokenBrand(p.asset).b
                            } as React.CSSProperties
                          }
                        >
                          <img
                            src={getTokenLogoSrc(p.asset)}
                            alt={`${p.asset} logo`}
                            className="h-full w-full rounded-lg object-contain"
                            loading="lazy"
                          />
                        </div>
                        <span>{p.asset}</span>
                      </div>
                    </AppTd>
                    <AppTd className="text-white/70">{p.type}</AppTd>
                    <AppTd className="text-white/70">{p.userStatus}</AppTd>
                    <AppTd className="font-mono text-xs text-white/70">{p.expiryTs ? fmtDate(p.expiryTs) : "—"}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{fmtNumber(p.quantity, 4)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.strike)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.premiumUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{Number.isFinite(p.apr) ? `${p.apr.toFixed(2)}%` : "—"}</AppTd>
                  </tr>
                ))
              )}
            </tbody>
          </AppTable>
        ) : (
          <AppTable className="border-white/10 bg-white/5">
            <thead>
              <tr className="border-b border-white/10">
                <AppTh className="text-white/50">Asset</AppTh>
                <AppTh className="text-white/50">Type</AppTh>
                <AppTh className="text-white/50">Status</AppTh>
                <AppTh className="text-white/50">Maturity</AppTh>
                <AppTh className="text-right text-white/50">Quantity</AppTh>
                <AppTh className="text-right text-white/50">Strike</AppTh>
                <AppTh className="text-right text-white/50">Premium</AppTh>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <AppTd colSpan={7} className="py-10 text-center text-white/50">
                    No closed RFQ positions yet.
                  </AppTd>
                </tr>
              ) : (
                historyRows.map((p) => (
                  <tr key={p.id} className="border-b border-white/10 last:border-b-0">
                    <AppTd className="font-semibold text-white">{p.asset}</AppTd>
                    <AppTd className="text-white/70">{p.type}</AppTd>
                    <AppTd className="text-white/70">{p.userStatus}</AppTd>
                    <AppTd className="font-mono text-xs text-white/70">{fmtDate(p.expiryTs ?? p.createdTs)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{fmtNumber(p.quantity, 4)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.strike)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.premiumUsd)}</AppTd>
                  </tr>
                ))
              )}
            </tbody>
          </AppTable>
        )}
        {!rfqAuthenticated && hasLoadedRfqData ? (
          <div className="text-xs text-white/45">
            Showing last synced positions while RFQ session reconnects.
          </div>
        ) : null}
      </section>
    </div>
  );
}


