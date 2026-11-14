"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { useTokenBalance } from "@/components/wallet/use-token-balance";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useQuoteRequest } from "@/components/rfq/use-quote-request";
import { useTokenMarketsSnapshot } from "@/components/rfq/use-token-markets-snapshot";
import { RfqFlowModal } from "@/components/market/rfq-flow-modal";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { displayQuoteSymbol, getToken, getTokenMint } from "@/lib/tokens";
import { grossFromIndicative1e9, previewFill } from "@acta-markets/ts-sdk/ws";
import { DEFAULT_SIZE_UNITS, assetsForMenu, pickAsset, tradeAssets } from "@/lib/trade/assets";
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
  buyBreakEven,
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
import { ProfitOutlook } from "./profit-table";
import { TICKET_CELL, TICKET_LABEL, TICKET_NOTE, TICKET_VALUE, TICKET_WHEN } from "./ticket-styles";
import { ChartSkeleton, TradeSkeleton } from "./trade-skeleton";
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

/**
 * Where a sell's outcome line breaks when the strip is four across. Left to the browser, the
 * line re-wraps as the numbers change ("Keep 99.75 USDC" on one line, "Keep 6,650.00 / USDC" on
 * two) and the text jumps. Broken at a fixed point it is always the same two lines:
 * "Buy 0.1 BTC / at $66,500", "Sold for / 6,650.00 USDC", "Keep / 6,650.00 USDC".
 */
