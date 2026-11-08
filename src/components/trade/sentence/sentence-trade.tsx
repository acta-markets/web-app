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
import { cn } from "@/lib/cn";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { getToken } from "@/lib/tokens";
import { pickAsset, tradeAssets } from "@/lib/trade/assets";
import { formatAmount, formatExpiryDay, formatTimeAway, formatUsdAmount } from "@/lib/trade/format";
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
  buyZoneLabels,
  cushionText,
  directionInfo,
  directionsFor,
  easyCta,
  scenario as buildScenario,
  strategyInfo,
  strikeDistancePct,
  thesisText,
  zoneLabels,
  type Direction,
  type Strategy,
} from "@/lib/trade/thesis";
import type { TakerSide } from "@/lib/spreads";
import { ThesisSentence } from "./thesis-sentence";
import { ThesisChart } from "./thesis-chart";

const PRICE_SCALE = 1_000_000_000;
const CONTAINER = "mx-auto w-full max-w-[850px] pb-20 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-6";

/** The chosen strike if still listed, else the closest one by price. */
function nearestStrike(options: StrikeOption[], strike1e9: number): StrikeOption | null {
  let best: StrikeOption | null = null;
  for (const o of options) {
    if (!best || Math.abs(o.strike1e9 - strike1e9) < Math.abs(best.strike1e9 - strike1e9)) best = o;
  }
  return best;
}

function SentenceSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-12 w-full max-w-[720px] animate-pulse bg-action-primary max-md:h-9" />
      <div className="h-12 w-3/5 max-w-[420px] animate-pulse bg-action-primary max-md:h-9" />
    </div>
  );
}

/**
 * The trade page: one sentence the user edits — "I think [asset] ends [above/below]
 * [strike] by [expiry]" — the chart echoing it, a size, a one-line summary and one Trade
 * button. Earn sells the view for a premium (a short option); Profit pays it (a long option).
 */
