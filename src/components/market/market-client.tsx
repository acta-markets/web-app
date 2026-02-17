"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { MarketChart } from "@/components/market/market-chart";
import { RfqFlowModal } from "@/components/market/rfq-flow-modal";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { getTokenMint } from "@/lib/tokens";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { computeApyFromScaledPrices } from "@acta-markets/ts-sdk/ws";
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

  const [strikeIdx, setStrikeIdx] = useState<0>(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [deposit, setDeposit] = useState("");
  const [live, setLive] = useState<{ price: number; publishTime: number } | null>(null);
  const pythId = market?.pythId;
  const [baseSpot, setBaseSpot] = useState<number | null>(null);
  const spotForHooks = live?.price ?? market?.spotPrice ?? 0;

  // RFQ Flow state
  const [rfqModalOpen, setRfqModalOpen] = useState(false);
  
  // Global RFQ context (markets already fetched on app load)
  const {
    markets: rfqMarkets,
    indicativePrices,
    getIndicativePrices,
    isConnected: rfqConnected,
    isAuthenticated: rfqAuthenticated,
    authenticate: authenticateRfq,
  } = useRfqContext();
  
  // Log available RFQ markets
  useEffect(() => {
    console.log("[MarketClient] RFQ markets from context:", rfqMarkets.length);
    if (rfqMarkets.length > 0) {
      console.log("[MarketClient] RFQ Markets:", rfqMarkets);
    }
  }, [rfqMarkets]);
  
  // Find matching RFQ market for current asset/type
  const rfqMarket = useMemo(() => {
    if (rfqMarkets.length === 0 || !market) return undefined;
    
    const isPut = type === "csp"; // CSP = put, call = not put
    const underlyingMint = getTokenMint(market.asset);
    
    // Strict match only: underlying mint + put/call type.
    const match = rfqMarkets.find(m => {
      const matchesUnderlying = m.underlying === underlyingMint;
      const matchesType = m.is_put === isPut;
      return matchesUnderlying && matchesType;
    });
    
    if (match) {
      console.log("[MarketClient] Found matching RFQ market:", match);
      return match;
    }

    console.warn("[MarketClient] No RFQ market matched required underlying+type:", {
      asset: market.asset,
      underlyingMint,
      isPut,
      availableMarkets: rfqMarkets.length,
    });
    return undefined;
  }, [rfqMarkets, type, market]);
  
  const rfqMarketPda = rfqMarket?.pda;
  
  // Use expiry from RFQ market data if available, otherwise fallback to default dates
  const expiryFromMarket = useMemo(() => {
    if (rfqMarket?.expiry_ts) {
      const expiryTs = Number(rfqMarket.expiry_ts);
      const expiryDate = new Date(expiryTs * 1000);
      console.log("[MarketClient] Using expiry from RFQ market:", {
        expiry_ts: rfqMarket.expiry_ts,
        expiryDate: expiryDate.toLocaleString(),
      });
      return expiryDate;
    }
    return null;
  }, [rfqMarket?.expiry_ts]);
  
  // Fallback dates if no market expiry
  const fallbackDates = useMemo(() => [addDays(today, 14), addDays(today, 28)], [today]);
  
  // Single expiry date from market, or multiple fallback options
  const strikeDates = useMemo(() => {
    if (expiryFromMarket) {
      return [expiryFromMarket];
    }
    return fallbackDates;
  }, [expiryFromMarket, fallbackDates]);
  
  // Fetch indicative prices when we have a market PDA
  useEffect(() => {
    if (rfqConnected && rfqMarketPda) {
      const positionType = type === "call" ? "covered_call" : "cash_secured_put";
      console.log("[MarketClient] Fetching indicative prices for:", rfqMarketPda, positionType);
      getIndicativePrices(rfqMarketPda, positionType);
    }
  }, [rfqConnected, rfqMarketPda, type, getIndicativePrices]);
  
  // Log indicative prices when received
  useEffect(() => {
    if (indicativePrices) {
      console.log("[MarketClient] Indicative prices received:", indicativePrices);
    }
  }, [indicativePrices]);
  
  // Solana wallet via Wallet Standard
  const { selectedAccount, isConnected, signMessage: solanaSignMessage, signTransaction: solanaSignTransaction } = useSolana();
  
  // Wallet address
  const walletAddress = selectedAccount?.address;
  const pendingRfqAuthWalletRef = useRef<string | null>(null);
  const authInFlightRef = useRef(false);
  const authWarmupTimerRef = useRef<number | null>(null);
  const [authWarmupDone, setAuthWarmupDone] = useState(false);
  
  // Log wallet state changes
  useEffect(() => {
    console.log("[MarketClient] Wallet state:", {
      isConnected,
      address: selectedAccount?.address,
    });
  }, [isConnected, selectedAccount]);
  
  // Sign message function using Wallet Standard
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    console.log("[signMessage] Called, message length:", message.length);
    console.log("[signMessage] Wallet connected:", isConnected);
    console.log("[signMessage] Address:", selectedAccount?.address);
    
    if (!isConnected || !selectedAccount) {
      throw new Error("No wallet connected");
    }
    
    try {
      console.log("[signMessage] Calling solanaSignMessage...");
      const signature = await solanaSignMessage(message);
      console.log("[signMessage] Got signature, length:", signature.length);
      return signature;
    } catch (err) {
      console.error("[signMessage] Error signing message:", err);
      throw err;
    }
  }, [isConnected, selectedAccount, solanaSignMessage]);

  // Trigger RFQ auth after wallet connect (outside modal flow).
  useEffect(() => {
    if (!walletAddress) {
      pendingRfqAuthWalletRef.current = null;
      setAuthWarmupDone(false);
      if (authWarmupTimerRef.current != null) {
        window.clearTimeout(authWarmupTimerRef.current);
        authWarmupTimerRef.current = null;
      }
      return;
    }
    pendingRfqAuthWalletRef.current = walletAddress;
    setAuthWarmupDone(false);

    // Give wallets a short settle window after initial connect before auth signing.
    if (authWarmupTimerRef.current != null) {
      window.clearTimeout(authWarmupTimerRef.current);
    }
    authWarmupTimerRef.current = window.setTimeout(() => {
      setAuthWarmupDone(true);
      authWarmupTimerRef.current = null;
    }, 900);

    return () => {
      if (authWarmupTimerRef.current != null) {
        window.clearTimeout(authWarmupTimerRef.current);
        authWarmupTimerRef.current = null;
      }
    };
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress || !rfqConnected || rfqAuthenticated || authInFlightRef.current || !authWarmupDone) {
      return;
    }
    if (pendingRfqAuthWalletRef.current !== walletAddress) {
      return;
    }

    authInFlightRef.current = true;
    void authenticateRfq(walletAddress, signMessage)
      .then(() => {
        pendingRfqAuthWalletRef.current = null;
      })
      .catch((err) => {
        console.error("[MarketClient] RFQ auth after wallet connect failed:", err);
        // Stop automatic retries; user can reconnect wallet to re-trigger.
        pendingRfqAuthWalletRef.current = null;
      })
      .finally(() => {
        authInFlightRef.current = false;
      });
  }, [walletAddress, rfqConnected, rfqAuthenticated, authWarmupDone, authenticateRfq, signMessage]);

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

  // Price options with APR calculated from indicative prices
  const priceOptionsWithApr = useMemo(() => {
    const positionType = type === "call" ? "covered_call" : "cash_secured_put";
    const spotPrice = baseSpot ?? spotForHooks ?? 0;
    
    // Calculate seconds to expiry from RFQ market
    const expiryTs = rfqMarket?.expiry_ts ? Number(rfqMarket.expiry_ts) : 0;
    const secondsToExpiry = expiryTs > 0 ? expiryTs - Math.floor(Date.now() / 1000) : 14 * 24 * 60 * 60; // default 14 days
    
    // Use indicative prices strikes if available
    if (indicativePrices?.strikes && indicativePrices.strikes.length > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const daysToExpiry = secondsToExpiry / (24 * 60 * 60);
      const hoursToExpiry = secondsToExpiry / (60 * 60);
      const expiryDate = new Date(expiryTs * 1000);
      console.log("[MarketClient] Computing APRs from indicative prices:", {
        positionType,
        spotPrice,
        expiryTs,
        expiryDate: expiryDate.toISOString(),
        expiryReadable: expiryDate.toLocaleString(),
        nowSeconds,
        secondsToExpiry,
        hoursToExpiry: hoursToExpiry.toFixed(2) + " hours",
        daysToExpiry: daysToExpiry.toFixed(2) + " days",
        strikesCount: indicativePrices.strikes.length,
      });
      
      const options = indicativePrices.strikes.map(s => {
        const strike = Number(s.strike) / 1_000_000_000; // Convert to human readable
        const bestPrice = s.best_price ? Number(s.best_price) : null;
        const bestPriceHuman = bestPrice ? bestPrice / 1_000_000_000 : null;
        
        let apr = 0;
        let apy = 0;
        let termYield = 0;
        if (bestPrice && secondsToExpiry > 0) {
          try {
            const result = computeApyFromScaledPrices({
              positionType,
              underlyingAmount: 1,
              grossPremiumPerUnit1e9: bestPrice,
              strike1e9: Number(s.strike),
              spotPrice1e9: Math.round(spotPrice * 1_000_000_000),
              secondsToExpiry,
            });
            apr = result.apr;
            apy = result.apy;
            termYield = result.termYield;
            
            console.log("[MarketClient] APR for strike", strike, ":", {
              bestPriceHuman,
              termYield: (termYield * 100).toFixed(2) + "%",
              apr: (apr * 100).toFixed(2) + "%",
              apy: (apy * 100).toFixed(2) + "%",
            });
          } catch (e) {
            console.warn("[MarketClient] APR calculation failed for strike", strike, ":", e);
          }
        } else {
          console.log("[MarketClient] No price for strike", strike, "(bestPrice:", bestPrice, ")");
        }
        
        return { strike, apr, bestPrice };
      });
      
      // Sort: calls ascending, puts descending
      const sorted = [...options].sort((a, b) => (type === "call" ? a.strike - b.strike : b.strike - a.strike));
      console.log("[MarketClient] Final price options with APR:", sorted.map(o => ({
        strike: o.strike,
        apr: (o.apr * 100).toFixed(2) + "%",
        hasPrice: o.bestPrice !== null,
      })));
      return sorted;
    }
    
    // Fallback: generate from spot price with estimated APRs
    const s = spotPrice;
    const count = Math.max(3, market?.priceOptions.length ?? 3);
    const callMults = count === 4 ? [1.03, 1.06, 1.09, 1.15] : [1.04, 1.08, 1.14];
    const putMults = count === 4 ? [0.97, 0.94, 0.91, 0.85] : [0.96, 0.92, 0.86];
    const mults = type === "call" ? callMults : putMults;
    
    // Generate fallback with interpolated APRs
    const maxApr = market?.maxApr ?? 0.35;
    const minApr = market?.minApr ?? 0.10;
    
    const arr = mults.slice(0, count).map((m, i) => {
      const strike = roundNice(s * m);
      const t = count <= 1 ? 0 : i / (count - 1);
      const apr = maxApr - (maxApr - minApr) * t;
      return { strike, apr, bestPrice: null };
    });
    
    // Sort: calls ascending, puts descending
    const sorted = [...arr].sort((a, b) => (type === "call" ? a.strike - b.strike : b.strike - a.strike));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicativePrices?.strikes, rfqMarket?.expiry_ts, baseSpot, market?.priceOptions.length, market?.maxApr, market?.minApr, spotForHooks, type]);
  
  // Extract just the strike prices for backward compatibility
  const priceOptions = useMemo(() => priceOptionsWithApr.map(o => o.strike), [priceOptionsWithApr]);

  useEffect(() => {
    // Clamp selected index if option count changes.
    setPriceIdx((i) => clampNumber(i, 0, priceOptions.length - 1));
  }, [priceOptions.length]);

  const selectedPriceIdx = clampNumber(priceIdx, 0, priceOptions.length - 1);
  const selectedPrice = priceOptions[selectedPriceIdx];
  const selectedPriceOption = priceOptionsWithApr[selectedPriceIdx];

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

  // Calculate term from expiry date
  const expiryDate = strikeDates[strikeIdx] ?? strikeDates[0];
  const msToExpiry = expiryDate.getTime() - Date.now();
  const hoursToExpiry = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60)));
  const termDays = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
  const isSameDay = termDays <= 1 || hoursToExpiry < 24;
  const termDisplay = isSameDay ? `${hoursToExpiry} hour${hoursToExpiry !== 1 ? "s" : ""}` : `${termDays} days`;
  const termDisplayShort = isSameDay ? `${hoursToExpiry}h` : `${termDays}d`;
  const spot = live?.price ?? market.spotPrice;

  // Use calculated APR from indicative prices, or fallback to interpolated APR
  // Convert from decimal (0.30) to percentage (30) for display
  const selectedApr = (selectedPriceOption?.apr ?? 0) * 100;

  const depositNum = Number(deposit);
  const depositOk = Number.isFinite(depositNum) && depositNum > 0;

  const notionalUsd =
    type === "call" ? (depositOk ? depositNum * spot : 0) : depositOk ? depositNum : 0;

  const estPremiumUsd = notionalUsd * (selectedApr / 100) * (termDays / 365);

  const capFilled = clampNumber(market.capFilledPct, 0, 100);

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

      {/* Mobile chart */}
      {chartOpen ? (
        <div className="lg:hidden">
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

      {/* Expiry selector + main grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-semibold text-white/50">Expiry</div>
          <div className="flex flex-nowrap gap-2 overflow-x-auto">
            {strikeDates.map((d, idx) => {
              const active = strikeIdx === idx;
              const msUntil = d.getTime() - Date.now();
              const hoursUntil = Math.max(1, Math.ceil(msUntil / (1000 * 60 * 60)));
              const daysUntil = Math.max(1, Math.ceil(msUntil / (1000 * 60 * 60 * 24)));
              const isToday = daysUntil <= 1 || hoursUntil < 24;
              const timeLabel = isToday ? `${hoursUntil}h` : `${daysUntil}d`;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStrikeIdx(idx as 0)}
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
                  <span className="text-[11px] opacity-70">{timeLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={[
            "grid w-full items-start gap-6",
            chartOpen ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "lg:grid-cols-1"
          ].join(" ")}
        >
        <div className="w-full space-y-4">

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-center text-base font-semibold text-white">
              {type === "call" ? "Choose the price you’re happy to sell" : "Choose the price you’re happy to buy"}{" "}
              <span className="text-yuzu-main">{market.asset}</span> on{" "}
              <span className="text-white/90">{formatDate(expiryDate)}</span>{" "}
              <span className="text-white/50">(in {termDisplay})</span>
            </div>

            <div className="mt-5">
              <div
                className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] sm:gap-4"
              >
                {priceOptionsWithApr.map((option, idx) => {
                  const active = idx === priceIdx;
                  const priceText = formatUsdSmart(option.strike);
                  const absPrice = Math.abs(option.strike);
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
                  // Use calculated APR from indicative prices
                  const aprForIdx = option.apr;
                  return (
                    <button key={option.strike} type="button" onClick={() => setPriceIdx(idx)} className="text-left">
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
                          {aprForIdx > 0 ? (
                            <><span className="text-white/85">{formatPct(aprForIdx * 100)}</span> APR</>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
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
                <span className="font-semibold text-white">{termDisplayShort}</span>
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
              {/* For calls: below=positive (keep asset), above=negative (sold)
                  For puts: above=positive (keep USDC), below=negative (buy asset) */}
              <div className={`${type === "call" ? "outcome-positive" : "outcome-positive"} border-white/10 p-5 md:border-r`}>
                <div className="text-xs font-semibold text-white/60">
                  If spot {type === "call" ? "below" : "above"} {formatUsdSmart(selectedPrice)}
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {depositOk
                    ? type === "call"
                      ? `Get ${depositNum.toLocaleString()} ${market.asset} back`
                      : `Keep ${formatUsdc(depositNum)}`
                    : "—"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {type === "call"
                    ? "You keep the asset and the premium."
                    : "You keep your USDC and the premium."}
                </div>
              </div>

              <div className="outcome-negative p-5">
                <div className="text-xs font-semibold text-white/60">
                  If spot {type === "call" ? "above" : "below"} {formatUsdSmart(selectedPrice)}
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {depositOk
                    ? type === "call"
                      ? `Receive ${formatUsdc(depositNum * selectedPrice)}`
                      : `Buy ${market.asset} at ${formatUsdSmart(selectedPrice)}`
                    : "—"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {type === "call"
                    ? "Your asset is sold at your selected price."
                    : "Your USDC is used to buy the asset at your selected price."}
                </div>
              </div>
            </div>
          </AppCard>

          {!walletAddress ? (
            // Show wallet connect button when not connected
            <SolanaConnectButton fullWidth />
          ) : (
            <AppButton
              className="w-full"
              disabled={!depositOk}
              onClick={() => setRfqModalOpen(true)}
            >
              Deposit
            </AppButton>
          )}
        </div>

        {/* Desktop sticky chart (right column) */}
        {chartOpen ? (
          <aside className="relative hidden lg:block">
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

      {/* RFQ Flow Modal */}
      <RfqFlowModal
        open={rfqModalOpen}
        onClose={() => setRfqModalOpen(false)}
        marketPda={rfqMarketPda}
        asset={market.asset}
        positionType={type === "call" ? "covered_call" : "cash_secured_put"}
        strike={Math.round(selectedPrice * 1_000_000_000)} // Convert to lamports (9 decimals)
        quantity={Math.round(depositNum * 1_000_000_000)} // Convert to token smallest units (9 decimals for most)
        strikeDisplay={formatUsdSmart(selectedPrice)}
        quantityDisplay={`${depositNum.toLocaleString()} ${market.asset}`}
        walletPublicKey={walletAddress || undefined}
        signMessage={walletAddress ? signMessage : undefined}
        signTransaction={walletAddress ? solanaSignTransaction : undefined}
      />
    </div>
  );
}


