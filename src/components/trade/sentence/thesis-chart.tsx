"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type React from "react";
import { Check, Grab, Hand, X } from "lucide-react";
import { AreaSeries, createChart, ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { AppCard } from "@/components/app-ui/app-card";
import { Chevron } from "@/components/app-ui/chevron";
import { cn } from "@/lib/cn";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import { publicKey } from "@/lib/state/keys";
import { useResource } from "@/lib/state/use-resource";
import { loadPriceHistory } from "@/lib/trade/price-history";
import type { Direction, ZoneLabel } from "@/lib/trade/thesis";

type Point = { t: number; v: number };
type Range = "1d" | "1w" | "1m" | "3m";

const RANGES: Array<{ value: Range; label: string }> = [
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
];
const RANGE_NAMES: Record<Range, string> = { "1d": "last 24 hours", "1w": "last week", "1m": "last month", "3m": "last 3 months" };
/** Pixel wander amplitude for each range's projection fan (at the 280px pane). 1D is the calm
    reference feel and the longer ranges ramp only gently just above it — 1W≈36, 1M≈42, 3M≈50 —
    never the wild √-growth that made longer horizons read as scrawled noise. */
export const RANGE_WIGGLE: Record<Range, number> = { "1d": 30, "1w": 36, "1m": 42, "3m": 50 };
const MAX_POINTS = 200;

const DAY_MS = 86_400_000;

/** The price-history range a strike date deserves: near expiries (a day or two out) look at a
    day/week, a week out a week, a month out a month, and anything past that three months. The
    chart always looks back at least as far as the trade has left to run. */
export function rangeForExpiry(expiryMs: number, nowMs: number): Range {
  const days = (expiryMs - nowMs) / DAY_MS;
  if (days <= 1) return "1d";
  if (days <= 7) return "1w";
  if (days <= 30) return "1m";
  return "3m";
}

/** The chart's height: the pane over the library's time axis. The price scale keeps the same
    margin at the pane's top and bottom (`SCALE_MARGIN_PX`), so the rail's first tick is as far
    from the pane's top as its last is from the pane's foot, and the strike, which the range is
    centred on, is at the pane's middle. */
export const CHART_HEIGHT = 262;
/** Where the price range's two ends sit, px inside the pane's top and foot. The rail draws a
    tick at each end, a block of two 12px lines (27.6 px) centred on it, and the two step
    sections of the rail are buttons: this margin leaves the numbers as far from a section's
    top or foot as they are from its sides (`RAIL_TEXT_INSET`, 11 px, measured to the ink: a
    line of text has about 2.5 px of air over and under its figures). */
const SCALE_MARGIN_PX = 22;
/** What stands at the pane's top and foot is on the same two lines as the rail's first and last
    ticks (Tim, 28 Nov 2026): the range tabs and the expiry tag are centred `SCALE_MARGIN_PX`
    under the pane's top, the flip hint the same distance over its foot. The tabs are 22 px
    tall, so their top is this; the two tags are 24.4 px tall and sit 10 px from their end
    (`top-[10px]`, and the hint's `bottom`). Change the margin and those move with it. */
const TAB_ROW_TOP = SCALE_MARGIN_PX - 11;
/** The height of the library's time axis under the pane, until the chart has been measured.
    The chart's box (the zones' tint, the price rail) ends at the axis line, top and bottom
    alike; the dates stand under it, outside the box (Tim, 28 Nov 2026: the legend's foot has to
    line up with the chart's as its head does). */
const TIME_AXIS_HEIGHT = 28;
/** Fixed number of right-axis ticks: the grid count stays put while the labels recompute. */
const TICK_COUNT = 5;
const FALLBACK_STRIKE_Y = 130;
/** How far (px) a pointer may drift between press and release before a chart tap counts as a
    drag rather than a tap-to-flip. The strike handle captures its own pointer, so this only
    guards taps that begin on empty chart. */
const TAP_SLOP = 6;

function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

const HISTORY_FRESH_MS = 5 * 60 * 1000;
const HISTORY_SHOW_MS = 24 * 60 * 60 * 1000;
/** No history yet. One array, so "nothing" is the same value every render and never re-runs an effect. */
const NO_POINTS: Point[] = [];

/**
 * Price history from CoinGecko via `/api/market/history`, through the shared cache: a series
 * already loaded (this session, or an earlier one on this device) is drawn at once and
 * replaced when a newer one lands. A range change keeps the old series up meanwhile; a change
 * of asset does not, another asset's prices are never drawn under this one's name.
 */
function usePriceHistory(symbol: string, range: Range) {
  const series = useResource<Point[]>({
    key: publicKey("price-history", symbol, range),
    load: async (signal) => {
      const points = downsample(await loadPriceHistory(symbol, range, signal), MAX_POINTS);
      // an empty answer is a failure or an asset without history: not worth keeping, asked again next time
      if (points.length === 0) throw new Error("No price history");
      return points;
    },
    initial: [],
    pollMs: 0,
    staleMs: HISTORY_FRESH_MS,
    persist: true,
    maxShowMs: HISTORY_SHOW_MS,
  });
  const last = useRef<{ symbol: string; points: Point[] } | null>(null);
  if (!series.loading) last.current = { symbol, points: series.data };
  return {
    points: series.loading ? (last.current?.symbol === symbol ? last.current.points : NO_POINTS) : series.data,
    loading: series.loading,
  };
}

/** How far from the pane's top and bottom a lone strike is kept: both zones get room. */
const LONE_STRIKE_MARGIN = 0.38;
/** The same for the lowest and highest strike on offer. Smaller, so the strikes between them
    spread over the pane and the line has somewhere to travel. */
const OFFERED_STRIKES_MARGIN = 0.22;

/** Price domain covering history, spot and every strike given, padded, with the strikes kept
    off the edges. Given the whole list on offer, the domain does not depend on which strike is
    chosen: choosing another one moves the line and leaves the chart where it is. */
/** A price range centred on `center` that still covers every context value, so the strike sits
    at the pane's middle and dragging it scrolls the chart past a knot that stays put. */
function centredPriceDomain(context: number[], center: number): [number, number] {
  const values = context.filter(Number.isFinite);
  const mid = center > 0 ? center : (values.length ? values[0] : 1);
  const minC = values.length ? Math.min(...values) : mid;
  const maxC = values.length ? Math.max(...values) : mid;
  const up = Math.max(maxC - mid, 0);
  const down = Math.max(mid - minC, 0);
  const half = Math.max(up, down, Math.abs(mid) * 0.05) * 1.12;
  return [Math.max(0, mid - half), mid + half];
}

export function priceDomain(values: number[], strikes: number | readonly number[] | null): [number, number] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!(hi > lo)) {
    const d = Math.abs(hi || 1) * 0.05;
    lo -= d;
    hi += d;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const list = (strikes == null ? [] : typeof strikes === "number" ? [strikes] : strikes).filter(Number.isFinite);
  if (list.length > 0) {
    const low = Math.min(...list);
    const high = Math.max(...list);
    const m = high > low ? OFFERED_STRIKES_MARGIN : LONE_STRIKE_MARGIN;
    const lowShort = (l: number, h: number) => low - l < m * (h - l);
    const highShort = (l: number, h: number) => h - high < m * (h - l);
    // stretch one end; if that leaves the other end short too, both strikes sit exactly on their margins
    const stretchedLo = lowShort(lo, hi) ? (low - m * hi) / (1 - m) : lo;
    const stretchedHi = highShort(lo, hi) ? (high - m * lo) / (1 - m) : hi;
    if ((lowShort(lo, hi) && highShort(stretchedLo, hi)) || (highShort(lo, hi) && lowShort(lo, stretchedHi))) {
      const span = (high - low) / (1 - 2 * m);
      lo = low - m * span;
      hi = high + m * span;
    } else {
      lo = stretchedLo;
      hi = stretchedHi;
    }
  }
  return [Math.max(0, lo), hi];
}

/** The long option's gross payout (intrinsic value) at a settlement price: how much it pays
    out before the premium is subtracted. */
export function optionPayout(direction: Direction, strike: number, quantity: number, price: number): number {
  return direction === "above" ? Math.max(0, price - strike) * quantity : Math.max(0, strike - price) * quantity;
}

/** Net profit in the profit zone at a settlement price.
    - long (buy): the payout minus the premium — the option's intrinsic value less what was paid.
    - short (sell): the premium, flat — kept regardless of how far in the money it settles. */
export function profitAtPrice(
  side: "sell" | "buy",
  direction: Direction,
  strike: number,
  quantity: number,
  premium: number,
  price: number
): number {
  return side === "sell" ? premium : optionPayout(direction, strike, quantity, price) - premium;
}

/** Full signed PnL at a settlement price — the payoff net of the premium. The option's
    intrinsic value depends on both side and direction: buy-above / sell-below trades a call,
    buy-below / sell-above a put. For a long (buy) the PnL is intrinsic minus premium (loss
    capped at the premium); for a short (sell) it is premium minus intrinsic (profit capped
    at the premium, loss growing on assignment). Scales linearly with quantity — this is the
    curve the PnL Y axis draws. */
export function pnlAtPrice(
  side: "sell" | "buy",
  direction: Direction,
  strike: number,
  quantity: number,
  premium: number,
  price: number
): number {
  const isPut = (direction === "above") === (side === "sell");
  const intrinsic = (isPut ? Math.max(0, strike - price) : Math.max(0, price - strike)) * quantity;
  return side === "sell" ? premium - intrinsic : intrinsic - premium;
}

/** Return at a settlement price as a percentage of the premium at stake — the money put in is
    the zero line, so +100% is a long doubling its premium (or a short keeping its full premium)
    and −100% is a long losing it all. A zero/unknown premium yields 0%. */
export function returnPctAtPrice(
  side: "sell" | "buy",
  direction: Direction,
  strike: number,
  quantity: number,
  premium: number,
  price: number
): number {
  if (!(premium > 0)) return 0;
  return (pnlAtPrice(side, direction, strike, quantity, premium, price) / premium) * 100;
}

/** A signed dollar readout for the rail: "+$42.00", "-$250", and zero plain, "$0.00". */
function formatSignedUsd(usd: number): string {
  if (usd > 0) return `+${formatUsdSmart(usd)}`;
  return usd < 0 ? `-${formatUsdSmart(-usd)}` : formatUsdSmart(0);
}

/** Profit → brand green, loss → red, break-even → neutral. */
function readoutTone(readout: string): string {
  return readout[0] === "+" ? "text-accent-primary"
    : readout[0] === "-" ? "text-additional-red-primary"
    : "text-content-tertiary";
}

/** Schedule a callback on the next paint where available (jsdom tests have no rAF). */
function afterFrame(fn: () => void) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 0);
}

/** Deterministic PRNG so one seed always yields the same wiggle (stable across renders). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The pixel box a projection path must never leave (used to clamp x, y and the smoothing
    control points so the whole curve — not just its knots — stays inside). */
type PathBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Smooth (Catmull-Rom) open path through the given points. The control points are clamped to
    [minY, maxY]: a cubic Bézier lies inside the convex hull of its four control points, so
    clamping them guarantees the curve can't bulge past the box between data points. */
