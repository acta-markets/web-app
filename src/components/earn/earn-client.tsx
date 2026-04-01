"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppModal } from "@/components/app-ui/app-modal";
import { type MarketType, formatPct } from "@/lib/markets";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { normalizeTokenSymbol } from "@/lib/tokens";
import type { EarnAssetSummary } from "@/lib/rfq-client";

type EarnRow = {
  asset: string;
  type: MarketType;
  minAprPct: number | null;
  maxAprPct: number | null;
  capFilledPct: number;
  nearestMarketPda: string;
};

function typeShort(t: MarketType) {
  return t === "call" ? "Call" : "CSP";
}

function summaryToRow(s: EarnAssetSummary): EarnRow {
  const type: MarketType = s.position_type === "cash_secured_put" ? "csp" : "call";
  return {
    asset: s.underlying_symbol ? normalizeTokenSymbol(s.underlying_symbol) : "?",
    type,
    minAprPct: s.min_apr != null ? s.min_apr * 100 : null,
    maxAprPct: s.max_apr != null ? s.max_apr * 100 : null,
    capFilledPct: Math.max(0, Math.min(100, (s.cap_filled_pct ?? 0) * 100)),
    nearestMarketPda: s.nearest_market_pda,
  };
}

export function EarnClient() {
  const [type, setType] = useState<MarketType>("call");
  const router = useRouter();
  const [howOpen, setHowOpen] = useState(false);
  const { earnSummary, connectionState, getEarnSummary } = useRfqContext();

  const wsReady =
    connectionState !== "disconnected" && connectionState !== "error" && connectionState !== "connecting";
  useEffect(() => {
    if (!wsReady) return;
    getEarnSummary();
  }, [wsReady, getEarnSummary]);
  const [sort, setSort] = useState<{ key: "minAprPct" | "maxAprPct"; dir: "asc" | "desc" } | null>(null);

  const isLoading = earnSummary === null;

  const allRows = useMemo<EarnRow[]>(() => {
    if (!earnSummary) return [];
    return earnSummary.map(summaryToRow);
  }, [earnSummary]);

  const rows = useMemo(() => allRows.filter((r) => r.type === type), [allRows, type]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)) * dir);
  }, [rows, sort]);

  const popular = useMemo(() => {
    const preferred = ["WSOL", "jitoSOL", "JLP", "zBTC", "PUMP"];
    const order = new Map(preferred.map((s, i) => [s.toUpperCase(), i]));
    return rows
      .filter((r) => order.has(r.asset.toUpperCase()))
      .sort((a, b) => (order.get(a.asset.toUpperCase()) ?? 999) - (order.get(b.asset.toUpperCase()) ?? 999));
  }, [rows]);

  const formatAprRange = (row: EarnRow): string => {
    if (row.minAprPct == null || row.maxAprPct == null) return "—";
    return `${formatPct(row.minAprPct)}–${formatPct(row.maxAprPct)}`;
  };

  return (
    <div>
      {/* Hero — pt-[104px] pb-[80px] gap-[32px] */}
      <div className="flex flex-col items-center gap-8 pb-20 pt-[104px]">
        <div className="flex w-[298px] flex-col items-center gap-3">
          <h1 className="w-full text-center font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
            Earn
          </h1>
          <div className="flex w-full flex-col items-center gap-1.5">
            <p className="w-full text-center text-base font-normal leading-[1.2] tracking-[-0.32px] text-content-secondary">
              Get instant yield on your assets
            </p>
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="inline-flex items-center gap-0.5 text-base font-medium leading-[1.2] tracking-[-0.32px] text-accent-secondary hover:text-accent-primary"
            >
              How it works
              <img src="/chevron-right-duo.svg" alt="" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Calls / Puts — gap-[8px], both flex-1 */}
        <div className="flex w-full max-w-[850px] gap-2 max-xl:px-[71px] max-lg:px-6">
          {(["call", "csp"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className="flex-1">
              <div className={[
                "flex flex-col items-center gap-1.5 border px-6 py-5 backdrop-blur-[4px] transition-colors",
                type === t
                  ? "bg-[rgba(42,162,134,0.2)] border-[rgba(42,162,134,0.3)]"
                  : "bg-[rgba(18,18,18,0.01)] border-bg-border hover:bg-[rgba(40,40,40,0.24)] hover:border-[rgba(240,240,240,0.15)]"
              ].join(" ")}>
                <span className="text-xl font-bold leading-[1.2] tracking-[-0.4px] text-content-primary">
                  {t === "call" ? "Calls" : "Puts"}
                </span>
                <p className={[
                  "text-sm text-center leading-[1.2] tracking-[-0.28px] w-full",
                  type === t ? "text-[rgba(240,240,240,0.5)]" : "text-content-secondary"
                ].join(" ")}>
                  {t === "call"
                    ? "Deposit the asset and earn premium. If spot finishes above your selected price, you sell there, otherwise you keep your asset"
                    : "Deposit USDC and earn premium. If spot finishes below your selected price, you buy the asset there, otherwise you keep your USDC"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content — 850px centered */}
      <div className="mx-auto w-full max-w-[850px] pb-20 max-xl:px-[71px] max-lg:px-6">
        {/* Popular — gap title-to-cards: 16px */}
        <section className="flex flex-col gap-4">
          <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
            Popular
          </h2>

          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {isLoading
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`popular-skeleton-${idx}`} className="relative flex h-[220px] flex-col items-start justify-end gap-3 overflow-clip border border-bg-border bg-bg-primary p-6">
                    <div className="absolute left-[-1px] right-[-1px] top-0 h-[74px] animate-pulse bg-action-primary" />
                    <div className="relative z-10 flex w-full flex-col items-center gap-2.5">
                      <div className="h-14 w-14 animate-pulse rounded-full bg-action-primary" />
                      <div className="h-6 w-20 animate-pulse rounded bg-action-primary" />
                    </div>
                    <div className="relative z-10 flex w-full items-center gap-1">
                      <div className="flex-1"><div className="mx-auto h-4 w-16 animate-pulse rounded bg-action-primary" /></div>
                      <div className="h-6 w-px bg-bg-border" />
                      <div className="flex-1"><div className="mx-auto h-4 w-16 animate-pulse rounded bg-action-primary" /></div>
                    </div>
                  </div>
                ))
              : popular.map((m) => (
              <Link
                key={`${m.asset}:${m.type}`}
                href={`/market/${encodeURIComponent(m.asset)}?type=${m.type}&market=${encodeURIComponent(m.nearestMarketPda)}`}
                className="group block"
              >
                {/* Card — exact Figma: 275x220, backdrop-blur-[4px], border #282828, bg #121212, overflow-clip */}
                <div className="relative flex h-[220px] flex-col items-start justify-end gap-3 overflow-clip border border-bg-border bg-bg-primary backdrop-blur-[4px] pb-6 pt-5 px-6 transition-colors hover:bg-[rgba(40,40,40,0.24)] hover:border-[rgba(240,240,240,0.15)]">
                  {/* Decorative top band */}
                  <div
                    className="absolute left-[-1px] right-[-1px] top-0 h-[74px] overflow-clip bg-black"
                    style={{
                      backgroundImage: "url(/bg-card-band.png)",
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }}
                  />

                  {/* Logo + name */}
                  <div className="relative z-10 flex w-full flex-col items-center gap-2.5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-clip rounded-full border border-[rgba(240,240,240,0.1)] bg-[#f0f0f0] shadow-[0_0_0_5px_#121212]">
                      <img
                        src={getTokenLogoSrc(m.asset)}
                        alt={`${m.asset}`}
                        className="h-14 w-14 rounded-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="w-full text-center text-2xl font-bold leading-[1.2] tracking-[-0.48px] text-content-primary">
                      {m.asset}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="relative z-10 flex w-full items-center gap-1">
                    <div className="flex flex-1 flex-col items-start gap-1.5 text-center leading-[1.2]">
                      <span className="w-full text-sm tracking-[-0.28px] text-content-secondary">
                        APR range
                      </span>
                      <span className="w-full text-base font-medium tracking-[-0.32px] text-content-primary">
                        {formatAprRange(m)}
                      </span>
                    </div>
                    <div className="h-6 w-px shrink-0 bg-bg-border" />
                    <div className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="w-full text-center text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                        Cap filled
                      </span>
                      <div className="flex w-[93px] items-center gap-2">
                        <span className="shrink-0 text-center text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                          {formatPct(m.capFilledPct)}
                        </span>
                        <div className="flex h-2.5 min-h-px min-w-px flex-1 items-start bg-accent-primary/20">
                          <div
                            className="h-full min-h-px min-w-px bg-accent-primary"
                            style={{ width: `${Math.min(100, m.capFilledPct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="h-16" />

        {/* All markets — H2 40px */}
        <section className="flex flex-col gap-4">
          <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
            All markets
          </h2>

          {/* Table */}
          <div className="overflow-clip border border-bg-border backdrop-blur-[4px]">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-bg-border bg-bg-primary py-3 pl-5 pr-12">
              <div className="flex-1 text-xs font-medium leading-[1.2] tracking-[-0.24px] text-content-secondary">Asset</div>
              <div className="w-[120px] text-xs font-medium leading-[1.2] tracking-[-0.24px] text-content-secondary">Type</div>
              <button
                type="button"
                className="flex w-[120px] items-center gap-1 text-xs font-medium leading-[1.2] tracking-[-0.24px] text-content-secondary"
                onClick={() => setSort((p) => p?.key === "minAprPct" ? { key: "minAprPct", dir: p.dir === "asc" ? "desc" : "asc" } : { key: "minAprPct", dir: "desc" })}
              >
                Min APR <span className="text-content-tertiary">{sort?.key === "minAprPct" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
              </button>
              <button
                type="button"
                className="flex w-[120px] items-center gap-1 text-xs font-medium leading-[1.2] tracking-[-0.24px] text-content-secondary"
                onClick={() => setSort((p) => p?.key === "maxAprPct" ? { key: "maxAprPct", dir: p.dir === "asc" ? "desc" : "asc" } : { key: "maxAprPct", dir: "desc" })}
              >
                Max APR <span className="text-content-tertiary">{sort?.key === "maxAprPct" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
              </button>
              <div className="w-[120px] text-xs font-medium leading-[1.2] tracking-[-0.24px] text-content-secondary">Cap filled</div>
            </div>

            {/* Rows */}
            {isLoading
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <div key={`table-skeleton-${idx}`} className="flex h-[60px] items-center gap-2 border-b border-bg-border bg-bg-primary p-5 last:border-b-0">
                    <div className="flex-1"><div className="h-4 w-20 animate-pulse rounded bg-action-primary" /></div>
                    <div className="w-[120px]"><div className="h-4 w-14 animate-pulse rounded bg-action-primary" /></div>
                    <div className="w-[120px]"><div className="h-4 w-12 animate-pulse rounded bg-action-primary" /></div>
                    <div className="w-[120px]"><div className="h-4 w-12 animate-pulse rounded bg-action-primary" /></div>
                    <div className="w-[120px]"><div className="h-4 w-12 animate-pulse rounded bg-action-primary" /></div>
                    <div className="w-5"><div className="h-4 w-4 animate-pulse rounded bg-action-primary" /></div>
                  </div>
                ))
              : sortedRows.map((m) => {
              const href = `/market/${encodeURIComponent(m.asset)}?type=${m.type}&market=${encodeURIComponent(m.nearestMarketPda)}`;
              return (
                <div
                  key={`${m.asset}:${m.type}`}
                  className="flex h-[60px] cursor-pointer items-center gap-2 border-b border-bg-border bg-bg-primary p-5 transition-colors hover:bg-action-primary last:border-b-0"
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(href); } }}
                >
                  <div className="flex flex-1 items-center gap-1.5">
                    <div className="flex h-[18px] w-[18px] items-center justify-center overflow-clip rounded-full border border-[rgba(240,240,240,0.1)] bg-[#f0f0f0]">
                      <img src={getTokenLogoSrc(m.asset)} alt="" className="h-[18px] w-[18px] rounded-full object-cover" loading="lazy" />
                    </div>
                    <span className="text-sm font-medium leading-[1.2] tracking-[-0.28px] text-content-primary">{m.asset}</span>
                  </div>
                  <div className="w-[120px] text-sm font-medium leading-[1.2] tracking-[-0.28px] text-content-primary">{typeShort(m.type)}</div>
                  <div className="w-[120px] text-sm font-medium leading-[1.2] tracking-[-0.28px] text-content-primary">{m.minAprPct != null ? formatPct(m.minAprPct) : "—"}</div>
                  <div className="w-[120px] text-sm font-medium leading-[1.2] tracking-[-0.28px] text-content-primary">{m.maxAprPct != null ? formatPct(m.maxAprPct) : "—"}</div>
                  <div className="w-[120px] text-sm font-medium leading-[1.2] tracking-[-0.28px] text-content-primary">{formatPct(m.capFilledPct)}</div>
                  <div className="w-5 text-center text-content-secondary">»</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <AppModal open={howOpen} onClose={() => setHowOpen(false)} title="Acta Earn">
        <div className="space-y-3 text-[15px]">
          {[
            { n: "1) Choose strategy", t: <>Pick <span className="font-medium text-accent-secondary">Calls</span> or <span className="font-medium text-accent-secondary">Puts</span>.</> },
            { n: "2) Pick a market", t: "Choose an asset (e.g. JLP, jitoSOL, zBTC) and pick the expiry and price you're comfortable with." },
            { n: "3) Deposit", t: "Deposit collateral (asset for calls, USDC for puts). You earn upfront premium right after deposit." },
            { n: "4) Settlement at expiry", t: <ul className="list-disc space-y-2 pl-5"><li><span className="font-medium text-content-primary">Calls</span>: if spot &gt; your price, your asset is sold at that price. Otherwise, you keep the asset.</li><li><span className="font-medium text-content-primary">Puts</span>: if spot &lt; your price, your USDC buys the asset at that price. Otherwise, you keep the USDC.</li></ul> },
          ].map((s) => (
            <div key={s.n} className="border border-bg-border bg-action-primary p-4">
              <div className="font-medium text-content-primary">{s.n}</div>
              <div className="mt-2 text-content-primary/80">{s.t}</div>
            </div>
          ))}
        </div>
      </AppModal>
    </div>
  );
}
