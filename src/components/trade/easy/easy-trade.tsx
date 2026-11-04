"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { useMemo, useState } from "react";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { useTokenBalance } from "@/components/wallet/use-token-balance";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useQuoteRequest } from "@/components/rfq/use-quote-request";
import { useTokenMarketsSnapshot } from "@/components/rfq/use-token-markets-snapshot";
import { RfqFlowModal } from "@/components/market/rfq-flow-modal";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { BUY_PRODUCT_NAME, type TakerSide } from "@/lib/spreads";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { formatPct, formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { getToken } from "@/lib/tokens";
import { pickAsset, tradeAssets } from "@/lib/trade/assets";
import { formatAmount, formatCountdown, formatExpiryDay, formatExpiryUtc, formatPrice, formatTimeAway, formatUsdAmount, formatUsdc } from "@/lib/trade/format";
import {
  alignQuantityToRule,
  defaultAmount,
  depositInputDecimals,
  depositRuleFor,
  depositToQuantity,
  formatInputValue,
  presetAmounts,
  quantityToDeposit,
} from "@/lib/trade/sizing";
import {
  buildStrikeOptions,
  defaultStrikeIndex,
  tradableExpiries,
  indicativesFor,
  spotFromSnapshot,
  type StrikeOption,
} from "@/lib/trade/strikes";
import {
  BUY_ITM_WARNING,
  BUY_KIND_OPTIONS,
  SENTENCE,
  SPREAD_SETTLEMENT_NOTE,
  amountSymbol,
  buyOutcomeCopy,
  buySpreadTerms,
  buyZoneLabels,
  cushionText,
  directionInfo,
  directionsFor,
  easyCta,
  exerciseDepositText,
  outcomeCopy,
  payoutTail,
  scenario as buildScenario,
  spreadLegLabel,
  spreadLegs,
  spreadMaxGain,
  spreadOutcomeCopy,
  spreadZoneLabels,
  strikeDistancePct,
  thesisText,
  zoneLabels,
  type BuyKind,
  type Direction,
} from "@/lib/trade/thesis";
import { ThesisSentence } from "./thesis-sentence";
import { ThesisChart } from "./thesis-chart";
import { OrderBreakdown, type BreakdownRow } from "./order-breakdown";

const PRICE_SCALE = 1_000_000_000;
const SIDE_OPTIONS: Array<{ value: TakerSide; label: string }> = [
  { value: "sell", label: "Sell" },
  { value: "buy", label: "Buy" },
];
const CONTAINER = "mx-auto w-full max-w-[850px] pb-20 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-6";

/** The chosen strike if still listed, else the closest one by price. */
function nearestStrike(options: StrikeOption[], strike1e9: number): StrikeOption | null {
  let best: StrikeOption | null = null;
  for (const o of options) {
    if (!best || Math.abs(o.strike1e9 - strike1e9) < Math.abs(best.strike1e9 - strike1e9)) best = o;
  }
  return best;
}

function signedPct(pct: number) {
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
}

function SentenceSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-12 w-full max-w-[720px] animate-pulse bg-action-primary max-md:h-9" />
      <div className="h-12 w-4/5 max-w-[560px] animate-pulse bg-action-primary max-md:h-9" />
      <div className="h-12 w-3/5 max-w-[420px] animate-pulse bg-action-primary max-md:h-9" />
    </div>
  );
}

