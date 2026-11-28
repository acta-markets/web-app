/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Chevron } from "@/components/app-ui/chevron";
import {
  AppInlineSelect,
  INLINE_PILL,
  INLINE_PILL_FACE,
  INLINE_PILL_GLYPH,
  type AppInlineSelectOption,
} from "@/components/app-ui/app-inline-select";
import { cn } from "@/lib/cn";
import { getTokenLogoSrc } from "@/lib/token-assets";
import type { TakerSide } from "@/lib/spreads";
import { DIRECTIONS, SENTENCE, type Direction, type TradeLine } from "@/lib/trade/thesis";

// Pill text stays in the sentence's own ink so the sentence reads as one line of text;
// the tint (and the direction arrow) carries the meaning. The tint is bright enough, with an
// edge in its own hue, that each pill reads as a control to set rather than a highlighted word.
// (The hue tokens are CSS variables, which take no alpha, so the tints are spelled out:
// violet #7251F7, green #49AA19, red #FF3347.)
const PILL = {
  violet: "border-[rgba(114,81,247,0.6)] bg-[rgba(114,81,247,0.3)] text-content-primary hover:border-additional-violet-primary-deep hover:bg-[rgba(114,81,247,0.42)]",
  above: "border-[rgba(73,170,25,0.6)] bg-[rgba(73,170,25,0.24)] text-content-primary hover:border-additional-green-primary-deep hover:bg-[rgba(73,170,25,0.36)]",
  below: "border-[rgba(255,51,71,0.55)] bg-[rgba(255,51,71,0.22)] text-content-primary hover:border-additional-red-primary hover:bg-[rgba(255,51,71,0.34)]",
  accent: "border-accent-primary/60 bg-accent-primary/25 text-content-primary hover:border-accent-primary hover:bg-accent-primary/40",
  // A control that is not part of the belief: the buying / selling switch and a buy's strike,
  // in the second line. Grey like the words around them, so the belief's pills stand out.
  quiet: "border-[rgba(240,240,240,0.4)] bg-[rgba(240,240,240,0.16)] text-content-primary hover:border-[rgba(240,240,240,0.6)] hover:bg-[rgba(240,240,240,0.24)]",
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

/**
 * FUTURE ("chip+pair"): a calendar chip plus the relative-time hint appended to the expiry
 * date. Kept commented out in case a richer expiry affordance is wanted again.
 *
 *   const CHIP_CHROME =
 *     "border-additional-violet-primary bg-additional-violet-secondary text-content-primary hover:border-additional-violet-primary-deep";
 *
 *   function CalendarGlyph() {
 *     return (
 *       <svg aria-hidden="true" viewBox="0 0 16 16"
 *         className="h-[0.7em] w-[0.7em] shrink-0 text-additional-violet-primary-deep"
 *         fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
 *         <rect x="2" y="3" width="12" height="11" />
 *         <path d="M5.5 1.5v2M10.5 1.5v2M2 6.5h12" />
 *       </svg>
 *     );
 *   }
 *
 *   // render the chip face and, for the pair flavour, a `· in N days` hint after the date:
 *   //   const expiryFace = (label) => (<><CalendarGlyph />{label ? <span>{label}</span> : <Pending />}</>);
 *   //   const expiryRelative = options.expiries.find((o) => o.value === expiryValue)?.detail ?? null;
 */

/** Pending value inside a pill while its data loads. */
function Pending() {
  return <span className="text-content-secondary">&hellip;</span>;
}

// The expiry is a menu like the asset's, the goal's and the strike's (Tim, 28 Nov 2026: "make
// it a normal menu"): every date on offer, listed under the pill. It was a wheel that opened in
// place, over the line above it and the chart's top.

export type SentenceOptions = {
  assets: ReadonlyArray<AppInlineSelectOption>;
  strikes: ReadonlyArray<AppInlineSelectOption>;
  expiries: ReadonlyArray<AppInlineSelectOption>;
  /** direction values that have no markets for this asset */
  unavailable?: ReadonlyArray<Direction>;
};

/**
 * Every value the direction and strike pills can show for this asset, across both
 * directions and all prices, so each pill holds its widest value's width and no choice
 * reflows the sentence. (The asset pill hugs its ticker and the expiry pill reserves its own
 * widest date where it is drawn, so neither needs a width reserve here.)
 */
export type SentenceReserve = {
  strikes: ReadonlyArray<{ key: string; label: string }>;
};

/**
 * A buyer's goal, where the page has one (Profit): the price they think the asset reaches. With
 * it, the first line's price is the goal and the strike moves down into the second line, where
 * the option is named.
 */
export type SentenceGoal = {
  value: string;
  /** the chosen goal, formatted; null while there is none to show */
  label: string | null;
  options: ReadonlyArray<AppInlineSelectOption>;
  onChange: (price: string) => void;
};

function AssetFace({ symbol }: { symbol: string }) {
  const logo = getTokenLogoSrc(symbol);
  return (
    <>
      {logo ? (
        <img
          src={logo}
          alt=""
          className="h-[0.75em] w-[0.75em] shrink-0 rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary object-cover"
        />
      ) : (
        <span className="flex h-[0.75em] w-[0.75em] shrink-0 items-center justify-center rounded-full border border-[rgba(240,240,240,0.1)] bg-action-primary font-mono text-[0.5em] font-medium leading-none text-content-primary">
          {symbol.slice(0, 2)}
        </span>
      )}
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

/**
 * The direction has two values, so it is a switch, not a menu: one click on the pill flips it,
 * the same as a click on the chart. It keeps the width of its wider value, so flipping never
 * reflows the sentence. When the asset lists no markets the other way, it is plain text.
 */
function DirectionToggle({
  direction,
  unavailable,
  disabled,
  className,
  onChange,
}: {
  direction: Direction;
  unavailable?: ReadonlyArray<Direction>;
  disabled: boolean;
  className: string;
  onChange: (direction: Direction) => void;
}) {
  const other: Direction = direction === "above" ? "below" : "above";
  const blocked = unavailable?.includes(other) ?? false;
  return (
    <button
      type="button"
      data-pill="Direction"
      aria-label={blocked ? `Direction: ${direction}` : `Direction: ${direction}. Switch to ${other}`}
      title={blocked ? `No markets ${other} for this asset` : `Switch to ${other}`}
      disabled={disabled || blocked}
      onClick={() => onChange(other)}
      className={cn(
        INLINE_PILL,
        // on a phone the tap area fills the line's height, not just the word's
        "max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 max-md:after:content-['']",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
        disabled ? "cursor-not-allowed opacity-60" : blocked ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <span className="inline-grid">
        {DIRECTIONS.map((d) => (
          <span key={d.value} aria-hidden={d.value !== direction} className={cn(INLINE_PILL_FACE, d.value !== direction && "invisible")}>
            <DirectionFace direction={d.value} />
          </span>
        ))}
      </span>
      {/* a stacked chevron, the two-way sibling of the menus' chevron: a second arrow beside the
          direction arrow read as part of the direction */}
      {blocked ? null : <Chevron kind="switch" className={INLINE_PILL_GLYPH} />}
    </button>
  );
}

/**
 * The mode, as the one word of the quiet line that can change: "You're [buying] a call…".
 * It has two values, so it is a switch, not a menu: one click flips it, like the direction pill,
 * and it is drawn as one of the sentence's pills.
 */
function SideToggle({ side, verb, disabled, onFlip }: { side: TakerSide; verb: string; disabled: boolean; onFlip: () => void }) {
  const other = side === "buy" ? "selling" : "buying";
  return (
    <button
      type="button"
      data-pill="Side"
      aria-label={`You are ${verb}. Switch to ${other}`}
      title={`Switch to ${other}`}
      disabled={disabled}
      onClick={onFlip}
      className={cn(
        INLINE_PILL,
        // grey like the strike beside it (Tim, 28 Nov 2026): the quiet line's controls are not
        // part of the belief, so neither takes a colour of its own
        PILL.quiet,
        // on a phone the tap area fills the line's height, not just the word's
        "max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 max-md:after:content-['']",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      {verb}
      <Chevron kind="switch" className={INLINE_PILL_GLYPH} />
    </button>
  );
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Keeps each of the sentence's two lines on one line wherever the layout gives it one (md and
 * up). The type already scales with the card's width; this is the backstop for words wider than
 * that allows for (a long ticker, a long price, a fifth date, a long outcome): the type steps
 * down just enough to fit, through `--fit`, instead of the last phrase dropping to another line
 * and pushing the chart down. Both lines take the same step, the one the wider of them needs, so
 * they stay one size. On a phone the sentence wraps by design and is left alone.
 *
 * The text should not move more than it has to (Tim, 28 Nov 2026), so the step is held still:
 * - it is taken in whole percents, and
 * - while the words stay the same and only the figures in them change (`steadyKey`: a strike
 *   dragged, a goal picked, a size typed) and the card keeps its width, the step only ever goes
 *   down. A longer figure may take the type down a percent; a shorter one never brings it back
 *   up, so the line does not breathe as the figures change.
 * The size is set at once, with no transition: a size in the middle of a transition was what
 * the next measurement read, which left the line a little too wide every time.
 */
function useFitLines(first: React.RefObject<HTMLElement>, second: React.RefObject<HTMLElement>, contentKey: string, steadyKey: string = contentKey) {
  const held = React.useRef<{ key: string; boxes: string; factor: number } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const lines = [first.current, second.current].filter((el): el is HTMLElement => el != null);
    if (lines.length === 0) return;
    const fit = () => {
      for (const el of lines) el.style.removeProperty("--fit");
      if (!window.matchMedia?.("(min-width: 768px)").matches) {
        held.current = null;
        return;
      }
      let factor = 1;
      for (const el of lines) {
        const box = el.clientWidth;
        const wrap = el.style.whiteSpace;
        el.style.whiteSpace = "nowrap";
        const natural = el.scrollWidth;
        el.style.whiteSpace = wrap;
        if (box > 0 && natural > box) factor = Math.min(factor, box / natural);
      }
      factor = Math.floor(factor * 100) / 100;
      // the same words in the same card: never larger than it has already been
      const boxes = lines.map((el) => el.clientWidth).join(",");
      const before = held.current;
      if (before && before.key === steadyKey && before.boxes === boxes) factor = Math.min(factor, before.factor);
      held.current = { key: steadyKey, boxes, factor };
      if (factor < 1) for (const el of lines) el.style.setProperty("--fit", factor.toString());
    };
    fit();
    // the card's width changes with the window, and the words' width once the web font is in
    const parent = lines[0].parentElement;
    const observer = typeof ResizeObserver === "undefined" || !parent ? null : new ResizeObserver(fit);
    if (observer && parent) observer.observe(parent);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    // `ready` settles once; a weight that is first needed later (the web font swapping in for
    // the fallback it was measured in) announces itself here, and the lines are measured again
    const fonts = typeof document.fonts?.addEventListener === "function" ? document.fonts : null;
    fonts?.addEventListener("loadingdone", fit);
    return () => {
      live = false;
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", fit);
    };
  }, [first, second, contentKey, steadyKey]);
}

/** A line's words with every figure in them taken out: what stays the same while a strike is
    dragged or a size is typed. */
function withoutFigures(text: string): string {
  return text.replace(/[\d.,]+/g, "#");
}

/**
 * The trade page's type for both of the sentence's lines. The sentence is the page, so it is set
 * as large as one line of it allows: the size follows the card's width, up to 26px, and steps
 * down to fit. The second line is the longer one, in either mode ("You're selling a call to
 * earn ≈$5.48, and sell your BTC at $62,000 if wrong"; "You're buying a $61,000 call to make
 * +$28.05 or more, risking ≈$21.95"). It was a third longer, about 45 of its own ems, which is
 * where the 2.2% of the width comes from; the shorter wording fits at that size with room over.
 */
const COMPACT_LINE = "text-[length:calc(clamp(17px,2.2cqw,26px)*var(--fit,1))] leading-[1.5] max-md:text-[17px] max-md:leading-[1.9]";

function StrikeFace({ label }: { label: string | null }) {
  return label ? <span>{label}</span> : <Pending />;
}

/** The strike's own control. Selling it is the first line's price; buying it is the goal's
    sibling in the quiet line, inside the option's name. */
export function StrikeControl({
  strikeValue,
  strikeLabel,
  options,
  reserve,
  onStrike,
  onStrikePreview,
  disabled,
  ready,
  inSecondLine,
}: {
  strikeValue: string;
  strikeLabel: string | null;
  options: SentenceOptions;
  reserve: SentenceReserve;
  onStrike: (strike1e9: string) => void;
  onStrikePreview?: (strike1e9: string | null) => void;
  disabled: boolean;
  ready: boolean;
  /** a buy's strike sits in the quiet line, grey so the goal stays the one price that stands out */
  inSecondLine: boolean;
}) {
  return (
    <AppInlineSelect
      label="Strike"
      value={strikeValue}
      options={options.strikes}
      onChange={onStrike}
      onPreview={onStrikePreview}
      disabled={disabled || !ready || options.strikes.length === 0}
      className={inSecondLine ? PILL.quiet : PILL.accent}
      reserve={reserve.strikes.map((r) => ({ key: r.key, face: <StrikeFace label={r.label} /> }))}
    >
      <StrikeFace label={strikeLabel} />
    </AppInlineSelect>
  );
}

/** The quiet line under the belief: what is traded, for how much, and what being wrong costs.
    Lifted out of ThesisSentence so the trade page can put it below the chart instead. */
export function ThesisMoveLine({
  move,
  side,
  onSide,
  strikeInSecond,
  strikePill,
  compact,
  secondRef,
}: {
  move: TradeLine;
  side: TakerSide;
  onSide?: () => void;
  strikeInSecond: boolean;
  strikePill: React.ReactNode;
  compact: boolean;
  secondRef?: React.RefObject<HTMLParagraphElement>;
}) {
  // One line from a tablet up: there the quiet line never wraps, and it shrinks (--fit) to fit
  // its card rather than breaking. The width is measured against the full nowrap line, so it
  // assumes the whole number of symbols whatever the prices say. On a phone the type is a fixed
  // 17px and the line is twice the screen's width, so there it wraps like any sentence: held
  // to one line it made the whole page scroll sideways.
  const self = React.useRef<HTMLParagraphElement>(null);
  const fitRef = secondRef ?? self;
  const contentKey = [move.strike ?? "", move.rest].join("|");
  useFitLines(fitRef, { current: null }, contentKey, withoutFigures([move.lead, move.verb, move.before, move.rest].join("|")));
  return (
    <p
      ref={fitRef}
      data-testid="thesis-move"
      className={cn(
        // no transition on the size: text is not animated (Tim, 28 Nov 2026)
        "font-space font-semibold tracking-[-0.03em] text-content-primary whitespace-nowrap max-md:whitespace-normal",
        // Figures of one width, so an amount that changes value and keeps its number of digits
        // ("$836" to "$911") moves nothing after it: in this face a 1 is 10px wide and a 0 is
        // 15px at this size. Set as a property, not with `tabular-nums`: that class is how the
        // app's font split picks its mono face, and this line stays in its own.
        "[font-variant-numeric:tabular-nums]",
        compact ? COMPACT_LINE : "-mt-1 text-[18px] font-medium leading-[1.3] tracking-[-0.02em] max-md:mt-0 max-md:text-[15px]",
      )}
    >
      {`${move.lead} `}
      {onSide ? (
        <span className="text-content-primary">
          <SideToggle side={side} verb={move.verb} disabled={false} onFlip={onSide} />
        </span>
      ) : (
        move.verb
      )}
      {strikeInSecond ? (
        <>
          {` ${move.before} `}
          {strikePill}
        </>
      ) : move.strike ? (
        ` ${move.before} ${move.strike}`
      ) : null}
      {` ${move.rest}`}
    </p>
  );
}

/** The one editable belief: "I think [asset] ends [above/below] [strike] by [expiry]". */
export function ThesisSentence({
  side,
  asset,
  direction,
  strikeValue,
  strikeLabel,
  goal,
  move,
  expiryValue,
  options,
  reserve,
  ready,
  disabled,
  onAsset,
  onDirection,
  onSide,
  onStrike,
  onStrikePreview,
  onExpiry,
  compact = false,
  /** render the quiet line under the belief; the trade page turns this off and draws it below the chart */
  secondLine = true,
}: {
  side: TakerSide;
  asset: string;
  direction: Direction;
  strikeValue: string;
  strikeLabel: string | null;
  /** Profit only: the first line's price is this goal, and the strike is picked in the second line */
  goal?: SentenceGoal;
  /** the second line: what is traded, for how much, and what being wrong costs, from `tradeLine` */
  move: TradeLine;
  expiryValue: string;
  options: SentenceOptions;
  reserve: SentenceReserve;
  /** the asset's market data has arrived */
  ready: boolean;
  disabled: boolean;
  onAsset: (symbol: string) => void;
  onDirection: (direction: Direction) => void;
  /** flips buying and selling; with it the line's verb is the switch, without it plain text */
  onSide?: () => void;
  onStrike: (strike1e9: string) => void;
  /** the strike under the pointer or the keyboard while its menu is open; null once it closes */
  onStrikePreview?: (strike1e9: string | null) => void;
  onExpiry: (expiryTs: string) => void;
  /** caption mode: the belief reads as a compact line under the chart, not a headline */
  compact?: boolean;
  /** render the quiet second line; the trade page passes false and draws it below the chart */
  secondLine?: boolean;
}) {
  // Two lines in one type: the belief, then the trade made on it and what being wrong costs. The
  // second holds controls of its own (the buying / selling switch, and a buy's strike), so on the
  // trade page it is set exactly as the first, in quieter ink. Lines break only between the
  // nowrap phrases. The direction and strike pills hold their widest value's width so picking
  // them never reflows the sentence; the asset pill hugs its ticker, so switching assets lets
  // the sentence settle around it.
  const line = React.useRef<HTMLParagraphElement>(null);
  const second = React.useRef<HTMLParagraphElement>(null);
  // everything that sets the line's width: the ticker, the widest price it reserves, the dates
  const contentKey = [
    asset,
    strikeLabel ?? "",
    reserve.strikes.map((s) => s.label).join(","),
    options.expiries.map((o) => o.label).join(","),
    options.unavailable?.join(",") ?? "",
  ].join("|");
  useFitLines(
    line,
    second,
    compact ? `${contentKey}|${goal?.label ?? ""}|${move.verb}|${move.rest}` : "",
    // the same asset, direction and wording: a new strike, goal or amount does not let the type grow back
    compact ? withoutFigures([asset, direction, move.verb, move.rest].join("|")) : "",
  );
  // The strike's own control. Selling, it is the first line's price; buying, the first line's
  // price is the goal and this sits in the second line, inside the option's name.
  const strikeInSecond = goal != null && move.strike != null;
  const expiryLabel = options.expiries.find((o) => o.value === expiryValue)?.label ?? null;
  const strikePill = (
    <StrikeControl
      strikeValue={strikeValue}
      strikeLabel={strikeLabel}
      options={options}
      reserve={reserve}
      onStrike={onStrike}
      onStrikePreview={onStrikePreview}
      disabled={disabled}
      ready={ready}
      inSecondLine={strikeInSecond}
    />
  );
  return (
    // a size container, so the belief's type follows the card's width, not the window's: the
    // card is narrower on a mid-size window than on a small one, and window-sized type broke there
    <div className={cn(
      "flex flex-col font-space font-semibold tracking-[-0.03em] text-content-primary [container-type:inline-size]",
      compact ? "gap-0" : "gap-2 max-md:gap-1",
    )}>
      <p
        ref={compact ? line : undefined}
        className={compact ? COMPACT_LINE : "text-[clamp(26px,2.85vw,40px)] leading-[1.45]"}
      >
        <span className="whitespace-nowrap">
          {SENTENCE.lead}{" "}
          <AppInlineSelect
            label="Asset"
            value={asset}
            options={options.assets}
            onChange={onAsset}
            disabled={disabled}
            className={PILL.violet}
            // assets are a set to pick from at a glance: the menu widens, a column per group, and does not scroll
            overflow="columns"
          >
            <AssetFace symbol={asset} />
          </AppInlineSelect>
        </span>{" "}
        <span className="whitespace-nowrap">
          {SENTENCE.willBe}{" "}
          <DirectionToggle
            direction={direction}
            unavailable={options.unavailable}
            disabled={disabled}
            className={PILL[direction]}
            onChange={onDirection}
          />
        </span>{" "}
        <span className="whitespace-nowrap">
          {goal ? (
            <AppInlineSelect
              label="Goal"
              value={goal.value}
              options={goal.options}
              onChange={goal.onChange}
              disabled={disabled || !ready || goal.options.length === 0}
              className={PILL.accent}
              reserve={goal.options.map((o) => ({ key: o.value, face: <StrikeFace label={o.label} /> }))}
            >
              <StrikeFace label={goal.label} />
            </AppInlineSelect>
          ) : (
            strikePill
          )}{" "}
        </span>{" "}
        {/* "by" belongs to the date, not to the strike: kept in one nowrap phrase so a
            break never leaves the preposition stranded at the end of the line. */}
        <span className="whitespace-nowrap">
          {SENTENCE.on}{" "}
          <AppInlineSelect
            label="Expiry"
            value={expiryValue}
            options={options.expiries}
            onChange={onExpiry}
            disabled={disabled || !ready || options.expiries.length === 0}
            className={PILL.violet}
            // the pill keeps the width of its longest date, so choosing one never reflows the line
            reserve={options.expiries.map((o) => ({ key: o.value, face: <span>{o.label}</span> }))}
          >
            {expiryLabel ? <span>{expiryLabel}</span> : <Pending />}
          </AppInlineSelect>
        </span>
      </p>
      {/* the trade and its downside, on a line of its own, so it never touches how the belief
          wraps. The trade page can instead put it below the chart with `secondLine={false}`. */}
      {secondLine ? (
        <ThesisMoveLine
          move={move}
          side={side}
          onSide={onSide}
          strikeInSecond={strikeInSecond}
          strikePill={strikePill}
          compact={compact}
          secondRef={compact ? second : undefined}
        />
      ) : null}

    </div>
  );
}
