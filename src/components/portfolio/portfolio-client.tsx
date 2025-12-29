"use client";

import { useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented, type AppSegmentedOption } from "@/components/app-ui/app-segmented";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { cn } from "@/lib/cn";
import { formatPct, formatUsdSmart } from "@/lib/markets";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";
import {
  buildEarningsSeries,
  computePortfolioSummary,
  portfolioMock,
  type PortfolioApiResponse,
  type PortfolioEarningsEvent,
  type PortfolioPosition
} from "@/lib/portfolio";
import { PortfolioEarningsChart } from "@/components/portfolio/portfolio-earnings-chart";

const EMPTY_POSITIONS: PortfolioPosition[] = [];
const EMPTY_EVENTS: PortfolioEarningsEvent[] = [];

function typeLabel(t: PortfolioPosition["type"]) {
  return t === "csp" ? "Cash secured put" : "Covered call";
}

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

function outcomeFor(p: PortfolioPosition) {
  if (p.outcome) return p.outcome;
  if (p.type === "csp") return `Get ${fmtNumber(p.size, 0)} USDC`;
  return `Sell ${fmtNumber(p.size, 0)} ${p.asset}`;
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

export function PortfolioClient() {
  const [chartRange, setChartRange] = useState<"24h" | "7d" | "30d">("30d");
  const [positionsTab, setPositionsTab] = useState<PositionsTab>("positions");
  const [data, setData] = useState<Extract<PortfolioApiResponse, { ok: true }> | null>(null);
  const [loading, setLoading] = useState(true);
  const nowMs = useNow(1000);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/portfolio");
        const json = (await res.json()) as PortfolioApiResponse;
        if (!alive) return;
        if (!res.ok || !("ok" in json) || json.ok !== true) {
          setData({ ok: true, ...portfolioMock() });
        } else {
          setData(json);
        }
      } catch {
        if (!alive) return;
        setData({ ok: true, ...portfolioMock() });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const open = useMemo(() => data?.open ?? EMPTY_POSITIONS, [data]);
  const history = useMemo(() => data?.history ?? EMPTY_POSITIONS, [data]);
  const events = useMemo(() => data?.events ?? EMPTY_EVENTS, [data]);
  const now = data?.now ?? Math.floor(Date.now() / 1000);

  const summary = useMemo(() => computePortfolioSummary({ open, events, now }), [open, events, now]);
  const pnlSeries = useMemo(() => buildEarningsSeries(events), [events]);

  const bigApr = summary.weightedApr;
  const nextMaturity = summary.nextMaturityTs;
  const countdown = nextMaturity ? formatCountdown(nextMaturity, nowMs) : "—";

  const monthlyRate = bigApr / 12;

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
            {Number.isFinite(bigApr) ? `${bigApr.toFixed(2)}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">
            Next maturity in {countdown}
          </div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Total Earnings</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(summary.totalIncomeUsd)}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">
            All-time income
          </div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Value locked</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(summary.totalNotionalUsd)}
          </div>
          <div className="mt-1 text-sm text-white/40 tabular-nums">{open.length} open positions</div>
        </AppCard>

        <AppCard className="border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white/60">Monthly</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatUsdSmart(summary.incomeLast30dUsd)}
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
            {loading
              ? "Loading…"
              : positionsTab === "positions"
                ? `${open.length} open`
                : `${history.length} closed`}
          </div>
        </div>

        {positionsTab === "positions" ? (
          <AppTable className="border-white/10 bg-white/5">
            <thead>
              <tr className="border-b border-white/10">
                <AppTh className="text-white/50">Asset</AppTh>
                <AppTh className="text-white/50">Type</AppTh>
                <AppTh className="text-white/50">Maturity</AppTh>
                <AppTh className="text-right text-white/50">Size</AppTh>
                <AppTh className="text-right text-white/50">Notional</AppTh>
                <AppTh className="text-right text-white/50">APR</AppTh>
                <AppTh className="text-right text-white/50">Current Price</AppTh>
                <AppTh className="text-right text-white/50">Target</AppTh>
                <AppTh className="text-right text-white/50">Outcome</AppTh>
              </tr>
            </thead>
            <tbody>
              {open.length === 0 ? (
                <tr>
                  <AppTd colSpan={9} className="py-10 text-center text-white/50">
                    No open positions yet.
                  </AppTd>
                </tr>
              ) : (
                open.map((p) => (
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
                    <AppTd className="text-white/70">{typeLabel(p.type)}</AppTd>
                    <AppTd className="font-mono text-xs text-white/70">{fmtDate(p.maturityTs)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{fmtNumber(p.size, 2)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.notionalUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatPct(p.apr)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.currentPriceUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.targetPriceUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{outcomeFor(p)}</AppTd>
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
                <AppTh className="text-white/50">Maturity</AppTh>
                <AppTh className="text-right text-white/50">Size</AppTh>
                <AppTh className="text-right text-white/50">Notional</AppTh>
                <AppTh className="text-right text-white/50">APR</AppTh>
                <AppTh className="text-right text-white/50">Upfront Yield</AppTh>
                <AppTh className="text-right text-white/50">Outcome</AppTh>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <AppTd colSpan={8} className="py-10 text-center text-white/50">
                    No historical positions yet.
                  </AppTd>
                </tr>
              ) : (
                history.map((p) => (
                  <tr key={p.id} className="border-b border-white/10 last:border-b-0">
                    <AppTd className="font-semibold text-white">{p.asset}</AppTd>
                    <AppTd className="text-white/70">{typeLabel(p.type)}</AppTd>
                    <AppTd className="font-mono text-xs text-white/70">{fmtDate(p.maturityTs)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{fmtNumber(p.size, 2)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatUsdSmart(p.notionalUsd)}</AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{formatPct(p.apr)}</AppTd>
                    <AppTd
                      className={cn(
                        "text-right tabular-nums",
                        p.upfrontYieldUsd >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatUsdSmart(p.upfrontYieldUsd)}
                    </AppTd>
                    <AppTd className="text-right tabular-nums text-white/70">{outcomeFor(p)}</AppTd>
                  </tr>
                ))
              )}
            </tbody>
          </AppTable>
        )}
      </section>
    </div>
  );
}