export function EasyTrade({
  initialAsset,
  modeSwitch,
  howItWorks,
}: {
  initialAsset?: string | null;
  /** Make Yield | Make Profit switch, first on the left so it holds its place across modes */
  modeSwitch?: React.ReactNode;
  howItWorks?: React.ReactNode;
}) {
  const { earnSummary, referralStatus, openReferralGate, isAuthenticated, marketDescriptors } = useRfqContext();
  const { rpc, selectedAccount, signTransaction } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const walletAddress = selectedAccount?.address;
  const { isRequesting, failure, request, modalProps } = useQuoteRequest({ cancelOnUnmount: true });

  const assets = useMemo(() => tradeAssets(earnSummary), [earnSummary]);
  const [assetChoice, setAssetChoice] = useState<string | null>(null);
  const [takerSide, setTakerSide] = useState<TakerSide>("sell");
  const [buyKind, setBuyKind] = useState<BuyKind>("option");
  const [legChoice, setLegChoice] = useState<number | null>(null);
  const [directionChoice, setDirectionChoice] = useState<Direction>("above");
  const [expiryChoice, setExpiryChoice] = useState<number | null>(null);
  const [strikeChoice, setStrikeChoice] = useState<number | null>(null);
  /** what the user typed; null follows the suggested amount */
  const [amountInput, setAmountInput] = useState<string | null>(null);

  const asset = pickAsset(assets, assetChoice ?? initialAsset);
  const snapshot = useTokenMarketsSnapshot(asset?.mint ?? null);
  const spot = spotFromSnapshot(snapshot);
  const nowSec = Math.floor(Date.now() / 1000);

  const putExpiries = useMemo(() => tradableExpiries(snapshot, true, "cash_secured_put", nowSec), [snapshot, nowSec]);
  const callExpiries = useMemo(() => tradableExpiries(snapshot, false, "covered_call", nowSec), [snapshot, nowSec]);
  const hasMarkets = (d: Direction) => {
    const { isPut } = directionInfo(d, takerSide);
    return snapshot ? (isPut ? putExpiries : callExpiries).length > 0 : (isPut ? asset?.hasPut : asset?.hasCall) ?? true;
  };
  const available: Record<Direction, boolean> = { above: hasMarkets("above"), below: hasMarkets("below") };
  const direction: Direction = available[directionChoice]
    ? directionChoice
    : available.above ? "above" : available.below ? "below" : directionChoice;
  const info = directionInfo(direction, takerSide);
  const buying = takerSide === "buy";
  // a buy is sized in the asset; only a sold put is sized in USDC
  const amountInQuote = !buying && info.isPut;
  const expiries = info.isPut ? putExpiries : callExpiries;
  const expiry = expiries.find((e) => e.expiryTs === expiryChoice) ?? expiries[0] ?? null;

  const strikeOptions = useMemo(
    () =>
      expiry
        ? buildStrikeOptions(indicativesFor(snapshot, expiry.pda, info.positionType), {
          referencePrice1e9: snapshot ? Number(snapshot.reference_price) : null,
          secondsToExpiry: expiry.expiryTs - nowSec,
          isPut: info.isPut,
        })
        : [],
    [snapshot, expiry, info.positionType, info.isPut, nowSec]
  );
  const strike = strikeChoice != null
    ? nearestStrike(strikeOptions, strikeChoice)
    : strikeOptions[defaultStrikeIndex(strikeOptions, spot, info.isPut)] ?? null;

  const listedProducts = marketDescriptors.find((d) => d.market?.market_pda === expiry?.pda)?.products;
  const spreadsListed = !!listedProducts?.includes(info.isPut ? "put_spread" : "call_spread");
  const buyingSpread = buying && buyKind === "spread" && spreadsListed;
  const legs = useMemo(
    () => buyingSpread && strike
      ? spreadLegs(strikeOptions.map((o) => o.strike1e9), strike.strike1e9, info.isPut)
        .filter((l) => listedProducts?.includes(buySpreadTerms(info.isPut, strike.strike1e9, l).type))
      : [],
    [buyingSpread, strike, strikeOptions, info.isPut, listedProducts]
  );
  const leg = legChoice != null && legs.includes(legChoice) ? legChoice : legs[0] ?? null;
  const spreadBuy = buyingSpread && strike && leg != null ? buySpreadTerms(info.isPut, strike.strike1e9, leg) : null;

  const symbol = asset ? amountSymbol(takerSide, direction, asset.symbol) : "USDC";
  const decimals = snapshot ? Number(snapshot.underlying_decimals) : getToken(asset?.symbol ?? "")?.decimals ?? 9;
  const sizeRule = snapshot?.size_rule ?? null;
  const depositRule = depositRuleFor({ isPut: amountInQuote, sizeRule, strike1e9: strike?.strike1e9 ?? 0, underlyingDecimals: decimals });
  const inputDecimals = depositInputDecimals(depositRule, amountInQuote, decimals);
  const suggested = defaultAmount({ rule: depositRule, isPut: amountInQuote, spot });
  const amountText = amountInput ?? (suggested != null ? formatInputValue(suggested, inputDecimals) : "");
  const amount = Number(amountText);

  const typedQuantity = sizeRule && strike
    ? depositToQuantity({ amount, isPut: amountInQuote, strike1e9: strike.strike1e9, underlyingDecimals: decimals })
    : null;
  const sizeViolation = typedQuantity == null || !sizeRule || !depositRule
    ? null
    : typedQuantity < sizeRule.min_size
      ? `Below min ${formatInputValue(depositRule.min, inputDecimals)} ${symbol}`
      : typedQuantity > sizeRule.max_size
        ? `Above max ${formatInputValue(depositRule.max, inputDecimals)} ${symbol}`
        : null;
  // floored onto the step grid, so the order never locks more than was typed
  const quantity = typedQuantity != null && sizeRule && !sizeViolation
    ? alignQuantityToRule(typedQuantity, sizeRule, "floor")
    : null;
  const lockedDeposit = quantity != null && strike
    ? quantityToDeposit({ quantity, isPut: amountInQuote, strike1e9: strike.strike1e9, underlyingDecimals: decimals })
    : null;
  const lockedText = lockedDeposit != null ? formatInputValue(lockedDeposit, inputDecimals) : null;

  const premiumPerUnit = !buying && strike?.bestPrice != null ? strike.bestPrice / PRICE_SCALE : null;
  const outcome = quantity != null && strike && premiumPerUnit != null
    ? buildScenario({ direction, quantity: quantity / 10 ** decimals, strike: strike.strike, premiumPerUnit, spot })
    : null;
  const aprPct = !buying && strike?.apr != null ? strike.apr * 100 : null;
  const countdown = expiry ? formatCountdown(expiry.expiryTs * 1000, Date.now()) : null;
  const distance = strike ? strikeDistancePct(strike.strike, spot) : null;

  // a buy pays USDC and its amount is the option's size, so the balance cannot bound it before the quote
  const balanceSymbol = buying ? "USDC" : symbol;
  const balance = useTokenBalance(walletAddress, balanceSymbol);
  const insufficientBalance = !buying && balance != null && lockedDeposit != null && lockedDeposit > balance + 1e-9;

  // Everything the sentence could show for this asset in either direction, on any date,
  // at any price: each part keeps its widest value's width, so no pick reflows the sentence.
  const sentenceReserve = useMemo(() => {
    const strikes = new Map<number, { key: string; label: string }>();
    const dates = new Map<number, { key: string; label: string }>();
    const amounts = new Map<string, { key: string; number: string; symbol: string }>();
    const tails = new Set<string>();
    if (snapshot && asset) {
      for (const side of directionsFor(takerSide)) {
        const sideSymbol = amountSymbol(takerSide, side.value, asset.symbol);
        const sideInQuote = !buying && side.isPut;
        // switching direction clears a typed amount, so the other side shows its suggestion
        const typed = side.value === direction ? amountInput : null;
        for (const e of tradableExpiries(snapshot, side.isPut, side.positionType, nowSec)) {
          dates.set(e.expiryTs, { key: String(e.expiryTs), label: formatExpiryDay(e.expiryTs * 1000) });
          const options = buildStrikeOptions(indicativesFor(snapshot, e.pda, side.positionType), {
            referencePrice1e9: Number(snapshot.reference_price),
            secondsToExpiry: e.expiryTs - nowSec,
            isPut: side.isPut,
          });
          for (const o of options) {
            strikes.set(o.strike1e9, { key: String(o.strike1e9), label: formatStrikePrice(o.strike) });
            if (!sizeRule) continue;
            const rule = depositRuleFor({ isPut: sideInQuote, sizeRule, strike1e9: o.strike1e9, underlyingDecimals: decimals });
            const fallback = defaultAmount({ rule, isPut: sideInQuote, spot });
            const text = typed ?? (fallback != null ? formatInputValue(fallback, depositInputDecimals(rule, sideInQuote, decimals)) : "");
            if (!text) continue;
            amounts.set(`${text} ${sideSymbol}`, { key: `${text} ${sideSymbol}`, number: text, symbol: sideSymbol });
            const q = depositToQuantity({ amount: Number(text), isPut: sideInQuote, strike1e9: o.strike1e9, underlyingDecimals: decimals });
            if (!buying && q != null && o.bestPrice != null && q >= sizeRule.min_size && q <= sizeRule.max_size) {
              const units = alignQuantityToRule(q, sizeRule, "floor") / 10 ** decimals;
              tails.add(payoutTail(
                `≈${formatUsdAmount((units * o.bestPrice) / PRICE_SCALE)}`,
                o.apr != null ? formatPct(o.apr * 100) : null
              ));
            }
          }
        }
      }
      if (buying) tails.add(payoutTail(SENTENCE.quotedPremium, null));
    }
    return {
      assets: assets.map((a) => a.symbol),
      strikes: [...strikes.values()],
      dates: [...dates.values()],
      amounts: [...amounts.values()],
      tails: [...tails],
    };
  }, [snapshot, asset, assets, takerSide, buying, direction, amountInput, sizeRule, nowSec, decimals, spot]);

  const cta = easyCta({
    walletConnected: !!walletAddress,
    referralGated: referralStatus === "required",
    pricesLoading: !snapshot,
    hasMarkets: expiries.length > 0,
    hasStrike: !!strike && (!buyingSpread || spreadBuy != null),
    priced: buying || aprPct != null,
    amountEntered: amount > 0,
    sizeViolation,
    insufficientBalance,
    connecting: !!walletAddress && !isAuthenticated,
    requesting: isRequesting,
  });

  function chooseAsset(next: string) {
    setAssetChoice(next);
    setExpiryChoice(null);
    setStrikeChoice(null);
    setAmountInput(null);
  }

  function chooseSide(next: TakerSide) {
    setTakerSide(next);
    setStrikeChoice(null);
    setLegChoice(null);
    setAmountInput(null);
  }

  function chooseBuyKind(next: BuyKind) {
    setBuyKind(next);
    setLegChoice(null);
  }

  function chooseDirection(next: Direction) {
    setDirectionChoice(next);
    setStrikeChoice(null);
    setLegChoice(null);
    setAmountInput(null);
  }

  function onCta() {
    if (cta.action === "connect") return openSidebar();
    if (cta.action === "redeem") return openReferralGate();
    if (cta.action !== "quote" || !asset || !expiry || !strike || quantity == null || lockedDeposit == null) return;
    if (amountInput != null && lockedText != null && lockedText !== amountText) setAmountInput(lockedText);
    const terms = spreadBuy ?? { type: info.positionType, strike: strike.strike1e9 };
    request(
      { market: expiry.pda, terms, side: takerSide, quantity },
      {
        asset: asset.symbol,
        terms,
        side: takerSide,
        quantity,
        underlyingDecimals: decimals,
        strikeDisplay: formatStrikePrice(strike.strike),
        quantityDisplay: `${formatAmount(lockedDeposit, inputDecimals)} ${symbol}`,
        thesis: thesisText({ asset: asset.symbol, direction, strike: strike.strike, expiryMs: expiry.expiryTs * 1000 }),
        lockedAprPct: aprPct,
      }
    );
  }

  const modal = (
    <RfqFlowModal
      key="rfq-order"
      {...modalProps}
      walletAddress={walletAddress ?? null}
      backendUrl={getRfqBackendUrl()}
      signTransaction={walletAddress ? signTransaction : undefined}
      rpc={rpc}
    />
  );

  const topBar = (
    <div className="flex flex-wrap items-center gap-3">
      {modeSwitch}
      <div className="ml-auto">{howItWorks}</div>
    </div>
  );

  if (!earnSummary || !asset) {
    return (
      <div className={CONTAINER}>
        {topBar}
        <div className="mt-8 max-md:mt-6">
          {earnSummary ? (
            <AppCard className="p-6 font-mono text-base text-content-secondary">
              No markets are open right now. Check back soon.
            </AppCard>
          ) : (
            <SentenceSkeleton />
          )}
        </div>
        {modal}
      </div>
    );
  }

  const sizeText = quantity != null ? `${formatAmount(quantity / 10 ** decimals, inputDecimals)} ${asset.symbol}` : "—";
  const maxPayout = spreadBuy && strike && leg != null && quantity != null
    ? formatUsdc(spreadMaxGain(quantity / 10 ** decimals, strike.strike1e9, leg))
    : null;
  const outcomeText = maxPayout && strike && leg != null
    ? spreadOutcomeCopy({ asset: asset.symbol, direction, strike1e9: strike.strike1e9, leg1e9: leg, maxPayout })
    : buying
    ? strike && quantity != null ? buyOutcomeCopy({ asset: asset.symbol, direction, strike: strike.strike, sizeText }) : null
    : outcome && strike
    ? outcomeCopy({ asset: asset.symbol, direction, strike: strike.strike, scenario: outcome, assetDecimals: info.isPut ? 4 : inputDecimals })
    : null;
  const labels = spreadBuy
    ? spreadZoneLabels(maxPayout)
    : strike && buying
    ? buyZoneLabels({ asset: asset.symbol, direction, strike: strike.strike })
    : strike
    ? zoneLabels({ asset: asset.symbol, direction, strike: strike.strike, scenario: outcome, assetDecimals: info.isPut ? 4 : inputDecimals })
    : null;

  const termRows: BreakdownRow[] = [
    spreadBuy
      ? { label: "Type", value: BUY_PRODUCT_NAME[spreadBuy.type], info: SPREAD_SETTLEMENT_NOTE }
      : { label: "Type", value: info.optionName, info: info.optionExplainer },
    {
      label: "Strike",
      value: strike
        ? `${formatStrikePrice(strike.strike)}${distance != null ? ` · ${Math.abs(distance).toFixed(1)}% ${distance < 0 ? "below" : "above"} spot` : ""}`
        : "—",
    },
    { label: "Expiry", value: expiry ? `${formatExpiryUtc(expiry.expiryTs * 1000)} · in ${countdown}` : "—" },
  ];
  const rows: BreakdownRow[] = buying ? [
    ...termRows,
    { label: "You buy", value: sizeText },
    {
      label: "You pay",
      value: "Set by the quote",
      info: "Market makers price a buy when you request it. The premium, max loss and break-even are shown before you accept.",
    },
    { label: "Max loss", value: "The premium you pay" },
    ...(spreadBuy ? [{
      label: "Max payout before premium",
      value: maxPayout ?? "—",
      info: "The width of the spread, paid in USDC at expiry. Your max gain is this minus the premium, shown with the quote.",
    }, {
      label: "Deposit",
      value: "None",
      info: SPREAD_SETTLEMENT_NOTE,
    }] : [{
      label: "To exercise",
      value: quantity != null && strike
        ? `Deposit ${exerciseDepositText(info.isPut, quantity / 10 ** decimals, strike.strike, asset.symbol, inputDecimals)} before expiry`
        : "—",
      info: BUY_ITM_WARNING,
    }]),
  ] : [
    ...termRows,
    {
      label: "You deposit",
      value: outcome
        ? info.isPut
          ? formatUsdc(outcome.deposit)
          : `${formatAmount(outcome.deposit, inputDecimals)} ${asset.symbol}${outcome.depositUsd != null ? ` (~${formatUsdSmart(outcome.depositUsd)})` : ""}`
        : "—",
    },
    {
      label: "Paid to you now",
      value: outcome ? `≈ ${formatUsdc(outcome.premium)}` : "—",
      info: "An estimate from market makers' indicative prices. The quote you accept sets the exact amount, paid when the order fills.",
    },
    { label: "APR", value: aprPct != null ? formatPct(aprPct) : "—" },
    {
      label: "Potential profit",
      value: outcome
        ? `+${formatUsdc(outcome.premium)}${outcome.returnPct != null ? ` (${outcome.returnPct.toFixed(2)}%)` : ""}`
        : "—",
      info: "The most this trade makes: the premium, when you are right.",
    },
    {
      label: "Break-even",
      value: outcome ? formatPrice(outcome.breakEven) : "—",
      info: direction === "above"
        ? "Below this price you are down compared with holding USDC."
        : `Above this price, holding ${asset.symbol} would have done better.`,
    },
  ];

  const unavailable = (Object.keys(available) as Direction[]).filter((d) => !available[d]);
  const earnings = !snapshot ? null : buying ? SENTENCE.quotedPremium : outcome ? `≈${formatUsdAmount(outcome.premium)}` : "—";
  // the pill's quick amounts: half and all of the balance; none on a buy, whose size is not paid from this balance, snapped onto the step grid; typing covers anything else
  const { half, max } = presetAmounts({ rule: depositRule, balance, isPut: amountInQuote });
  const halfText = balance != null ? formatInputValue(half, inputDecimals) : null;
  const maxText = balance != null ? formatInputValue(max, inputDecimals) : null;
  const amountPresets =
    buying || maxText == null || Number(maxText) <= 0
      ? []
      : [
          ...(halfText != null && halfText !== maxText && Number(halfText) > 0
            ? [{ text: halfText, hint: "half of balance" }]
            : []),
          { text: maxText, hint: depositRule != null && balance != null && balance > depositRule.max ? "rule max" : "your balance" },
        ];
  const amountHint = sizeViolation
    ? { text: sizeViolation, error: true }
    : lockedText != null && amountInput != null && lockedText !== amountText
      ? { text: `${buying ? "Buys" : "Locks"} ${lockedText} ${symbol} (size steps of ${formatInputValue(depositRule?.step ?? 0, inputDecimals)})`, error: false }
      : null;

  return (
    <div className={CONTAINER}>
      {topBar}

      <section aria-label="Your trade" className="mt-8 flex flex-col gap-5 max-md:mt-6">
        <AppSegmented
          ariaLabel="Buy or sell"
          value={takerSide}
          onChange={chooseSide}
          options={SIDE_OPTIONS}
          disabled={isRequesting}
          className="self-start"
        />
        {buying && spreadsListed ? (
          <AppSegmented
            ariaLabel="Option or spread"
            value={buyKind}
            onChange={chooseBuyKind}
            options={[...BUY_KIND_OPTIONS]}
            disabled={isRequesting}
            className="self-start"
          />
        ) : null}
        {buyingSpread && legs.length > 0 ? (
          <AppSegmented
            ariaLabel="Spread width"
            value={String(leg)}
            onChange={(value) => setLegChoice(Number(value))}
            options={legs.map((l) => ({ value: String(l), label: spreadLegLabel(info.isPut, l) }))}
            disabled={isRequesting}
            className="self-start"
          />
        ) : null}
        <ThesisSentence
          side={takerSide}
          asset={asset.symbol}
          direction={direction}
          strikeValue={strike ? String(strike.strike1e9) : ""}
          strikeLabel={strike ? formatStrikePrice(strike.strike) : null}
          move={cushionText(asset.symbol, direction, distance)}
          expiryValue={expiry ? String(expiry.expiryTs) : ""}
          expiryLabel={expiry ? formatExpiryDay(expiry.expiryTs * 1000) : null}
          amount={amountText}
          amountSymbol={symbol}
          amountDecimals={inputDecimals}
          amountInvalid={!!sizeViolation || insufficientBalance}
          amountPresets={amountPresets}
          earnings={earnings}
          apr={aprPct != null ? formatPct(aprPct) : null}
          reserve={sentenceReserve}
          ready={!!snapshot}
          disabled={isRequesting}
          options={{
            assets: assets.map((a) => ({
              value: a.symbol,
              label: a.symbol,
              icon: (
                <img
                  src={getTokenLogoSrc(a.symbol)}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary object-cover"
                />
              ),
              detail: !buying && a.maxApr != null ? `up to ${formatPct(a.maxApr * 100)} APR` : undefined,
            })),
            strikes: strikeOptions.map((o) => {
              const pct = strikeDistancePct(o.strike, spot);
              return {
                value: String(o.strike1e9),
                label: formatStrikePrice(o.strike),
                detail: [
                  ...(pct != null ? [signedPct(pct)] : []),
                  ...(buying ? [] : [o.apr != null ? `${formatPct(o.apr * 100)} APR` : "no price"]),
                ].join(" · "),
              };
            }),
            expiries: expiries.map((e) => ({
              value: String(e.expiryTs),
              label: formatExpiryDay(e.expiryTs * 1000),
              detail: `in ${formatTimeAway(e.expiryTs * 1000, Date.now())}`,
            })),
            unavailable,
          }}
          onAsset={chooseAsset}
          onDirection={chooseDirection}
          onStrike={(v) => setStrikeChoice(Number(v))}
          onExpiry={(v) => setExpiryChoice(Number(v))}
          onAmount={setAmountInput}
        />

        {amountHint ? (
          <p className={amountHint.error ? "font-mono text-sm text-error" : "font-mono text-sm text-content-secondary"}>
            {amountHint.text}
          </p>
        ) : null}

        {failure ? (
          <p role="alert" className="font-mono text-sm text-error">
            {failure.kind === "timeout" ? "No quote came back in 30 seconds. Try again." : failure.message}
          </p>
        ) : null}

        <AppButton size="lg" className="w-full font-mono" disabled={cta.action == null} onClick={onCta}>
          {cta.label}
          <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
        </AppButton>
      </section>

      <div className="mt-10 flex flex-col gap-5 max-md:mt-8">
        {spot != null && strike && expiry && labels ? (
          <ThesisChart
            symbol={asset.symbol}
            spot={spot}
            strike={strike.strike}
            expiryMs={expiry.expiryTs * 1000}
            direction={direction}
            right={labels.right}
            wrong={labels.wrong}
            strikeOptions1e9={strikeOptions.map((o) => o.strike1e9)}
            onStrikeChange={setStrikeChoice}
          />
        ) : !snapshot ? (
          <div aria-hidden="true" className="h-[290px] animate-pulse border border-bg-border bg-action-primary/40" />
        ) : null}
        <OrderBreakdown rows={rows} outcomes={outcomeText} />
      </div>

      {modal}
    </div>
  );
}