export function SentenceTrade({
  mode,
  initialAsset,
  modeSwitch,
  howItWorks,
}: {
  /** "yield" sells the belief, "profit" pays for it */
  mode: "yield" | "profit";
  initialAsset?: string | null;
  /** Earn | Profit, first on the left so it holds its place across modes */
  modeSwitch?: React.ReactNode;
  howItWorks?: React.ReactNode;
}) {
  const side: TakerSide = mode === "yield" ? "sell" : "buy";
  const { earnSummary, referralStatus, openReferralGate, isAuthenticated } = useRfqContext();
  const { rpc, selectedAccount, signTransaction } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const walletAddress = selectedAccount?.address;
  const { isRequesting, failure, request, modalProps } = useQuoteRequest({ cancelOnUnmount: true });

  const assets = useMemo(() => tradeAssets(earnSummary), [earnSummary]);
  const [assetChoice, setAssetChoice] = useState<string | null>(null);
  const [directionChoice, setDirectionChoice] = useState<Direction>("above");
  const [expiryChoice, setExpiryChoice] = useState<number | null>(null);
  const [strikeChoice, setStrikeChoice] = useState<number | null>(null);
  /** what the user typed; null follows the suggested amount */
  const [amountInput, setAmountInput] = useState<string | null>(null);
  /** token the amount is entered in; null follows the position's default */
  const [denomChoice, setDenomChoice] = useState<boolean | null>(null);

  const asset = pickAsset(assets, assetChoice ?? initialAsset);
  const snapshot = useTokenMarketsSnapshot(asset?.mint ?? null);
  const spot = spotFromSnapshot(snapshot);
  const nowSec = Math.floor(Date.now() / 1000);

  // the sentence's direction maps straight onto the strategy for the mode: above is a put
  // to sell or a call to buy, below the other way round
  const putExpiries = useMemo(() => tradableExpiries(snapshot, true, "cash_secured_put", nowSec), [snapshot, nowSec]);
  const callExpiries = useMemo(() => tradableExpiries(snapshot, false, "covered_call", nowSec), [snapshot, nowSec]);
  const marketOpen = (isPut: boolean) =>
    snapshot ? (isPut ? putExpiries : callExpiries).length > 0 : (isPut ? asset?.hasPut : asset?.hasCall) ?? true;
  const available = directionsFor(side).filter((d) => !marketOpen(d.isPut)).map((d) => d.value);
  const direction: Direction = marketOpen(directionInfo(directionChoice, side).isPut)
    ? directionChoice
    : directionsFor(side).find((d) => marketOpen(d.isPut))?.value ?? directionChoice;
  const strategy: Strategy =
    side === "sell"
      ? direction === "above" ? "sell_put" : "sell_call"
      : direction === "above" ? "buy_call" : "buy_put";
  const info = strategyInfo(strategy);
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

  // a sell deposits (USDC for a put, the asset for a call); a buy is sized in the asset.
  // The token switch lets the user enter the same quantity in either unit.
  const amountInQuote = denomChoice ?? (side === "sell" && info.isPut);
  const symbol = asset ? (amountInQuote ? "USDC" : asset.symbol) : "USDC";
  const decimals = snapshot ? Number(snapshot.underlying_decimals) : getToken(asset?.symbol ?? "")?.decimals ?? 9;
  const sizeRule = snapshot?.size_rule ?? null;
  const depositRule = depositRuleFor({ isPut: amountInQuote, sizeRule, strike1e9: strike?.strike1e9 ?? 0, underlyingDecimals: decimals });
  const inputDecimals = depositInputDecimals(depositRule, amountInQuote, decimals);
  // guards the size field to `inputDecimals` fraction digits, matching AppAmountInput
  const sizePattern = useMemo(
    () => (inputDecimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${inputDecimals}})?$`) : /^\d*$/),
    [inputDecimals]
  );
  // precision for showing the underlying asset amount, from the asset's own size step —
  // independent of which token the amount happens to be entered in
  const assetDisplayDecimals = depositInputDecimals(
    depositRuleFor({ isPut: false, sizeRule, strike1e9: 0, underlyingDecimals: decimals }),
    false,
    decimals
  );
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

  const premiumPerUnit = strike?.bestPrice != null ? strike.bestPrice / PRICE_SCALE : null;
  const outcome = quantity != null && strike && premiumPerUnit != null
    ? buildScenario({ direction, quantity: quantity / 10 ** decimals, strike: strike.strike, premiumPerUnit, spot })
    : null;
  const distance = strike ? strikeDistancePct(strike.strike, spot) : null;

  // The chart's profit-zone PnL readout: the side, the underlying units the position controls
  // and the premium in USDC. A buy's premium is only the quote's, so it stays null until then.
  const chartPnl = quantity != null && strike
    ? {
        side,
        quantity: quantity / 10 ** decimals,
        premium: side === "sell" ? (outcome?.premium ?? null) : null,
      }
    : null;

  const balance = useTokenBalance(walletAddress, symbol);
  const insufficientBalance = balance != null && lockedDeposit != null && lockedDeposit > balance + 1e-9;

  // every value each pill could show for this asset on either side: each part holds its
  // widest value's width, so no pick reflows the sentence
  const sentenceReserve = useMemo(() => {
    const strikes = new Map<number, { key: string; label: string }>();
    const dates = new Map<number, { key: string; label: string }>();
    if (snapshot && asset) {
      for (const sideInfo of directionsFor(side)) {
        for (const e of tradableExpiries(snapshot, sideInfo.isPut, sideInfo.positionType, nowSec)) {
          dates.set(e.expiryTs, { key: String(e.expiryTs), label: formatExpiryDay(e.expiryTs * 1000) });
          for (const o of buildStrikeOptions(indicativesFor(snapshot, e.pda, sideInfo.positionType), {
            referencePrice1e9: Number(snapshot.reference_price),
            secondsToExpiry: e.expiryTs - nowSec,
            isPut: sideInfo.isPut,
          })) {
            strikes.set(o.strike1e9, { key: String(o.strike1e9), label: formatStrikePrice(o.strike) });
          }
        }
      }
    }
    return { assets: assets.map((a) => a.symbol), strikes: [...strikes.values()], dates: [...dates.values()] };
  }, [snapshot, asset, assets, side, nowSec]);

  const cta = easyCta({
    walletConnected: !!walletAddress,
    referralGated: referralStatus === "required",
    pricesLoading: !snapshot,
    hasMarkets: expiries.length > 0,
    hasStrike: !!strike,
    // a buy has no indicative price: any listed strike is quotable
    priced: side === "buy" || premiumPerUnit != null,
    amountEntered: amount > 0,
    sizeViolation,
    insufficientBalance: side === "sell" && insufficientBalance,
    connecting: !!walletAddress && !isAuthenticated,
    requesting: isRequesting,
    ctaLabel: "Trade",
  });

  function chooseAsset(next: string) {
    setAssetChoice(next);
    setExpiryChoice(null);
    setStrikeChoice(null);
    setAmountInput(null);
    setDenomChoice(null);
  }

  function chooseDirection(next: Direction) {
    setDirectionChoice(next);
    setStrikeChoice(null);
    setAmountInput(null);
    setDenomChoice(null);
  }

  /** Flip which token the amount is entered in, re-expressing the same quantity in the new unit. */
  function chooseToken(next: boolean) {
    if (next === amountInQuote) return;
    if (typedQuantity != null && strike) {
      const converted = quantityToDeposit({ quantity: typedQuantity, isPut: next, strike1e9: strike.strike1e9, underlyingDecimals: decimals });
      const nextDecimals = depositInputDecimals(
        depositRuleFor({ isPut: next, sizeRule, strike1e9: strike.strike1e9, underlyingDecimals: decimals }),
        next,
        decimals
      );
      setAmountInput(formatInputValue(converted, nextDecimals));
    } else {
      setAmountInput(null);
    }
    setDenomChoice(next);
  }

  function onCta() {
    if (cta.action === "connect") return openSidebar();
    if (cta.action === "redeem") return openReferralGate();
    if (cta.action !== "quote" || !asset || !expiry || !strike || quantity == null || lockedDeposit == null) return;
    if (amountInput != null && lockedText != null && lockedText !== amountText) setAmountInput(lockedText);
    const terms = { type: info.positionType, strike: strike.strike1e9 };
    request(
      { market: expiry.pda, terms, side, quantity },
      {
        asset: asset.symbol,
        terms,
        side,
        quantity,
        underlyingDecimals: decimals,
        strikeDisplay: formatStrikePrice(strike.strike),
        quantityDisplay: `${formatAmount(lockedDeposit, inputDecimals)} ${symbol}`,
        thesis: thesisText({ asset: asset.symbol, direction, strike: strike.strike, expiryMs: expiry.expiryTs * 1000 }),
        lockedAprPct: side === "sell" && strike.apr != null ? strike.apr * 100 : undefined,
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

  const topBar = (withChip: boolean) => (
    <div className="flex flex-wrap items-center gap-3">
      {modeSwitch}
      {withChip ? (
        <div className="max-md:order-last max-md:w-full">
          {/* plain text: only things you can change are drawn as boxes */}
          <div className="inline-flex items-center gap-2 py-2 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
            <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", snapshot ? "bg-accent-primary" : "bg-content-secondary")} />
            <span className="text-content-primary">
              {asset?.symbol ?? "…"} {spot != null ? formatUsdSmart(spot) : "…"}
            </span>
            <span className="text-content-secondary">Reference price</span>
          </div>
        </div>
      ) : null}
      <div className="ml-auto">{howItWorks}</div>
    </div>
  );

  if (!earnSummary || !asset) {
    return (
      <div className={CONTAINER}>
        {topBar(!earnSummary)}
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

  // the one-line summary shows what changes hands now, and what is on the line
  const riskText = outcome
    ? info.isPut
      ? formatUsdAmount(outcome.deposit)
      : `${formatAmount(outcome.deposit, assetDisplayDecimals)} ${asset.symbol}`
    : "—";
  const strikeLabel = strike ? formatStrikePrice(strike.strike) : null;
  const expiryLabel = expiry ? formatExpiryDay(expiry.expiryTs * 1000) : null;
  // the size's consequence in one plain sentence, so the number is never a mystery box
  const sizeLine = side === "sell"
    ? outcome
      ? `You're risking ${riskText}, you'd collect ${formatUsdAmount(outcome.premium)} if right.`
      : null
    : strikeLabel
      ? `You'd collect the payout if ${asset.symbol} ends ${direction} ${strikeLabel}, you pay the quoted premium.`
      : null;
  const labels = strike
    ? side === "sell" && outcome
      ? zoneLabels({ asset: asset.symbol, direction, strike: strike.strike, scenario: outcome, assetDecimals: assetDisplayDecimals })
      : buyZoneLabels({ asset: asset.symbol, direction, strike: strike.strike })
    : null;
  const amountHint = sizeViolation
    ? { text: sizeViolation, error: true }
    : lockedText != null && amountInput != null && lockedText !== amountText
      ? { text: `Locks ${lockedText} ${symbol} (size steps of ${formatInputValue(depositRule?.step ?? 0, inputDecimals)})`, error: false }
      : null;
  // the amount's value in the OTHER token, so the switch's effect is visible at a glance
  const otherAmount = quantity != null && strike
    ? quantityToDeposit({ quantity, isPut: !amountInQuote, strike1e9: strike.strike1e9, underlyingDecimals: decimals })
    : null;
  const conversionHint = otherAmount != null
    ? amountInQuote
      ? `≈ ${formatAmount(otherAmount, assetDisplayDecimals)} ${asset.symbol}`
      : `≈ ${formatUsdAmount(otherAmount)}`
    : null;
  const balanceDecimals = amountInQuote ? 2 : 4;
  const balanceText = walletAddress
    ? balance != null
      ? `${formatAmount(balance, balanceDecimals)} ${symbol}`
      : "—"
    : null;
  const presets = presetAmounts({ rule: depositRule, balance, isPut: amountInQuote });
  const onHalf = depositRule ? () => setAmountInput(formatInputValue(presets.half, inputDecimals)) : undefined;
  const onMax = depositRule ? () => setAmountInput(formatInputValue(presets.max, inputDecimals)) : undefined;

  const tokenOptions: Array<{ value: "quote" | "underlying"; label: string }> = [
    { value: "quote", label: "USDC" },
    { value: "underlying", label: asset.symbol },
  ];

  // The thesis sentence is the chart's header: it lives above the plot, next to the range
  // control, so editing the belief and reading the chart happen in one glance and update together.
  const sentence = (
    <ThesisSentence
      compact
      side={side}
      asset={asset.symbol}
      direction={direction}
      strikeValue={strike ? String(strike.strike1e9) : ""}
      strikeLabel={strikeLabel}
      move={cushionText(asset.symbol, direction, distance)}
      expiryValue={expiry ? String(expiry.expiryTs) : ""}
      expiryLabel={expiryLabel}
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
          detail: a.maxApr != null ? `up to ${Math.round(a.maxApr * 100)}% APR` : undefined,
        })),
        strikes: strikeOptions.map((o) => ({
          value: String(o.strike1e9),
          label: formatStrikePrice(o.strike),
          detail: o.apr != null ? `${Math.round(o.apr * 100)}% APR` : "no price",
        })),
        expiries: expiries.map((e) => ({
          value: String(e.expiryTs),
          label: formatExpiryDay(e.expiryTs * 1000),
          detail: `in ${formatTimeAway(e.expiryTs * 1000, Date.now())}`,
        })),
        unavailable: available,
      }}
      reserve={sentenceReserve}
      ready={!!snapshot}
      disabled={isRequesting}
      onAsset={chooseAsset}
      onDirection={chooseDirection}
      onStrike={(v) => setStrikeChoice(Number(v))}
      onExpiry={(v) => setExpiryChoice(Number(v))}
    />
  );

  return (
    <div className={CONTAINER}>
      {topBar(true)}

      <section aria-label="Your trade" className="mt-8 flex flex-col gap-4 max-md:mt-6">
        {/* one coherent surface: the sentence is the chart's header, the size + summary read as a
            compact controller beneath it, closed by the CTA */}
        <AppCard className="p-4 max-md:p-3">
          {spot != null && strike && expiry && labels ? (
            <ThesisChart
              frameless
              title={sentence}
              symbol={asset.symbol}
              spot={spot}
              strike={strike.strike}
              expiryMs={expiry.expiryTs * 1000}
              direction={direction}
              side={side}
              right={labels.right}
              wrong={labels.wrong}
              onDirection={chooseDirection}
              strikes={strikeOptions.map((o) => ({ strike: o.strike, strike1e9: o.strike1e9 }))}
              onStrike={(v) => setStrikeChoice(v)}
              pnl={chartPnl}
            />
          ) : !snapshot ? (
            <div className="flex flex-col gap-4">
              {sentence}
              <div aria-hidden="true" className="h-[290px] animate-pulse border border-bg-border bg-action-primary/40" />
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-4 border-t border-bg-border pt-4">
            <div className="flex flex-col gap-1.5">
              {/* one dense row: the size's consequence fills the freed width on the left and a
                  compact amount control (token unit + narrow field + presets) sits on the right */}
              <div
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border bg-action-primary px-3 py-2 transition-colors focus-within:border-content-secondary",
                  sizeViolation || insufficientBalance
                    ? "border-error"
                    : "border-bg-border hover:border-content-secondary"
                )}
              >
                {/* the size's consequence, read as a sentence in the freed space (own line on mobile) */}
                <div className="min-w-0 grow basis-full md:basis-52">
                  {sizeLine ? (
                    <p className="font-mono text-sm leading-[1.4] tracking-[-0.28px] text-content-primary">
                      {sizeLine}
                    </p>
                  ) : null}
                </div>

                <label
                  htmlFor="trade-size"
                  className="shrink-0 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary"
                >
                  {side === "sell" ? "Deposit" : "Amount"}
                </label>

                {/* the token unit, as a slim flush toggle rather than a row of buttons */}
                <div
                  role="tablist"
                  aria-label="Size token"
                  className="flex h-8 shrink-0 items-stretch overflow-hidden border border-bg-border"
                >
                  {tokenOptions.map((o) => {
                    const active = (o.value === "quote") === amountInQuote;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={isRequesting}
                        onClick={() => chooseToken(o.value === "quote")}
                        className={cn(
                          "flex items-center px-2.5 font-mono text-xs leading-[1.2] tracking-[-0.28px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          active
                            ? "bg-accent-primary/20 text-content-primary"
                            : "text-content-secondary hover:text-content-primary"
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>

                <input
                  id="trade-size"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0"
                  value={amountText}
                  disabled={isRequesting}
                  aria-invalid={sizeViolation || insufficientBalance ? true : undefined}
                  onChange={(e) => {
                    const next = e.target.value.replace(",", ".");
                    if (sizePattern.test(next)) setAmountInput(next);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-right font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary outline-none placeholder:text-content-secondary disabled:cursor-not-allowed md:w-32 md:flex-none"
                />

                <div className="flex shrink-0 items-center gap-1">
                  {onHalf ? (
                    <button
                      type="button"
                      onClick={onHalf}
                      disabled={isRequesting}
                      className="font-mono text-xs font-medium leading-[1.2] tracking-[-0.28px] text-accent-secondary transition-colors hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      HALF
                    </button>
                  ) : null}
                  {onMax ? (
                    <button
                      type="button"
                      onClick={onMax}
                      disabled={isRequesting}
                      className="font-mono text-xs font-medium leading-[1.2] tracking-[-0.28px] text-accent-secondary transition-colors hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      MAX
                    </button>
                  ) : null}
                </div>
              </div>

              {/* one slim caption: the amount's other-token value and the wallet balance */}
              <div className="flex items-center justify-between gap-3 px-1 font-mono text-xs leading-[1.2] tracking-[-0.28px] text-content-secondary">
                <span className="min-w-0 truncate tabular-nums">{conversionHint}</span>
                {balanceText != null ? (
                  <span className="flex shrink-0 items-center gap-1 tabular-nums">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0 text-content-secondary" aria-hidden="true">
                      <path
                        d="M6.75 10h6.5M15 5H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="14" cy="10" r="0.75" fill="currentColor" />
                    </svg>
                    <span className="truncate">{balanceText}</span>
                  </span>
                ) : null}
              </div>

              {amountHint ? (
                <p className={cn("font-mono text-sm leading-[1.2] tracking-[-0.28px]", amountHint.error ? "text-error" : "text-content-secondary")}>
                  {amountHint.text}
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-4 border-t border-bg-border pt-4 font-mono text-sm leading-[1.4] tracking-[-0.28px] text-content-primary" aria-label="Trade summary">
            {side === "sell" ? (
              <>
                <span className="text-additional-green-primary-deep">{info.label}</span>{" "}
                <span className="text-content-secondary">: collect</span>{" "}
                {outcome ? <span>{`≈${formatUsdAmount(outcome.premium)}`}</span> : <span>—</span>}{" "}
                <span className="text-content-secondary">premium now</span>{" "}
                <span className="text-content-secondary">·</span>{" "}
                <span className="text-content-secondary">max loss</span>{" "}
                <span className="text-additional-red-primary">{riskText}</span>
              </>
            ) : (
              <>
                <span>{info.label}</span>{" "}
                <span className="text-content-secondary">: pay</span>{" "}
                <span>the quoted premium</span>{" "}
                <span className="text-content-secondary">·</span>{" "}
                <span className="text-content-secondary">max loss</span>{" "}
                <span className="text-additional-red-primary">the premium</span>
              </>
            )}
          </p>

          <AppButton size="lg" className="mt-4 w-full font-mono" disabled={cta.action == null} onClick={onCta}>
            {cta.label}
            <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
          </AppButton>
        </AppCard>

        {failure ? (
          <p role="alert" className="font-mono text-sm text-error">
            {failure.kind === "timeout" ? "No quote came back in 30 seconds. Try again." : failure.message}
          </p>
        ) : null}
      </section>

      {modal}
    </div>
  );
}
