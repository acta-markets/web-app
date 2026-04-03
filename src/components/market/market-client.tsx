"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { AppPill } from "@/components/app-ui/app-pill";
import { MarketChart } from "@/components/market/market-chart";
import { RfqFlowModal } from "@/components/market/rfq-flow-modal";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { getTokenMint } from "@/lib/tokens";
import { getCapFilledPct } from "@/lib/token-caps";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import type { QuoteReceivedMessage, IndicativePricesMessage } from "@/lib/rfq-client";
import {
  computeApyFromScaledPrices,
  quoteAmountToQuantity,
  quantityToQuoteAmount,
  sizeRuleInQuoteTerms,
} from "@acta-markets/ts-sdk/ws";
import {
  MARKETS,
  getMarket,
  type MarketType,
  formatPct,
  formatUsdSmart
} from "@/lib/markets";
import { usePythPrice } from "@/lib/use-pyth-price";

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
  if (!Number.isFinite(n)) return "\u2014";
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} USDC`;
}

function alignQuantityToRule(
  quantity: number,
  rule: { min_size: number; max_size: number; step: number }
): number {
  const clamped = Math.max(rule.min_size, Math.min(rule.max_size, Math.round(quantity)));
  if (rule.step <= 0) return clamped;
  const offset = clamped - rule.min_size;
  const steps = Math.round(offset / rule.step);
  const snapped = rule.min_size + steps * rule.step;
  return Math.max(rule.min_size, Math.min(rule.max_size, snapped));
}

function decimalsFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const text = step.toString();
  if (!text.includes(".")) return 0;
  return Math.min(9, text.split(".")[1]?.length ?? 0);
}

function formatInputValue(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "";
  if (maxDecimals <= 0) return String(Math.round(value));
  return value.toFixed(maxDecimals).replace(/\.?0+$/, "");
}

export function MarketClient({ asset }: { asset: string }) {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const strikeParam = searchParams.get("strike") ?? searchParams.get("price");
  const marketParam = searchParams.get("market");
  const type: MarketType = typeParam === "csp" ? "csp" : "call";

  const market = useMemo(() => getMarket(asset, type), [asset, type]);
  const [assetOpen, setAssetOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartRange, setChartRange] = useState<"1w" | "1m" | "3m">("1w");
  const assetOptions = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const m of MARKETS) uniq.set(m.asset.toUpperCase(), m.asset);
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

  const [strikeIdx, setStrikeIdx] = useState(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [deposit, setDeposit] = useState("");
  const pythId = market?.pythId;
  const { price: livePrice, publishTime: livePt, livePoints } = usePythPrice(pythId);
  const live = livePrice != null ? { price: livePrice, publishTime: livePt! } : null;
  const [baseSpot, setBaseSpot] = useState<number | null>(null);
  const spotForHooks = livePrice ?? 0;

  // RFQ Flow state
  const [rfqModalOpen, setRfqModalOpen] = useState(false);
  const [rfqRequestNonce, setRfqRequestNonce] = useState(0);
  const [isRequestingQuote, setIsRequestingQuote] = useState(false);
  const [modalInitialQuote, setModalInitialQuote] = useState<QuoteReceivedMessage | null>(null);
  const [indicativeRequestedKey, setIndicativeRequestedKey] = useState<string | null>(null);

  // Global RFQ context (markets already fetched on app load)
  const {
    markets: rfqMarkets,
    tokenCaps,
    marketDescriptors,
    currentQuote,
    error: rfqError,
    submitRfq,
    clearTransientState,
    getIndicativePrices,
    getIndicativePricesCached,
    tokenMarketsInfo,
    getTokenMarketsInfo,
    isConnected: rfqConnected,
    isAuthenticated: rfqAuthenticated,
    connectionState,
  } = useRfqContext();

  // All RFQ markets matching this asset+type, sorted by expiry (nearest first).
  const matchingMarkets = useMemo(() => {
    if (!market) return [];
    const isPut = type === "csp";

    if (tokenMarketsInfo?.markets && tokenMarketsInfo.markets.length > 0) {
      return tokenMarketsInfo.markets
        .filter(m => m.is_put === isPut)
        .map(m => ({ pda: m.market_pda, expiry_ts: m.expiry_ts, is_put: m.is_put }))
        .sort((a, b) => Number(a.expiry_ts) - Number(b.expiry_ts));
    }

    if (rfqMarkets.length === 0) return [];
    const underlyingMint = (getTokenMint(market.asset) ?? "").trim();

    const normalizeIsPut = (value: unknown): boolean | null => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
      if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (v === "true" || v === "1") return true;
        if (v === "false" || v === "0") return false;
      }
      return null;
    };

    return rfqMarkets
      .filter(m => {
        const marketUnderlying = String(
          (m as unknown as { underlying?: string; underlying_mint?: string }).underlying ??
          (m as unknown as { underlying?: string; underlying_mint?: string }).underlying_mint ??
          ""
        ).trim();
        const marketIsPut = normalizeIsPut((m as unknown as { is_put?: unknown }).is_put);
        return marketUnderlying === underlyingMint && marketIsPut === isPut;
      })
      .sort((a, b) => Number(a.expiry_ts) - Number(b.expiry_ts));
  }, [tokenMarketsInfo, rfqMarkets, type, market]);

  // Resolve RFQ market PDA
  const rfqMarketPda = useMemo(() => {
    if (matchingMarkets.length > 0) {
      const m = matchingMarkets[strikeIdx];
      if (m) return m.pda;
    }
    if (marketParam && rfqMarkets.length === 0) return marketParam;
    if (matchingMarkets.length === 0 && rfqMarkets.length > 0 && market) {
      console.warn("[MarketClient] No RFQ market matched:", {
        asset: market.asset,
        availableMarkets: rfqMarkets.length,
      });
    }
    return undefined;
  }, [marketParam, rfqMarkets, matchingMarkets, strikeIdx, market]);

  // Sync strikeIdx when arriving via ?market=<pda> URL param.
  useEffect(() => {
    if (!marketParam || matchingMarkets.length === 0) return;
    const idx = matchingMarkets.findIndex(m => m.pda === marketParam);
    if (idx !== -1 && idx !== strikeIdx) {
      setStrikeIdx(idx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketParam, matchingMarkets]);

  // Clamp strikeIdx when matching markets change.
  useEffect(() => {
    if (matchingMarkets.length > 0 && strikeIdx >= matchingMarkets.length) {
      setStrikeIdx(0);
    }
  }, [matchingMarkets.length, strikeIdx]);

  const positionType = type === "call" ? "covered_call" : "cash_secured_put";
  const currentIndicativePrices = useMemo(() => {
    if (!rfqMarketPda) return null;
    const cached = getIndicativePricesCached(rfqMarketPda, positionType);
    if (cached) return cached;
    if (tokenMarketsInfo?.markets) {
      const mkt = tokenMarketsInfo.markets.find(m => m.market_pda === rfqMarketPda);
      const ind = mkt?.indicatives?.find(i => i.position_type === positionType);
      if (ind?.strikes?.length) {
        return {
          market: rfqMarketPda,
          position_type: positionType,
          strikes: ind.strikes,
          updated_at: ind.updated_at,
        } as IndicativePricesMessage;
      }
    }
    return null;
  }, [rfqMarketPda, positionType, getIndicativePricesCached, tokenMarketsInfo]);

  const currentIndicativeKey = rfqMarketPda ? `${rfqMarketPda}:${positionType}` : null;
  const hasCurrentIndicativePrices = !!(
    currentIndicativePrices &&
    currentIndicativePrices.market === rfqMarketPda &&
    currentIndicativePrices.position_type === positionType &&
    currentIndicativePrices.strikes &&
    currentIndicativePrices.strikes.length > 0
  );
  const isResolvingRfqMarket = rfqConnected && !rfqMarketPda;
  const hasRequestedCurrentIndicative =
    currentIndicativeKey != null && indicativeRequestedKey === currentIndicativeKey;
  const shouldShowIndicativeLoading =
    isResolvingRfqMarket ||
    (!!currentIndicativeKey && (!hasRequestedCurrentIndicative || !hasCurrentIndicativePrices));

  // Expiry dates from all matching markets (one button per date).
  const strikeDates = useMemo(
    () => matchingMarkets.map(m => new Date(Number(m.expiry_ts) * 1000)),
    [matchingMarkets]
  );
  const expiryFromMarket = strikeDates.length > 0 ? strikeDates[strikeIdx] ?? strikeDates[0] : null;

  // Initial load: single GetTokenMarketsInfo for markets + decimals + size_rule + indicatives.
  const wsReady = connectionState === "connected" || connectionState === "authenticated";
  useEffect(() => {
    if (!wsReady || !market) return;
    const underlyingMint = (getTokenMint(market.asset) ?? "").trim();
    if (!underlyingMint) return;
    getTokenMarketsInfo(underlyingMint);
  }, [wsReady, market, getTokenMarketsInfo]);

  // 30s refresh: lightweight GetIndicativePrices for current market only.
  useEffect(() => {
    if (!wsReady || !rfqMarketPda) return;
    const id = window.setInterval(() => {
      getIndicativePrices(rfqMarketPda, positionType);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [wsReady, rfqMarketPda, positionType, getIndicativePrices]);

  // Mark indicative as requested when market PDA is resolved.
  useEffect(() => {
    if (!rfqMarketPda) return;
    setIndicativeRequestedKey(`${rfqMarketPda}:${positionType}`);
  }, [rfqMarketPda, positionType]);

  useEffect(() => {
    if (!currentIndicativeKey) {
      setIndicativeRequestedKey(null);
    }
  }, [currentIndicativeKey]);

  // Solana wallet via Wallet Standard
  const { selectedAccount, signTransaction: solanaSignTransaction } = useSolana();
  const { openSidebar } = useWalletSidebar();

  const walletAddress = selectedAccount?.address;

  useEffect(() => {
    setChartOpen(window.innerWidth >= 1024);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
    if (baseSpot == null && Number.isFinite(spotForHooks) && spotForHooks > 0) {
      setBaseSpot(spotForHooks);
      return;
    }
    if (baseSpot != null && live?.price && baseSpot !== live.price) {
      setBaseSpot(live.price);
    }
  }, [baseSpot, live?.price, spotForHooks]);

  // Price options with APR calculated from indicative prices
  const priceOptionsWithApr = useMemo(() => {
    const spotPrice = baseSpot ?? spotForHooks ?? 0;
    const expiryTs = matchingMarkets[strikeIdx]?.expiry_ts ? Number(matchingMarkets[strikeIdx].expiry_ts) : 0;
    const secondsToExpiry = expiryTs > 0 ? expiryTs - Math.floor(Date.now() / 1000) : 0;

    if (hasCurrentIndicativePrices && currentIndicativePrices?.strikes) {
      const options = currentIndicativePrices.strikes.map(s => {
        const strike = Number(s.strike) / 1_000_000_000;
        const bestPrice = s.best_price ? Number(s.best_price) : null;
        let apr = 0;
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
          } catch {
            // ignore
          }
        }

        return { strike, apr, bestPrice };
      });

      return [...options].sort((a, b) => (type === "call" ? a.strike - b.strike : b.strike - a.strike));
    }
    return [];
  }, [
    hasCurrentIndicativePrices,
    currentIndicativePrices?.strikes,
    matchingMarkets,
    strikeIdx,
    baseSpot,
    spotForHooks,
    positionType,
    type,
  ]);

  // Extract just the strike prices for backward compatibility
  const priceOptions = useMemo(() => priceOptionsWithApr.map(o => o.strike), [priceOptionsWithApr]);

  useEffect(() => {
    setPriceIdx((i) => clampNumber(i, 0, priceOptions.length - 1));
  }, [priceOptions.length]);

  useEffect(() => {
    if (!market || priceOptions.length === 0) return;

    if (strikeParam) {
      const targetStrike = Number(strikeParam);
      if (Number.isFinite(targetStrike)) {
        let bestIdx = 0;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (let i = 0; i < priceOptions.length; i += 1) {
          const delta = Math.abs(priceOptions[i] - targetStrike);
          if (delta < bestDelta) {
            bestDelta = delta;
            bestIdx = i;
          }
        }
        setPriceIdx(bestIdx);
      }
    }
  }, [market, type, priceOptions, strikeParam]);

  const selectedPriceIdx = clampNumber(priceIdx, 0, priceOptions.length - 1);
  const selectedPrice = priceOptions[selectedPriceIdx] ?? 0;
  const selectedPriceOption = priceOptionsWithApr[selectedPriceIdx];
  const hasSelectedPrice = priceOptions.length > 0;
  const selectedStrikeLamports = Math.round(selectedPrice * 1_000_000_000);

  const rfqMarketDescriptor = useMemo(
    () =>
      rfqMarketPda
        ? marketDescriptors.find((d) => d.market?.market_pda === rfqMarketPda) ?? null
        : null,
    [marketDescriptors, rfqMarketPda]
  );
  const underlyingDecimals = tokenMarketsInfo?.underlying_decimals != null
    ? Number(tokenMarketsInfo.underlying_decimals)
    : (rfqMarketDescriptor?.underlying_decimals ?? 9);
  const wireSizeRule = tokenMarketsInfo?.size_rule ?? rfqMarketDescriptor?.size_rule ?? null;

  const depositRule = useMemo(() => {
    if (!wireSizeRule) return null;
    if (type === "call") {
      const scale = 10 ** underlyingDecimals;
      return {
        min: wireSizeRule.min_size / scale,
        max: wireSizeRule.max_size / scale,
        step: wireSizeRule.step / scale,
      };
    }
    if (selectedStrikeLamports <= 0) return null;
    return sizeRuleInQuoteTerms(wireSizeRule, selectedStrikeLamports, underlyingDecimals);
  }, [wireSizeRule, type, selectedStrikeLamports, underlyingDecimals]);

  const depositInputDecimals = useMemo(() => {
    if (!depositRule) return type === "call" ? Math.min(9, underlyingDecimals) : 2;
    return Math.max(type === "csp" ? 2 : 0, decimalsFromStep(depositRule.step));
  }, [depositRule, type, underlyingDecimals]);

  const handleDepositChange = useCallback(
    (raw: string) => {
      if (raw === "" || /^(\d+(\.\d*)?|\.\d+)$/.test(raw)) setDeposit(raw);
    },
    []
  );

  // Calculate term from expiry date
  const expiryDate = strikeDates[strikeIdx] ?? strikeDates[0] ?? new Date();
  const isLiveMarketReady = !!expiryFromMarket;
  const msToExpiry = expiryDate.getTime() - Date.now();
  const hoursToExpiry = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60)));
  const termDays = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
  const isSameDay = termDays <= 1 || hoursToExpiry < 24;
  const termDisplay = isSameDay ? `${hoursToExpiry} hour${hoursToExpiry !== 1 ? "s" : ""}` : `${termDays} days`;
  const termDisplayShort = isSameDay ? `${hoursToExpiry}h` : `${termDays}d`;
  const spot = live?.price ?? 0;

  const depositNum = Number(deposit);
  const quantityLamportsFromInput = useMemo(() => {
    if (!Number.isFinite(depositNum) || depositNum <= 0 || !wireSizeRule) return null;
    if (type === "csp" && selectedStrikeLamports <= 0) return null;
    try {
      return type === "call"
        ? Math.round(depositNum * 10 ** underlyingDecimals)
        : quoteAmountToQuantity(depositNum, selectedStrikeLamports, underlyingDecimals);
    } catch {
      return null;
    }
  }, [depositNum, wireSizeRule, type, underlyingDecimals, selectedStrikeLamports]);

  const sizeRuleUnitSymbol = type === "call" ? (market?.asset ?? asset) : "USDC";
  const sizeRuleViolationMessage = useMemo(() => {
    if (!wireSizeRule || !depositRule) return null;
    if (!Number.isFinite(depositNum) || depositNum <= 0 || quantityLamportsFromInput == null) return null;
    if (quantityLamportsFromInput < wireSizeRule.min_size) {
      return `Below min ${formatInputValue(depositRule.min, depositInputDecimals)} ${sizeRuleUnitSymbol}`;
    }
    if (quantityLamportsFromInput > wireSizeRule.max_size) {
      return `Above max ${formatInputValue(depositRule.max, depositInputDecimals)} ${sizeRuleUnitSymbol}`;
    }
    return null;
  }, [wireSizeRule, depositRule, depositNum, quantityLamportsFromInput, depositInputDecimals, sizeRuleUnitSymbol]);

  const depositOk =
    quantityLamportsFromInput != null &&
    wireSizeRule != null &&
    quantityLamportsFromInput >= wireSizeRule.min_size &&
    quantityLamportsFromInput <= wireSizeRule.max_size;
  const notionalUsd =
    type === "call" ? (depositOk ? depositNum * spot : 0) : depositOk ? depositNum : 0;
  const selectedApr = (selectedPriceOption?.apr ?? 0) * 100;

  // Premium directly from indicative best_price (per-unit, 1e9 scale).
  const bestPricePerUnit = selectedPriceOption?.bestPrice
    ? Number(selectedPriceOption.bestPrice) / 1_000_000_000
    : 0;
  const displayedPremiumUsd = depositOk ? bestPricePerUnit * depositNum : 0;

  const isRfqAuthPending =
    !!walletAddress &&
    depositOk &&
    !!rfqMarketPda &&
    (connectionState === "authenticating" || connectionState === "connecting" || !rfqAuthenticated);
  const requiresLiveQuote =
    depositOk &&
    hasSelectedPrice &&
    !!rfqMarketPda &&
    rfqConnected &&
    rfqAuthenticated &&
    !shouldShowIndicativeLoading &&
    !isRfqAuthPending;

  const ctaLabel = !walletAddress
    ? "Connect"
    : !hasSelectedPrice
      ? "Choose price"
      : !depositOk
        ? (sizeRuleViolationMessage ?? "Choose size")
        : shouldShowIndicativeLoading
          ? "Loading prices..."
          : isRfqAuthPending
            ? "Connecting..."
            : isRequestingQuote
                ? "Getting quote..."
                : "Deposit";

  const capFilledFallback = clampNumber(market?.capFilledPct ?? 0, 0, 100);
  const currentUnderlyingMint = (getTokenMint(market?.asset ?? asset) ?? "").trim();
  const currentTokenCap = tokenCaps.find((cap) => cap.underlying_mint === currentUnderlyingMint);
  const liveCapFilledPct = getCapFilledPct(currentTokenCap);
  const capFilledPct = liveCapFilledPct ?? capFilledFallback;

  const defaultMaxPresetNum = type === "call" ? 10 : 5000;
  const maxPresetNum = depositRule?.max ?? defaultMaxPresetNum;
  const halfPresetNum = depositRule ? (depositRule.min + depositRule.max) / 2 : maxPresetNum / 2;
  const maxPreset = formatInputValue(maxPresetNum, depositInputDecimals);
  const depositToken = type === "call" ? market?.asset ?? asset : "USDC";

  useEffect(() => {
    if (!isRequestingQuote || rfqModalOpen) return;
    if (rfqError) {
      setIsRequestingQuote(false);
      return;
    }
    if (!currentQuote) return;
    if (Number(currentQuote.strike) !== selectedStrikeLamports) return;
    setModalInitialQuote(currentQuote);
    setIsRequestingQuote(false);
    setRfqRequestNonce((n) => n + 1);
    setRfqModalOpen(true);
  }, [isRequestingQuote, rfqModalOpen, rfqError, currentQuote, selectedStrikeLamports]);

  useEffect(() => {
    if (!isRequestingQuote || rfqModalOpen) return;
    const timeoutId = window.setTimeout(() => {
      setIsRequestingQuote(false);
    }, 15000);
    return () => window.clearTimeout(timeoutId);
  }, [isRequestingQuote, rfqModalOpen]);

  const handleDepositClick = useCallback(() => {
    if (isRequestingQuote) return;

    if (!depositOk) {
      console.warn("[MarketClient] Deposit blocked: invalid or empty deposit amount");
      return;
    }
    if (!hasSelectedPrice) {
      console.warn("[MarketClient] Deposit blocked: no strike selected yet");
      return;
    }
    if (quantityLamportsFromInput == null || !wireSizeRule) {
      console.warn("[MarketClient] Deposit blocked: amount violates market size rule");
      return;
    }

    const marketPda = rfqMarketPda;
    const blockedReasons: string[] = [];
    if (!marketPda) blockedReasons.push("no strictly matching RFQ market");
    if (!rfqConnected) blockedReasons.push("RFQ socket is not connected");
    if (!rfqAuthenticated) blockedReasons.push("wallet is not authenticated with RFQ");

    if (blockedReasons.length > 0) {
      console.warn("[MarketClient] Deposit blocked:", blockedReasons.join("; "), {
        marketPda,
        rfqConnected,
        rfqAuthenticated,
      });
      return;
    }
    if (!marketPda) return;

    const alignedQuantity = alignQuantityToRule(quantityLamportsFromInput, wireSizeRule);
    if (alignedQuantity !== quantityLamportsFromInput) {
      const alignedDeposit =
        type === "call"
          ? alignedQuantity / 10 ** underlyingDecimals
          : quantityToQuoteAmount(alignedQuantity, selectedStrikeLamports, underlyingDecimals);
      setDeposit(formatInputValue(alignedDeposit, depositInputDecimals));
    }

    clearTransientState();
    setModalInitialQuote(null);
    submitRfq({
      market: marketPda,
      positionType,
      strike: selectedStrikeLamports,
      quantity: alignedQuantity,
      timeoutSeconds: 30,
    });
    setIsRequestingQuote(true);
  }, [
    isRequestingQuote,
    rfqMarketPda,
    depositOk,
    hasSelectedPrice,
    rfqConnected,
    rfqAuthenticated,
    clearTransientState,
    submitRfq,
    selectedStrikeLamports,
    quantityLamportsFromInput,
    wireSizeRule,
    positionType,
    type,
    underlyingDecimals,
    depositInputDecimals,
  ]);

  if (!market) {
    return (
      <div className="space-y-6">
        <h1 className="font-space text-4xl font-semibold">Market not found</h1>
        <div className="font-mono text-content-secondary">
          Try <Link className="text-accent-secondary hover:text-accent-primary" href="/earn">/earn</Link>.
        </div>
      </div>
    );
  }

  if (!isLiveMarketReady) {
    return (
      <div>
        <header className="mx-auto w-full max-w-[850px] space-y-6 pb-20 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-10 max-md:pt-16">
          <div className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
            <Link href="/earn" className="text-content-secondary hover:text-content-primary">
              Earn
            </Link>
            <span className="text-content-primary">/</span>
            <span className="text-content-primary">Market</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex w-[298px] min-w-0 flex-col gap-4 max-md:w-auto">
              <div className="flex items-center gap-5">
                <div className="h-16 w-16 shrink-0 animate-pulse overflow-hidden rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary/20" />
                <h1 className="font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
                  {asset}
                </h1>
              </div>
              <p className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
                Loading live market data...
              </p>
            </div>
            <div className="hidden h-10 w-44 animate-pulse rounded border border-bg-border bg-action-primary md:block" />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[850px] gap-5 pb-16 max-xl:px-[71px] max-lg:px-6 max-md:flex-col max-md:px-3">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="h-8 w-20 animate-pulse rounded bg-content-primary/10" />
                <div className="flex gap-2">
                  <div className="h-9 w-28 animate-pulse rounded border border-bg-border bg-action-primary" />
                  <div className="h-9 w-28 animate-pulse rounded border border-bg-border bg-action-primary/50" />
                </div>
              </div>
              <AppCard className="p-4">
                <div className="mx-auto h-6 w-96 max-w-full animate-pulse rounded bg-content-primary/10" />
                <div className="mt-3 flex gap-2">
                  <div className="h-20 flex-1 animate-pulse rounded border border-bg-border bg-action-primary" />
                  <div className="h-20 flex-1 animate-pulse rounded border border-bg-border bg-action-primary/50" />
                  <div className="h-20 flex-1 animate-pulse rounded border border-bg-border bg-action-primary/50" />
                </div>
              </AppCard>
              <AppCard className="p-4">
                <div className="h-10 animate-pulse rounded bg-content-primary/10" />
                <div className="mt-3 h-20 animate-pulse rounded border border-bg-border bg-action-primary/50" />
              </AppCard>
            </div>
            <AppButton size="lg" className="w-full font-mono" disabled>
              Loading prices...
              <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
            </AppButton>
          </div>
        </div>
      </div>
    );
  }

  const n = priceOptions.length;

  const chartEl = (
    <MarketChart
      symbol={market.asset}
      strikePrice={selectedPrice}
      expiryLabel={formatDate(expiryDate)}
      expiryTs={Math.round(expiryDate.getTime() / 1000)}
      range={chartRange}
      onRangeChange={setChartRange}
      onClose={() => setChartOpen(false)}
      livePoints={livePoints}
    />
  );

  return (
    <div>
      {/* Header */}
      <header className="mx-auto w-full max-w-[850px] space-y-6 pb-20 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-10 max-md:pt-16">
        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
          <Link href="/earn" className="text-content-secondary hover:text-content-primary">
            Earn
          </Link>
          <span className="text-content-primary">/</span>
          <span className="text-content-primary">Market</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          {/* Left: asset name + description */}
          <div className="flex w-[298px] min-w-0 flex-col gap-4 max-md:w-auto">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary">
                <img
                  src={getTokenLogoSrc(market.asset)}
                  alt={market.asset}
                  className="h-full w-full object-cover"
                />
              </div>
              <h1 className="font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
                {market.asset}
              </h1>
            </div>
            <p className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
              Manage your risks by choosing expiry date and price
            </p>
          </div>

          {/* Right: Spot / Cap info box */}
          <AppCard className="hidden shrink-0 items-center gap-3 px-4 py-2.5 md:flex">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                Spot price
              </span>
              <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                {formatUsdSmart(spot)}
              </span>
            </div>
            <div className="h-6 w-px bg-[#323038]" />
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                Cap filled
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                  {formatPct(capFilledPct)}
                </span>
                <div className="h-2.5 w-14 overflow-hidden bg-accent-primary/20">
                  <div
                    className="h-full bg-accent-primary"
                    style={{ width: `${capFilledPct}%` }}
                  />
                </div>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Mobile spot/cap */}
        <AppCard className="flex items-center justify-center gap-3 px-4 py-4 md:hidden">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
              Spot price
            </span>
            <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
              {formatUsdSmart(spot)}
            </span>
          </div>
          <div className="h-6 w-px bg-[#323038]" />
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
              Cap filled
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                {formatPct(capFilledPct)}
              </span>
              <div className="h-2.5 w-14 overflow-hidden bg-accent-primary/20">
                <div
                  className="h-full bg-accent-primary"
                  style={{ width: `${capFilledPct}%` }}
                />
              </div>
            </div>
          </div>
        </AppCard>
      </header>

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-[850px] gap-5 pb-16 max-xl:px-[71px] max-lg:px-6 max-md:flex-col max-md:px-3">
        {/* Mobile chart (above form on small screens) */}
        {chartOpen && <div className="hidden max-lg:block">{chartEl}</div>}

        {/* Left column: form */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Expiry */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="shrink-0 font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
                Expiry
              </h3>
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
                      onClick={() => setStrikeIdx(idx)}
                      className={[
                        "shrink-0 whitespace-nowrap border px-3 py-2 font-mono text-xs font-medium tracking-[-0.24px] transition-colors",
                        active
                          ? "border-accent-primary/30 bg-accent-primary/20 text-content-primary"
                          : "border-bg-border bg-[rgba(18,18,18,0.01)] text-content-secondary hover:border-content-primary/15 hover:bg-[rgba(40,40,40,0.24)]"
                      ].join(" ")}
                      title={formatDate(d)}
                    >
                      <span className="font-medium">{formatShortDate(d)}</span>
                      <span className="mx-1.5 opacity-40">&middot;</span>
                      <span className="opacity-70">{timeLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price selection */}
            <AppCard className="p-4 max-md:p-3">
              <p className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
                {type === "call" ? "Choose the price you\u2019re happy to sell" : "Choose the price you\u2019re happy to buy"}{" "}
                <span className="text-content-primary">{market.asset}</span>{" "}
                on{" "}
                <span className="text-content-primary">{formatDate(expiryDate)} (in {termDisplay})</span>
              </p>

              <div className="mt-3 flex gap-2">
                {shouldShowIndicativeLoading
                  ? Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`price-skeleton-${idx}`} className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 border border-bg-border px-4 py-3">
                      <div className="h-5 w-16 animate-pulse rounded bg-content-primary/10" />
                      <div className="h-4 w-12 animate-pulse rounded bg-content-primary/10" />
                    </div>
                  ))
                  : priceOptionsWithApr.map((option, idx) => {
                  const active = idx === priceIdx;
                  const aprForIdx = option.apr;
                  return (
                    <button
                      key={option.strike}
                      type="button"
                      onClick={() => setPriceIdx(idx)}
                      className={[
                        "flex min-w-0 flex-1 flex-col items-start justify-center gap-1 border px-4 py-3 backdrop-blur-[4px] transition-colors",
                        active
                          ? "border-accent-primary/30 bg-accent-primary/20 text-content-primary"
                          : "border-bg-border bg-[rgba(18,18,18,0.01)] text-content-primary hover:border-content-primary/15 hover:bg-[rgba(40,40,40,0.24)]"
                      ].join(" ")}
                    >
                      <span className="w-full font-mono text-base font-medium leading-[1.2] tracking-[-0.32px]">
                        {formatUsdSmart(option.strike)}
                      </span>
                      <span className="flex w-full items-center justify-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
                        <span className={active ? "text-content-primary" : "text-content-secondary"}>APR</span>
                        <span className="text-content-primary">
                          {aprForIdx > 0 ? formatPct(aprForIdx * 100) : "\u2014"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {shouldShowIndicativeLoading ? (
                <div className="mt-3 font-mono text-sm text-content-secondary">
                  Fetching live strike quotes...
                </div>
              ) : null}
            </AppCard>

            {/* Deposit box */}
            <AppCard className="p-4 max-md:p-3">
              {/* Deposit tabs */}
              <div className="flex">
                <button
                  type="button"
                  onClick={() => {
                    if (type !== "call") {
                      window.location.assign(`/market/${encodeURIComponent(market.asset)}?type=call`);
                    }
                  }}
                  className={[
                    "flex flex-1 items-center justify-center p-3 font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] transition-colors",
                    type === "call"
                      ? "border-b-2 border-accent-primary bg-accent-primary/20 text-accent-secondary"
                      : "border-b border-bg-border bg-transparent text-content-primary hover:text-accent-secondary"
                  ].join(" ")}
                >
                  Deposit {market.asset}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (type !== "csp") {
                      window.location.assign(`/market/${encodeURIComponent(market.asset)}?type=csp`);
                    }
                  }}
                  className={[
                    "flex flex-1 items-center justify-center p-3 font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] transition-colors",
                    type === "csp"
                      ? "border-b-2 border-accent-primary bg-accent-primary/20 text-accent-secondary"
                      : "border-b border-bg-border bg-transparent text-content-primary hover:text-accent-secondary"
                  ].join(" ")}
                >
                  Deposit USDC
                </button>
              </div>

              {/* Deposit input + info */}
              <div className="mt-4 flex flex-col gap-3">
                {/* Input */}
                <div
                  className="flex cursor-text flex-col gap-2 overflow-clip border border-[rgba(240,240,240,0.1)] bg-action-primary p-4"
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                    <span>Deposit</span>
                    <span>~${depositOk ? Math.round(notionalUsd).toLocaleString() : "0"}</span>
                  </div>

                  {/* Token + value */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 overflow-hidden rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary">
                        <img
                          src={getTokenLogoSrc(depositToken)}
                          alt={depositToken}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="font-mono text-2xl font-medium leading-[1.2] text-content-primary">
                        {depositToken}
                      </span>
                    </div>
                    <input
                      inputMode="decimal"
                      placeholder={maxPreset}
                      value={deposit}
                      onChange={(e) => handleDepositChange(e.target.value)}
                      className="w-24 bg-transparent text-right font-mono text-2xl font-medium leading-[1.2] text-content-primary outline-none placeholder:text-content-secondary"
                    />
                  </div>

                  {/* Balance + HALF/MAX */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-content-primary">
                        <path d="M6.75 10h6.5M15 5H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="14" cy="10" r="0.75" fill="currentColor" />
                      </svg>
                      <span>{maxPresetNum.toLocaleString()} {depositToken}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AppPill
                        active
                        className="cursor-pointer"
                        onClick={() => setDeposit(formatInputValue(halfPresetNum, depositInputDecimals))}
                      >
                        HALF
                      </AppPill>
                      <AppPill
                        className="cursor-pointer"
                        onClick={() => setDeposit(maxPreset)}
                      >
                        MAX
                      </AppPill>
                    </div>
                  </div>
                </div>

                {/* Size rule info */}
                {depositRule ? (
                  <div className="font-mono text-xs leading-[1.2] tracking-[-0.24px] text-content-secondary">
                    Size rule: min {formatInputValue(depositRule.min, depositInputDecimals)}{" "}
                    {depositToken}, max{" "}
                    {formatInputValue(depositRule.max, depositInputDecimals)}{" "}
                    {depositToken}, step{" "}
                    {formatInputValue(depositRule.step, depositInputDecimals)}.
                  </div>
                ) : null}

                {/* Info row */}
                <div className="flex items-center gap-4 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">APR</span>
                    <span className="text-content-primary">
                      {shouldShowIndicativeLoading || livePrice == null ? "Loading..." : formatPct(selectedApr)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">Upfront</span>
                    <span className="text-content-primary">{depositOk ? formatUsdc(displayedPremiumUsd) : "\u2014"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">Term</span>
                    <span className="text-content-primary">{termDisplayShort}</span>
                  </div>
                  {depositOk ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-content-secondary">Quote</span>
                      <span className="text-content-primary">
                        {isRfqAuthPending ? "Connecting..." : "Indicative"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </AppCard>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-bg-border" />

          {/* Now section */}
          <div className="flex flex-col gap-3">
            <h3 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
              Now
            </h3>
            <div className="flex flex-col gap-2 border border-bg-border bg-[rgba(18,18,18,0.01)] p-4 backdrop-blur-[4px] max-md:p-3">
              <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                {shouldShowIndicativeLoading || livePrice == null
                  ? "Loading..."
                  : `You earn ${formatPct(selectedApr)} APR`}
              </span>
              <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                {depositOk
                  ? `${formatUsdc(displayedPremiumUsd)} upfront`
                  : "Enter a deposit amount to see your upfront premium"}
              </span>
            </div>
          </div>

          {/* On date section */}
          <div className="flex flex-col gap-3">
            <h3 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
              On {formatDate(expiryDate)}
            </h3>
            <div className="flex gap-2 max-md:flex-col">
              <div className="flex flex-1 flex-col gap-2 border border-bg-border bg-[rgba(18,18,18,0.01)] p-4 backdrop-blur-[4px] max-md:p-3">
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  If spot {type === "call" ? "below" : "above"} {formatUsdSmart(selectedPrice)}
                </span>
                <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                  {depositOk
                    ? type === "call"
                      ? `Get ${depositNum.toLocaleString()} ${market.asset} back`
                      : `Keep ${formatUsdc(depositNum)}`
                    : "\u2014"}
                </span>
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  {type === "call"
                    ? "You keep the asset and the premium."
                    : "You keep your USDC and the premium."}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 border border-bg-border bg-[rgba(18,18,18,0.01)] p-4 backdrop-blur-[4px] max-md:p-3">
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  If spot {type === "call" ? "above" : "below"} {formatUsdSmart(selectedPrice)}
                </span>
                <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                  {depositOk
                    ? type === "call"
                      ? `Receive ${formatUsdc(depositNum * selectedPrice)}`
                      : `Buy ${market.asset} at ${formatUsdSmart(selectedPrice)}`
                    : "\u2014"}
                </span>
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  {type === "call"
                    ? "Your asset is sold at your selected price."
                    : "Your USDC is used to buy the asset at your selected price."}
                </span>
              </div>
            </div>
          </div>

          {/* Deposit button */}
          {!walletAddress ? (
            <AppButton
              size="lg"
              className="w-full font-mono"
              onClick={openSidebar}
            >
              {ctaLabel}
              <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
            </AppButton>
          ) : (
            <AppButton
              size="lg"
              className="w-full font-mono"
              disabled={
                !depositOk ||
                !hasSelectedPrice ||
                isRequestingQuote ||
                shouldShowIndicativeLoading
              }
              onClick={handleDepositClick}
            >
              {ctaLabel}
              <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
            </AppButton>
          )}
        </div>

        {/* Desktop chart sidebar */}
        {chartOpen && (
          <aside className="hidden w-[260px] shrink-0 lg:block">
            <div className="sticky top-24">
              {chartEl}
            </div>
          </aside>
        )}
      </div>

      {/* RFQ Flow Modal */}
      <RfqFlowModal
        open={rfqModalOpen}
        onClose={() => {
          setRfqModalOpen(false);
          setIsRequestingQuote(false);
          setModalInitialQuote(null);
        }}
        requestNonce={rfqRequestNonce}
        marketPda={rfqMarketPda}
        asset={market.asset}
        positionType={type === "call" ? "covered_call" : "cash_secured_put"}
        strike={Math.round(selectedPrice * 1_000_000_000)}
        quantity={(depositOk && wireSizeRule && quantityLamportsFromInput != null)
          ? alignQuantityToRule(quantityLamportsFromInput, wireSizeRule)
          : 0}
        strikeDisplay={formatUsdSmart(selectedPrice)}
        quantityDisplay={`${depositNum.toLocaleString()} ${type === "call" ? market.asset : "USDC"}`}
        initialQuote={modalInitialQuote}
        lockedAprPct={selectedApr}
        signTransaction={walletAddress ? solanaSignTransaction : undefined}
      />
    </div>
  );
}
