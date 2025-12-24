"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { MarketChart } from "@/components/market/market-chart";
import { getTokenLogoSrc } from "@/lib/token-assets";
import {
  MARKETS,
  getMarket,
  type MarketType,
  formatPct,
  formatUsdSmart
} from "@/lib/markets";

type PythLatestResponse =
  | { ok: true; prices: Record<string, { price: number; conf: number; expo: number; publishTime: number }> }
  | { ok: false; error: string };

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatUsdc(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} USDC`;
}

export function MarketClient({ asset }: { asset: string }) {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const type: MarketType = typeParam === "csp" ? "csp" : "call";

  const market = useMemo(() => getMarket(asset, type), [asset, type]);
  const [assetOpen, setAssetOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartRange, setChartRange] = useState<"1w" | "1m" | "3m">("1w");
  const assetOptions = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const m of MARKETS) uniq.set(m.asset.toUpperCase(), m.asset);
    // Keep a sensible order (zBTC near top, then the rest alpha)
    const preferred = ["JLP", "JITOSOL", "ZBTC", "ETH", "PUMP", "BONK"];
    const items = Array.from(uniq.values());
    items.sort((a, b) => {
      const ia = preferred.indexOf(a.toUpperCase());
      const ib = preferred.indexOf(b.toUpperCase());
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    return items;
  }, []);

  const today = useMemo(() => new Date(), []);
  const strikeDates = useMemo(() => [addDays(today, 14), addDays(today, 28)], [today]);

  const [strikeIdx, setStrikeIdx] = useState<0 | 1>(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [deposit, setDeposit] = useState("");
  const [live, setLive] = useState<{ price: number; publishTime: number } | null>(null);
  const pythId = market?.pythId;
  const [baseSpot, setBaseSpot] = useState<number | null>(null);
  const spotForHooks = live?.price ?? market?.spotPrice ?? 0;

  useEffect(() => {
    // Default: show chart on desktop, hidden on mobile.
    setChartOpen(window.innerWidth >= 1024);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Persist chart range so it doesn't reset on any remount / responsive chart swap.
    try {
      const v = window.localStorage.getItem("yuzu_chart_range");
      if (v === "1w" || v === "1m" || v === "3m") setChartRange(v);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("yuzu_chart_range", chartRange);
    } catch {
      // ignore
    }
  }, [chartRange]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function tick() {
      if (!pythId) return;
      try {
        const res = await fetch(`/api/pyth/latest?ids[]=${encodeURIComponent(pythId)}`, {
          signal: controller.signal
        });
        const data = (await res.json()) as PythLatestResponse;
        if (!alive) return;
        if (!res.ok || !("ok" in data) || data.ok !== true) return;

        const key = pythId.toLowerCase();
        const p = data.prices[key];
        if (p && Number.isFinite(p.price)) {
          setLive({ price: p.price, publishTime: p.publishTime });
        }
      } catch {
        // ignore; keep last known price or mock fallback
      }
    }

    void tick();
    const id = window.setInterval(tick, 10_000);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, [pythId]);

  useEffect(() => {
    if (!assetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAssetOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-asset-switcher]")) return;
      setAssetOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [assetOpen]);

  useEffect(() => {
    // Lock strikes to the initial spot on page load (or first live price).
    if (baseSpot == null && Number.isFinite(spotForHooks) && spotForHooks > 0) {
      setBaseSpot(spotForHooks);
      return;
    }
    // If we started from mock spot and later receive live, update once.
    if (baseSpot != null && live?.price && baseSpot === (market?.spotPrice ?? baseSpot)) {
      setBaseSpot(live.price);
    }
  }, [baseSpot, live?.price, market?.spotPrice, spotForHooks]);

  function roundNice(n: number) {
    const abs = Math.abs(n);
    let step = 1;
    if (abs >= 10000) step = 500;
    else if (abs >= 1000) step = 25;
    else if (abs >= 100) step = 1;
    else if (abs >= 1) step = 0.01;
    else if (abs >= 0.01) step = 0.0001;
    else step = 0.0000001;
    return Math.round(n / step) * step;
  }

  const priceOptions = useMemo(() => {
    const s = baseSpot ?? spotForHooks ?? 0;
    const count = Math.max(3, market?.priceOptions.length ?? 3);
    const callMults = count === 4 ? [1.03, 1.06, 1.09, 1.15] : [1.04, 1.08, 1.14];
    const putMults = count === 4 ? [0.97, 0.94, 0.91, 0.85] : [0.96, 0.92, 0.86];
    const mults = type === "call" ? callMults : putMults;
    const arr = mults.slice(0, count).map((m) => roundNice(s * m));
    // Ensure sorted (calls ascending, puts descending) like the original UI expectations.
    const sorted = [...arr].sort((a, b) => (type === "call" ? a - b : b - a));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSpot, market?.priceOptions.length, spotForHooks, type]);

  useEffect(() => {
    // Clamp selected index if option count changes.
    setPriceIdx((i) => clampNumber(i, 0, priceOptions.length - 1));
  }, [priceOptions.length]);

  const selectedPrice = priceOptions[clampNumber(priceIdx, 0, priceOptions.length - 1)];

  const n = priceOptions.length;
  const t = n <= 1 ? 0 : clampNumber(priceIdx, 0, n - 1) / (n - 1);
  // Map "closest/first option" -> higher APR, "farthest/last option" -> lower APR.
  if (!market) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-black uppercase">Market not found</h1>
        <div className="font-bold text-gray-700">
          Try <Link className="underline" href="/earn">/earn</Link>.
        </div>
      </div>
    );
  }

  const termDays = strikeIdx === 0 ? 14 : 28;
  const spot = live?.price ?? market.spotPrice;

  const selectedApr = market.maxApr - (market.maxApr - market.minApr) * t;

  const depositNum = Number(deposit);
  const depositOk = Number.isFinite(depositNum) && depositNum > 0;

  const notionalUsd =
    type === "call" ? (depositOk ? depositNum * spot : 0) : depositOk ? depositNum : 0;

  const estPremiumUsd = notionalUsd * (selectedApr / 100) * (termDays / 365);

  const capFilled = clampNumber(market.capFilledPct, 0, 100);
  const expiryDate = strikeDates[strikeIdx];

  const maxPreset = type === "call" ? "10" : "5000";
  const maxPresetNum = Number(maxPreset);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
          <div className="min-w-0">
            <div className="text-sm text-black/50 dark:text-white/50">
              <Link href="/earn" className="underline">
                Earn
              </Link>{" "}
              / Market
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <div className="relative inline-block max-w-full" data-asset-switcher>
                <button
                  type="button"
                  onClick={() => setAssetOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={assetOpen}
                  className="inline-flex max-w-full items-center gap-3 truncate text-4xl font-semibold tracking-tight text-white md:text-5xl"
                  title="Switch market"
                >
                  <span className="truncate">{market.asset}</span>
                  <span className="text-white/55 hover:text-white/80" aria-hidden>
                    ▾
                  </span>
                </button>

                {assetOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 z-20 mt-3 max-h-[340px] w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-xl backdrop-blur"
                  >
                    <div className="max-h-[340px] overflow-y-auto py-1">
                      {assetOptions.map((a) => {
                        const active = a.toUpperCase() === market.asset.toUpperCase();
                        return (
                          <button
                            key={a}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              setAssetOpen(false);
                              const url = `/market/${encodeURIComponent(a)}?type=${type}`;
                              window.location.assign(url);
                            }}
                            className={[
                              "flex w-full items-center justify-between px-4 py-3 text-left text-base font-semibold transition-colors",
                              active
                                ? "bg-white/10 text-white"
                                : "text-white/80 hover:bg-white/10 hover:text-white"
                            ].join(" ")}
                          >
                            <span>{a}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="text-sm font-semibold text-white/70">
                Spot <span className="text-white">{formatUsdSmart(spot)}</span>
                <span className="mx-2 text-white/25">·</span>
                Cap <span className="text-white">{formatPct(capFilled)}</span>
                <span className="mx-2 text-white/25">·</span>
                <button
                  type="button"
                  onClick={() => setChartOpen((v) => !v)}
                  className="text-white/70 hover:text-white"
                >
                  {chartOpen ? "Hide chart" : "Show chart"}
                </button>
              </div>
            </div>

            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Manage your risks by choosing expiry date and price            
            </p>
          </div>

          <div className="flex items-start md:justify-end">
            <AppSegmented
              value={type}
              onChange={(t) => {
                const url = `/market/${encodeURIComponent(market.asset)}?type=${t}`;
                window.location.assign(url);
              }}
              options={[
                { value: "call", label: `Deposit\u00A0${market.asset}` },
                { value: "csp", label: "Deposit\u00A0USDC" }
              ]}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </header>

      <div
        className={[
          "grid w-full gap-6",
          chartOpen ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "lg:grid-cols-1"
        ].join(" ")}
      >
        <div className="w-full space-y-4">
          {/* Mobile chart (hidden by default; toggled by Chart button) */}
          {chartOpen ? (
            <div className="lg:hidden pt-2">
              <MarketChart
                symbol={market.asset}
                pythId={pythId}
                strikePrice={selectedPrice}
                expiryLabel={formatDate(expiryDate)}
                expiryTs={Math.round(expiryDate.getTime() / 1000)}
                defaultSpot={spot}
                range={chartRange}
                onRangeChange={setChartRange}
                onClose={() => setChartOpen(false)}
              />
            </div>
          ) : null}

          {/* Primary flow */}
          <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-semibold text-white/50">Expiry</div>
            <div className="flex flex-nowrap gap-2 overflow-x-auto">
              {[0, 1].map((idx) => {
                const active = strikeIdx === idx;
                const d = strikeDates[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setStrikeIdx(idx as 0 | 1)}
                    className={[
                      "shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "border-yuzu-main/50 bg-yuzu-main text-black"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    ].join(" ")}
                    title={formatDate(d)}
                  >
                    <span className="font-semibold">{formatShortDate(d)}</span>
                    <span className="mx-2 opacity-40">·</span>
                    <span className="text-[11px] opacity-70">{14 * (idx + 1)}d</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-center text-base font-semibold text-white">
              {type === "call" ? "Choose the price you’re happy to sell" : "Choose the price you’re happy to buy"}{" "}
              <span className="text-yuzu-main">{market.asset}</span> on{" "}
              <span className="text-white/90">{formatDate(expiryDate)}</span>{" "}
              <span className="text-white/50">(in {termDays} days)</span>
            </div>

            <div className="mt-5">
              <div
                className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] sm:gap-4"
              >
                {priceOptions.map((p, idx) => {
                  const active = idx === priceIdx;
                  const priceText = formatUsdSmart(p);
                  const absPrice = Math.abs(p);
                  // Mobile typography: keep big numbers (e.g. zBTC) from dominating the card.
                  const mobilePriceClass =
                    absPrice >= 10000
                      ? "text-[20px]"
                      : absPrice >= 1000
                        ? "text-2xl"
                        : priceText.length >= 14
                          ? "text-xl"
                          : "text-2xl";

                  // Desktop typography can stay bigger, but still clamp extreme lengths.
                  const desktopPriceClass =
                    priceText.length >= 16 ? "sm:text-2xl" : absPrice >= 10000 ? "sm:text-[28px]" : "sm:text-3xl";
                  const aprForIdx =
                    market.maxApr - (market.maxApr - market.minApr) * (n <= 1 ? 0 : idx / (n - 1));
                  return (
                    <button key={p} type="button" onClick={() => setPriceIdx(idx)} className="text-left">
                      <AppCard
                        className={[
                          "px-4 py-4 text-center transition-all sm:px-6 sm:py-6",
                          "hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30",
                          active
                            ? "border-yuzu-main/60 bg-yuzu-main/10 ring-2 ring-yuzu-main/40"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "whitespace-nowrap font-semibold leading-tight text-white tabular-nums tracking-tight",
                            mobilePriceClass,
                            desktopPriceClass
                          ].join(" ")}
                        >
                          {priceText}
                        </div>
                        <div className="mt-2 text-[11px] font-semibold text-white/55 sm:text-xs">
                          <span className="text-white/85">{formatPct(aprForIdx)}</span> APR
                        </div>
                      </AppCard>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <AppCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-white/50">
                Deposit {type === "call" ? market.asset : "USDC"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeposit(String(maxPresetNum / 2))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  HALF
                </button>
                <button
                  type="button"
                  onClick={() => setDeposit(maxPreset)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="flex flex-1 items-center px-4">
                <input
                  inputMode="decimal"
                  placeholder={maxPreset}
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className="h-14 w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div className="flex items-center gap-2 border-l border-white/10 px-4">
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">
                    {type === "call" ? market.asset : "USDC"}
                  </div>
                </div>
                <div className="h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-black/30">
                  <img
                    src={getTokenLogoSrc(type === "call" ? market.asset : "USDC")}
                    alt="token logo"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
              <div>
                <span className="text-white/50">APR</span>{" "}
                <span className="font-semibold text-white">{formatPct(selectedApr)}</span>
              </div>
              <div>
                <span className="text-white/50">Upfront</span>{" "}
                <span className="font-semibold text-white">{depositOk ? formatUsdc(estPremiumUsd) : "—"}</span>
              </div>
              <div>
                <span className="text-white/50">Term</span>{" "}
                <span className="font-semibold text-white">{termDays}d</span>
              </div>
            </div>
          </AppCard>

          <AppCard className="overflow-hidden p-0">
            <div className="border-b border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-white/80">
              Now
            </div>
            <div className="px-5 py-5">
              <div className="text-4xl font-semibold text-white">{formatPct(selectedApr)} APR</div>
              <div className="mt-2 text-sm text-white/70">
                {depositOk ? (
                  <>
                    <span className="font-semibold text-white">{formatUsdc(estPremiumUsd)}</span> upfront premium
                  </>
                ) : (
                  "Enter a deposit amount to preview upfront premium."
                )}
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-white/80">
              On {formatDate(expiryDate)}
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-white/10 p-5 md:border-r">
                <div className="text-xs font-semibold text-white/60">
                  If spot {type === "call" ? "below" : "below"} {formatUsdSmart(selectedPrice)}
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {depositOk
                    ? type === "call"
                      ? `Get ${depositNum.toLocaleString()} ${market.asset} back`
                      : `Buy ${market.asset} at ${formatUsdSmart(selectedPrice)}`
                    : "—"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {type === "call"
                    ? "You keep the asset and the premium."
                    : "Your USDC is used to buy the asset at your selected price."}
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs font-semibold text-white/60">
                  If spot {type === "call" ? "above" : "above"} {formatUsdSmart(selectedPrice)}
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {depositOk
                    ? type === "call"
                      ? `Receive ${formatUsdc(depositNum * selectedPrice)}`
                      : `Keep ${formatUsdc(depositNum)}`
                    : "—"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {type === "call"
                    ? "Your asset is sold at your selected price."
                    : "You keep your USDC and the premium."}
                </div>
              </div>
            </div>
          </AppCard>

          <AppButton
            className="w-full"
            disabled={!depositOk}
            onClick={() => {
              // UI prototype: wire to real deposit flow later.
              alert("Deposit flow coming soon.");
            }}
          >
            Deposit
          </AppButton>
          </div>
        </div>
        {/* Desktop sticky chart (right column) */}
        {chartOpen ? (
          <aside className="relative hidden lg:block">
            {/* AppNav is sticky top-0; give the chart enough offset so it doesn't slide under it */}
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto">
              <MarketChart
                symbol={market.asset}
                pythId={pythId}
                strikePrice={selectedPrice}
                expiryLabel={formatDate(expiryDate)}
                expiryTs={Math.round(expiryDate.getTime() / 1000)}
                defaultSpot={spot}
                range={chartRange}
                onRangeChange={setChartRange}
                onClose={() => setChartOpen(false)}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}


