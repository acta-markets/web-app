"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppCard } from "@/components/app-ui/app-card";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { MARKETS, type MarketType, type Market, formatPct } from "@/lib/markets";
import { getNetwork, getTokenMint, getTokenPythId, getTokenSymbolByMint } from "@/lib/tokens";
import { getCapFilledPct } from "@/lib/token-caps";
import { getTokenBrand } from "@/lib/token-brand";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { computeApyFromScaledPrices } from "@acta-markets/ts-sdk/ws";

type PythLatestResponse =
  | { ok: true; prices: Record<string, { price: number; conf: number; expo: number; publishTime: number }> }
  | { ok: false; error: string };

function typeLabel(t: MarketType) {
  // Keep verbose names out of the UI; users already chose a strategy.
  return t === "call" ? "Call" : "Put";
}

function typeShort(t: MarketType) {
  return t === "call" ? "Call" : "CSP";
}

function normalizeExpiryTs(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Some backends may send ms timestamps; normalize to seconds.
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
}

export function EarnClient() {
  const [type, setType] = useState<MarketType>("call");
  const router = useRouter();
  const [howOpen, setHowOpen] = useState(false);
  const { tokenCaps, markets: rfqMarkets, getIndicativePricesCached } = useRfqContext();
  const network = getNetwork();
  const isTestnet = network === "testnet";
  const [sort, setSort] = useState<{ key: "minApr" | "maxApr"; dir: "asc" | "desc" } | null>(
    null
  );
  const [liveSpotByPythId, setLiveSpotByPythId] = useState<Record<string, number>>({});

  const listedMarkets = useMemo<Market[]>(() => {
    if (!isTestnet) return MARKETS;

    const rows: Market[] = [];
    const seen = new Set<string>();
    for (const m of rfqMarkets) {
      const underlyingMint = String(
        (m as unknown as { underlying?: string; underlying_mint?: string }).underlying ??
          (m as unknown as { underlying?: string; underlying_mint?: string }).underlying_mint ??
          ""
      ).trim();
      if (!underlyingMint) continue;

      const asset = getTokenSymbolByMint(underlyingMint, { preferWrappedSol: true });
      if (!asset) continue;

      const marketType: MarketType = (m as unknown as { is_put?: boolean }).is_put ? "csp" : "call";
      const key = `${asset}:${marketType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        asset,
        type: marketType,
        // On testnet, keep these zeroed so UI never shows static/mock APR fallback.
        minApr: 0,
        maxApr: 0,
        capFilledPct: 0,
        spotPrice: 0,
        pythId: getTokenPythId(asset),
        priceOptions: [0],
      });
    }
    return rows;
  }, [isTestnet, rfqMarkets]);
  const isLoadingLiveMarkets = isTestnet && rfqMarkets.length === 0;

  const rows = useMemo(() => listedMarkets.filter((m) => m.type === type), [listedMarkets, type]);
  const pythIdsForRows = useMemo(() => {
    const ids = new Set<string>();
    for (const row of listedMarkets) {
      const id = getTokenPythId(row.asset);
      if (id) ids.add(id.toLowerCase());
    }
    return Array.from(ids);
  }, [listedMarkets]);

  useEffect(() => {
    if (pythIdsForRows.length === 0) {
      setLiveSpotByPythId({});
      return;
    }

    let alive = true;
    const controller = new AbortController();
    const query = pythIdsForRows.map((id) => `ids[]=${encodeURIComponent(id)}`).join("&");

    const fetchLatest = async () => {
      try {
        const res = await fetch(`/api/pyth/latest?${query}`, { signal: controller.signal });
        const data = (await res.json()) as PythLatestResponse;
        if (!alive || !res.ok || !("ok" in data) || data.ok !== true) return;

        const next: Record<string, number> = {};
        for (const [id, entry] of Object.entries(data.prices ?? {})) {
          if (Number.isFinite(entry?.price) && entry.price > 0) {
            next[id.toLowerCase()] = Number(entry.price);
          }
        }
        if (Object.keys(next).length > 0) {
          setLiveSpotByPythId((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // ignore fetch errors; keep last known spots
      }
    };

    void fetchLatest();
    const intervalId = window.setInterval(fetchLatest, 10_000);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [pythIdsForRows]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => (a[sort.key] - b[sort.key]) * dir);
  }, [rows, sort]);

  const popular = useMemo(() => {
    // Make this robust to casing differences (e.g. "ZBTC" vs "zBTC").
    const preferred = ["WSOL", "jitoSOL", "JLP", "zBTC", "PUMP"];
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

  const nowSeconds = Math.floor(Date.now() / 1000);
  const normalizeIsPut = useCallback((value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
    }
    return null;
  }, []);

  const liveAprRangeByMarket = useMemo(() => {
    const out = new Map<string, { minAprPct: number; maxAprPct: number }>();

    for (const row of listedMarkets) {
      const underlyingMint = (getTokenMint(row.asset) ?? "").trim();
      if (!underlyingMint) continue;
      const isPut = row.type === "csp";
      const matchingRfqMarkets = rfqMarkets
        .map((m) => {
          const marketUnderlying = String(
            (m as unknown as { underlying?: string; underlying_mint?: string }).underlying ??
              (m as unknown as { underlying?: string; underlying_mint?: string }).underlying_mint ??
              ""
          ).trim();
          const marketIsPut = normalizeIsPut((m as unknown as { is_put?: unknown }).is_put);
          const expiryTs = normalizeExpiryTs((m as unknown as { expiry_ts?: unknown }).expiry_ts);
          return { market: m, marketUnderlying, marketIsPut, expiryTs };
        })
        .filter(({ marketUnderlying, marketIsPut, expiryTs }) => {
          return (
            marketUnderlying === underlyingMint &&
            marketIsPut === isPut &&
            expiryTs != null &&
            expiryTs > nowSeconds
          );
        })
        .sort((a, b) => (a.expiryTs ?? 0) - (b.expiryTs ?? 0));
      if (!matchingRfqMarkets.length) continue;

      const positionType = row.type === "call" ? "covered_call" : "cash_secured_put";
      const pythId = getTokenPythId(row.asset)?.toLowerCase();
      const liveSpot = pythId ? liveSpotByPythId[pythId] : undefined;
      const fallbackSpot = Number.isFinite(row.spotPrice) && row.spotPrice > 0 ? row.spotPrice : null;
      const spot = Number.isFinite(liveSpot) && (liveSpot ?? 0) > 0 ? Number(liveSpot) : fallbackSpot;
      if (!spot || !Number.isFinite(spot) || spot <= 0) continue;

      for (const { market: matchingRfqMarket, expiryTs } of matchingRfqMarkets) {
        const marketPda = matchingRfqMarket?.pda;
        if (!marketPda || !expiryTs) continue;
        const indicative = getIndicativePricesCached(marketPda, positionType);
        if (!indicative?.strikes?.length) continue;
        const secondsToExpiry = expiryTs - nowSeconds;
        if (secondsToExpiry <= 0) continue;

        const aprValuesPct = indicative.strikes
          .map((s) => {
            const bestPrice = s.best_price ? Number(s.best_price) : null;
            const strike = Number(s.strike);
            if (!bestPrice || !Number.isFinite(strike) || strike <= 0) return null;
            try {
              const result = computeApyFromScaledPrices({
                positionType,
                underlyingAmount: 1,
                grossPremiumPerUnit1e9: bestPrice,
                strike1e9: strike,
                spotPrice1e9: Math.round(spot * 1_000_000_000),
                secondsToExpiry,
              });
              return result.apr * 100;
            } catch {
              return null;
            }
          })
          .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
        if (!aprValuesPct.length) continue;

        out.set(`${row.asset.toUpperCase()}:${row.type}`, {
          minAprPct: Math.min(...aprValuesPct),
          maxAprPct: Math.max(...aprValuesPct),
        });
        break;
      }
    }

    return out;
  }, [listedMarkets, rfqMarkets, normalizeIsPut, getIndicativePricesCached, nowSeconds, liveSpotByPythId]);

  const getAprRange = useCallback(
    (m: Market): { minAprPct: number; maxAprPct: number } | null => {
      const live = liveAprRangeByMarket.get(`${m.asset.toUpperCase()}:${m.type}`) ?? null;
      if (live) return live;
      // Testnet must be strict: no static APR fallback values.
      if (isTestnet) return null;
      return { minAprPct: m.minApr, maxAprPct: m.maxApr };
    },
    [liveAprRangeByMarket, isTestnet]
  );

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
          {isLoadingLiveMarkets
            ? Array.from({ length: 4 }).map((_, idx) => (
                <AppCard key={`popular-skeleton-${idx}`} className="relative overflow-hidden p-4">
                  <div className="h-1.5 w-full animate-pulse rounded bg-white/15" />
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
                    <div className="h-5 w-20 animate-pulse rounded bg-white/10" />
                  </div>
                  <div className="mt-6 h-4 w-16 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-8 w-28 animate-pulse rounded bg-white/10" />
                  <div className="mt-5 h-3 w-24 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-white/10" />
                </AppCard>
              ))
            : popular.map((m) => (
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
                  {(() => {
                    const aprRange = getAprRange(m);
                    return aprRange
                      ? `${formatPct(aprRange.minAprPct)}–${formatPct(aprRange.maxAprPct)}`
                      : "—";
                  })()}
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
            {isLoadingLiveMarkets
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`table-skeleton-${idx}`} className="border-b border-white/5 last:border-b-0">
                    <AppTd><div className="h-4 w-20 animate-pulse rounded bg-white/10" /></AppTd>
                    <AppTd><div className="h-4 w-14 animate-pulse rounded bg-white/10" /></AppTd>
                    <AppTd className="text-right"><div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/10" /></AppTd>
                    <AppTd className="text-right"><div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/10" /></AppTd>
                    <AppTd className="text-right"><div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/10" /></AppTd>
                    <AppTd className="text-right"><div className="ml-auto h-4 w-4 animate-pulse rounded bg-white/10" /></AppTd>
                  </tr>
                ))
              : sortedRows.map((m) => {
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
                <AppTd className="text-right">
                  {(() => {
                    const aprRange = getAprRange(m);
                    return aprRange ? formatPct(aprRange.minAprPct) : "—";
                  })()}
                </AppTd>
                <AppTd className="text-right">
                  {(() => {
                    const aprRange = getAprRange(m);
                    return aprRange ? formatPct(aprRange.maxAprPct) : "—";
                  })()}
                </AppTd>
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
