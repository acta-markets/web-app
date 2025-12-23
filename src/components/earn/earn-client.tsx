"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppCard } from "@/components/app-ui/app-card";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { MARKETS, type MarketType, formatPct } from "@/lib/markets";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";

function typeLabel(t: MarketType) {
  // Keep verbose names out of the UI; users already chose a strategy.
  return t === "call" ? "Call" : "Put";
}

function typeShort(t: MarketType) {
  return t === "call" ? "Call" : "CSP";
}

export function EarnClient() {
  const [type, setType] = useState<MarketType>("call");
  const router = useRouter();
  const [howOpen, setHowOpen] = useState(false);
  const [sort, setSort] = useState<{ key: "minApr" | "maxApr"; dir: "asc" | "desc" } | null>(
    null
  );

  const rows = useMemo(() => MARKETS.filter((m) => m.type === type), [type]);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => (a[sort.key] - b[sort.key]) * dir);
  }, [rows, sort]);

  const popular = useMemo(() => {
    // Make this robust to casing differences (e.g. "ZBTC" vs "zBTC").
    const preferred = ["jitoSOL", "JLP", "zBTC", "PUMP"];
    const order = new Map(preferred.map((s, i) => [s.toUpperCase(), i]));
    return rows
      .filter((r) => order.has(r.asset.toUpperCase()))
      .sort((a, b) => (order.get(a.asset.toUpperCase()) ?? 999) - (order.get(b.asset.toUpperCase()) ?? 999));
  }, [rows]);

  return (
    <div className="space-y-8">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Earn</h1>
          <p className="max-w-2xl text-sm text-black/60 dark:text-white/60">
            Get instant yield on your assets.{" "}
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="font-semibold text-yuzu-main hover:underline underline-offset-4"
            >
              How it works
            </button>
          </p>
        </div>

        <div className="flex max-w-full flex-col gap-4 md:flex-row md:items-start lg:max-w-[720px] lg:justify-end">
          <button
            type="button"
            onClick={() => setType("call")}
            className="w-full text-left md:w-[340px]"
          >
            <AppCard
              className={[
                "p-5 transition-all",
                "hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30",
                type === "call"
                  ? "border-yuzu-main/60 bg-yuzu-main/10 ring-2 ring-yuzu-main/50"
                  : "border-white/10 bg-black/20 ring-0 hover:bg-white/5"
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className="text-yuzu-main">📈</span>
                    Calls
                  </div>
                  <div className="mt-2 text-sm text-white/60">
                    Deposit the asset and earn premium. If spot finishes above your selected price, you
                    sell there, otherwise you keep your asset
                  </div>
                </div>
              </div>
            </AppCard>
          </button>

          <button
            type="button"
            onClick={() => setType("csp")}
            className="w-full text-left md:w-[340px]"
          >
            <AppCard
              className={[
                "p-5 transition-all",
                "hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30",
                type === "csp"
                  ? "border-yuzu-main/60 bg-yuzu-main/10 ring-2 ring-yuzu-main/50"
                  : "border-white/10 bg-black/20 ring-0 hover:bg-white/5"
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className="text-yuzu-main">📉</span>
                    Puts
                  </div>
                  <div className="mt-2 text-sm text-white/60">
                    Deposit USDC and earn premium. If spot finishes below your selected price, you buy
                    the asset there, otherwise you keep your USDC
                  </div>
                </div>
              </div>
            </AppCard>
          </button>
        </div>
      </header>

      <AppModal open={howOpen} onClose={() => setHowOpen(false)} title="Yuzu Earn">
        <div className="space-y-3 text-sm text-white/80">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">1) Choose strategy</div>
            <div className="mt-2 text-white/70">
              Pick <span className="font-semibold text-yuzu-main">📈 Calls</span> or{" "}
              <span className="font-semibold text-yuzu-main">📉 Puts</span>.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">2) Pick a market</div>
            <div className="mt-2 text-white/70">
              Choose an asset (e.g. JLP, jitoSOL, zBTC) and pick the expiry and price you’re comfortable with.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">3) Deposit</div>
            <div className="mt-2 text-white/70">
              Deposit collateral (asset for calls, USDC for puts). You earn upfront premium right after deposit.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">4) Settlement at expiry</div>
            <div className="mt-2 text-white/70">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <span className="font-semibold text-white">Calls</span>: if spot &gt; your price, your asset is sold at that price (you receive USDC). Otherwise, you keep the asset.
                </li>
                <li>
                  <span className="font-semibold text-white">Puts</span>: if spot &lt; your price, your USDC buys the asset at that price. Otherwise, you keep the USDC.
                </li>
              </ul>
            </div>
          </div>

          <div className="text-xs text-white/50">
            Note: This is a UI prototype; final mechanics (fees/oracles/settlement) will be documented.
          </div>
        </div>
      </AppModal>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-black/70 dark:text-white/70">Popular</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((m) => (
            <Link
              key={`${m.asset}:${m.type}`}
              href={`/market/${encodeURIComponent(m.asset)}?type=${m.type}`}
              className="group block"
            >
              <AppCard
                className="relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30"
                style={
                  {
                    ["--brand-a" as any]: getTokenBrand(m.asset).a,
                    ["--brand-b" as any]: getTokenBrand(m.asset).b
                  } as React.CSSProperties
                }
              >
                <div
                  className="absolute inset-x-0 top-0 h-1.5 opacity-90"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--brand-a), var(--brand-b))"
                  }}
                />

                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 30%, var(--brand-a), transparent 60%)"
                  }}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white/60 p-1 dark:border-white/10 dark:bg-black/30"
                      style={{
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)"
                      }}
                    >
                      <img
                        src={getTokenLogoSrc(m.asset)}
                        alt={`${m.asset} logo`}
                        className="h-full w-full rounded-lg object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div>
                      <div className="text-base font-semibold">{m.asset}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-black/60 dark:text-white/60">
                  APR range
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatPct(m.minApr)}–{formatPct(m.maxApr)}
                </div>

                <div className="mt-4 text-xs text-black/50 dark:text-white/50">
                  Cap filled:{" "}
                  <span className="font-semibold text-black/70 dark:text-white/70">
                    {formatPct(m.capFilledPct)}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/5 dark:bg-white/10">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${m.capFilledPct}%`,
                      background:
                        "linear-gradient(90deg, var(--brand-a), var(--brand-b))"
                    }}
                  />
                </div>

                {/* Entire card is clickable; no explicit Open CTA */}
              </AppCard>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-black/70 dark:text-white/70">All markets</div>
        </div>

        <AppTable>
          <thead>
            <tr className="border-b border-black/10">
              <AppTh>Asset</AppTh>
              <AppTh>Type</AppTh>
              <AppTh className="text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 whitespace-nowrap"
                  onClick={() =>
                    setSort((prev) =>
                      prev?.key === "minApr"
                        ? { key: "minApr", dir: prev.dir === "asc" ? "desc" : "asc" }
                        : { key: "minApr", dir: "desc" }
                    )
                  }
                >
                  Min APR
                  <span className="inline-flex w-4 justify-end text-black/40 dark:text-white/40">
                    {sort?.key === "minApr" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </AppTh>
              <AppTh className="text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 whitespace-nowrap"
                  onClick={() =>
                    setSort((prev) =>
                      prev?.key === "maxApr"
                        ? { key: "maxApr", dir: prev.dir === "asc" ? "desc" : "asc" }
                        : { key: "maxApr", dir: "desc" }
                    )
                  }
                >
                  Max APR
                  <span className="inline-flex w-4 justify-end text-black/40 dark:text-white/40">
                    {sort?.key === "maxApr" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </AppTh>
              <AppTh className="text-right">Cap Filled</AppTh>
              <AppTh className="text-right" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((m) => {
              const href = `/market/${encodeURIComponent(m.asset)}?type=${m.type}`;
              return (
              <tr
                key={`${m.asset}:${m.type}`}
                className="cursor-pointer border-b border-black/5 hover:bg-yuzu-main/10 dark:border-white/10 dark:hover:bg-yuzu-main/10 last:border-b-0"
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
              >
                <AppTd className="font-semibold text-black">{m.asset}</AppTd>
                <AppTd>
                  <span className="text-sm font-semibold text-black/70 dark:text-white/70">
                    {typeShort(m.type)}
                  </span>
                </AppTd>
                <AppTd className="text-right">{formatPct(m.minApr)}</AppTd>
                <AppTd className="text-right">{formatPct(m.maxApr)}</AppTd>
                <AppTd className="text-right">{formatPct(m.capFilledPct)}</AppTd>
                <AppTd className="text-right text-yuzu-main">→</AppTd>
              </tr>
            )})}
          </tbody>
        </AppTable>
      </section>
    </div>
  );
}


