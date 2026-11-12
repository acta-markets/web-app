"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { useMemo, useState, useEffect } from "react";
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
import { displayQuoteSymbol, getToken, getTokenMint } from "@/lib/tokens";
import { grossFromIndicative1e9, previewFill, type TokenProtocolFees } from "@acta-markets/ts-sdk/ws";
import { pickAsset, tradeAssets } from "@/lib/trade/assets";
import { formatAmount, formatExpiryDay, formatTimeAway, formatUsdAmount } from "@/lib/trade/format";
import {
  alignQuantityToRule,
  clampNumber,
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
  movePctText,
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
 * button. Yield sells the view for a premium (a short option); Profit pays it (a long option).
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
  /** Yield | Profit, first on the left so it holds its place across modes */
  modeSwitch?: React.ReactNode;
  howItWorks?: React.ReactNode;
}) {
  const side: TakerSide = mode === "yield" ? "sell" : "buy";
  const { earnSummary, referralStatus, openReferralGate, isAuthenticated, assetSnapshots, getAssetSnapshots, protocolFeesBySymbol } = useRfqContext();
  const { rpc, selectedAccount, signTransaction, signTransactionBytes } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const walletAddress = selectedAccount?.address;
  const { isRequesting, failure, request, modalProps } = useQuoteRequest({ cancelOnUnmount: true });

  const assets = useMemo(() => tradeAssets(earnSummary), [earnSummary]);
  // Live reference prices for the asset picker: one snapshot per listed underlying, refreshed
  // while the tab is visible. Each snapshot resolves independently; a mint with no markets
  // simply never appears, so the picker shows a dash instead of a stale guess.
  const assetMints = useMemo(() => assets.map((a) => a.mint), [assets]);
  useEffect(() => {
    if (assetMints.length === 0) return;
    const refresh = () => { if (!document.hidden) getAssetSnapshots(assetMints); };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [assetMints, getAssetSnapshots]);
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
  /** Spot for any listed underlying, from the picker's per-mint snapshots (selected one first). */
  const spotFor = (mint: string) =>
    spotFromSnapshot(assetSnapshots.get(mint) ?? (mint === asset?.mint ? snapshot : null));
  const nowSec = Math.floor(Date.now() / 1000);

  // the sentence's direction maps straight onto the strategy for the mode: above is a put
  // to sell or a call to buy, below the other way round
  const putExpiries = useMemo(() => tradableExpiries(snapshot, true, "cash_secured_put", side, nowSec), [snapshot, side, nowSec]);
  const callExpiries = useMemo(() => tradableExpiries(snapshot, false, "covered_call", side, nowSec), [snapshot, side, nowSec]);
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
        ? buildStrikeOptions(indicativesFor(snapshot, expiry.pda, info.positionType, side), {
          referencePrice1e9: snapshot ? Number(snapshot.reference_price) : null,
          secondsToExpiry: expiry.expiryTs - nowSec,
          isPut: info.isPut,
        })
        : [],
    [snapshot, expiry, info.positionType, info.isPut, side, nowSec]
  );
  const strike = strikeChoice != null
    ? nearestStrike(strikeOptions, strikeChoice)
    : strikeOptions[defaultStrikeIndex(strikeOptions, spot, info.isPut)] ?? null;

  // a sell deposits (USDC for a put, the asset for a call); a buy is sized in the asset.
  // The token switch lets the user enter the same quantity in either unit.
  const amountInQuote = denomChoice ?? (side === "sell" && info.isPut);
  // The venue reports the quote as "USDC-Dev" on devnet; `displayQuoteSymbol` names it
  // "USDC-DEV" there and "USDC" on mainnet, so the switch, balance, size and summary all
  // follow one source of truth instead of a hardcoded "USDC".
  const quoteSymbol = displayQuoteSymbol(snapshot?.quote_symbol ?? "USDC");
  const symbol = asset ? (amountInQuote ? quoteSymbol : asset.symbol) : quoteSymbol;
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
  // the time-to-expiry the cushion sentence names, e.g. "in 7 days"; null without an expiry
  const horizon = expiry ? `in ${formatTimeAway(expiry.expiryTs * 1000, Date.now())}` : null;

  const quoteDecimalsForPreview = snapshot ? Number(snapshot.quote_decimals) : 6;
  const preview = useMemo(() => {
    if (!strike || strike.bestPrice == null || quantity == null || quantity <= 0) return null;
    const fees: TokenProtocolFees =
      protocolFeesBySymbol?.get(quoteSymbol.trim().toUpperCase()) ??
      protocolFeesBySymbol?.get("USDC") ??
      { type: "pending" };
    const terms = { type: info.positionType, strike: strike.strike1e9 };
    const indicative = BigInt(Math.round(strike.bestPrice));
    try {
      // A sell indicative already has the fee taken out; previewFill wants the gross price.
      const gross = side === "sell" ? grossFromIndicative1e9(indicative, "sell", terms, fees) : indicative;
      return previewFill({
        terms,
        side,
        quantity: BigInt(Math.round(quantity)),
        price1e9: gross,
        fees,
        underlyingDecimals: decimals,
        quoteDecimals: quoteDecimalsForPreview
      });
    } catch {
      return null;
    }
  }, [strike, quantity, side, protocolFeesBySymbol, quoteSymbol, info.positionType, decimals, quoteDecimalsForPreview]);
  // The chart's profit-zone PnL readout: the side, the underlying units the position controls
  // and the premium in USDC. A buy's premium is only the quote's, so it stays null until then.
  const chartPnl = quantity != null && strike
    ? {
        side,
        quantity: quantity / 10 ** decimals,
        premium: side === "sell" ? (outcome?.premium ?? null) : null,
      }
    : null;

  // Balance is keyed on the market's actual mint (server-authoritative), never the symbol
  // looked up in the static list — that list's devnet mints are wrong (HYPE, JITOSOL). The
  // entered token is USDC when sizing in quote, else the underlying asset.
  const balanceMint = amountInQuote || !asset ? getTokenMint("USDC") : asset.mint;
  const balanceTokenDecimals = amountInQuote || !asset
    ? (snapshot ? Number(snapshot.quote_decimals) : getToken("USDC")?.decimals ?? 6)
    : (snapshot ? Number(snapshot.underlying_decimals) : getToken(asset.symbol)?.decimals ?? 9);
  const balance = useTokenBalance(walletAddress, balanceMint, balanceTokenDecimals);
  const insufficientBalance = balance != null && lockedDeposit != null && lockedDeposit > balance + 1e-9;

  // every value the direction and strike pills could show for this asset on either side:
  // each part holds its widest value's width, so no pick reflows the sentence
  const sentenceReserve = useMemo(() => {
    const strikes = new Map<number, { key: string; label: string }>();
    if (snapshot && asset) {
      for (const sideInfo of directionsFor(side)) {
        for (const e of tradableExpiries(snapshot, sideInfo.isPut, sideInfo.positionType, side, nowSec)) {
          for (const o of buildStrikeOptions(indicativesFor(snapshot, e.pda, sideInfo.positionType, side), {
            referencePrice1e9: Number(snapshot.reference_price),
            secondsToExpiry: e.expiryTs - nowSec,
            isPut: sideInfo.isPut,
          })) {
            strikes.set(o.strike1e9, { key: String(o.strike1e9), label: formatStrikePrice(o.strike) });
          }
        }
      }
    }
    return { strikes: [...strikes.values()] };
  }, [snapshot, asset, side, nowSec]);

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
    ctaLabel: side === "buy" ? "Get quote" : "Trade",
  });

  function chooseAsset(next: string) {
    setAssetChoice(next);
    setExpiryChoice(null);
    setStrikeChoice(null);
    setAmountInput(null);
    setDenomChoice(null);
  }

  function chooseDirection(next: Direction) {
    // Switching call/put is a view change, not a new trade: keep the size and unit.
    // The strike resets because call and put strikes are different sets.
    setDirectionChoice(next);
    setStrikeChoice(null);
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
      signTransactionBytes={walletAddress ? signTransactionBytes : undefined}
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

  const strikeLabel = strike ? formatStrikePrice(strike.strike) : null;
  // Exact fill economics from the SDK's local preview: the program's own fee formula, so the
  // premium, the lock and the breakeven agree with what the venue will actually settle.
  // The key facts beside the size: a compact label/value table re-expressing what the chart
  // already shows. The premium is indicative (marked ≈) and only confirmed on quote.
  const premiumUsd = preview ? Number(preview.premium.netAtoms) / 10 ** quoteDecimalsForPreview : null;
  const premiumText = premiumUsd != null ? `≈ ${formatUsdAmount(premiumUsd)}` : "—";
  // Breakeven only when the preview has one that differs from the strike, so it earns its row.
  const breakevenText = preview ? formatUsdSmart(Number(preview.breakeven1e9) / 1e9) : null;
  const expiryText = expiry ? `${formatExpiryDay(expiry.expiryTs * 1000)} · ${formatTimeAway(expiry.expiryTs * 1000, Date.now())}` : "—";
  const sizeText = quantity != null ? `${formatAmount(quantity / 10 ** decimals, assetDisplayDecimals)} ${asset.symbol}` : "—";
  const returnText = (() => {
    if (side !== "sell" || !preview || spot == null || !preview.collateral) return null;
    const net = Number(preview.premium.netAtoms) / 10 ** quoteDecimalsForPreview;
    const c = preview.collateral;
    const locked = c.asset === "quote" ? Number(c.atoms) / 10 ** quoteDecimalsForPreview : (Number(c.atoms) / 10 ** decimals) * spot;
    return locked > 0 ? `${((net / locked) * 100).toFixed(1)}%` : null;
  })();
  const facts: Array<{ label: string; value: string }> = [
    { label: "Premium", value: premiumText },
    { label: "Strike", value: strikeLabel ?? "—" },
    { label: "Expiry", value: expiryText },
    { label: "Size", value: sizeText },
  ];
  if (returnText != null) facts.push({ label: "Return", value: returnText });
  if (breakevenText != null) facts.push({ label: "Breakeven", value: breakevenText });

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
  // the wallet balance for the selected token, "—" until it is known (or while disconnected),
  // so the caption under the size never drops the row and reflows the control.
  const balanceText = walletAddress
    ? balance != null
      ? `${formatAmount(balance, balanceDecimals)} ${symbol}`
      : "—"
    : "—";
  // HALF and MAX fill the wallet's balance for the selected token: MAX the whole available
  // balance (capped at the rule's max), HALF half of it — each snapped down onto the rule's
  // step. Only shown once the balance is loaded, and only when there is something to fill.
  const presets = presetAmounts({ rule: depositRule, balance, isPut: amountInQuote });
  const canPreset = depositRule != null && balance != null && balance > 0;
  const onHalf = canPreset ? () => setAmountInput(formatInputValue(presets.half, inputDecimals)) : undefined;
  const onMax = canPreset ? () => setAmountInput(formatInputValue(presets.max, inputDecimals)) : undefined;

  // the slider spans 0 → the wallet's balance for the selected token, capped by the rule's
  // max. It stays hidden until the balance loads — there is no balance to fraction before
  // then — so connecting the wallet reveals it anchored to the balance instead of collapsing
  // from the rule's own (quote-sized) bounds. A loaded zero balance also hides it.
  const sliderMin = 0;
  const sliderMax = depositRule && balance != null
    ? Math.min(Math.max(balance, 0), depositRule.max)
    : 0;
  const sliderStep = depositRule?.step ?? 1;
  const sliderValue = Number.isFinite(amount) && amount > 0 ? clampNumber(amount, sliderMin, Math.max(sliderMin, sliderMax)) : sliderMin;

  const tokenOptions: Array<{ value: "quote" | "underlying"; label: string }> = [
    { value: "quote", label: quoteSymbol },
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
      move={cushionText(asset.symbol, direction, distance, horizon)}
      expiryValue={expiry ? String(expiry.expiryTs) : ""}
      options={{
        assets: assets.map((a) => ({
          value: a.symbol,
          label: a.symbol,
          icon: getTokenLogoSrc(a.symbol) ? (
            <img
              src={getTokenLogoSrc(a.symbol)}
              alt=""
              className="h-4 w-4 shrink-0 rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary object-cover"
            />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgba(240,240,240,0.1)] bg-action-primary font-mono text-[9px] font-medium leading-none text-content-primary">
              {a.symbol.slice(0, 2)}
            </span>
          ),
          // live reference price (from the venue's snapshot), "—" when the oracle has no price
          detail: (() => {
            const price = spotFor(a.mint);
            return price != null ? formatUsdSmart(price) : "—";
          })(),
        })),
        strikes: strikeOptions.map((o) => ({
          value: String(o.strike1e9),
          label: formatStrikePrice(o.strike),
          detail:
            side === "buy"
              ? (movePctText(o.strike, spot) ?? undefined)
              : o.apr != null
                ? `${Math.round(o.apr * 100)}% APR`
                : "no price",
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
      {topBar}

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
          ) : (
            // loaded, but no complete trade selected yet: never collapse to nothing
            <div className="flex flex-col gap-4">
              {sentence}
              <div className="flex h-[290px] items-center justify-center border border-bg-border bg-action-primary/20">
                <span className="font-mono text-sm text-content-secondary">
                  Pick an expiry and strike to see the projection
                </span>
              </div>
            </div>
          )}

          {/* the controller beneath the chart: size on the left, the key trade facts beside it —
              two quiet columns with no divider — closed by the risk line and one full-width CTA.
              The grid is inset on the right by the chart's 64px return-% rail (md:pr-16) so its
              two halves line up with the chart's PLOT edges, not the card or the rail. */}
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6 md:pr-16">
            {/* the size/amount control */}
            <div className="flex w-full flex-col gap-2">
              {/* one bare amount field: SIZE + the numeral + the unit selector at the far
                  end, so it reads "1.00 ▾USDC" — no tabs on the left */}
              <div
                className={cn(
                  "flex items-stretch border bg-action-primary transition-colors focus-within:border-content-primary",
                  sizeViolation || insufficientBalance
                    ? "border-error"
                    : "border-bg-border hover:border-content-secondary"
                )}
              >
                <span aria-hidden="true" className="flex shrink-0 items-center pl-3 font-mono text-[11px] font-medium leading-[1.2] tracking-[0.08em] text-content-tertiary">
                  SIZE
                </span>

                <input
                  id="trade-size"
                  aria-label={side === "sell" ? "Deposit" : "Amount"}
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
                  className="min-w-0 flex-1 bg-transparent py-3 pl-3 pr-2 text-right font-mono text-xl font-semibold leading-[1.2] tabular-nums text-content-primary outline-none placeholder:text-content-secondary disabled:cursor-not-allowed"
                />

                {/* the unit as a compact dropdown after the number: ▾USDC / ▾SOL */}
                <div className="relative flex shrink-0 items-center">
                  <select
                    aria-label="Size token"
                    value={amountInQuote ? "quote" : "underlying"}
                    disabled={isRequesting}
                    onChange={(e) => chooseToken(e.target.value === "quote")}
                    className="cursor-pointer appearance-none bg-transparent py-3 pl-5 pr-3 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tokenOptions.map((o) => (
                      <option key={o.value} value={o.value} className="bg-bg-primary text-content-primary">
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="pointer-events-none absolute left-1.5 h-3 w-3 shrink-0 text-content-tertiary"
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* the token switch under the size: USDC ↔ the asset. One source of truth with
                  the in-field unit dropdown — both read and write `amountInQuote` via
                  `chooseToken`, so the slider, balance, conversion and presets all follow
                  whichever token is selected. */}
              <div className="inline-flex border border-bg-border bg-action-primary">
                <button
                  type="button"
                  aria-pressed={amountInQuote}
                  disabled={isRequesting}
                  onClick={() => chooseToken(true)}
                  className={cn(
                    "px-3 py-1 font-mono text-[11px] font-medium uppercase leading-[1.2] tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    amountInQuote ? "bg-accent-primary/20 text-content-primary" : "text-content-secondary hover:text-content-primary"
                  )}
                >
                  {quoteSymbol}
                </button>
                <button
                  type="button"
                  aria-pressed={!amountInQuote}
                  disabled={isRequesting}
                  onClick={() => chooseToken(false)}
                  className={cn(
                    "border-l border-bg-border px-3 py-1 font-mono text-[11px] font-medium uppercase leading-[1.2] tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    !amountInQuote ? "bg-accent-primary/20 text-content-primary" : "text-content-secondary hover:text-content-primary"
                  )}
                >
                  {asset.symbol}
                </button>
              </div>

              {/* the step slider: same value as the field, snapped onto the deposit step; the
                  dots are a quiet scale, not extra controls. Hidden when the range collapses
                  (a loaded zero balance) */}
              {depositRule && sliderMax > 0 ? (
                <div className="px-1">
                  <input
                    type="range"
                    aria-label="Size slider"
                    min={sliderMin}
                    max={sliderMax}
                    step={sliderStep}
                    value={sliderValue}
                    disabled={isRequesting}
                    onChange={(e) => setAmountInput(formatInputValue(Number(e.target.value), inputDecimals))}
                    className="h-4 w-full cursor-pointer accent-[#2AA286] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <div aria-hidden="true" className="mt-1 flex items-center justify-between px-[3px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="h-[3px] w-[3px] bg-bg-border" />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* one slim caption: conversion + balance on the left, quiet presets on the right.
                  Both slots always render — "—" while a value is unknown — so switching assets
                  never collapses the row and the control does not visibly reflow. */}
              <div className="flex items-center justify-between gap-3 px-0.5 font-mono text-xs leading-[1.2] tracking-[-0.28px] text-content-secondary">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate tabular-nums">{conversionHint ?? "—"}</span>
                  <span aria-hidden="true" className="text-content-tertiary">·</span>
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
                </div>

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

              {amountHint ? (
                <p className={cn("font-mono text-sm leading-[1.2] tracking-[-0.28px]", amountHint.error ? "text-error" : "text-content-secondary")}>
                  {amountHint.text}
                </p>
              ) : null}
            </div>

            {/* the key trade facts: a definition list that owns the right half of the plot —
                right edge on the plot's edge (inside the return-% rail), not the card edge —
                top-aligned with the size field, so the two halves read as one summary row. Muted
                keys on the left, values right-aligned on one tabular rail — the app's key/value
                idiom (see vault-card), not a data table. */}
            <div className="flex w-full flex-col gap-2">
              <dl className="w-full divide-y divide-bg-border font-mono text-sm leading-[1.2] tracking-[-0.28px]">
                {facts.map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                    <dt className="shrink-0 text-content-secondary">{f.label}</dt>
                    <dd className="text-right tabular-nums text-content-primary">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

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