export function splitOutcome(title: string): [string, string] | null {
  const at = title.indexOf(" at ");
  if (at > 0) return [title.slice(0, at), title.slice(at + 1)];
  const sold = title.indexOf(" for ");
  if (sold > 0) return [title.slice(0, sold + 4), title.slice(sold + 5)];
  const space = title.indexOf(" ");
  return space > 0 ? [title.slice(0, space), title.slice(space + 1)] : null;
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
  // the picker's own order: crypto led by BTC, then stocks and gold
  const menuAssets = useMemo(() => assetsForMenu(assets), [assets]);
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
  /** the strike being considered in the open strike menu (hovered or arrowed to); the chart previews it */
  const [strikePreview, setStrikePreview] = useState<number | null>(null);
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
  const suggested = defaultAmount({
    rule: depositRule,
    isPut: amountInQuote,
    spot,
    targetUnits: asset ? DEFAULT_SIZE_UNITS[asset.symbol.toUpperCase()] : undefined,
  });
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
  const previewFor = useCallback(
    (option: { strike1e9: number; bestPrice: number | null } | null) => {
      if (!option || option.bestPrice == null || quantity == null || quantity <= 0) return null;
      const fees =
        protocolFeesBySymbol?.get(quoteSymbol.trim().toUpperCase()) ??
        protocolFeesBySymbol?.get("USDC");
      // Without the quote token's fee config the preview would show a zero fee.
      if (fees?.type !== "quote") return null;
      const terms = { type: info.positionType, strike: option.strike1e9 };
      const indicative = BigInt(Math.round(option.bestPrice));
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
    },
    [quantity, side, protocolFeesBySymbol, quoteSymbol, info.positionType, decimals, quoteDecimalsForPreview]
  );
  const preview = useMemo(() => previewFor(strike), [previewFor, strike]);
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
            <AppCard className="border-0 p-6 font-mono text-base text-content-secondary">
              No markets are open right now. Check back soon.
            </AppCard>
          ) : (
            <TradeSkeleton side={side} />
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
  const returnText = (() => {
    if (side !== "sell" || !preview || spot == null || !preview.collateral) return null;
    const net = Number(preview.premium.netAtoms) / 10 ** quoteDecimalsForPreview;
    const c = preview.collateral;
    const locked = c.asset === "quote" ? Number(c.atoms) / 10 ** quoteDecimalsForPreview : (Number(c.atoms) / 10 ** decimals) * spot;
    return locked > 0 ? `${((net / locked) * 100).toFixed(1)}%` : null;
  })();
  // The headline is the one number the page sells: what the trade pays now (Yield) or costs
  // (Profit). The strike, the expiry date and the size are already in the sentence and the
  // size field, so the rows beneath it carry only what is not said elsewhere.
  // A buy's price before the quote is the maker's indicative: the SDK preview when the fee
  // config is known (fee included), else the indicative itself. Either way the quote sets the
  // final price, and the note under the number says so.
  const payUsd =
    premiumUsd ??
    (side === "buy" && premiumPerUnit != null && quantity != null ? (quantity / 10 ** decimals) * premiumPerUnit : null);
  // Where a buy starts paying and what it makes further out: its breakeven, then the profit at
  // the first three round moves from today's price that clear it.
  const buyBreakeven =
    side !== "buy" || !strike
      ? null
      : preview
        ? Number(preview.breakeven1e9) / 1e9
        : premiumPerUnit != null
          ? buyBreakEven(info.isPut, strike.strike, premiumPerUnit)
          : null;
  /** An outcome's main line. A sell's is set on two fixed lines where the strip is four across; see `splitOutcome`. */
  const outcomeLine = (title: string) => {
    const parts = side === "sell" ? splitOutcome(title) : null;
    if (!parts) return title;
    return (
      <>
        <span className="xl:block xl:whitespace-nowrap">{parts[0]}</span>{" "}
        <span className="xl:block xl:whitespace-nowrap">{parts[1]}</span>
      </>
    );
  };
  const headline: { value: string | null; note: string } =
    side === "sell"
      ? {
          value: premiumUsd != null ? premiumText : null,
          note: premiumPerUnit == null ? "No price for this strike right now" : "Enter a size to see what you earn",
        }
      : {
          value: payUsd != null ? `\u2248 ${formatUsdAmount(payUsd)}` : null,
          note: premiumPerUnit == null ? "No price for this strike right now" : "Enter a size to see what you pay",
        };
  // A sell always speaks the sell outcomes, priced or not: `zoneLabels` has its own copy for a
  // strike with no indicative yet, so it never borrows the buy side's "premium lost".
  const labels = strike
    ? side === "sell"
      ? zoneLabels({ asset: asset.symbol, direction, strike: strike.strike, scenario: outcome, assetDecimals: assetDisplayDecimals })
      : buyZoneLabels({ asset: asset.symbol, direction, strike: strike.strike })
    : null;
  // The ticket reads left to right as one story: what goes in, what is paid now, and the two
  // ways it can end. Every fact the page shows about the trade sits in one of those four cells.
  const loseSide = direction === "above" ? "below" : "above";
  const ticketOutcomes = labels && strikeLabel
    ? side === "sell"
      ? {
          right: { when: `${direction} ${strikeLabel}`, what: labels.right.title, note: "and the premium" },
          wrong: {
            when: `${loseSide} ${strikeLabel}`,
            what: labels.wrong.title,
            note: breakevenText ? `Breakeven ${breakevenText}` : "You keep the premium",
          },
        }
      : {
          // A buy profits past its breakeven, not at the strike: the table under "You profit"
          // opens with the breakeven as its zero line, then lists what the trade makes further out.
          right: {
            when: `${direction} ${strikeLabel}`,
            what: "You profit",
            note: buyBreakeven != null ? `Breakeven at ${formatUsdSmart(buyBreakeven)}` : "Once it clears the premium you paid",
          },
          wrong: {
            when: `${loseSide} ${strikeLabel}`,
            what: "Premium lost",
            note: "The most you can lose",
          },
        }
    : { right: { when: null, what: "\u2014", note: "" }, wrong: { when: null, what: "\u2014", note: "" } };
  const headlineNote = headline.value
    ? side === "buy"
      ? "Final quote might be different"
      : returnText != null
        ? `Return ${returnText}`
        : "Confirmed on quote"
    : headline.note;
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

  /** What a strike costs at the current size, priced the way the headline prices the chosen one. */
  const strikeCost = (o: { strike1e9: number; bestPrice: number | null }) => {
    const filled = previewFor(o);
    const usd = filled
      ? Number(filled.premium.netAtoms) / 10 ** quoteDecimalsForPreview
      : o.bestPrice != null && quantity != null
        ? (quantity / 10 ** decimals) * (o.bestPrice / PRICE_SCALE)
        : null;
    return usd != null ? `\u2248 ${formatUsdAmount(usd)}` : o.bestPrice == null ? "no price" : undefined;
  };
  // the strike being considered in the menu, unless it is the one already chosen
  const previewedStrike = strikePreview != null && strikePreview !== strike?.strike1e9
    ? (strikeOptions.find((o) => o.strike1e9 === strikePreview)?.strike ?? null)
    : null;

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
        assets: menuAssets.map((a) => ({
          value: a.symbol,
          label: a.symbol,
          group: a.group,
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
        // Each strike with how far it is from today's price, and the number you would choose it
        // by: what it costs at the current size (Profit) or what it pays as APR (Yield).
        strikes: strikeOptions.map((o) => ({
          value: String(o.strike1e9),
          label: formatStrikePrice(o.strike),
          meta: movePctText(o.strike, spot) ?? undefined,
          detail: side === "buy" ? strikeCost(o) : o.apr != null ? `${Math.round(o.apr * 100)}% APR` : "no price",
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
      onStrikePreview={(v) => setStrikePreview(v == null ? null : Number(v))}
      onExpiry={(v) => setExpiryChoice(Number(v))}
    />
  );

  return (
    <div className={CONTAINER}>
      {topBar}

      <section aria-label="Your trade" className="mt-8 flex flex-col gap-4 max-md:mt-6">
        {/* one coherent surface: the sentence is the chart's header, the size + summary read as a
            compact controller beneath it, closed by the CTA */}
        <AppCard className="border-0 p-4 max-md:p-3">
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
              legend={false}
              previewStrike={previewedStrike}
            />
          ) : !snapshot ? (
            <div>
              {sentence}
              <ChartSkeleton />
            </div>
          ) : (
            // loaded, but no complete trade selected yet: never collapse to nothing
            <div>
              {sentence}
              <div className="mt-3 flex h-[280px] items-center justify-center bg-action-primary/20">
                <span className="font-mono text-sm text-content-secondary">
                  Pick an expiry and strike to see the projection
                </span>
              </div>
            </div>
          )}

          {/* The ticket: one strip that reads left to right as the whole trade — what goes in,
              what is paid now, and the two ways it can end — closed by the one button that sends
              it. No frames and no dividers: the columns are set by spacing alone. The amount is
              a tinted pill, the same idiom as the asset, direction and strike in the sentence
              above, so everything you can change on the page looks the same way. */}
          <div className="mt-4">
            {/* Two moments, as on the chart: what happens now (left) and what happens by the
                expiry (right). Where the card has its full width the headings share the top row
                and the four cells the row beneath; on anything narrower, laptops included, each
                heading sits right above its own pair, so no cell is ever too narrow for its line. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 xl:grid-cols-[1.05fr_0.9fr_1.1fr_1.05fr]">
              <p className={cn(TICKET_WHEN, "xl:order-1")}>Now</p>
              {/* 1. what goes in */}
              <div className={cn(TICKET_CELL, "xl:order-3")}>
                <span aria-hidden="true" className={TICKET_LABEL}>
                  {side === "sell" ? "You deposit" : "Size"}
                </span>
                <div
                  className={cn(
                    "flex w-full cursor-text items-center border px-2 transition-colors",
                    sizeViolation || insufficientBalance
                      ? "border-error bg-accent-primary/15"
                      : "border-accent-primary/20 bg-accent-primary/15 hover:border-accent-primary focus-within:border-accent-primary"
                  )}
                >
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
                  className={cn(TICKET_VALUE, "min-w-0 flex-1 bg-transparent py-0.5 tabular-nums text-content-primary outline-none placeholder:text-content-secondary disabled:cursor-not-allowed")}
                />

                {/* the unit as a compact dropdown after the number: ▾USDC / ▾SOL */}
                <div className="relative flex shrink-0 items-center">
                  <select
                    aria-label="Size token"
                    value={amountInQuote ? "quote" : "underlying"}
                    disabled={isRequesting}
                    onChange={(e) => chooseToken(e.target.value === "quote")}
                    className="cursor-pointer appearance-none bg-transparent py-1 pl-5 pr-0 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-40"
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
                {/* one slot: the size feedback takes the conversion's place instead of adding a line */}
                <span className={cn(TICKET_NOTE, "whitespace-nowrap tabular-nums", amountHint?.error && "text-error")}>
                  {amountHint
                    ? // "Locks 997.5 USDC (size steps of 9.5)" always breaks before the bracket, so the
                      // number's length never decides where it wraps
                      amountHint.text.includes(" (")
                      ? (
                        <>
                          {amountHint.text.slice(0, amountHint.text.indexOf(" ("))} <br />
                          {amountHint.text.slice(amountHint.text.indexOf(" (") + 1)}
                        </>
                      )
                      : amountHint.text
                    : (conversionHint ?? "\u2014")}
                </span>
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
                {/* the balance belongs to a wallet: the row appears once one is connected */}
                {walletAddress ? (
                  <div className={cn(TICKET_NOTE, "flex items-center justify-between gap-2")}>
                    <span className="flex min-w-0 items-center gap-1 tabular-nums">
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
                    <span className="flex shrink-0 items-center gap-2">
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
                    </span>
                  </div>
                ) : null}
              </div>

              {/* 2. what is paid now */}
              <div className={cn(TICKET_CELL, "xl:order-4")}>
                <span className={TICKET_LABEL}>{side === "sell" ? "You earn" : "You pay premium"}</span>
                <span
                  data-testid="trade-headline"
                  className={cn(
                    TICKET_VALUE,
                    "py-0.5 tabular-nums",
                    headline.value ? (side === "sell" ? "text-accent-secondary" : "text-content-primary") : "text-content-tertiary"
                  )}
                >
                  {headline.value ?? "\u2014"}
                </span>
                <span data-testid="trade-headline-note" className={TICKET_NOTE}>{headlineNote}</span>
              </div>

              {/* the second moment: how far off the expiry is, so the outcomes read "In 6 days: if
                  above ..., if below ..."; the date itself is in the sentence above */}
              <p data-testid="ticket-when" className={cn(TICKET_WHEN, "max-xl:mt-2 xl:order-2")}>
                {horizon ? `${horizon.charAt(0).toUpperCase()}${horizon.slice(1)}` : "At expiry"}
              </p>
              {/* 3 and 4. the two ways it ends, in the chart's own green and red */}
              <div className={cn(TICKET_CELL, "xl:order-5")}>
                <span className={cn(TICKET_LABEL, "flex items-center gap-1 whitespace-nowrap")}>
                  <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-additional-green-primary-deep" />
                  {/* the ticker is a name, so it keeps its own casing inside the uppercase label */}
                  {ticketOutcomes.right.when ? (
                    <span>
                      If <span className="normal-case">{asset.symbol}</span> {ticketOutcomes.right.when}
                    </span>
                  ) : (
                    "If right"
                  )}
                </span>
                <span data-testid="ticket-right" className={cn(TICKET_VALUE, "py-0.5 text-content-primary", side === "sell" && "xl:min-h-[54px]")}>
                  {outcomeLine(ticketOutcomes.right.what)}
                </span>
                {/* In Profit this block is always as tall as the table and its link, so prices
                    arriving or dropping out never move the button. */}
                <div className={cn("flex flex-col gap-2", side === "buy" && "min-h-[91px]")}>
                {side === "buy" && buyBreakeven != null && strike && spot != null ? (
                  <ProfitOutlook
                    asset={asset.symbol}
                    direction={direction}
                    strike={strike.strike}
                    spot={spot}
                    breakeven={buyBreakeven}
                    premiumUsd={payUsd}
                    units={quantity != null ? quantity / 10 ** decimals : null}
                    emptyNote={ticketOutcomes.right.note}
                  />
                ) : (
                  <span className={TICKET_NOTE}>{ticketOutcomes.right.note}</span>
                )}
                </div>
              </div>
              <div className={cn(TICKET_CELL, "xl:order-6")}>
                <span className={cn(TICKET_LABEL, "flex items-center gap-1 whitespace-nowrap")}>
                  <X aria-hidden="true" className="h-3 w-3 shrink-0 text-additional-red-primary" />
                  {ticketOutcomes.wrong.when ? (
                    <span>
                      If <span className="normal-case">{asset.symbol}</span> {ticketOutcomes.wrong.when}
                    </span>
                  ) : (
                    "If wrong"
                  )}
                </span>
                <span data-testid="ticket-wrong" className={cn(TICKET_VALUE, "py-0.5 text-content-primary", side === "sell" && "xl:min-h-[54px]")}>
                  {outcomeLine(ticketOutcomes.wrong.what)}
                </span>
                <span className={cn(TICKET_NOTE, "whitespace-nowrap")}>
                  {side === "buy" && payUsd != null ? (
                    // The words come first and the amount last, so a longer amount never pushes
                    // the words sideways; and it breaks at one fixed point where the cell is narrow.
                    <>
                      The most you can lose is <br className="max-xl:hidden" />
                      {formatUsdAmount(payUsd)}
                    </>
                  ) : (
                    ticketOutcomes.wrong.note
                  )}
                </span>
              </div>
            </div>

            {/* the ticket's last row: nothing renders after the button */}
            <div className="mt-3">
              <AppButton size="lg" className="w-full whitespace-nowrap font-mono max-md:px-4 max-md:text-base" disabled={cta.action == null} onClick={onCta}>
                {cta.label}
                <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
              </AppButton>
            </div>
          </div>
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