function smoothPath(pts: Array<[number, number]>, minY = -Infinity, maxY = Infinity): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6, minY, maxY);
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6, minY, maxY);
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${c1y.toFixed(1)}`
      + ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${c2y.toFixed(1)}`
      + ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A plausible price path from (x0,y0) to (x1,y1): a straight trend plus a wander that is
    zero at both ends and peaks mid-path, so it starts on the live price and ends on the
    given endpoint. Every knot is clamped to `bounds` (x and y) before smoothing, so the
    start, the mid-path wander and the end can never leave the box. */
export function projectionPath(
  x0: number, y0: number, x1: number, y1: number,
  seed: number, steps = PROJECTION_STEPS, wiggle = RANGE_WIGGLE["1d"],
  bounds: PathBounds = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity }
): string {
  const rnd = mulberry32(seed);
  let wander = 0;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    wander = (wander + (rnd() * 2 - 1) * 1.6) * 0.72;
    const x = clamp(x0 + (x1 - x0) * t, bounds.minX, bounds.maxX);
    const y = clamp(y0 + (y1 - y0) * t + wander * Math.sin(Math.PI * t) * wiggle, bounds.minY, bounds.maxY);
    pts.push([x, y]);
  }
  return smoothPath(pts, bounds.minY, bounds.maxY);
}

// dark-theme palette: a soft neutral white for the price history (the "actual data"), a pure bright
// white for the "your price" LINE (white lives inside the chart, not as a UI block), and a dim
// neutral for the live "now" price. The two HTML tags follow the design system instead: the draggable
// strike handle wears the brand's accent-green "active" tag and the NOW reference recedes to the
// default outlined tag — neither leans on a large white fill.
const LINE = "#F0F0F0";
const STRIKE = "#FFFFFF";
/** A buyer's goal: the brand accent, so it reads as the aim and not as a second strike. */
const GOAL = "#80C9B6";
const SPOT = "rgba(240,240,240,0.30)";
const GRID = "rgba(240,240,240,0.05)";
const BORDER = "rgba(240,240,240,0.10)";
const TEXT = "rgba(240,240,240,0.55)";
const NOW_LINE = "rgba(240,240,240,0.35)";
/** Projection fan: sage green for scenarios that end profitable, dusty red for those that don't.
    Solid hues at reduced alpha so the synthetic paths recede behind the live history. */
const PROFIT = "rgba(92,168,124,0.60)";
const LOSS = "rgba(194,104,104,0.60)";

/** The NOW tag's half height, and how far its centre sits from the live-price dot it names. */
/** Below this pane width (a phone) the overlays switch to their compact placement. */
/** A goal's tag says what the chart's right part (from the "now" line to the plot's right edge)
    has room for. Narrower than the first, it is its price alone: with its profit as well it
    would reach the NOW tag. From the second, beside the rail, it has its word and hand too. */
const NARROW_RIGHT_PART = 240;
const ROOMY_RIGHT_PART = 300;
/** A goal tag's width, for keeping it off the NOW tag: its box, glyphs and gaps, then its
    characters at the width of one in the tags' mono face. An estimate, on the generous side. */
const GOAL_TAG_CHROME = 44;
const GOAL_TAG_WORD = 60;
const TAG_CH = 7.6;

/**
 * A piece of a tag's text in a slot as wide as the widest text that slot ever holds, so the tag
 * keeps one width while what it says changes. The widest text is set unseen in the same cell
 * of a one-cell grid: the slot is exactly that wide in the tag's own face, whatever the face
 * (a width in `ch` came out a tenth too wide). In a mono face any text of the same length will
 * do for `widest`.
 */
function Sized({ text, widest, align = "left" }: { text: string; widest: string; align?: "left" | "right" }) {
  return (
    <span className="inline-grid tabular-nums">
      {/* drawn from an attribute, so the widest text is never read out or found as text */}
      <span
        aria-hidden="true"
        data-sizer={widest.length > text.length ? widest : text}
        className="invisible col-start-1 row-start-1 whitespace-pre before:content-[attr(data-sizer)]"
      />
      <span className={cn("col-start-1 row-start-1", align === "right" ? "justify-self-end" : "justify-self-start")}>{text}</span>
    </span>
  );
}

/** How far the NOW tag's middle is from the live price's dot, above it or below, px. */
const NOW_TAG_OFFSET = 18;
/** The highest the NOW tag's middle goes: inside the pane's top edge, px. */
const NOW_TAG_TOP = 15;
/** Half the height of a tag in the pane's centre column (a zone label, the NOW tag), px. */
const TAG_HALF = 12;
/** The clear space kept between two tags in the centre column, px; and the least, where the
    pane has no room for more. */
const TAG_GAP = 6;
const TAG_TIGHT = 2;
/** How far a zone label's middle is from its end of the pane, px: the upper one 6 px under the
    row of the range tabs and the expiry tag, the lower one 6 px over the flip hint, the same
    distance from each end. */
const ZONE_LABEL_INSET = 52;

/**
 * Where a zone's label sits: at its home, always (Tim, 28 Nov 2026: "ALWAYS in same place").
 * The strike, the goal, the direction and the live price never move it; the NOW tag steps
 * around it instead (`nowTagY`). The one thing that holds it is its own zone: a label never
 * stands on the wrong side of the strike line (`min`..`max`), which with the strike in the
 * middle of the pane never comes up.
 */
export function zoneLabelY({ home, min, max }: { home: number; min: number; max: number }): number {
  return Math.min(Math.max(home, min), Math.max(min, max));
}

/** How far the NOW tag may lie over the edge of a zone label before it gives the label up and
    goes past it, px: the label's border and padding, never its words. */
const NOW_TAG_OVERLAP = 4;

/**
 * Where the NOW tag sits in the pane's centre column, which it shares with the two zone labels.
 * It is always above the live price's dot (Tim, 28 Nov 2026, after trying both sides), right by
 * it, so the end of the line and the start of the projection stay visible. The labels do not
 * move, and the tag stacks with them: with a label just over the dot the tag stays by the dot,
 * close up under the label, over the label's edge by a few pixels and nearer the dot if it has
 * to be. Only where it cannot fit between the two without covering the label's words or the
 * dot does it go past the label, to the first clear place over it; at the pane's top it stops
 * inside the pane. `taken` is each label's top and bottom; `top`
 * and `bottom` are the highest and lowest its middle may go.
 */
export function nowTagY({
  spotY,
  top,
  bottom,
  taken,
}: {
  spotY: number;
  top: number;
  bottom: number;
  taken: ReadonlyArray<readonly [number, number]>;
}): number {
  const inside = (y: number) => y >= top && y <= bottom;
  /** how far a tag centred at `y` lies over the nearest thing in the column, px; negative is the room between them */
  const over = (y: number) => Math.max(...taken.map(([from, to]) => Math.min(y + TAG_HALF - from, to - (y - TAG_HALF))), -Infinity);
  const beside = spotY - NOW_TAG_OFFSET;
  if (inside(beside) && over(beside) <= NOW_TAG_OVERLAP) return beside;
  // A label a little nearer over the dot: the tag is pressed between the two, as far up over the
  // label's edge as it may go, so long as it still ends over the dot and not on it.
  const pressed = taken
    .filter(([, to]) => to <= spotY)
    .map(([, to]) => to - NOW_TAG_OVERLAP + TAG_HALF)
    .filter((y) => y > beside && y + TAG_HALF <= spotY - 1 && inside(y) && over(y) <= NOW_TAG_OVERLAP);
  if (pressed.length > 0) return Math.max(...pressed);
  // past the label in its way: the nearest clear place over it, with the usual room or with little
  for (const gap of [TAG_GAP, TAG_TIGHT]) {
    const past = taken
      .map(([from]) => from - gap - TAG_HALF)
      .filter((y) => y <= beside && inside(y) && over(y) <= -gap)
      .sort((p, q) => q - p);
    if (past.length > 0) return past[0];
  }
  return Math.min(Math.max(beside, top), Math.max(top, bottom));
}

/** The projection fan re-randomizes on this cadence so the future keeps re-drawing. */
const PROJECTION_REFRESH_MS = 5500;
const PROJECTION_STEPS = 40;
/** Cap the wander at this fraction of the pane so the paths never run fully off the chart. */
const PROJECTION_WIGGLE_CAP = 0.6;
/** Margin (px) the future fan keeps clear of the pane's top, bottom and right edges. */
const PROJECTION_PAD = 6;

/** Pixel wander amplitude for the future paths: the tuned per-range value, clamped to the pane
    height so the lines stay on the chart. */
export function projectionWiggle(range: Range, paneHeight: number): number {
  return Math.min(RANGE_WIGGLE[range], paneHeight * PROJECTION_WIGGLE_CAP);
}

/** Minimum vertical gap (px) between the two projection endpoints, so the profit and loss
    futures read as two clearly different outcomes at a glance. */
const ENDPOINT_MIN_GAP = 96;
/** Minimum the endpoints keep clear of the strike line (px) so the two paths read apart. */
const STRIKE_STANDOFF = 12;

/** Random plausible future endpoints for the projection fan, in pane pixel-Y space: exactly one
    profit-side endpoint and one loss-side endpoint, split at the strike. Each endpoint is placed
    in the OUTER half of its own half of the pane — one comfortably high, one comfortably low — so
    the pair ends far apart, with a minimum vertical gap enforced between them. Deterministic for a
    given seed. (`spotY` is kept for call-site stability; placement no longer drifts from it.) */
export function scenarioEndpoints(
  seed: number,
  paneHeight: number,
  strikeY: number,
  spotY: number,
  direction: Direction
): [number, number] {
  const rnd = mulberry32(seed);
  const minY = PROJECTION_PAD;
  const maxY = Math.max(minY + 1, paneHeight - PROJECTION_PAD);

  // The pane's two halves, split at the strike.
  const upperBand: [number, number] = [minY, strikeY];
  const lowerBand: [number, number] = [strikeY, maxY];

  // Place an endpoint in the outer half of a band — the half furthest from the strike — so it
  // sits comfortably near the pane edge rather than hugging the strike (and the other endpoint).
  const pickOuter = (band: [number, number], farEdge: "lo" | "hi"): number => {
    const [lo, hi] = band;
    if (!(hi > lo)) return clamp(strikeY, minY, maxY);
    const mid = lo + (hi - lo) / 2;
    const [a, b] = farEdge === "lo" ? [lo, mid] : [mid, hi];
    return a + (b - a) * rnd();
  };

  // The high end lives toward the pane top, the low end toward the pane bottom.
  let upper = pickOuter(upperBand, "lo");
  let lower = pickOuter(lowerBand, "hi");

  // Keep each end clear of the strike, then enforce a minimum vertical gap — both pushes move each
  // end further into its own half, never across the strike or past the padded pane.
  upper = Math.min(upper, strikeY - STRIKE_STANDOFF);
  lower = Math.max(lower, strikeY + STRIKE_STANDOFF);
  if (lower - upper < ENDPOINT_MIN_GAP) {
    const deficit = ENDPOINT_MIN_GAP - (lower - upper);
    upper = Math.max(minY, upper - deficit / 2);
    lower = Math.min(maxY, lower + deficit / 2);
  }

  // Profit is up for "above" (price must rise), down for "below".
  return direction === "above" ? [upper, lower] : [lower, upper];
}

type Geometry = {
  width: number;
  height: number;
  /** the plot and the price rail together: the chart as the page sees it */
  rowWidth: number;
  paneWidth: number;
  paneHeight: number;
  strikeY: number;
  spotY: number | null;
  /** where the buyer's goal sits, when there is one and it is inside the pane */
  goalY: number | null;
  nowX: number | null;
};

