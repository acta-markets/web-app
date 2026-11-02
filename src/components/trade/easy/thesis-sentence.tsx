/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { AppInlineSelect, type AppInlineSelectOption } from "@/components/app-ui/app-inline-select";
import { cn } from "@/lib/cn";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { DIRECTIONS, SENTENCE, type Direction } from "@/lib/trade/thesis";

// Pill text stays in the sentence's own ink so the sentence reads as one line of text;
// the tint (and the direction arrow) carries the meaning.
const PILL = {
  violet: "border-additional-violet-secondary bg-additional-violet-secondary text-content-primary hover:border-additional-violet-primary",
  above: "border-additional-green-secondary bg-additional-green-secondary text-content-primary hover:border-additional-green-primary",
  below: "border-additional-red-secondary bg-additional-red-secondary text-content-primary hover:border-additional-red-primary",
  accent: "border-accent-primary/20 bg-accent-primary/15 text-content-primary hover:border-accent-primary",
} as const;

const ARROW = {
  above: "text-additional-green-primary-deep",
  below: "text-additional-red-primary",
} as const;

/** Pending value inside a pill while its data loads. */
function Pending() {
  return <span className="text-content-secondary">&hellip;</span>;
}

/**
 * A line's closing words, holding the width of the widest text in `reserve`. Content sits
 * left, so any spare width falls after the line's last word, where it cannot be seen.
 */
function LineEnd({ reserve, children }: { reserve: ReadonlyArray<string>; children: React.ReactNode }) {
  return (
    <span className="inline-grid justify-items-start tabular-nums">
      {reserve.map((r) => (
        <span key={r} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
          {r}
        </span>
      ))}
      <span className="col-start-1 row-start-1 whitespace-pre">{children}</span>
    </span>
  );
}

