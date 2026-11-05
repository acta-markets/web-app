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
  amountSymbol,
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
 * [$price] on [date]" — the chart echoing it, an amount, a one-line summary and one Trade
 * button. Earn (the sentence's default) sells the view for a premium; Profit pays it.
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

  // a sell deposits (USDC for a put, the asset for a call); a buy is sized in the asset
  const amountInQuote = side === "sell" && info.isPut;
  const symbol = asset ? amountSymbol(side, direction, asset.symbol) : "USDC";
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

  const premiumPerUnit = strike?.bestPrice != null ? strike.bestPrice / PRICE_SCALE : null;
  const outcome = quantity != null && strike && premiumPerUnit != null
    ? buildScenario({ direction, quantity: quantity / 10 ** decimals, strike: strike.strike, premiumPerUnit, spot })
    : null;
  const distance = strike ? strikeDistancePct(strike.strike, spot) : null;

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
  }

  function chooseDirection(next: Direction) {
    setDirectionChoice(next);
    setStrikeChoice(null);
    setAmountInput(null);
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
      : `${formatAmount(outcome.deposit, inputDecimals)} ${asset.symbol}`
    : "—";
  const labels = strike
    ? side === "sell" && outcome
      ? zoneLabels({ asset: asset.symbol, direction, strike: strike.strike, scenario: outcome, assetDecimals: info.isPut ? 4 : inputDecimals })
      : buyZoneLabels({ asset: asset.symbol, direction, strike: strike.strike })
    : null;
  const amountHint = sizeViolation
    ? { text: sizeViolation, error: true }
    : lockedText != null && amountInput != null && lockedText !== amountText
      ? { text: `Locks ${lockedText} ${symbol} (size steps of ${formatInputValue(depositRule?.step ?? 0, inputDecimals)})`, error: false }
      : null;

  return (
    <div className={CONTAINER}>
      {topBar(true)}

      <section aria-label="Your trade" className="mt-8 flex flex-col gap-5 max-md:mt-6">
        <ThesisSentence
          side={side}
          asset={asset.symbol}
          direction={direction}
          strikeValue={strike ? String(strike.strike1e9) : ""}
          strikeLabel={strike ? formatStrikePrice(strike.strike) : null}
          move={cushionText(asset.symbol, direction, distance)}
          expiryValue={expiry ? String(expiry.expiryTs) : ""}
          expiryLabel={expiry ? formatExpiryDay(expiry.expiryTs * 1000) : null}
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

        {/* view → amount → confirm: one field, its balance, the one-line summary, one button */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
          <label className="flex items-center gap-2 text-content-secondary">
            Amount
            <input
              aria-label={`Amount in ${symbol}`}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0"
              value={amountText}
              disabled={isRequesting}
              onChange={(e) => {
                const next = e.target.value.replace(",", ".");
                const max = inputDecimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${inputDecimals}})?$`) : /^\d*$/;
                if (max.test(next)) setAmountInput(next);
              }}
              aria-invalid={!!sizeViolation || insufficientBalance || undefined}
              className={cn(
                "w-32 border bg-bg-primary px-2 py-1 text-right tabular-nums text-content-primary outline-none transition-colors",
                sizeViolation || insufficientBalance ? "border-error" : "border-bg-border focus:border-accent-primary"
              )}
            />
            <span className="text-content-primary">{symbol}</span>
          </label>
          {walletAddress ? (
            <span className="flex items-center gap-2 text-content-secondary">
              Balance{" "}
              <span className="tabular-nums text-content-primary">
                {balance != null ? `${formatAmount(balance, side === "buy" ? 2 : info.isPut ? 2 : 4)} ${symbol}` : "—"}
              </span>
            </span>
          ) : null}
          {amountHint ? (
            <span className={amountHint.error ? "text-error" : "text-content-secondary"}>{amountHint.text}</span>
          ) : null}
        </div>

        <p className="font-mono text-sm leading-[1.4] tracking-[-0.28px] text-content-primary" aria-label="Trade summary">
          {side === "sell" ? (
            <>
              <span className="text-additional-green-primary-deep">You earn</span>{" "}
              {outcome ? <span>{`≈${formatUsdAmount(outcome.premium)}`}</span> : <span>—</span>}{" "}
              <span className="text-content-secondary">now</span>{" "}
              <span className="text-content-secondary">·</span>{" "}
              <span className="text-content-secondary">risk</span>{" "}
              <span className="text-additional-red-primary">{riskText}</span>
            </>
          ) : (
            <>
              <span>You pay</span> <span>the quoted premium</span>{" "}
              <span className="text-content-secondary">·</span>{" "}
              <span className="text-content-secondary">max loss</span>{" "}
              <span className="text-additional-red-primary">the premium</span>
            </>
          )}
        </p>

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

      <div className="mt-10 max-md:mt-8">
        {spot != null && strike && expiry && labels ? (
          <ThesisChart
            symbol={asset.symbol}
            spot={spot}
            strike={strike.strike}
            expiryMs={expiry.expiryTs * 1000}
            direction={direction}
            right={labels.right}
            wrong={labels.wrong}
            onDirection={chooseDirection}
          />
        ) : !snapshot ? (
          <div aria-hidden="true" className="h-[290px] animate-pulse border border-bg-border bg-action-primary/40" />
        ) : null}
      </div>

      {modal}
    </div>
  );
}