/**
 * The chart's two draggable handles, the strike and a buyer's goal, are one control drawn twice,
 * and drawn small: a tag in the family of the chart's other labels (the NOW tag's box and type)
 * with an accent edge and two small glyphs to say it moves. No fill, no pulse: the lines they
 * ride carry the weight. Only the word differs: both sit at the right end of their lines, where
 * the price is headed. The tag is small, so its grab area reaches past it, to a finger's height
 * (`--grab`, less when the two tags are neighbours, so neither takes the other's press). On a
 * phone both are the price alone. The two are one width, set by the wider of them.
 */
const HANDLE =
  "group absolute z-[18] flex -translate-y-1/2 cursor-grab touch-none select-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[rgba(128,201,182,0.45)] bg-bg-primary/95 px-2.5 py-1.5 font-mono text-[12px] font-bold leading-[1.2] tracking-[-0.02em] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px] hover:border-accent-secondary active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary after:absolute after:-inset-x-1.5 after:inset-y-[calc(var(--grab,10px)*-1)] after:content-['']";
const HANDLE_ICON = "h-3.5 w-3.5 shrink-0 text-accent-secondary";
/** A part of a tag that is as wide as its own text or its twin's (`data-sizer`), whichever is
    wider: the two tags then come out one width, word under word and price under price. The
    twin's text is CSS content, so it is never read out or found as text. */

/** A handle tag's height and the least distance between two tags' centres, px. */
const HANDLE_HEIGHT = 28;
const HANDLE_GAP = HANDLE_HEIGHT + 2;
/** The least room between the strike line and the edge of the goal's tag, where the strike's
    own tag is in the rail and the line has to be seen running into it, px. */
const LINE_CLEAR = 3;
/** The price rail's text column: every value in it, the strike knot's price included, ends this
    far inside the rail's right edge. It is the knot's own inset (border 1 + padding 10): the
    rail is as wide as the knot, so the knot's box reaches the edge and its price stands under
    the ticks' prices. */
const RAIL_TEXT_INSET = 11;
/** How far a step arrow is from the knot's edge, px. One sits over the knot and one under it,
    in the rail's free left, so the knot reads as something that moves up and down. The knot's
    grab area in the rail reaches no further than this, so a press on an arrow is a step. */
const STEP_ARROW_GAP = 5;
/** Half the height of a rail tick (two 12px lines). A tick whose block would come closer to the
    knot than `RAIL_GAP` is not drawn. */
const RAIL_TICK_HALF = 14;
/** The height of one line of a rail tick: 12 px type at a line height of 1.15. */
const RAIL_LINE = 13.8;
const RAIL_GAP = 4;
/** How far a tag's grab area reaches past it, above and below, when it has the room, px. */
const HANDLE_GRAB = 10;
/** The highest a handle sits: clear of the expiry in the pane's top corner. */
const HANDLE_TOP = 50;

/**
 * Where the strike and goal tags sit. Each rides its own line. In one column (a phone: both at
 * the plot's right edge), where the lines are closer than a tag is tall the two step apart by
 * half the shortfall each, so both stay readable and each still touches its line; pushed against
 * the pane's top or bottom, the pair moves back inside together. In two columns (the strike in
 * the price rail) the strike's tag never moves: its line runs through the middle of it, and the
 * goal's tag keeps `LINE_CLEAR` off that line so the line is seen all the way to the knot.
 * `grab` is how far a tag's grab area may reach toward the other without overlapping it.
 */
export function handleTops({
  strikeY,
  goalY,
  goalAbove,
  top,
  bottom,
  sameColumn = true,
}: {
  strikeY: number;
  goalY: number | null;
  /** the goal is the higher of the two on screen (the belief is "above"); settles a tie */
  goalAbove: boolean;
  top: number;
  bottom: number;
  /** false where the strike's tag is in the price rail and the goal's in the plot: they cannot
      cover each other, so the strike's is not moved off its line */
  sameColumn?: boolean;
}): { strike: number; goal: number | null; grab: number } {
  const clamp = (y: number) => Math.min(Math.max(y, top), Math.max(top, bottom));
  if (goalY == null) return { strike: clamp(strikeY), goal: null, grab: HANDLE_GRAB };
  if (!sameColumn) {
    // the knot never leaves its line; the goal's tag only gives the strike line room to reach it
    const strike = clamp(strikeY);
    const clear = HANDLE_HEIGHT / 2 + LINE_CLEAR;
    const goalIsAbove = goalY === strikeY ? goalAbove : goalY < strikeY;
    let goal = clamp(goalY);
    if (Math.abs(goal - strike) < clear) goal = clamp(goalIsAbove ? strike - clear : strike + clear);
    return { strike, goal, grab: HANDLE_GRAB };
  }
  const above = goalY === strikeY ? goalAbove : goalY < strikeY;
  let upper = clamp(above ? goalY : strikeY);
  let lower = clamp(above ? strikeY : goalY);
  const short = HANDLE_GAP - (lower - upper);
  if (short > 0) {
    upper -= short / 2;
    lower += short / 2;
    const over = Math.max(top - upper, 0) - Math.max(lower - Math.max(top, bottom), 0);
    upper += over;
    lower += over;
  }
  const grab = Math.min(HANDLE_GRAB, Math.max(0, (lower - upper - HANDLE_HEIGHT) / 2));
  return { strike: above ? lower : upper, goal: above ? upper : lower, grab };
}

/**
 * How far across the plot the "now" line stands so that it is in the middle of the whole chart,
 * the plot and the price rail together: half the chart's width, as a share of the plot's. With
 * no rail that is one half. Never left of the plot's middle, and never past four fifths of it,
 * so the future always keeps a part of the plot.
 */
export function nowSplitFor(chartWidth: number, plotWidth: number): number {
  if (!(plotWidth > 0) || !(chartWidth > 0)) return 0.5;
  return Math.min(0.8, Math.max(0.5, Math.round((chartWidth / (2 * plotWidth)) * 1000) / 1000));
}

/** How far the pointer travels for one step of a dragged handle, px. */
const DRAG_STEP = 18;

/** The price rail is drawn from Tailwind's `md` up (its own `max-md:hidden`); below that the
    plot takes the full width. The strike's tag lives in the rail where there is one and at the
    plot's right edge where there is not, so the chart has to know which it is. */
const RAIL_QUERY = "(min-width: 768px)";
function subscribeRail(onChange: () => void) {
  const query = typeof window === "undefined" ? undefined : window.matchMedia?.(RAIL_QUERY);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
/** Whether the price rail is on screen. Where the browser cannot say, it is. */
function useRailShown(): boolean {
  return useSyncExternalStore(
    subscribeRail,
    () => window.matchMedia?.(RAIL_QUERY)?.matches ?? true,
    () => true,
  );
}

/**
 * A handle that steps through an ascending list of prices as it is dragged or arrowed: up is
 * always a higher price. It counts the pointer's travel, not its position, so the chart can
 * rescale under it mid-drag (a goal pulls the price range out with it) without the value
 * jumping. The goal handle uses it; the strike handle has the same behaviour of its own.
 */
function useStepHandle(pricesAsc: ReadonlyArray<number>, current: number | null, onPick: ((price: number) => void) | undefined) {
  const dragRef = useRef<{ pointerId: number; anchorY: number; index: number } | null>(null);
  const [grabbed, setGrabbed] = useState(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const nearestIndex = useCallback(() => {
    if (current == null) return -1;
    let best = -1;
    let bestDist = Infinity;
    pricesAsc.forEach((p, i) => {
      const d = Math.abs(p - current);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, [pricesAsc, current]);
  const step = useCallback(
    (index: number) => {
      const price = pricesAsc[index];
      if (price != null) pickRef.current?.(price);
    },
    [pricesAsc]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const index = nearestIndex();
      if (index < 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { pointerId: e.pointerId, anchorY: e.clientY, index };
      setGrabbed(true);
    },
    [nearestIndex]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      let { anchorY, index } = drag;
      let dy = anchorY - e.clientY; // > 0 when the pointer moved up
      const from = index;
      while (dy >= DRAG_STEP) {
        index = Math.min(index + 1, pricesAsc.length - 1);
        anchorY -= DRAG_STEP;
        dy -= DRAG_STEP;
      }
      while (dy <= -DRAG_STEP) {
        index = Math.max(index - 1, 0);
        anchorY += DRAG_STEP;
        dy += DRAG_STEP;
      }
      drag.anchorY = anchorY;
      if (index !== from) {
        drag.index = index;
        step(index);
      }
    },
    [pricesAsc.length, step]
  );
  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setGrabbed(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      let index = nearestIndex();
      if (index < 0) return;
      if (e.key === "ArrowUp") index = Math.min(index + 1, pricesAsc.length - 1);
      else if (e.key === "ArrowDown") index = Math.max(index - 1, 0);
      else if (e.key === "Home") index = 0;
      else if (e.key === "End") index = pricesAsc.length - 1;
      else return;
      e.preventDefault();
      step(index);
    },
    [nearestIndex, pricesAsc.length, step]
  );
  return { grabbed, handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onKeyDown } };
}

/** One strike the "your price" line can snap to: display price + the wire value to report. */
export type ChartStrike = { strike: number; strike1e9: number };

/** Position context for the profit-zone PnL readout: the side, the underlying units the
    position controls and the total premium in USDC (null when a buy's premium is only known
    from the quote). */
export type PnlContext = {
  side: "sell" | "buy";
  quantity: number;
  premium: number | null;
};

type FlipHintVariant = "current" | "underline" | "zones" | "axis" | "coach";

/** Pick an alternative flip affordance for review: `?flip=underline|zones|axis|coach`. */
function useFlipHintVariant(): FlipHintVariant {
  const [variant, setVariant] = useState<FlipHintVariant>("current");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("flip");
    if (v === "underline" || v === "zones" || v === "axis" || v === "coach") setVariant(v);
  }, []);
  return variant;
}

/** The flip control. Four presentations of the same action, so the affordance can be chosen
    without touching the mechanics: the pane still flips on a clean tap either way. */
