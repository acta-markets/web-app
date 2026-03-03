"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppCard } from "@/components/app-ui/app-card";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { MARKETS, type MarketType, formatPct } from "@/lib/markets";
import { getTokenMint } from "@/lib/tokens";
import { getCapFilledPct } from "@/lib/token-caps";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { useRfqContext } from "@/components/rfq/rfq-provider";

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
  const { tokenCaps } = useRfqContext();
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

  const capFilledPctByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const tokenCap of tokenCaps) {
      const mint = String(tokenCap.underlying_mint ?? "").trim();
      if (!mint) continue;
      const liveFilled = getCapFilledPct(tokenCap);
      if (liveFilled == null) continue;
      map.set(mint, liveFilled);
    }
    return map;
  }, [tokenCaps]);

  const getMarketCapFilledPct = useCallback((asset: string, fallbackCapFilledPct: number) => {
    const mint = (getTokenMint(asset) ?? "").trim();
    const fallbackFilled = Math.max(0, Math.min(100, fallbackCapFilledPct));
    if (!mint) return fallbackFilled;
    return capFilledPctByAsset.get(mint) ?? fallbackFilled;
  }, [capFilledPctByAsset]);

  return (
    <div className="space-y-8">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Earn</h1>
          <p className="max-w-2xl text-sm text-content-secondary">
            Get instant yield on your assets.{" "}
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="font-semibold text-accent-primary hover:underline underline-offset-4"
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
                "hover:-translate-y-0.5 hover:shadow-md",
                type === "call"
                  ? "!border-yuzu-main/60 !bg-yuzu-main/10"
                  : "hover:bg-white/10"
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className="text-accent-primary">📈</span>
                    Calls
                  </div>
                  <div className="mt-2 text-sm text-content-secondary">
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
                "hover:-translate-y-0.5 hover:shadow-md",
                type === "csp"
                  ? "!border-yuzu-main/60 !bg-yuzu-main/10"
                  : "hover:bg-white/10"
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className="text-accent-primary">📉</span>
                    Puts
                  </div>
                  <div className="mt-2 text-sm text-content-secondary">
                    Deposit USDC and earn premium. If spot finishes below your selected price, you buy
                    the asset there, otherwise you keep your USDC
                  </div>
                </div>
              </div>
            </AppCard>
          </button>
        </div>
      </header>

      <AppModal open={howOpen} onClose={() => setHowOpen(false)} title="Acta Earn">
        <div className="space-y-3 text-[15px]">
          <div className="rounded-xl border border-bg-border bg-action-primary/30 p-4">
            <div className="font-semibold text-content-primary">1) Choose strategy</div>
            <div className="mt-2 text-content-primary/80">
              Pick <span className="font-semibold text-accent-primary">📈 Calls</span> or{" "}
              <span className="font-semibold text-accent-primary">📉 Puts</span>.
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-action-primary/30 p-4">
            <div className="font-semibold text-content-primary">2) Pick a market</div>
            <div className="mt-2 text-content-primary/80">
              Choose an asset (e.g. JLP, jitoSOL, zBTC) and pick the expiry and price you&apos;re comfortable with.
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-action-primary/30 p-4">
            <div className="font-semibold text-content-primary">3) Deposit</div>
            <div className="mt-2 text-content-primary/80">
              Deposit collateral (asset for calls, USDC for puts). You earn upfront premium right after deposit.
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-action-primary/30 p-4">
            <div className="font-semibold text-content-primary">4) Settlement at expiry</div>
            <div className="mt-2 text-content-primary/80">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="font-semibold text-content-primary">Calls</span>: if spot &gt; your price, your asset is sold at that price (you receive USDC). Otherwise, you keep the asset.
                </li>
                <li>
                  <span className="font-semibold text-content-primary">Puts</span>: if spot &lt; your price, your USDC buys the asset at that price. Otherwise, you keep the USDC.
                </li>
              </ul>
            </div>
          </div>

          <div className="text-sm text-content-secondary">
            Note: This is a UI prototype; final mechanics (fees/oracles/settlement) will be documented.
          </div>
        </div>
      </AppModal>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-content-secondary">Popular</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((m) => (
            <Link
              key={`${m.asset}:${m.type}`}
              href={`/market/${encodeURIComponent(m.asset)}?type=${m.type}`}
              className="group block"
            >
              <AppCard
                className="relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary/60 p-1"
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

                <div className="mt-4 text-sm text-content-secondary">
                  APR range
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatPct(m.minApr)}–{formatPct(m.maxApr)}
                </div>

                <div className="mt-4 text-xs text-content-tertiary">
                  Cap filled:{" "}
                  <span className="font-semibold text-content-secondary">
                    {formatPct(getMarketCapFilledPct(m.asset, m.capFilledPct))}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-action-primary/20">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${getMarketCapFilledPct(m.asset, m.capFilledPct)}%`,
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
          <div className="text-sm font-semibold text-content-secondary">All markets</div>
        </div>

        <AppTable className="border border-white/10 bg-white/5">
          <thead>
            <tr className="border-b border-white/10">
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
                  <span className="inline-flex w-4 justify-end text-content-tertiary">
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
                  <span className="inline-flex w-4 justify-end text-content-tertiary">
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
                className="cursor-pointer border-b border-white/5 last:border-b-0 hover:bg-yuzu-main/15"
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
                <AppTd className="font-semibold text-content-primary">{m.asset}</AppTd>
                <AppTd>
                  <span className="text-sm font-semibold text-content-secondary">
                    {typeShort(m.type)}
                  </span>
                </AppTd>
                <AppTd className="text-right">{formatPct(m.minApr)}</AppTd>
                <AppTd className="text-right">{formatPct(m.maxApr)}</AppTd>
                <AppTd className="text-right">{formatPct(getMarketCapFilledPct(m.asset, m.capFilledPct))}</AppTd>
                <AppTd className="text-right text-content-tertiary">→</AppTd>
              </tr>
            )})}
          </tbody>
        </AppTable>
      </section>
    </div>
  );
}
