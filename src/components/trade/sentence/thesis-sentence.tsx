/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { AppInlineSelect, type AppInlineSelectOption } from "@/components/app-ui/app-inline-select";
import { cn } from "@/lib/cn";
import { getTokenLogoSrc } from "@/lib/token-assets";
import type { TakerSide } from "@/lib/spreads";
import { DIRECTIONS, SENTENCE, directionsFor, type Direction } from "@/lib/trade/thesis";

// Pill text stays in the sentence's own ink so the sentence reads as one line of text;
// the tint (and the direction arrow) carries the meaning.
const PILL = {
  violet: "border-additional-violet-secondary bg-additional-violet-secondary text-content-primary hover:border-additional-violet-primary",
  above: "border-additional-green-secondary bg-additional-green-secondary text-content-primary hover:border-additional-green-primary",
  below: "border-additional-red-secondary bg-additional-red-secondary text-content-primary hover:border-additional-red-primary",
  accent: "border-accent-primary/20 bg-accent-primary/15 text-content-primary hover:border-accent-primary",
} as const;

/** The direction pill is plain text when the UI derives it from a strategy, so it never hints at a hover. */
const DIRECTION_PILL = {
  above: "border-additional-green-secondary bg-additional-green-secondary text-content-primary",
  below: "border-additional-red-secondary bg-additional-red-secondary text-content-primary",
} as const;

const ARROW = {
  above: "text-additional-green-primary-deep",
  below: "text-additional-red-primary",
} as const;

/** Pending value inside a pill while its data loads. */
function Pending() {
  return <span className="text-content-secondary">&hellip;</span>;
}

export type SentenceOptions = {
  assets: ReadonlyArray<AppInlineSelectOption>;
  strikes: ReadonlyArray<AppInlineSelectOption>;
  expiries: ReadonlyArray<AppInlineSelectOption>;
  /** direction values that have no markets for this asset */
  unavailable?: ReadonlyArray<Direction>;
};

/**
 * Every value each part of the sentence can show for this asset, across both directions,
 * all dates and all prices, so each part holds its widest value's width and no choice
 * reflows the sentence.
 */
export type SentenceReserve = {
  assets: ReadonlyArray<string>;
  strikes: ReadonlyArray<{ key: string; label: string }>;
  dates: ReadonlyArray<{ key: string; label: string }>;
};

function AssetFace({ symbol }: { symbol: string }) {
  return (
    <>
      <img
        src={getTokenLogoSrc(symbol)}
        alt=""
        className="h-[0.75em] w-[0.75em] shrink-0 rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary object-cover"
      />
      <span>{symbol}</span>
    </>
  );
}

function DirectionFace({ direction }: { direction: Direction }) {
  return (
    <>
      <span>{direction}</span>
      <span aria-hidden="true" className={ARROW[direction]}>
        {DIRECTIONS.find((d) => d.value === direction)?.arrow}
      </span>
    </>
  );
}

function StrikeFace({ label }: { label: string | null }) {
  return label ? <span>{label}</span> : <Pending />;
}

/** The one editable belief: "I think [asset] ends [above/below] [strike] by [expiry]." */
export function ThesisSentence({
  side,
  asset,
  direction,
  strikeValue,
  strikeLabel,
  move,
  expiryValue,
  expiryLabel,
  options,
  reserve,
  ready,
  disabled,
  onAsset,
  onDirection,
  onStrike,
  onExpiry,
  compact = false,
}: {
  side: TakerSide;
  asset: string;
  direction: Direction;
  strikeValue: string;
  strikeLabel: string | null;
  /** where today's price stands against the thesis, from `cushionText`; null without spot */
  move: string | null;
  expiryValue: string;
  expiryLabel: string | null;
  options: SentenceOptions;
  reserve: SentenceReserve;
  /** the asset's market data has arrived */
  ready: boolean;
  disabled: boolean;
  onAsset: (symbol: string) => void;
  onDirection: (direction: Direction) => void;
  onStrike: (strike1e9: string) => void;
  onExpiry: (expiryTs: string) => void;
  /** caption mode: the belief reads as a compact line under the chart, not a headline */
  compact?: boolean;
}) {
  const directionOptions = directionsFor(side).map((d) => {
    const unavailable = options.unavailable?.includes(d.value) ?? false;
    return {
      value: d.value,
      label: d.value,
      icon: <span aria-hidden="true" className={cn("w-3 text-center", ARROW[d.value])}>{d.arrow}</span>,
      detail: unavailable ? "no markets" : d.optionName.toLowerCase(),
      disabled: unavailable,
    };
  });

  // The belief is one line; the cushion reads quietly under it, a size down. Lines break
  // only between the nowrap phrases, and each pill holds its widest value's width, so
  // picking a value never reflows the sentence.
  return (
    <div className="flex flex-col gap-2 font-space font-semibold tracking-[-0.03em] text-content-primary max-md:gap-1">
      <p className={compact
        ? "text-[22px] leading-[1.5] max-lg:text-[20px] max-md:text-[17px]"
        : "text-[40px] leading-[1.45] max-lg:text-[34px] max-md:text-[26px] max-md:leading-[1.6]"}>
        <span className="whitespace-nowrap">
          {SENTENCE.lead}{" "}
          <AppInlineSelect
            label="Asset"
            value={asset}
            options={options.assets}
            onChange={onAsset}
            disabled={disabled}
            className={PILL.violet}
            reserve={reserve.assets.map((symbol) => ({ key: symbol, face: <AssetFace symbol={symbol} /> }))}
          >
            <AssetFace symbol={asset} />
          </AppInlineSelect>
        </span>{" "}
        <span className="whitespace-nowrap">
          {SENTENCE.willBe}{" "}
          <AppInlineSelect
            label="Direction"
            value={direction}
            options={directionOptions}
            onChange={(v) => onDirection(v as Direction)}
            disabled={disabled}
            className={PILL[direction]}
            reserve={DIRECTIONS.map((d) => ({ key: d.value, face: <DirectionFace direction={d.value} /> }))}
          >
            <DirectionFace direction={direction} />
          </AppInlineSelect>
        </span>{" "}
        <span className="whitespace-nowrap">
          <AppInlineSelect
            label="Strike"
            value={strikeValue}
            options={options.strikes}
            onChange={onStrike}
            disabled={disabled || !ready || options.strikes.length === 0}
            className={PILL.accent}
            reserve={reserve.strikes.map((s) => ({ key: s.key, face: <StrikeFace label={s.label} /> }))}
          >
            <StrikeFace label={strikeLabel} />
          </AppInlineSelect>{" "}
          {SENTENCE.on}{" "}
          <AppInlineSelect
            label="Expiry"
            value={expiryValue}
            options={options.expiries}
            onChange={onExpiry}
            disabled={disabled || !ready || options.expiries.length === 0}
            className={PILL.violet}
            reserve={reserve.dates.map((d) => ({ key: d.key, face: <span>{d.label}</span> }))}
          >
            {expiryLabel ? <span>{expiryLabel}</span> : <Pending />}
          </AppInlineSelect>
          .
        </span>
      </p>
      {/* a quiet line of its own under the belief, so it never touches how the belief wraps; it keeps its height before prices arrive */}
      <p className={cn(
        "-mt-1 font-medium leading-[1.3] tracking-[-0.02em] text-content-secondary max-md:mt-0",
        compact ? "text-[13px]" : "text-[18px] max-md:text-[15px]"
      )}>
        {move ?? " "}
      </p>
    </div>
  );
}