/** The one typed value in the sentence, so it is the only field drawn as a box; its unit reads as plain text after it. */
function AmountPill({
  value,
  reserve,
  symbol,
  maxDecimals,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  /** amounts the field may show for other dates, prices and directions, so it keeps one width */
  reserve: ReadonlyArray<string>;
  symbol: string;
  maxDecimals: number;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const pattern = React.useMemo(
    () => (maxDecimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${maxDecimals}})?$`) : /^\d*$/),
    [maxDecimals]
  );
  return (
    <label
      data-pill="Amount"
      className={cn(
        "relative inline-flex cursor-text items-center whitespace-nowrap border px-[0.25em] py-[0.06em] leading-[1.15] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-primary",
        invalid ? "border-error bg-accent-primary/15 text-content-primary" : PILL.accent,
        disabled && "opacity-60"
      )}
    >
      {/* hidden copies size the field to its widest amount; the input lies over them, text at the left as in any input */}
      <span className="relative inline-grid">
        {[value || "0", ...reserve.filter((r) => r !== value)].map((r) => (
          <span key={r} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
            {r}
          </span>
        ))}
        <input
          aria-label={`Amount in ${symbol}`}
          size={1}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const next = e.target.value.replace(",", ".");
            if (pattern.test(next)) onChange(next);
          }}
          className="absolute inset-0 h-full w-full min-w-0 bg-transparent p-0 text-content-primary outline-none placeholder:text-content-secondary disabled:cursor-not-allowed"
        />
      </span>
    </label>
  );
}

export type SentenceOptions = {
  assets: ReadonlyArray<AppInlineSelectOption>;
  strikes: ReadonlyArray<AppInlineSelectOption>;
  expiries: ReadonlyArray<AppInlineSelectOption>;
  /** direction values that have no markets for this asset */
  unavailable: ReadonlyArray<Direction>;
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
  amounts: ReadonlyArray<{ key: string; number: string; symbol: string }>;
  /** payout endings ("≈$0.95 (126% APR) now."), built with `payoutTail` */
  tails: ReadonlyArray<string>;
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

export function ThesisSentence({
  asset,
  direction,
  strikeValue,
  strikeLabel,
  move,
  expiryValue,
  expiryLabel,
  amount,
  amountSymbol,
  amountDecimals,
  amountInvalid,
  earnings,
  apr,
  options,
  reserve,
  ready,
  disabled,
  onAsset,
  onDirection,
  onStrike,
  onExpiry,
  onAmount,
}: {
  asset: string;
  direction: Direction;
  strikeValue: string;
  strikeLabel: string | null;
  /** where today's price stands against the thesis, from `cushionText`; null without spot */
  move: string | null;
  expiryValue: string;
  expiryLabel: string | null;
  amount: string;
  amountSymbol: string;
  amountDecimals: number;
  amountInvalid: boolean;
  /** the premium as it reads in the sentence, e.g. "≈$8.20"; null while unknown */
  earnings: string | null;
  /** annualized yield, e.g. "126%"; null when unpriced */
  apr: string | null;
  options: SentenceOptions;
  reserve: SentenceReserve;
  /** the asset's market data has arrived */
  ready: boolean;
  disabled: boolean;
  onAsset: (symbol: string) => void;
  onDirection: (direction: Direction) => void;
  onStrike: (strike1e9: string) => void;
  onExpiry: (expiryTs: string) => void;
  onAmount: (value: string) => void;
}) {
  const directionOptions = DIRECTIONS.map((d) => {
    const unavailable = options.unavailable.includes(d.value);
    return {
      value: d.value,
      label: d.value,
      icon: <span aria-hidden="true" className={cn("w-3 text-center", ARROW[d.value])}>{d.arrow}</span>,
      detail: unavailable ? "no markets" : `you deposit ${d.isPut ? "USDC" : asset}`,
      disabled: unavailable,
    };
  });
  const amountNumbers = Array.from(new Set(reserve.amounts.map((a) => a.number)));
  const amountUnits = Array.from(new Set([amountSymbol, ...reserve.amounts.map((a) => a.symbol)]));

  // The belief leads; the deposit and payout follow on their own line, a size down.
  // Lines break only between the nowrap phrases, and each pill holds its widest value's
  // width, so picking a value never reflows the sentence.
  return (
    <div className="flex flex-col gap-2 font-space font-semibold tracking-[-0.03em] text-content-primary max-md:gap-1">
      <p className="text-[40px] leading-[1.45] max-lg:text-[34px] max-md:text-[26px] max-md:leading-[1.6]">
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
            label="Price"
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
            label="Date"
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
      <p className="-mt-1 text-[18px] font-medium leading-[1.3] tracking-[-0.02em] text-content-secondary max-md:mt-0 max-md:text-[15px]">
        {move ?? " "}
      </p>
      <p className="text-[28px] leading-[1.45] max-lg:text-[24px] max-md:text-[20px] max-md:leading-[1.6]">
        <span className="whitespace-nowrap">
          {SENTENCE.deposit}{" "}
          <AmountPill
            value={amount}
            reserve={amountNumbers}
            symbol={amountSymbol}
            maxDecimals={amountDecimals}
            onChange={onAmount}
            disabled={disabled}
            invalid={amountInvalid}
          />{" "}
          {/* the unit is plain text; it holds the wider unit's width, so USDC and SOL leave the rest of the line in place */}
          <span className="inline-grid justify-items-start">
            {amountUnits.filter((u) => u !== amountSymbol).map((u) => (
              <span key={u} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
                {u},
              </span>
            ))}
            <span className="col-start-1 row-start-1 whitespace-pre">{amountSymbol},</span>
          </span>
        </span>{" "}
        {/* from md up the payout stays one phrase; on phones it may break after "I get paid" */}
        <span className="md:whitespace-nowrap">
          <span className="whitespace-nowrap">{SENTENCE.paid}</span>{" "}
          {/* renders exactly payoutTail(earnings, apr), so it matches its reserve */}
          <LineEnd reserve={reserve.tails}>
            <span className="text-accent-secondary">{earnings ?? "…"}</span>
            {apr ? (
              <>
                {" "}
                <span className="text-content-secondary">({apr} APR)</span>
              </>
            ) : null}{" "}
            {SENTENCE.now}.
          </LineEnd>
        </span>
      </p>
    </div>
  );
}
