"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { useTokenBalance } from "@/components/wallet/use-token-balance";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";
import { AppPill } from "@/components/app-ui/app-pill";
import { RfqFlowModal } from "@/components/market/rfq-flow-modal";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { getTokenMint } from "@/lib/tokens";
import { getCapFilledPct } from "@/lib/token-caps";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useQuoteRequest } from "@/components/rfq/use-quote-request";
import { useTokenMarketsSnapshot } from "@/components/rfq/use-token-markets-snapshot";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import {
  getMarket,
  type MarketType,
  formatPct,
  formatStrikePrice,
  formatUsdSmart
} from "@/lib/markets";
import { formatDate, formatShortDate, formatTerm, formatUsdc } from "@/lib/trade/format";
import {
  alignQuantityToRule,
  clampNumber,
  depositInputDecimals as inputDecimalsFor,
  depositRuleFor,
  depositToQuantity,
  formatInputValue,
  presetAmounts,
  quantityToDeposit,
} from "@/lib/trade/sizing";
import { buildStrikeOptions, indicativesFor, spotFromSnapshot } from "@/lib/trade/strikes";

export function MarketClient({ asset }: { asset: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const strikeParam = searchParams.get("strike") ?? searchParams.get("price");
  const marketParam = searchParams.get("market");
  const type: MarketType = typeParam === "csp" ? "csp" : "call";
  const isPut = type === "csp";

  const market = useMemo(() => getMarket(asset, type), [asset, type]);

  const [strikeIdx, setStrikeIdx] = useState(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [deposit, setDeposit] = useState("");
  const depositInputRef = useRef<HTMLInputElement>(null);
  const [indicativeRequestedKey, setIndicativeRequestedKey] = useState<string | null>(null);

  const {
    markets: rfqMarkets,
    tokenCaps,
    marketDescriptors,
    isConnected: rfqConnected,
    isAuthenticated: rfqAuthenticated,
    connectionState,
    referralStatus,
    openReferralGate,
  } = useRfqContext();
  const tokenMarketsInfo = useTokenMarketsSnapshot(market ? getTokenMint(market.asset) : null);
  const { isRequesting: isRequestingQuote, request: requestQuote, modalProps } = useQuoteRequest();
  const isReferralGated = referralStatus === "required";

  const matchingMarkets = useMemo(() => {
    if (!market) return [];

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
  }, [tokenMarketsInfo, rfqMarkets, isPut, market]);

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

  useEffect(() => {
    if (!marketParam || matchingMarkets.length === 0) return;
    const idx = matchingMarkets.findIndex(m => m.pda === marketParam);
    if (idx !== -1 && idx !== strikeIdx) {
      setStrikeIdx(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketParam, matchingMarkets]);

  useEffect(() => {
    if (matchingMarkets.length > 0 && strikeIdx >= matchingMarkets.length) {
      setStrikeIdx(0);
    }
  }, [matchingMarkets.length, strikeIdx]);

  const positionType = type === "call" ? "covered_call" : "cash_secured_put";
  const currentIndicativePrices = indicativesFor(tokenMarketsInfo, rfqMarketPda, positionType);
  const referencePrice = tokenMarketsInfo?.reference_price;
  const spot = spotFromSnapshot(tokenMarketsInfo);

  const currentIndicativeKey = rfqMarketPda ? `${rfqMarketPda}:${positionType}` : null;
  const hasCurrentIndicativePrices = !!(
    currentIndicativePrices &&
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

  const strikeDates = useMemo(
    () => matchingMarkets.map(m => new Date(Number(m.expiry_ts) * 1000)),
    [matchingMarkets]
  );
  const expiryFromMarket = strikeDates.length > 0 ? strikeDates[strikeIdx] ?? strikeDates[0] : null;

  useEffect(() => {
    if (!rfqMarketPda) return;
    setIndicativeRequestedKey(`${rfqMarketPda}:${positionType}`);
  }, [rfqMarketPda, positionType]);

  useEffect(() => {
    if (!currentIndicativeKey) {
      setIndicativeRequestedKey(null);
    }
  }, [currentIndicativeKey]);

  const { rpc, selectedAccount, signTransaction: solanaSignTransaction } = useSolana();
  const { openSidebar } = useWalletSidebar();

  const walletAddress = selectedAccount?.address;
  const rfqBackendUrl = getRfqBackendUrl();
  const depositToken = type === "call" ? market?.asset ?? asset : "USDC";
  const walletBalance = useTokenBalance(walletAddress, depositToken);

  const priceOptionsWithApr = useMemo(() => {
    const expiryTs = matchingMarkets[strikeIdx]?.expiry_ts ? Number(matchingMarkets[strikeIdx].expiry_ts) : 0;
    const secondsToExpiry = expiryTs > 0 ? expiryTs - Math.floor(Date.now() / 1000) : 0;
    if (!hasCurrentIndicativePrices) return [];
    return buildStrikeOptions(currentIndicativePrices, {
      referencePrice1e9: referencePrice != null ? Number(referencePrice) : null,
      secondsToExpiry,
      isPut,
    });
  }, [
    hasCurrentIndicativePrices,
    currentIndicativePrices,
    matchingMarkets,
    strikeIdx,
    referencePrice,
    isPut,
  ]);

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

  const depositRule = useMemo(
    () => depositRuleFor({ isPut, sizeRule: wireSizeRule, strike1e9: selectedStrikeLamports, underlyingDecimals }),
    [wireSizeRule, isPut, selectedStrikeLamports, underlyingDecimals]
  );

  const depositInputDecimals = useMemo(
    () => inputDecimalsFor(depositRule, isPut, underlyingDecimals),
    [depositRule, isPut, underlyingDecimals]
  );

  const handleDepositChange = useCallback(
    (raw: string) => {
      if (raw === "" || /^(\d+(\.\d*)?|\.\d+)$/.test(raw)) setDeposit(raw);
    },
    []
  );

  const expiryDate = strikeDates[strikeIdx] ?? strikeDates[0] ?? new Date();
  const isLiveMarketReady = !!expiryFromMarket;
  const { long: termDisplay, short: termDisplayShort } = formatTerm(expiryDate.getTime(), Date.now());

  const depositNum = Number(deposit);
  const quantityLamportsFromInput = useMemo(
    () => wireSizeRule
      ? depositToQuantity({ amount: depositNum, isPut, strike1e9: selectedStrikeLamports, underlyingDecimals })
      : null,
    [depositNum, wireSizeRule, isPut, underlyingDecimals, selectedStrikeLamports]
  );

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
    type === "call" ? (depositOk ? depositNum * (spot ?? 0) : 0) : depositOk ? depositNum : 0;
  const selectedApr = selectedPriceOption?.apr != null ? selectedPriceOption.apr * 100 : null;

  const bestPricePerUnit = selectedPriceOption?.bestPrice
    ? Number(selectedPriceOption.bestPrice) / 1_000_000_000
    : 0;
  const displayedPremiumUsd = depositOk
    ? bestPricePerUnit *
      (type === "call" ? depositNum : (quantityLamportsFromInput ?? 0) / 10 ** underlyingDecimals)
    : 0;
  const isRfqAuthPending =
    !!walletAddress &&
    depositOk &&
    !!rfqMarketPda &&
    (connectionState === "authenticating" || connectionState === "connecting" || !rfqAuthenticated);

  const ctaLabel = !walletAddress
    ? "Connect"
    : isReferralGated
      ? "Redeem invite to trade"
      : !hasSelectedPrice
        ? "Choose price"
        : !depositOk
          ? (sizeRuleViolationMessage ?? "Choose size")
          : shouldShowIndicativeLoading
            ? "Loading prices..."
            : selectedApr == null
              ? "Prices unavailable"
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

  const { half: halfPresetNum, max: maxPresetNum } = presetAmounts({ rule: depositRule, balance: walletBalance, isPut });
  const maxPreset = formatInputValue(maxPresetNum, depositInputDecimals);

  const handleDepositClick = useCallback(() => {
    if (isRequestingQuote) return;

    if (isReferralGated) {
      openReferralGate();
      return;
    }

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
    if (!marketPda || selectedApr == null) return;

    const alignedQuantity = alignQuantityToRule(quantityLamportsFromInput, wireSizeRule);
    const alignedDeposit = quantityToDeposit({
      quantity: alignedQuantity,
      isPut,
      strike1e9: selectedStrikeLamports,
      underlyingDecimals,
    });
    if (alignedQuantity !== quantityLamportsFromInput) {
      setDeposit(formatInputValue(alignedDeposit, depositInputDecimals));
    }

    requestQuote(
      { market: marketPda, positionType, strike: selectedStrikeLamports, quantity: alignedQuantity },
      {
        asset: market?.asset ?? asset,
        positionType,
        strike: selectedStrikeLamports,
        quantity: alignedQuantity,
        underlyingDecimals,
        strikeDisplay: formatStrikePrice(selectedPrice),
        quantityDisplay: `${alignedDeposit.toLocaleString("en-US")} ${type === "call" ? (market?.asset ?? asset) : "USDC"}`,
        lockedAprPct: selectedApr,
      }
    );
  }, [
    isRequestingQuote,
    isReferralGated,
    openReferralGate,
    rfqMarketPda,
    depositOk,
    hasSelectedPrice,
    rfqConnected,
    rfqAuthenticated,
    requestQuote,
    selectedStrikeLamports,
    quantityLamportsFromInput,
    wireSizeRule,
    positionType,
    isPut,
    type,
    underlyingDecimals,
    depositInputDecimals,
    asset, market?.asset, selectedPrice, selectedApr,
  ]);

  const rfqModal = <RfqFlowModal
    key="rfq-order"
    {...modalProps}
    walletAddress={walletAddress ?? null}
    backendUrl={rfqBackendUrl}
    signTransaction={walletAddress ? solanaSignTransaction : undefined}
    rpc={rpc}
  />;

  if (!market) {
    return (
      <>
        <div className="space-y-6">
          <h1 className="font-space text-4xl font-semibold">Market not found</h1>
          <div className="font-mono text-content-secondary">
            Try <Link className="text-accent-secondary hover:text-accent-primary" href="/trade">/trade</Link>.
          </div>
        </div>
        {rfqModal}
      </>
    );
  }

  if (!isLiveMarketReady) {
    return (
      <div>
        <header className="mx-auto w-full max-w-[850px] space-y-6 pb-20 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-10 max-md:pt-16">
          <div className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
            <Link href="/trade" className="text-content-secondary hover:text-content-primary">
              Trade
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
        {rfqModal}
      </div>
    );
  }


  return (
    <div>
      {            }
      <header className="mx-auto w-full max-w-[850px] space-y-6 pb-20 pt-[104px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-10 max-md:pt-16">
        {                }
        <div className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
          <Link href="/trade" className="text-content-secondary hover:text-content-primary">
            Trade
          </Link>
          <span className="text-content-primary">/</span>
          <span className="text-content-primary">Market</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          {                                    }
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

          {                                }
          <AppCard className="hidden shrink-0 items-center gap-3 px-4 py-2.5 md:flex">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                Spot price
              </span>
              <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                {spot != null ? formatUsdSmart(spot) : "\u2014"}
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

        {                     }
        <AppCard className="flex items-center justify-center gap-3 px-4 py-4 md:hidden">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
              Spot price
            </span>
            <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
              {spot != null ? formatUsdSmart(spot) : "\u2014"}
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

      {                  }
      <div className="mx-auto flex w-full max-w-[850px] gap-5 pb-16 max-xl:px-[71px] max-lg:px-6 max-md:flex-col max-md:px-3">
        {                                                }
        {                                                                         }

        {                       }
        <div className="min-w-0 flex-1 space-y-5">
          {            }
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

            {                     }
            <AppCard className="p-4 max-md:p-3">
              <p className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
                {type === "call" ? "Choose the price you\u2019re happy to sell" : "Choose the price you\u2019re happy to buy"}{" "}
                <span className="text-content-primary">{market.asset}</span>{" "}
                on{" "}
                <span className="text-content-primary">{formatDate(expiryDate)} (in {termDisplay})</span>
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 md:flex">
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
                          {formatStrikePrice(option.strike)}
                        </span>
                        <span className="flex w-full items-center justify-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
                          <span className={active ? "text-content-primary" : "text-content-secondary"}>APR</span>
                          <span className="text-content-primary">
                            {aprForIdx != null ? formatPct(aprForIdx * 100) : "\u2014"}
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

            {                 }
            <AppCard className="p-4 max-md:p-3">
              {                  }
              <div className="flex">
                <button
                  type="button"
                  onClick={() => {
                    if (type !== "call") {
                      router.push(`/market/${encodeURIComponent(market.asset)}?type=call`);
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
                      router.push(`/market/${encodeURIComponent(market.asset)}?type=csp`);
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

              {                          }
              <div className="mt-4 flex flex-col gap-3">
                {           }
                <div
                  className="flex cursor-text flex-col gap-2 overflow-clip border border-[rgba(240,240,240,0.1)] bg-action-primary p-4"
                  onClick={() => depositInputRef.current?.focus()}
                >
                  {             }
                  <div className="flex items-center justify-between font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
                    <span>Deposit</span>
                    <span>~${depositOk ? Math.round(notionalUsd).toLocaleString("en-US") : "0"}</span>
                  </div>

                  {                   }
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
                      ref={depositInputRef}
                      inputMode="decimal"
                      placeholder={maxPreset}
                      value={deposit}
                      onChange={(e) => handleDepositChange(e.target.value)}
                      className="w-24 bg-transparent text-right font-mono text-2xl font-medium leading-[1.2] text-content-primary outline-none placeholder:text-content-secondary"
                    />
                  </div>

                  {                        }
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-content-primary">
                        <path d="M6.75 10h6.5M15 5H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="14" cy="10" r="0.75" fill="currentColor" />
                      </svg>
                      <span>{walletBalance != null ? walletBalance.toLocaleString("en-US", { maximumFractionDigits: type === "csp" ? 2 : 4 }) : "\u2014"} {depositToken}</span>
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

                {                                }
                {depositRule ? (
                  <div
                    className={`font-mono text-xs leading-[1.2] tracking-[-0.24px] ${
                      sizeRuleViolationMessage ? "text-error" : "text-content-secondary"
                    }`}
                  >
                    {sizeRuleViolationMessage ? (
                      <>{sizeRuleViolationMessage}.</>
                    ) : (
                      <>
                        Size rule: min {formatInputValue(depositRule.min, depositInputDecimals)}{" "}
                        {depositToken}, max{" "}
                        {formatInputValue(depositRule.max, depositInputDecimals)}{" "}
                        {depositToken}, step{" "}
                        {formatInputValue(depositRule.step, depositInputDecimals)}.
                      </>
                    )}
                  </div>
                ) : null}

                {              }
                <div className="flex items-center gap-4 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">APR</span>
                    <span className="text-content-primary">
                      {selectedApr != null ? formatPct(selectedApr) : shouldShowIndicativeLoading ? "Loading..." : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">Upfront</span>
                    <span className="text-content-primary">{depositOk && selectedApr != null ? formatUsdc(displayedPremiumUsd) : "\u2014"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-content-secondary">Term</span>
                    <span className="text-content-primary">{termDisplayShort}</span>
                  </div>
                </div>
              </div>
            </AppCard>
          </div>

          {             }
          <div className="h-px w-full bg-bg-border" />

          {                 }
          <div className="flex flex-col gap-3">
            <h3 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
              Now
            </h3>
            <div className="flex flex-col gap-2 border border-bg-border bg-[rgba(18,18,18,0.01)] p-4 backdrop-blur-[4px] max-md:p-3">
              <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                {selectedApr != null ? `You earn ${formatPct(selectedApr)} APR`
                  : shouldShowIndicativeLoading ? "Loading..." : "APR unavailable"}
              </span>
              <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                {depositOk && selectedApr != null
                  ? `${formatUsdc(displayedPremiumUsd)} upfront`
                  : sizeRuleViolationMessage
                    ? `${sizeRuleViolationMessage} to see your upfront premium`
                    : "Enter a deposit amount to see your upfront premium"}
              </span>
            </div>
          </div>

          {                     }
          <div className="flex flex-col gap-3">
            <h3 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
              On {formatDate(expiryDate)}
            </h3>
            <div className="flex gap-2 max-md:flex-col">
              <div className="flex flex-1 flex-col gap-2 border border-bg-border bg-[rgba(18,18,18,0.01)] p-4 backdrop-blur-[4px] max-md:p-3">
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  If spot {type === "call" ? "below" : "above"} {formatStrikePrice(selectedPrice)}
                </span>
                <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                  {depositOk
                    ? type === "call"
                      ? `Get ${depositNum.toLocaleString("en-US")} ${market.asset} back`
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
                  If spot {type === "call" ? "above" : "below"} {formatStrikePrice(selectedPrice)}
                </span>
                <span className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary">
                  {depositOk
                    ? type === "call"
                      ? `Receive ${formatUsdc(depositNum * selectedPrice)}`
                      : `Buy ${market.asset} at ${formatStrikePrice(selectedPrice)}`
                    : "\u2014"}
                </span>
                <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary opacity-50">
                  {type === "call"
                    ? "Your asset is swapped at your selected price."
                    : "Your USDC is swapped at your selected price."}
                </span>
              </div>
            </div>
          </div>

          {                    }
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
                !isReferralGated && (
                  !depositOk ||
                  !hasSelectedPrice ||
                  isRequestingQuote ||
                  shouldShowIndicativeLoading
                )
              }
              onClick={handleDepositClick}
            >
              {ctaLabel}
              <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
            </AppButton>
          )}
        </div>

        {                           }
        {
             }
      </div>

      {rfqModal}
    </div>
  );
}