function FlipAffordance({
  variant,
  swapping,
  onFlip,
  onSwapEnd,
}: {
  variant: FlipHintVariant;
  swapping: boolean;
  onFlip: () => void;
  onSwapEnd: () => void;
}) {
  const [coachSeen, setCoachSeen] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCoachSeen(window.localStorage.getItem("acta.flipCoachSeen") === "1");
  }, []);
  const markSeen = () => {
    setCoachSeen(true);
    try {
      window.localStorage.setItem("acta.flipCoachSeen", "1");
    } catch {
      /* private mode: the hint simply shows again next visit */
    }
  };

  if (variant === "zones") return null;

  // The default: a tag, not a button. It teaches that the surface is the control (the pane
  // itself is the flip target and the keyboard focus stop), so it must not look clickable
  // itself. Taps fall straight through it.
  return (
    <span
      aria-hidden="true"
      // dressed exactly as the NOW tag, so the chart's labels are one family
      className="pointer-events-none absolute bottom-[calc(var(--axis,28px)+10px)] left-[var(--centre,50%)] z-20 flex -translate-x-1/2 select-none items-center gap-1 whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
    >
      <span
        className="inline-block transition-transform duration-300 ease-out"
        style={{ transform: swapping ? "rotate(180deg)" : "none" }}
        onTransitionEnd={onSwapEnd}
      >
        <Chevron kind="switch" className="block h-3 w-3" />
      </span>
      <span className="uppercase tracking-[0.08em] max-md:hidden">click the chart to flip it</span>
      <span className="uppercase tracking-[0.08em] md:hidden">tap to flip it</span>
      {variant === "coach" && !coachSeen ? (
        <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-none border border-bg-border bg-bg-primary/95 px-1.5 py-1 text-[12px] tracking-normal text-content-primary shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
          tap anywhere on the chart to flip it
          <span className="absolute left-1/2 top-full -translate-x-1/2 leading-none text-content-secondary">
            ▾
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** A zone label that can become the flip control itself: in `zones` mode the tinted halves
    are labelled by buttons, so the sections read as the things you click. */
function ZoneChip({
  text,
  outcome,
  toneClass,
  x,
  y,
  interactive,
  onFlip,
}: {
  text: string;
  /** Which way this zone ends for the user: it sets the mark in front of the words. */
  outcome: "right" | "wrong";
  toneClass: string;
  x: number;
  y: number;
  interactive: boolean;
  onFlip: () => void;
}) {
  const base =
    "absolute z-[17] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius)] border border-bg-border bg-bg-primary/95 px-2 py-0.5 font-mono text-[12px] font-semibold tracking-[0.08em] backdrop-blur-[4px] shadow-[0_1px_5px_rgba(0,0,0,0.45)] transition-colors";
  // The same marks, at the same size, as the ticket's "If ..." labels under the chart: a green
  // check where the user is right, a red cross where they are wrong. Colour alone did not say
  // which zone was which; the profit zone had a typed tick and the other zone had nothing.
  const mark =
    outcome === "right" ? (
      <Check aria-hidden="true" data-zone-mark="right" className="mr-1 inline h-3 w-3 shrink-0 align-[-1px] text-additional-green-primary-deep" />
    ) : (
      <X aria-hidden="true" data-zone-mark="wrong" className="mr-1 inline h-3 w-3 shrink-0 align-[-1px] text-additional-red-primary" />
    );
  if (!interactive) {
    return (
      <span aria-hidden="true" className={cn(base, "pointer-events-none", toneClass)} style={{ left: x, top: y }}>
        {mark}
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={`Flip direction (${text})`}
      title="Tap to flip direction"
      className={cn(
        base,
        "pointer-events-auto cursor-pointer font-bold hover:border-content-secondary hover:text-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
        toneClass
      )}
      style={{ left: x, top: y }}
    >
      {mark}
      {text}
      <Chevron kind="switch" className="ml-1 inline h-3 w-3 opacity-50" />
    </button>
  );
}

export function ThesisChart({
  symbol,
  spot,
  strike,
  expiryMs,
  direction,
  side,
  right,
  wrong,
  onDirection,
  strikes,
  onStrike,
  pnl,
  frameless = false,
  legend = true,
  previewStrike = null,
  goal = null,
  goals,
  goalProfits,
  onGoal,
  title,
  expiries,
  onExpiry,
  readOnly = false,
  zoneWords,
}: {
  symbol: string;
  spot: number;
  strike: number;
  expiryMs: number;
  direction: Direction;
  /** sell (short) or buy (long): picks the wrong-zone label — assigned vs you lose premium */
  side: "sell" | "buy";
  right: ZoneLabel;
  wrong: ZoneLabel;
  onDirection?: (next: Direction) => void;
  /** Available strikes the draggable "your price" line snaps to. */
  strikes?: ReadonlyArray<ChartStrike>;
  /** Fired with the snapped strike's wire value (strike1e9). */
  onStrike?: (strike1e9: number) => void;
  /** Position context for the right-axis PnL readout; null hides the money. */
  pnl?: PnlContext | null;
  /** Render only the chart body; the parent supplies the card frame (summary + chart in one card). */
  frameless?: boolean;
  /** Show the two-outcome caption under the plot; off when the parent states the outcomes itself. */
  legend?: boolean;
  /** A strike being considered but not chosen (hovered in the strike menu): drawn as a ghost line. */
  previewStrike?: number | null;
  /** A buyer's goal, the price they think the asset reaches: a dashed line of its own with a
      "GOAL" tag carrying `label` (e.g. "$61,500 +$28.05"), and always inside the price range. */
  goal?: { price: number; label: string } | null;
  /** The goals on offer: with `onGoal`, the goal's tag is a handle that drags through them. */
  goals?: ReadonlyArray<number>;
  /** What the trade makes at each goal on offer, as the tag writes it ("+$28.05"): the tag
      keeps room for the longest, so it is one width while the goal is dragged. */
  goalProfits?: ReadonlyArray<string>;
  onGoal?: (price: number) => void;
  /** The expiries on offer, for a date that can be changed from the chart's tag. */
  expiries?: ReadonlyArray<{ value: string; label: string; detail?: string }>;
  /** Fired with an expiry's wire value (seconds) when the date is changed from the chart. */
  onExpiry?: (expiryTs: string) => void;
  /** Optional header title (the thesis sentence); falls back to "SYMBOL price last N". */
  title?: React.ReactNode;
  /** A trade already made (a Portfolio position): nothing to flip or drag, no example paths
      into the future, and the expiry is named in a tag of its own. */
  readOnly?: boolean;
  /** The two zone words, for an outcome the defaults would misname (a cash-settled product buys nothing). */
  zoneWords?: { right: string; wrong: string };
}) {
  /** Manual price-history pick from the 1D/1W/1M/3M buttons, scoped to the expiry it was made
      for. A date change drops it, so the scale follows the new date again. */
  const [manual, setManual] = useState<{ expiryMs: number; range: Range } | null>(null);

  // The expiry drives the default range (nearby dates show a day/week, month-out show a month);
  // a manual pick overrides it only for the date it was chosen on.
  const range: Range = manual && manual.expiryMs === expiryMs ? manual.range : rangeForExpiry(expiryMs, Date.now());
  const { points, loading } = usePriceHistory(symbol, range);
  const goalPrice = goal?.price ?? null;
  const goalLabel = goal?.label ?? null;
  const goalsAsc = useMemo(() => [...(goals ?? [])].sort((a, b) => a - b), [goals]);
  const goalHandle = useStepHandle(goalsAsc, goalPrice, onGoal);
  const goalDraggable = !readOnly && onGoal != null && goalsAsc.length > 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  /** True between chart.remove() and the next mount; pending timers and cleanups must not touch a disposed chart. */
  const disposedRef = useRef(false);
  const domainRef = useRef<[number, number]>([0, 1]);
  /** The history the domain was last fitted to. */
  const pointsRef = useRef<Point[] | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  /** the plot and the rail side by side: its width is the chart's as the page sees it */
  const rowRef = useRef<HTMLDivElement>(null);
  /** how far across the plot the "now" line stands: half where there is no rail */
  const [nowSplit, setNowSplit] = useState(0.5);
  /** One gentle attention pulse on the "your price" handle so its draggability reads at a glance. */
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 3200);
    return () => clearTimeout(t);
  }, []);

  /** The projection fan re-randomizes on a timer so the future always looks freshly drawn. */
  const [projectionSeed, setProjectionSeed] = useState(1);
  useEffect(() => {
    if (readOnly) return;
    const id = setInterval(() => setProjectionSeed((s) => s + 1), PROJECTION_REFRESH_MS);
    return () => clearInterval(id);
  }, [readOnly]);

  // The line ends on a live point at the current price, so it always meets the NOW tag. The
  // history (CoinGecko) and the live price (RFQ backend) are different sources and the history
  // can lag, which otherwise leaves the tag hanging above or below the end of the line. The
  // point's time is fixed per history load so a price tick moves it vertically only.
  const liveT = useMemo(
    () => (points.length ? Math.max(Date.now() / 1000, points[points.length - 1].t + 1) : null),
    [points]
  );
  const seriesData = useCallback(
    (live: number) => {
      const data = points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v }));
      if (liveT != null) data.push({ time: liveT as UTCTimestamp, value: live });
      return data;
    },
    [points, liveT]
  );
  const spotRef = useRef(spot);
  spotRef.current = spot;

  /** Read the chart's pixel geometry so the overlay (zones, "now" boundary, future fan) lines up. */
  const measure = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!series || !chart || !el) return;
    const width = el.clientWidth || 0;
    const height = el.clientHeight || CHART_HEIGHT;
    const pane = chart.paneSize?.() ?? { width, height };
    const rowWidth = rowRef.current?.clientWidth || width;
    // The chart's centre line is the page's (Tim, 28 Nov 2026): the "now" line stands in the
    // middle of the plot and the rail together, not of the plot alone, so the zone labels, the
    // NOW tag and the flip hint are over the middle of the button and the text under the
    // chart. The rail then counts as part of the future's half. With no rail it is the plot's
    // middle, as before.
    const split = nowSplitFor(rowWidth, pane.width || width);
    setNowSplit((was) => (was === split ? was : split));
    setGeometry({
      width,
      height,
      rowWidth,
      paneWidth: pane.width || width,
      paneHeight: pane.height || height,
      strikeY: series.priceToCoordinate(strike) ?? FALLBACK_STRIKE_Y,
      spotY: series.priceToCoordinate(spot) ?? null,
      goalY: goalPrice != null ? (series.priceToCoordinate(goalPrice) ?? null) : null,
      nowX: liveT != null ? chart.timeScale().timeToCoordinate(liveT as UTCTimestamp) : null,
    });
  }, [liveT, strike, spot, goalPrice]);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // The "your price" line is draggable: dragging steps through the available strikes, exactly
  // like the sentence's price dropdown. Strikes are sorted by price so dragging up always means
  // a higher strike and dragging down a lower one.
  const strikesAsc = useMemo(
    () => [...(strikes ?? [])].sort((a, b) => a.strike - b.strike),
    [strikes]
  );
  /** the price rail is on screen (not a phone): the strike's tag is the knot in it */
  const railShown = useRailShown();
  /** A held strike handle: where the pointer was at the last step, and the strike it is on. */
  const dragRef = useRef<{ pointerId: number; anchorY: number; index: number } | null>(null);
  /** The handle is held: its icon closes from an open hand to a grabbing one, as the cursor does. */
  const [grabbed, setGrabbed] = useState(false);
  const onStrikeRef = useRef(onStrike);
  onStrikeRef.current = onStrike;

  const nearestStrikeIndex = useCallback(
    (price: number) => {
      let best = -1;
      let bestDist = Infinity;
      strikesAsc.forEach((s, i) => {
        const d = Math.abs(s.strike - price);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    },
    [strikesAsc]
  );

  const stepStrike = useCallback(
    (index: number) => {
      const s = strikesAsc[index];
      if (s) onStrikeRef.current?.(s.strike1e9);
    },
    [strikesAsc]
  );

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // only the main button holds the handle: a right-button press opens the browser's menu,
      // which takes the release with it
      if (e.button !== 0) return;
      const index = nearestStrikeIndex(strike);
      if (index < 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = { pointerId: e.pointerId, anchorY: e.clientY, index };
      setGrabbed(true);
    },
    [nearestStrikeIndex, strike]
  );

  /** Let go of the handle. A release does not always reach the page (a browser menu, another
      window or a system gesture can take it), so the drag also ends when the capture is lost
      and when a move arrives with no button held. Without that a mouse keeps one pointer id
      for good, and every later pass over the handle would step the strike. */
  const endDrag = useCallback((el: HTMLDivElement, pointerId: number) => {
    if (dragRef.current?.pointerId !== pointerId) return;
    dragRef.current = null;
    setGrabbed(false);
    if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
  }, []);

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (e.buttons === 0) {
        endDrag(e.currentTarget, e.pointerId);
        return;
      }
      // One strike for every `DRAG_STEP` px the pointer travels, up for a higher strike. It
      // counts travel, not the price under the pointer: the strike stays at the pane's middle
      // and the chart scrolls past it, so the price under a still pointer changes with every
      // step, and reading it made a 30 px drag run through thirteen strikes.
      const STEP = DRAG_STEP;
      let { anchorY, index } = drag;
      const last = strikesAsc.length - 1;
      let dy = anchorY - e.clientY; // > 0 when the pointer moved up
      let stepped = false;
      while (dy >= STEP && index < last) {
        index += 1;
        anchorY -= STEP;
        dy -= STEP;
        stepped = true;
      }
      while (dy <= -STEP && index > 0) {
        index -= 1;
        anchorY += STEP;
        dy += STEP;
        stepped = true;
      }
      // Past the last strike either way there is nothing to count: the travel starts again
      // from where the pointer is, so turning back is one strike after one step's travel, not
      // after undoing the whole overshoot.
      if ((index === last && dy >= STEP) || (index === 0 && dy <= -STEP)) anchorY = e.clientY;
      drag.anchorY = anchorY;
      if (stepped) {
        drag.index = index;
        stepStrike(index);
      }
    },
    [strikesAsc.length, stepStrike, endDrag]
  );

  const onDragPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => endDrag(e.currentTarget, e.pointerId),
    [endDrag]
  );

  const onDragKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let index = nearestStrikeIndex(strike);
      if (index < 0) return;
      if (e.key === "ArrowUp") index = Math.min(index + 1, strikesAsc.length - 1);
      else if (e.key === "ArrowDown") index = Math.max(index - 1, 0);
      else if (e.key === "Home") index = 0;
      else if (e.key === "End") index = strikesAsc.length - 1;
      else return;
      e.preventDefault();
      stepStrike(index);
    },
    [nearestStrikeIndex, strike, strikesAsc.length, stepStrike]
  );

  /** Tap-to-flip: a clean tap (press and release within a few px, never a drag) on the chart
      pane toggles the direction, the same above↔below switch as the sentence's direction pill.
      The strike handle captures its own pointer, so a strike drag never reaches this surface,
      and the range tabs / strike handle sit above it in z-order. */
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const flipHint = useFlipHintVariant();
  const flipDirection = useCallback(() => {
    onDirection?.(direction === "above" ? "below" : "above");
  }, [onDirection, direction]);

  /** A one-shot cross-swap of the two direction arrows, fired whenever the direction flips so the
      change reads as an inversion instead of a silent state swap. Skips the initial mount (the
      ref starts on the first direction). */
  const [swapping, setSwapping] = useState(false);
  const prevDirectionRef = useRef(direction);
  useEffect(() => {
    if (prevDirectionRef.current !== direction) {
      prevDirectionRef.current = direction;
      setSwapping(true);
    }
  }, [direction]);
  const onChartPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // a right-button press is the browser's menu, not a flip
    tapStartRef.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  }, []);
  const onChartPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = tapStartRef.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) {
      tapStartRef.current = null;
    }
  }, []);
  const onChartPointerUp = useCallback(() => {
    if (tapStartRef.current) {
      tapStartRef.current = null;
      flipDirection();
    }
  }, [flipDirection]);
  const onChartPointerCancel = useCallback(() => {
    tapStartRef.current = null;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT,
        // the dates under the chart are set as the price rail beside it is: the same face, at
        // the rail's 12 px (Tim, 28 Nov 2026). The canvas cannot read a CSS variable, so the
        // face is taken as the page resolved it for this element.
        fontSize: 12,
        fontFamily: getComputedStyle(el).fontFamily || "monospace",
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: "transparent" } },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false, lockVisibleTimeRangeOnResize: true },
      // The right price scale is drawn by hand — an HTML column pairing each price tick with the
      // PnL at that price — so the native axis is hidden and the pane fills the card. Its margins
      // still drive the autoscale fit (the strike lands 38–62% so both zones have room).
      rightPriceScale: {
        visible: false,
        // the library lands the range's lower end a pixel higher than asked: one less at the foot evens it
        scaleMargins: { top: SCALE_MARGIN_PX / (CHART_HEIGHT - TIME_AXIS_HEIGHT), bottom: (SCALE_MARGIN_PX - 1) / (CHART_HEIGHT - TIME_AXIS_HEIGHT) },
      },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: LINE,
      lineWidth: 2,
      topColor: "rgba(240,240,240,0.14)",
      bottomColor: "rgba(240,240,240,0)",
      priceLineVisible: false,
      // fix the price range to history + spot + strike (strike lands 38–62% so both zones have room)
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: domainRef.current[0], maxValue: domainRef.current[1] },
      }),
    });
    chartRef.current = chart;
    seriesRef.current = series;
    // A canvas does not draw itself again when a web font arrives, so the face is asked for
    // (the axis sets plain and bold dates) and the axis drawn again once it is in.
    const axisFace = getComputedStyle(el).fontFamily;
    if (axisFace && document.fonts?.load) {
      void Promise.all([document.fonts.load(`12px ${axisFace}`), document.fonts.load(`bold 12px ${axisFace}`)])
        .then(() => {
          if (!disposedRef.current) chart.applyOptions({ layout: { fontFamily: axisFace } });
        })
        .catch(() => {});
    }

    const resize = () => {
      chart.applyOptions({ width: el.clientWidth || 640 });
      afterFrame(() => {
        if (!disposedRef.current) measureRef.current();
      });
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(el);
    }
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      ro?.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load the history and fix the time range. Keyed on `points` only, so a strike
  // change (clicking an outcome) never re-fits the time range.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = seriesData(spotRef.current);
    series.setData(data);
  }, [seriesData]);

  // The history / future split, idempotent: the "now" boundary sits `nowSplit` of the way
  // across the plot (the middle of the plot and the rail together), derived from the bar count
  // so repeated runs can't compound. (fitContent + readback applies asynchronously, so reading
  // the visible range right after it returned a stale, already-extended range that grew on
  // every re-run.) Runs again when the split changes: the rail appears, or its width changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const bars = seriesData(spotRef.current).length;
    if (bars > 0) chart.timeScale().setVisibleLogicalRange({ from: 0, to: (bars - 1) / nowSplit });
    afterFrame(() => {
      if (!disposedRef.current) measureRef.current();
    });
  }, [seriesData, nowSplit]);

  // The price domain depends on the data and on the strikes on offer, not on the chosen one:
  // choosing another strike moves the line and leaves the chart where it is. Re-apply it (and
  // re-autoscale) only when it really changes; this must not touch the time range. The live
  // spot is read here for the initial fit but is deliberately NOT a dependency: a spot tick
  // must not re-fit the view — that is what made the chart snap.
  const lowestStrike = Math.min(strike, ...strikesAsc.map((s) => s.strike));
  const highestStrike = Math.max(strike, ...strikesAsc.map((s) => s.strike));
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const [lo, hi] = centredPriceDomain([...points.map((p) => p.v), spot, ...(goalPrice != null ? [goalPrice] : [])], strike);
    if (pointsRef.current === points && lo === domainRef.current[0] && hi === domainRef.current[1]) {
      // same scale: only the line moved, so place the handle on it at once
    } else {
      pointsRef.current = points;
      domainRef.current = [lo, hi];
      series.setData(seriesData(spot));
    }
    // place at once, then on the next frame and the one after (the chart rescales over two),
    // and a slower settle: a drag changes the strike or the goal many times a second, and
    // waiting for it to stop left the tag behind its line until the pointer paused.
    const place = () => {
      if (!disposedRef.current) measureRef.current();
    };
    place();
    afterFrame(() => {
      place();
      afterFrame(place);
    });
    const t = setTimeout(place, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, strike, lowestStrike, highestStrike, goalPrice]);

  // A live spot tick only moves the line's last point and the NOW line/tag within the
  // stable range — re-measure, never re-fit.
  useEffect(() => {
    seriesRef.current?.setData(seriesData(spot));
    const t = setTimeout(() => {
      if (!disposedRef.current) measureRef.current();
    }, 0);
    return () => clearTimeout(t);
  }, [spot, seriesData]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    // Only "your price" is a native price line. The dim NOW line is drawn in the SVG
    // overlay so it can track a spot tick with a short transition instead of re-adding a
    // native line on every update. Native axis labels stay disabled (labels are HTML tags
    // pinned to their exact line instead).
    const strikeLine = series.createPriceLine({
      price: strike,
      color: STRIKE,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      lineVisible: true,
      axisLabelVisible: false,
      title: "",
    });
    return () => {
      if (disposedRef.current) return;
      series.removePriceLine(strikeLine);
    };
  }, [strike]);

  // The goal is a native price line too, dashed and in the accent; its tag is HTML, like the
  // chart's other labels, and is the handle that drags it.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || goalPrice == null) return;
    const goalLine = series.createPriceLine({
      price: goalPrice,
      color: GOAL,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: false,
      title: "",
    });
    return () => {
      if (disposedRef.current) return;
      series.removePriceLine(goalLine);
    };
  }, [goalPrice]);

  const low = points.length ? Math.min(...points.map((p) => p.v)) : null;
  const high = points.length ? Math.max(...points.map((p) => p.v)) : null;
  const strikeY = geometry?.strikeY ?? null;
  const spotY = geometry?.spotY ?? null;
  const nowX = geometry?.nowX ?? null;
  /** A position already held names its strike in the HISTORY half (left of the "now" boundary):
      there the pane's right corner holds the expiry. A trade being made has its strike handle at
      the right edge, beside the goal's. */
  const leftSectionCenterX = geometry
    ? nowX != null
      ? nowX / 2
      : geometry.rowWidth * 0.25 // no history → the middle of the history half
    : 0;

  // The zone labels sit in the chart's centre column, with the NOW tag and the flip hint, on
  // the "now" line: the middle of the plot and the rail together, which is the page's middle.
  const centreX = geometry ? (nowX ?? geometry.rowWidth / 2) : 0;
  const zoneChipX = centreX;
  /** the part of the plot the price has yet to cross: from the "now" line to its right edge */
  const rightPart = geometry ? geometry.paneWidth - centreX : 0;
  const narrowPane = geometry != null && rightPart < NARROW_RIGHT_PART;
  const strikeShown = formatStrikePrice(strike);
  // A tag in the plot says only what the pane has room for: its word and hand on a roomy pane
  // beside the rail, the profit unless the pane is narrow, on a phone the price alone.
  const wordShown = railShown && geometry != null && rightPart >= ROOMY_RIGHT_PART;
  const longest = (texts: ReadonlyArray<string>, start = "") => texts.reduce((w, t) => (t.length > w.length ? t : w), start);
  const widestStrike = longest(strikesAsc.map((s) => formatStrikePrice(s.strike)), strikeShown);
  // The goal's tag is its price, then what the trade makes there. The price stands right after
  // the word, the profit at the tag's right end, each in a slot as wide as the longest among
  // the goals on offer: the tag is one width while the goal is dragged, the spaces beside the
  // word and at the right end are the same in every state (Tim, 28 Nov 2026), and what room is
  // left over lies between the two numbers.
  const [goalPriceText = "", goalProfitText = ""] = goalLabel == null ? [] : goalLabel.split(" ");
  const profitShown = goalProfitText !== "" && !narrowPane;
  const widestGoalPrice = longest(goalsAsc.map((g) => formatStrikePrice(g)), goalPriceText);
  const widestGoalProfit = longest(goalProfits ?? [], goalProfitText);
  // With no rail the strike's tag shares the plot's right edge with the goal's, one over the
  // other, and the two are one width: each keeps room for what the other says.
  const goalTagText = profitShown ? `${widestGoalPrice} ${widestGoalProfit}` : widestGoalPrice;
  const stackedPrice = railShown ? widestGoalPrice : longest([widestStrike], widestGoalPrice);
  const stackedStrike = railShown ? strikeShown : longest([widestStrike], goalTagText);
  // Beside the rail the goal's tag stands in the middle of the chart's right half, the part
  // the price has yet to cross, clear of the NOW tag at the half's left edge; with no rail it
  // stays at the plot's right edge.
  const goalX = (() => {
    if (!geometry || !railShown) return null;
    const from = centreX;
    const half = (GOAL_TAG_CHROME + (wordShown ? GOAL_TAG_WORD : 0) + goalTagText.length * TAG_CH) / 2;
    const nowHalf = (`NOW ${formatUsdSmart(spot)}`.length * 7.9 + 18) / 2;
    const middle = (from + geometry.paneWidth) / 2;
    return Math.min(Math.max(middle, from + nowHalf + TAG_GAP + half), Math.max(geometry.paneWidth - 6 - half, middle));
  })();

  // the two handles, kept clear of the pane's corners and, where they share the plot's right
  // edge (no rail), of each other
  const tops = geometry
    ? handleTops({
        strikeY: geometry.strikeY,
        goalY: geometry.goalY,
        goalAbove: direction === "above",
        top: HANDLE_TOP,
        bottom: geometry.paneHeight - HANDLE_HEIGHT / 2 - 2,
        sameColumn: !railShown,
      })
    : null;
  // one control, drawn in the rail or, with no rail, at the plot's right edge
  const strikeSlider =
    strikesAsc.length > 1
      ? ({
          role: "slider",
          "aria-label": "Strike",
          "aria-orientation": "vertical",
          "aria-valuemin": strikesAsc[0].strike,
          "aria-valuemax": strikesAsc[strikesAsc.length - 1].strike,
          "aria-valuenow": strike,
          "aria-valuetext": formatStrikePrice(strike),
          tabIndex: 0,
          title: "Drag to change the strike",
          "data-testid": "chart-strike",
          onPointerDown: onDragPointerDown,
          onPointerMove: onDragPointerMove,
          onPointerUp: onDragPointerEnd,
          onPointerCancel: onDragPointerEnd,
          onLostPointerCapture: onDragPointerEnd,
          onKeyDown: onDragKeyDown,
        } as const)
      : null;
  const grabStyle = tops ? ({ "--grab": `${tops.grab}px` } as React.CSSProperties) : undefined;

  // The projection fan: two plausible price paths from the now price toward expiry — one that ends
  // in the money and one that ends out. Each endpoint lands in the outer half of its own zone, so
  // the pair ends far apart and reads as a clean profit-vs-loss story rather than a busy multi-line
  // fan. Re-derived whenever the seed, geometry, strike/spot or direction moves.
  const projectionPaths = useMemo(() => {
    // a position already held shows where the price is, not where it might go
    if (readOnly) return null;
    if (geometry == null || nowX == null || spotY == null || strikeY == null) return null;
    // The fan must live inside the future region: the end sits short of the pane's right edge
    // and every knot (start, wander, end) is clamped to a padded box.
    const endX = Math.max(nowX + 1, geometry.paneWidth - PROJECTION_PAD);
    const bounds: PathBounds = {
      minX: nowX,
      maxX: endX,
      minY: PROJECTION_PAD,
      maxY: Math.max(PROJECTION_PAD + 1, geometry.paneHeight - PROJECTION_PAD),
    };
    const wiggle = projectionWiggle(range, geometry.paneHeight);
    const [profitY, lossY] = scenarioEndpoints(projectionSeed * 7919 + 11, geometry.paneHeight, strikeY, spotY, direction);
    return {
      endX,
      profit: {
        y: profitY,
        d: projectionPath(nowX, spotY, endX, profitY, projectionSeed * 104729 + 23, PROJECTION_STEPS, wiggle, bounds),
      },
      loss: {
        y: lossY,
        d: projectionPath(nowX, spotY, endX, lossY, projectionSeed * 104729 + 124, PROJECTION_STEPS, wiggle, bounds),
      },
    };
  }, [readOnly, geometry, nowX, spotY, strikeY, projectionSeed, range, direction]);

  /** The right axis: a fixed number of evenly-spaced price ticks spanning the domain, each paired
      with its own money readout — "at this price, I make this much" in one place, the readout
      sharing the price's own tick line. A sized position shows its profit or loss in dollars at
      that price (a percentage of the premium read as a riddle); a buy whose premium is still
      unknown falls back to the gross dollar payout instead of a dash. No title — the
      numbers stand alone. The tick COUNT is pinned so the grid never jumps between 3 and 5 lines as
      the strike moves; only the labels recompute. Recomputed every render from `pnl` and
      `geometry`, so it tracks size, premium and strike without an effect. */
  const rightAxis = (() => {
    if (!geometry || !seriesRef.current) {
      return { ticks: [] as Array<{ y: number; price: string; readout: string | null }>, readoutLabel: null as string | null };
    }
    const [lo, hi] = domainRef.current;
    if (!(hi > lo)) return { ticks: [], readoutLabel: null };
    // When the premium is known the readout is the profit or loss at that price, and while a
    // buy's premium is still unknown it falls back to the gross payout: a number, never a dash.
    const sized = pnl && pnl.quantity > 0 && (pnl.side === "sell" ? pnl.premium != null : true) ? pnl : null;
    const priced = sized && !(sized.side === "buy" && sized.premium == null);
    const premium = sized?.premium ?? 0;
    const ticks: Array<{ y: number; price: string; readout: string | null }> = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const p = lo + ((hi - lo) * i) / (TICK_COUNT - 1);
      const y = seriesRef.current.priceToCoordinate(p);
      if (y == null || !Number.isFinite(y)) continue;
      ticks.push({
        y,
        price: formatUsdSmart(p),
        readout: sized
          ? priced
            ? formatSignedUsd(pnlAtPrice(sized.side, direction, strike, sized.quantity, premium, p))
            : formatSignedUsd(optionPayout(direction, strike, sized.quantity, p))
          : null,
      });
    }
    return { ticks, readoutLabel: sized ? (priced ? "Profit" : "Payout") : null };
  })();

  // The knot stands in for the tick at the strike: that one, and any other that would touch
  // the knot, is not drawn.
  const railTicks = rightAxis.ticks.filter(
    (t) => !(tops && strikeSlider && Math.abs(t.y - tops.strike) < HANDLE_HEIGHT / 2 + RAIL_TICK_HALF + RAIL_GAP),
  );
  /** Where a step arrow's middle is, in the rail. It sits on a line of text, as the "Price" and
      "Profit" words do (Tim, 28 Nov 2026: align it with the text next to it): the line nearest
      the knot of the tick next to the knot, so the upper arrow is on that tick's lower line and
      the lower arrow on its upper line. With no tick that side it stays beside the knot. */
  const stepArrowY = (step: 1 | -1): number | null => {
    if (!tops) return null;
    const side = railTicks.filter((t) => (step > 0 ? t.y < tops.strike : t.y > tops.strike));
    if (side.length === 0) return tops.strike - step * (HANDLE_HEIGHT / 2 + STEP_ARROW_GAP + 8);
    const next = side.reduce((a, b) => (Math.abs(a.y - tops.strike) <= Math.abs(b.y - tops.strike) ? a : b));
    // a tick is one line (its price) or two (its price over its readout), centred on its level
    return next.readout ? next.y + step * (RAIL_LINE / 2) : next.y;
  };

  /** The wrong-zone overlay label, in the outcome's own words. A short option that goes wrong is
      exercised against you: the deposit buys the asset (above) or the asset is sold (below).
      A long option forfeits the premium it paid. */
  const wrongZone = zoneWords?.wrong ?? (side === "sell" ? `YOU ${direction === "above" ? "BUY" : "SELL"} ${symbol}` : "YOU LOSE PREMIUM");
  // the zone is named after the mode's own word: you take profit in Profit and earn yield in Yield
  const rightZone = zoneWords?.right ?? (side === "sell" ? "YIELD ZONE" : "PROFIT ZONE");

  // Each zone's label has its place at its own end of the pane: the upper one under the range
  // tabs, the lower one above the flip hint. Nothing moves them: not the strike, the goal or the
  // direction, and not the live price, whose NOW tag steps around them instead.
  const paneBottom = geometry?.paneHeight ?? CHART_HEIGHT - TIME_AXIS_HEIGHT;
  // the time axis under the pane: the chart's box stops at its line
  const axisHeight = geometry ? Math.max(0, geometry.height - geometry.paneHeight) : TIME_AXIS_HEIGHT;
  // the flip hint lies under the lower label: with no hint there is room below it
  const hintShown = !readOnly && flipHint !== "zones";
  const topLabelY = zoneLabelY({
    home: ZONE_LABEL_INSET,
    min: ZONE_LABEL_INSET,
    max: strikeY == null ? ZONE_LABEL_INSET : strikeY - TAG_HALF - 2,
  });
  const bottomLabelY = zoneLabelY({
    home: paneBottom - ZONE_LABEL_INSET,
    min: strikeY == null ? paneBottom - ZONE_LABEL_INSET : strikeY + TAG_HALF + 2,
    max: paneBottom - ZONE_LABEL_INSET,
  });
  // The NOW tag sits just off the live-price dot instead of on it, so the end of the line and
  // the start of the projection stay visible: above the dot, always, stacked under a label that
  // is just over the dot and past one that is on it.
  const nowTagTop =
    spotY == null
      ? null
      : nowTagY({
          spotY,
          top: NOW_TAG_TOP,
          bottom: paneBottom - TAG_HALF - 2,
          // the two labels. Not the flip hint under the lower one: with the price down at the
          // pane's foot the tag stays over its dot and lies over the hint, which matters less
          taken: strikeY == null ? [] : [topLabelY, bottomLabelY].map((y) => [y - TAG_HALF, y + TAG_HALF] as const),
        });

  const body = (
    <>
      <style>{`@keyframes strike-pulse{0%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 0 rgba(42,162,134,0.55)}70%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 10px rgba(42,162,134,0)}100%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 0 rgba(42,162,134,0)}}@keyframes flip-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}@keyframes flip-swap-up{0%,30%{transform:translateY(0)}50%,80%{transform:translateY(100%)}100%{transform:translateY(0)}}@keyframes flip-swap-down{0%,30%{transform:translateY(0)}50%,80%{transform:translateY(-100%)}100%{transform:translateY(0)}}.flip-idle{animation:flip-idle 2.6s ease-in-out infinite}.flip-swapping .flip-arrow-up{animation:flip-swap-up 0.45s ease-in-out}.flip-swapping .flip-arrow-down{animation:flip-swap-down 0.45s ease-in-out}`}</style>
      <div className="min-w-0">
        {title ?? (
          <div className="font-mono text-[12px] font-semibold leading-[1.2] tracking-[-0.28px]">
            <span className="text-content-primary">{symbol} price</span>{" "}
            <span className="text-content-secondary">{RANGE_NAMES[range]}</span>
          </div>
        )}
      </div>

      <p className="sr-only">
        {`${symbol} is ${formatUsdSmart(spot)} now. Strike ${formatStrikePrice(strike)}, expiry ${formatExpiryDay(expiryMs)}.`}
        {low != null && high != null ? ` Over the ${RANGE_NAMES[range]} it ranged from ${formatUsdSmart(low)} to ${formatUsdSmart(high)}.` : ""}
        {` If you are right: ${right.title}. If you are wrong: ${wrong.title}.`}
      </p>

      <div
        ref={rowRef}
        className="relative isolate mt-3 flex"
        // `--centre` is the chart's centre line in the plot, for the flip hint
        style={{ height: CHART_HEIGHT, "--axis": `${axisHeight}px`, ...(geometry ? { "--centre": `${centreX}px` } : null) } as React.CSSProperties}
      >
        <div className="relative isolate min-w-0 flex-1">
        {/* The history window is a secondary, price-only control: the expiry sets the default
            range, and these buttons override just the scale without touching the date. Kept as a
            small overlay in the chart's top-left. */}
        <div
          role="tablist"
          aria-label="Price history range"
          className="absolute left-1.5 z-20 flex items-center gap-0.5 rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 p-0.5 font-mono shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
          style={{ top: TAB_ROW_TOP }}
        >
          {RANGES.map((o) => {
            const active = o.value === range;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setManual({ expiryMs, range: o.value })}
                className={cn(
                  "px-1.5 py-0.5 text-[12px] font-semibold leading-none tracking-[-0.28px] transition-colors",
                  active ? "bg-accent-primary/20 text-content-primary" : "text-content-secondary hover:text-content-primary"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* full-width price history */}
        <div
          ref={containerRef}
          // On Trade the flip surface lies over the plot and takes every pointer. Without it the
          // library would pan and zoom the plot under the mouse, away from the zones and tags
          // drawn over it, so a read-only plot takes no pointer at all.
          // `font-mono tabular-nums` is the price rail's own face, whatever font mode the app is in:
          // the canvas reads it from here for the dates under the chart
          className={cn("absolute inset-0 font-mono tabular-nums", loading && points.length > 0 && "opacity-50", readOnly && "pointer-events-none")}
          aria-label={`${symbol} price history. Use the arrow keys to read prices.`}
          tabIndex={points.length ? 0 : -1}
          role="img"
        />
        {!loading && points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-content-secondary">
            Price history unavailable
          </div>
        ) : null}
        {/* a held position's chart opens in a window with nothing else in it: while the first
            series is on its way, say so instead of showing two empty zones */}
        {readOnly && loading && points.length === 0 ? (
          <div role="status" className="absolute inset-0 flex items-center justify-center font-mono text-xs text-content-secondary">
            Loading price history…
          </div>
        ) : null}

        {/* price gridlines aligned to the right-axis ticks, so each money label reads against its level */}
        {geometry && rightAxis.ticks.length > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[1]"
            width="100%"
            height="100%"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {rightAxis.ticks.map((t, i) => (
              <line key={i} x1={0} y1={t.y} x2={geometry.paneWidth} y2={t.y} stroke={GRID} strokeWidth={1} />
            ))}
          </svg>
        ) : null}

        {/* tap-to-flip surface: a clean tap anywhere on the pane toggles direction. It sits at
            z-10 beneath the range tabs (z-20) and the strike handle (z-18), so pressing a
            control never flips; the zone/now overlays are pointer-events-none and pass taps
            straight through. */}
        {readOnly ? null : (
        <div
          data-testid="chart-flip-surface"
          className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
          role="button"
          tabIndex={0}
          aria-label="Flip direction"
          onPointerDown={onChartPointerDown}
          onPointerMove={onChartPointerMove}
          onPointerUp={onChartPointerUp}
          onPointerCancel={onChartPointerCancel}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              flipDirection();
            }
          }}
        />
        )}

        {/* above/below zones, split at the strike: the tint marks which half is profit (green)
            vs wrong (red). Purely visual — the flip is the full-pane surface above. */}
        {strikeY != null ? (
          <>
            <div
              aria-hidden="true"
              // the chart's box has the app's corner, as every tag and button on it does
              className="pointer-events-none absolute inset-x-0 top-0 rounded-tl-[var(--radius)] transition-colors duration-200"
              style={{ height: Math.max(0, strikeY), background: direction === "above" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.06)" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 rounded-bl-[var(--radius)] transition-colors duration-200"
              style={{ top: Math.max(0, strikeY), bottom: axisHeight, background: direction === "below" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.06)" }}
            />
            {/* zone labels: kept out of the click targets and lifted above the frosted future pane */}
            {(
              <ZoneChip
                text={direction === "above" ? rightZone : wrongZone}
                outcome={direction === "above" ? "right" : "wrong"}
                toneClass={direction === "above" ? "text-additional-green-primary-deep" : "text-additional-red-primary"}
                x={zoneChipX}
                y={topLabelY}
                interactive={!readOnly && flipHint === "zones"}
                onFlip={flipDirection}
              />
            )}
            {(
              <ZoneChip
                text={direction !== "above" ? rightZone : wrongZone}
                outcome={direction !== "above" ? "right" : "wrong"}
                toneClass={direction !== "above" ? "text-additional-green-primary-deep" : "text-additional-red-primary"}
                x={zoneChipX}
                y={bottomLabelY}
                interactive={!readOnly && flipHint === "zones"}
                onFlip={flipDirection}
              />
            )}
          </>
        ) : null}

        {/* "now" boundary + future region + profit/loss projection fan */}
        {geometry && nowX != null ? (
          <>
            <svg
              className="pointer-events-none absolute inset-0 z-[15]"
              width="100%"
              height="100%"
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* the present moment */}
              <line x1={nowX} y1={0} x2={nowX} y2={geometry.paneHeight} stroke={NOW_LINE} strokeWidth={1} strokeDasharray="4 4" />
              {/* the live "now" price line, tracking spot without re-fitting the view */}
              {spotY != null ? (
                <line
                  x1={0}
                  y1={spotY}
                  x2={geometry.paneWidth}
                  y2={spotY}
                  stroke={SPOT}
                  strokeWidth={1}
                />
              ) : null}
              {/* the live price itself: the dot where the history line ends and the projection
                  starts. It, the price's line and the NOW tag move with the chart, at once: the
                  canvas redraws in one frame, and a dot that slid after it for 180 ms hung off
                  the end of its line every time the strike or the price changed. */}
              {spotY != null ? (
                <circle
                  cx={nowX}
                  cy={spotY}
                  r={3.5}
                  fill={LINE}
                  stroke="rgba(18,18,18,0.9)"
                  strokeWidth={1.5}
                />
              ) : null}
              {/* projection fan: several plausible price paths from the now price toward expiry,
                  re-drawn on the refresh cadence so the future keeps morphing. */}
              {projectionPaths ? (
                <>
                  <path d={projectionPaths.profit.d} fill="none" stroke={PROFIT} strokeWidth={1.5} strokeLinecap="round" style={{ transition: "d 240ms ease-out" }} />
                  <path d={projectionPaths.loss.d} fill="none" stroke={LOSS} strokeWidth={1.5} strokeLinecap="round" style={{ transition: "d 240ms ease-out" }} />
                </>
              ) : null}
            </svg>
            {readOnly ? null : onExpiry && expiries && expiries.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const cur = String(Math.round(expiryMs / 1000));
                    const i = expiries.findIndex((o) => o.value === cur);
                    const next = expiries[(i + 1) % expiries.length];
                    onExpiry(next.value);
                  }}
                  aria-label={`Expiry ${formatExpiryDay(expiryMs)}. Change date`}
                  className="absolute right-1.5 top-[10px] z-[17] whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[0.08em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px] transition-colors hover:border-content-secondary"
                >
                  {formatExpiryDay(expiryMs).toUpperCase()}
                </button>
              ) : (
                <span
                  className="pointer-events-none absolute right-1.5 top-[10px] z-[17] whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[0.08em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
                  aria-hidden="true"
                >
                  {formatExpiryDay(expiryMs).toUpperCase()}
                </span>
              )}
          </>
        ) : null}

        {/* the date a held position runs to, named and boxed like the NOW tag: there it is a fact
            of the trade, so it is drawn whether or not the price history loaded */}
        {readOnly ? (
          <span
            data-testid="chart-expiry-tag"
            className="pointer-events-none absolute right-1.5 top-[10px] z-[17] whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
            aria-hidden="true"
          >
            <span className="tracking-[0.08em]">{formatExpiryDay(expiryMs).toUpperCase()}</span>
          </span>
        ) : null}

        {/* a strike being considered in the menu: a dashed ghost of the strike line with its price,
            so the choice can be read against the chart before it is made. Off the pane, it is not drawn. */}
        {(() => {
          if (previewStrike == null || !geometry || !seriesRef.current) return null;
          const y = seriesRef.current.priceToCoordinate(previewStrike);
          if (y == null || y < 0 || y > geometry.paneHeight) return null;
          return (
            <>
              <div
                aria-hidden="true"
                data-testid="chart-strike-preview"
                className="pointer-events-none absolute inset-x-0 z-[16] border-t border-dashed border-accent-primary"
                style={{ top: y }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 z-[17] -translate-y-1/2 whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary px-2 py-1 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)]"
                style={{ top: y }}
              >
                {formatStrikePrice(previewStrike)}
              </span>
            </>
          );
        })()}

        {/* "now" (spot) reference tag — pinned to the now boundary, just off the live-price
            dot, so it names the price without covering the end of the line. */}
        {geometry && nowX != null && spotY != null ? (
          <span
            // drawn over everything else on the pane: no line, chip or handle covers the live price
            className="pointer-events-none absolute z-[19] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius)] border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
            data-testid="chart-now"
            style={{ left: nowX, top: nowTagTop ?? spotY }}
            aria-hidden="true"
          >
            {/* every caps word on the chart wears the same tracking; numbers never do */}
            <span className="tracking-[0.08em]">NOW</span> {formatUsdSmart(spot)}
          </span>
        ) : null}

        {/* the strike line itself: a grab band across the pane at the strike price, so the
            line can be dragged as well as its tag. It stays on the line where the tag steps off */}
        {geometry && tops && strikesAsc.length > 1 ? (
          <div
            aria-hidden="true"
            title="Drag to change the strike"
            className="absolute inset-x-0 z-[15] -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
            style={{ top: geometry.strikeY, height: 14 }}
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerEnd}
            onPointerCancel={onDragPointerEnd}
            onLostPointerCapture={onDragPointerEnd}
          />
        ) : null}

        {/* The buyer's goal: a handle at the far end of its dashed line, where the price is
            headed, dragged through the goals on offer just as the strike handle is dragged
            through the strikes, and drawn exactly as it is. It keeps clear of the expiry tag in
            the corner above it and of the strike handle beside it. */}
        {geometry && tops && tops.goal != null && goalLabel ? (
          goalDraggable ? (
            <div
              role="slider"
              aria-label="Goal"
              aria-orientation="vertical"
              aria-valuemin={goalsAsc[0]}
              aria-valuemax={goalsAsc[goalsAsc.length - 1]}
              aria-valuenow={goalPrice ?? undefined}
              aria-valuetext={goalLabel}
              tabIndex={0}
              title="Drag to change your goal"
              data-testid="chart-goal"
              data-place={goalX != null ? "middle" : "edge"}
              className={cn(HANDLE, goalX != null ? "-translate-x-1/2" : "-translate-x-full")}
              style={{ left: goalX ?? geometry.paneWidth - 6, top: tops.goal, ...grabStyle }}
              {...goalHandle.handlers}
            >
              <span className="flex items-center gap-1" aria-hidden="true">
                <Chevron kind="switch" className={HANDLE_ICON} />
                {wordShown ? goalHandle.grabbed ? <Grab className={HANDLE_ICON} /> : <Hand className={HANDLE_ICON} /> : null}
              </span>
              {/* the word, the price right after it, and the profit at the right end */}
              <span className="flex items-baseline gap-2">
                {/* every caps word on the chart wears the same tracking; numbers never do */}
                {wordShown ? <span className="tracking-[0.08em]">GOAL</span> : null}
                <Sized text={goalPriceText} widest={profitShown ? widestGoalPrice : stackedPrice} />
                {profitShown ? <Sized text={goalProfitText} widest={widestGoalProfit} align="right" /> : null}
              </span>
            </div>
          ) : (
            <span
              className="pointer-events-none absolute z-[17] -translate-x-full -translate-y-1/2 whitespace-nowrap rounded-[var(--radius)] border border-[rgba(128,201,182,0.35)] bg-bg-primary/95 px-2 py-1 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-accent-secondary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
              style={{ left: geometry.paneWidth - 6, top: tops.goal }}
              data-testid="chart-goal"
              aria-hidden="true"
            >
              <span className="tracking-[0.08em]">GOAL</span> {profitShown ? goalLabel : goalPriceText}
            </span>
          )
        ) : null}

        {/* with no price rail (a phone) the strike's tag is at the right end of its line, under or
            over the goal's and drawn as the goal's is: the price alone */}
        {geometry && tops && strikeSlider && !railShown ? (
          <div
            {...strikeSlider}
            data-place="plot"
            // On a phone the two tags are a price each, one over the other. Each wears its own
            // line's colour so they can be told apart: this one the strike line's white (edge
            // and mark), the goal's the goal line's green.
            className={cn(HANDLE, "-translate-x-full border-[rgba(240,240,240,0.55)] hover:border-content-primary")}
            style={{ left: geometry.paneWidth - 6, top: tops.strike, ...grabStyle }}
          >
            {/* built as the goal's tag is, part for part, so the two come out one width */}
            <span className="flex items-center gap-1" aria-hidden="true">
              <Chevron kind="switch" className="h-3.5 w-3.5 shrink-0 text-content-primary" />
            </span>
            <span className="flex items-baseline gap-2">
              <Sized text={strikeShown} widest={stackedStrike} align="right" />
            </span>
          </div>
        ) : null}

        {/* a single strike cannot be dragged, but it sits where the handle would */}
        {geometry && tops && strikesAsc.length <= 1 ? (
          <span
            className={cn(
              "pointer-events-none absolute z-[16] -translate-y-1/2 whitespace-nowrap border border-accent-primary/30 bg-accent-primary/20 px-3 py-2 font-mono text-[12px] tracking-[-0.02em] font-semibold leading-[1.2] text-content-primary shadow-[0_2px_12px_rgba(0,0,0,0.7)] backdrop-blur-[4px]",
              readOnly || !tops ? "-translate-x-1/2" : "-translate-x-full",
            )}
            style={readOnly || !tops ? { left: leftSectionCenterX, top: geometry.strikeY } : { left: geometry.paneWidth - 6, top: tops.strike }}
            aria-hidden="true"
          >
            {readOnly ? <span className="tracking-[0.08em]">STRIKE </span> : null}
            {formatStrikePrice(strike)}
          </span>
        ) : null}

        {readOnly ? null : (
          <FlipAffordance
            variant={flipHint}
            swapping={swapping}
            onFlip={flipDirection}
            onSwapEnd={() => setSwapping(false)}
          />
        )}

        </div>
        {/* right axis: price + PnL at each tick, sharing the price's own line, and the strike's
            knot. Not on a phone: there the plot takes the full width, the strike's tag moves to
            the plot's right edge, it and the NOW tag carry the two prices that matter, and the
            outcomes are spelled out in the strip under the chart. */}
        {rightAxis.ticks.length > 0 || strikesAsc.length > 1 ? (
          <div
            data-testid="chart-price-rail"
            // as wide as the knot (the sizer below), never narrower than a tick's two numbers
            // with their two words in front, and as tall as the pane: it ends at the time
            // axis line, where the zones' tint ends
            className="relative min-w-[132px] shrink-0 self-start border-l border-bg-border max-md:hidden"
            style={{ height: CHART_HEIGHT - axisHeight }}
          >
            {/* One step up, one step down. The whole of the rail over the knot is one button and
                the whole of it under the knot another (Tim, 28 Nov 2026): a click anywhere in a
                section moves the strike one strike that way, as an arrow key does. Each carries
                a small arrow beside the knot, over its hand, so the knot reads as something that
                moves. Under the pointer a section that can move lights up in the knot's own
                green. One that cannot (the last strike that way) is simply disabled: no colour,
                no change under the pointer, its arrow dim (Tim, 28 Nov 2026: not red). Out of
                the tab order: the knot has the keys. They come first, so the ticks are drawn
                over them. */}
            {geometry && tops && strikeSlider && railShown
              ? ([1, -1] as const).map((step) => {
                  const to = nearestStrikeIndex(strike) + step;
                  const off = to < 0 || to > strikesAsc.length - 1 || to - step < 0;
                  const edge = HANDLE_HEIGHT / 2;
                  // the arrow's box is 16 px: its middle on its line, measured from this section's top
                  const arrowTop = (stepArrowY(step) ?? tops.strike) - 8 - (step > 0 ? 0 : tops.strike + edge);
                  return (
                    <button
                      key={step}
                      type="button"
                      tabIndex={-1}
                      disabled={off}
                      // named for assistive tech only: a `title` here put the browser's tooltip
                      // over the legend's numbers whenever the pointer rested on it
                      aria-label={step > 0 ? "Higher strike" : "Lower strike"}
                      data-testid={step > 0 ? "strike-up" : "strike-down"}
                      onClick={() => stepStrike(to)}
                      // the app's corner, as the knot between them and every other button has
                      className="group absolute inset-x-0 rounded-[var(--radius)] transition-colors duration-150 enabled:cursor-pointer enabled:hover:bg-[rgba(128,201,182,0.08)] enabled:active:bg-[rgba(128,201,182,0.16)] disabled:cursor-default"
                      style={step > 0 ? { top: 0, height: Math.max(0, tops.strike - edge) } : { top: tops.strike + edge, bottom: 0 }}
                    >
                      <Chevron
                        kind="menu"
                        className={cn(
                          // its drawn corner starts 4 px inside its box: at 6 the arrow's left edge is on
                          // the rail's left text edge, with the knot's hand and the "Price" / "Profit" words
                          "absolute left-[6px] h-4 w-4 text-accent-secondary transition-colors group-enabled:group-hover:text-content-primary group-disabled:opacity-25",
                          step > 0 && "rotate-180",
                        )}
                        style={{ top: arrowTop }}
                      />
                    </button>
                  );
                })
              : null}
            {/* What makes the rail as wide as the knot: the knot's own box and words, unseen and
                with no height, saying the widest strike on offer, so the rail does not change
                width as the strike is dragged. */}
            {strikeSlider && railShown ? (
              <div
                aria-hidden="true"
                data-testid="chart-rail-sizer"
                className="invisible flex h-0 items-center gap-1.5 overflow-hidden whitespace-nowrap border-x border-transparent px-2.5 font-mono text-[12px] font-bold tracking-[-0.02em]"
              >
                <span className={HANDLE_ICON} />
                <span className="flex items-baseline gap-2">
                  <span className="tracking-[0.08em]">STRIKE</span>
                  <span className="tabular-nums">{widestStrike}</span>
                </span>
              </div>
            ) : null}
            {/* the strike as a fixed knot on the end of its line: dragging steps the strike while
                the knot stays put and the chart scrolls past it */}
            {geometry && tops && strikeSlider && railShown ? (
              <div
                {...strikeSlider}
                data-place="rail"
                className={HANDLE}
                // From the plot's edge (over the rail's own border, so the line runs into it) to
                // the rail's right edge, which is its own width away: its price then ends where
                // every tick's price ends.
                style={{ top: tops.strike, left: -1, right: 0, "--grab": `${STEP_ARROW_GAP - 2}px` } as React.CSSProperties}
              >
                <span className="flex items-center gap-1" aria-hidden="true">
                  {/* an open hand at rest, a closed one while held */}
                  {grabbed ? (
                    <Grab data-testid="strike-hand" data-grabbed="true" className={HANDLE_ICON} />
                  ) : (
                    <Hand data-testid="strike-hand" data-grabbed="false" className={HANDLE_ICON} />
                  )}
                </span>
                {/* the word, then the price, which keeps the right end, as in the goal's tag */}
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span className="tracking-[0.08em]">STRIKE</span>
                  <span className="tabular-nums">{strikeShown}</span>
                </span>
              </div>
            ) : null}
            {(() => {
              const drawn = railTicks;
              // What the two numbers at each tick are is said once, on the profit side (Tim, 28
              // Nov 2026): at the rail's outermost tick where the user is right, the top one for
              // "above" and the bottom one for "below", so "Profit" always names a gain. The
              // words are pinned to the rail's left, under the knot's hand, and the numbers keep
              // the right, so each word is on its own number's line.
              const ys = drawn.map((t) => t.y);
              const keyY = direction === "above" ? Math.min(...ys) : Math.max(...ys);
              return drawn.map((t) => {
                const key = t.y === keyY;
                const row = key ? "flex justify-between gap-2" : undefined;
                return (
                  <div
                    key={t.y}
                    data-testid={key ? "chart-rail-key" : undefined}
                    className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-right font-mono text-[12px] font-semibold tracking-[-0.02em] leading-[1.15] tabular-nums"
                    style={{ top: t.y, right: RAIL_TEXT_INSET, left: key ? RAIL_TEXT_INSET - 1 : undefined }}
                  >
                    <div className={cn("text-content-secondary", row)}>
                      {key ? <span>Price</span> : null}
                      <span>{t.price}</span>
                    </div>
                    {t.readout ? (
                      <div className={cn(readoutTone(t.readout), row)}>
                        {key && rightAxis.readoutLabel ? <span className="text-accent-primary">{rightAxis.readoutLabel}</span> : null}
                        <span>{t.readout}</span>
                      </div>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
        ) : null}
      </div>

      {/* the two outcomes, one plain compact caption below the plot — kept out of the data
          instead of floated over it. The strike already reads on the chart and in the terms. */}
      {legend ? (
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs font-semibold leading-[1.35] text-content-primary">
        <span className="flex items-center gap-1.5">
          <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-additional-green-primary-deep" />
          {right.title}
        </span>
        <span className="flex items-center gap-1.5">
          <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-additional-red-primary" />
          {wrong.title}
        </span>
      </div>
      ) : null}
    </>
  );

  return frameless ? body : <AppCard className="p-4 max-md:p-3">{body}</AppCard>;
}
