"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Check, Grab, MoveVertical, X } from "lucide-react";
import { AreaSeries, createChart, ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { cn } from "@/lib/cn";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
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

const CHART_HEIGHT = 280;
/** Slim column on the right that pairs each price tick with the return at that price. */
const PRICE_COLUMN_WIDTH = 64;
/** Fixed number of right-axis ticks: the grid count stays put while the labels recompute. */
const TICK_COUNT = 5;
const FALLBACK_STRIKE_Y = 130;

function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Price history from CoinGecko via `/api/market/history`; a range change keeps the old series until the new one lands. */
function usePriceHistory(symbol: string, range: Range) {
  const [state, setState] = useState<{ symbol: string; range: Range; points: Point[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((res) => res.json() as Promise<{ points?: Array<[number, number]> }>)
      .then((data) => {
        if (!alive) return;
        const points = (data.points ?? [])
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .map(([ms, v]) => ({ t: ms / 1000, v }))
          .sort((a, b) => a.t - b.t);
        setState({ symbol, range, points: downsample(points, MAX_POINTS) });
      })
      .catch(() => {
        if (alive) setState({ symbol, range, points: [] });
      });
    return () => {
      alive = false;
    };
  }, [symbol, range]);

  const sameAsset = state?.symbol === symbol;
  return {
    points: sameAsset ? state.points : [],
    loading: !sameAsset || state.range !== range,
  };
}

/** Price domain covering history, spot and strike, padded, with the strike kept off the edges. */
export function priceDomain(values: number[], strike: number | null): [number, number] {
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
  if (strike != null) {
    const margin = 0.38;
    if (strike - lo < margin * (hi - lo)) lo = (strike - margin * hi) / (1 - margin);
    if (hi - strike < margin * (hi - lo)) hi = (strike - margin * lo) / (1 - margin);
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

/** A signed percentage for the return readout: "+100%", "-42%", "0%". */
function formatReturnPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.05) return "0%";
  const body = `${abs >= 100 ? `${Math.round(abs)}` : abs.toFixed(1).replace(/\.0$/, "")}%`;
  return pct > 0 ? `+${body}` : `-${body}`;
}

/** A signed dollar readout for the gross-payout fallback: "+$42.00", "$0.00". The gross payout
    is never negative, so only the positive sign is added — zero stays plain. */
function formatSignedUsd(usd: number): string {
  return usd > 0 ? `+${formatUsdSmart(usd)}` : formatUsdSmart(usd);
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
const SPOT = "rgba(240,240,240,0.30)";
const GRID = "rgba(240,240,240,0.05)";
const BORDER = "rgba(240,240,240,0.10)";
const TEXT = "rgba(240,240,240,0.55)";
const NOW_LINE = "rgba(240,240,240,0.35)";
/** Projection fan: sage green for scenarios that end profitable, dusty red for those that don't.
    Solid hues at reduced alpha so the synthetic paths recede behind the live history. */
const PROFIT = "rgba(92,168,124,0.60)";
const LOSS = "rgba(194,104,104,0.60)";

/** Collision: lift the NOW tag vertically off the strike line when the two would overlap. */
const NOW_TAG_HALF = 9;
const STRIKE_TAG_HALF = 13;
const TAG_CLEARANCE = NOW_TAG_HALF + STRIKE_TAG_HALF + 6;

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
  paneWidth: number;
  paneHeight: number;
  strikeY: number;
  spotY: number | null;
  nowX: number | null;
};

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
  title,
}: {
  symbol: string;
  spot: number;
  strike: number;
  expiryMs: number;
  direction: Direction;
  /** sell (short) or buy (long): picks the wrong-zone label — assigned vs premium lost */
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
  /** Optional header title (the thesis sentence); falls back to "SYMBOL price last N". */
  title?: React.ReactNode;
}) {
  const [range, setRange] = useState<Range>("1d");
  const { points, loading } = usePriceHistory(symbol, range);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const domainRef = useRef<[number, number]>([0, 1]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  /** One gentle attention pulse on the "your price" handle so its draggability reads at a glance. */
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 3200);
    return () => clearTimeout(t);
  }, []);

  /** The projection fan re-randomizes on a timer so the future always looks freshly drawn. */
  const [projectionSeed, setProjectionSeed] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setProjectionSeed((s) => s + 1), PROJECTION_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  /** Read the chart's pixel geometry so the overlay (zones, "now" boundary, future fan) lines up. */
  const measure = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!series || !chart || !el) return;
    const width = el.clientWidth || 0;
    const height = el.clientHeight || CHART_HEIGHT;
    const pane = chart.paneSize?.() ?? { width, height };
    const last = points[points.length - 1];
    setGeometry({
      width,
      height,
      paneWidth: pane.width || width,
      paneHeight: pane.height || height,
      strikeY: series.priceToCoordinate(strike) ?? FALLBACK_STRIKE_Y,
      spotY: series.priceToCoordinate(spot) ?? null,
      nowX: last ? chart.timeScale().timeToCoordinate(last.t as UTCTimestamp) : null,
    });
  }, [points, strike, spot]);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // The "your price" line is draggable: dragging steps through the available strikes, exactly
  // like the sentence's price dropdown. Strikes are sorted by price so dragging up always means
  // a higher strike and dragging down a lower one.
  const strikesAsc = useMemo(
    () => [...(strikes ?? [])].sort((a, b) => a.strike - b.strike),
    [strikes]
  );
  const dragRef = useRef<{ pointerId: number; anchorY: number; index: number } | null>(null);
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
      const index = nearestStrikeIndex(strike);
      if (index < 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { pointerId: e.pointerId, anchorY: e.clientY, index };
    },
    [nearestStrikeIndex, strike]
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const STEP = 18;
      let { anchorY, index } = drag;
      let dy = anchorY - e.clientY; // > 0 when the pointer moved up
      let stepped = false;
      while (dy >= STEP) {
        index = Math.min(index + 1, strikesAsc.length - 1);
        anchorY -= STEP;
        dy -= STEP;
        stepped = true;
      }
      while (dy <= -STEP) {
        index = Math.max(index - 1, 0);
        anchorY += STEP;
        dy += STEP;
        stepped = true;
      }
      if (stepped) {
        drag.anchorY = anchorY;
        drag.index = index;
        stepStrike(index);
      }
    },
    [strikesAsc.length, stepStrike]
  );

  const onDragPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  }, []);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: "'Courier New', Menlo, monospace",
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: "transparent" } },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false, lockVisibleTimeRangeOnResize: true },
      // The right price scale is drawn by hand — an HTML column pairing each price tick with the
      // PnL at that price — so the native axis is hidden and the pane fills the card. Its margins
      // still drive the autoscale fit (the strike lands 38–62% so both zones have room).
      rightPriceScale: { visible: false, scaleMargins: { top: 0.05, bottom: 0.12 } },
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

    const resize = () => {
      chart.applyOptions({ width: el.clientWidth || 640 });
      afterFrame(() => measureRef.current());
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(el);
    }
    return () => {
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
    const data = points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v }));
    series.setData(data);
    if (data.length > 0) {
      // Idempotent 62% history / 38% future split, derived from the bar count so
      // repeated runs can't compound. (fitContent + readback applies asynchronously,
      // so reading the visible range right after it returned a stale, already-extended
      // range that grew on every re-run.)
      const from = 0;
      const to = data.length - 1;
      const span = to - from;
      chart.timeScale().setVisibleLogicalRange({ from, to: to + span * 0.62 });
    }
  }, [points]);

  // The price domain depends on the data and the strike. Re-apply it (and re-autoscale)
  // only when either changes; this must not touch the time range. The live spot is read
  // here for the initial fit but is deliberately NOT a dependency: a spot tick must not
  // re-fit the view — that is what made the chart snap.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    domainRef.current = priceDomain([...points.map((p) => p.v), spot], strike);
    series.setData(points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v })));
    const t = setTimeout(() => measureRef.current(), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, strike]);

  // A live spot tick only moves the NOW line/tag within the stable range — re-measure,
  // never re-fit.
  useEffect(() => {
    const t = setTimeout(() => measureRef.current(), 0);
    return () => clearTimeout(t);
  }, [spot]);

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
      series.removePriceLine(strikeLine);
    };
  }, [strike]);

  const low = points.length ? Math.min(...points.map((p) => p.v)) : null;
  const high = points.length ? Math.max(...points.map((p) => p.v)) : null;
  const strikeY = geometry?.strikeY ?? null;
  const spotY = geometry?.spotY ?? null;
  const nowX = geometry?.nowX ?? null;
  /** The "your price" badge lives in the HISTORY half (left of the "now" boundary), centred under
      the history plot rather than in the future region. */
  const leftSectionCenterX = geometry
    ? nowX != null
      ? nowX / 2
      : geometry.paneWidth * 0.31 // no history → the 62/38 split's left-half centre
    : 0;

  // The zone labels belong to the FUTURE outcome region, not the history side: they sit just
  // past the "now" boundary, horizontally centred in the future strip (now → pane edge) and
  // vertically centred in their own zone. (Tim: "close to the now … on those new sectors.")
  const futureCenterX = geometry
    ? nowX != null
      ? nowX + (geometry.paneWidth - nowX) / 2
      : geometry.paneWidth * 0.81 // no history → same 62/38 spot the "now" line would occupy
    : 0;
  const topZoneCenterY = strikeY != null ? strikeY / 2 : 0;
  const bottomZoneCenterY = strikeY != null ? strikeY + (CHART_HEIGHT - strikeY) / 2 : 0;

  // Keep the NOW tag legible: when the strike line drifts into the live price, lift the tag
  // off it (with a leader line back to the spot) so the two tags never collide.
  let nowTagY: number | null = spotY;
  let nowTagDisplaced = false;
  if (spotY != null && strikeY != null) {
    const dy = spotY - strikeY;
    if (Math.abs(dy) < TAG_CLEARANCE) {
      nowTagDisplaced = true;
      nowTagY = dy >= 0 ? strikeY + TAG_CLEARANCE : strikeY - TAG_CLEARANCE;
      const minY = NOW_TAG_HALF + 4;
      const maxY = (geometry?.paneHeight ?? CHART_HEIGHT) - NOW_TAG_HALF - 4;
      nowTagY = Math.min(Math.max(nowTagY, minY), maxY);
    }
  }

  // The projection fan: two plausible price paths from the now price toward expiry — one that ends
  // in the money and one that ends out. Each endpoint lands in the outer half of its own zone, so
  // the pair ends far apart and reads as a clean profit-vs-loss story rather than a busy multi-line
  // fan. Re-derived whenever the seed, geometry, strike/spot or direction moves.
  const projectionPaths = useMemo(() => {
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
  }, [geometry, nowX, spotY, strikeY, projectionSeed, range, direction]);

  /** The right axis: a fixed number of evenly-spaced price ticks spanning the domain, each paired
      with its own money readout — "at this price, I make this much" in one place, the readout
      sharing the price's own tick line. A sized position shows the return on premium; a buy whose
      quote is still unknown falls back to the gross dollar payout instead of a dash. No title — the
      numbers stand alone. The tick COUNT is pinned so the grid never jumps between 3 and 5 lines as
      the strike moves; only the labels recompute. Recomputed every render from `pnl` and
      `geometry`, so it tracks size, premium and strike without an effect. */
  const rightAxis = (() => {
    if (!geometry || !seriesRef.current) {
      return { ticks: [] as Array<{ y: number; price: string; readout: string | null }> };
    }
    const [lo, hi] = domainRef.current;
    if (!(hi > lo)) return { ticks: [] };
    // When the premium is priced the readout is a return %, and while a buy's quote is still
    // unknown it falls back to the gross dollar payout at that price — a number, never a dash.
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
            ? formatReturnPct(returnPctAtPrice(sized.side, direction, strike, sized.quantity, premium, p))
            : formatSignedUsd(optionPayout(direction, strike, sized.quantity, p))
          : null,
      });
    }
    return { ticks };
  })();

  /** The wrong-zone overlay label: a short option keeps its premium, so going wrong means the
      option is exercised against you ("assigned"); a long option forfeits the premium it paid. */
  const wrongZone = side === "sell" ? "ASSIGNED" : "PREMIUM LOST";

  const body = (
    <>
      <style>{`@keyframes strike-pulse{0%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 0 rgba(42,162,134,0.55)}70%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 10px rgba(42,162,134,0)}100%{box-shadow:0 2px 14px rgba(0,0,0,0.55),0 0 0 0 rgba(42,162,134,0)}}`}</style>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title ?? (
            <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px]">
              <span className="text-content-primary">{symbol} price</span>{" "}
              <span className="text-content-secondary">{RANGE_NAMES[range]}</span>
            </div>
          )}
        </div>
        <AppSegmented ariaLabel="Price history range" value={range} onChange={setRange} options={RANGES} className="shrink-0" />
      </div>

      <p className="sr-only">
        {`${symbol} is ${formatUsdSmart(spot)} now. Strike ${formatStrikePrice(strike)}, expiry ${formatExpiryDay(expiryMs)}.`}
        {low != null && high != null ? ` Over the ${RANGE_NAMES[range]} it ranged from ${formatUsdSmart(low)} to ${formatUsdSmart(high)}.` : ""}
        {` If you are right: ${right.title}. If you are wrong: ${wrong.title}.`}
      </p>

      <div className="relative isolate mt-3 flex" style={{ height: CHART_HEIGHT }}>
        <div className="relative isolate min-w-0 flex-1">
        {/* full-width price history */}
        <div
          ref={containerRef}
          className={cn("absolute inset-0", loading && points.length > 0 && "opacity-50")}
          aria-label={`${symbol} price history. Use the arrow keys to read prices.`}
          tabIndex={points.length ? 0 : -1}
          role="img"
        />
        {!loading && points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-content-secondary">
            Price history unavailable
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

        {/* clickable above/below zones, split at the strike */}
        {strikeY != null ? (
          <>
            <button
              type="button"
              onClick={() => onDirection?.("above")}
              className="absolute inset-x-0 top-0 z-10 cursor-pointer text-left transition hover:brightness-125"
              style={{ height: Math.max(0, strikeY), background: direction === "above" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.06)" }}
              aria-label={`Profit if ${symbol} settles above the strike`}
            />
            <button
              type="button"
              onClick={() => onDirection?.("below")}
              className="absolute inset-x-0 z-10 cursor-pointer text-left transition hover:brightness-125"
              style={{ top: Math.max(0, strikeY), bottom: 0, background: direction === "below" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.06)" }}
              aria-label={`Profit if ${symbol} settles below the strike`}
            />
            {/* zone labels: kept out of the click targets and lifted above the frosted future pane */}
            <span
              className={cn(
                "pointer-events-none absolute z-[17] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-bg-border bg-bg-primary/95 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider backdrop-blur-[4px] shadow-[0_1px_5px_rgba(0,0,0,0.45)]",
                direction === "above" ? "text-additional-green-primary-deep" : "text-additional-red-primary"
              )}
              style={{ left: futureCenterX, top: topZoneCenterY }}
              aria-hidden="true"
            >
              {direction === "above" ? "✓ PROFIT ZONE" : wrongZone}
            </span>
            <span
              className={cn(
                "pointer-events-none absolute z-[17] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-bg-border bg-bg-primary/95 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider backdrop-blur-[4px] shadow-[0_1px_5px_rgba(0,0,0,0.45)]",
                direction !== "above" ? "text-additional-green-primary-deep" : "text-additional-red-primary"
              )}
              style={{ left: futureCenterX, top: bottomZoneCenterY }}
              aria-hidden="true"
            >
              {direction !== "above" ? "✓ PROFIT ZONE" : wrongZone}
            </span>
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
                  style={{ transition: "y1 180ms ease-out, y2 180ms ease-out" }}
                />
              ) : null}
              {/* leader from the lifted NOW tag back to the live price, drawn only on collision */}
              {nowTagDisplaced && nowTagY != null && spotY != null ? (
                <line
                  x1={nowX}
                  y1={spotY}
                  x2={nowX}
                  y2={nowTagY}
                  stroke={SPOT}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  style={{ transition: "y1 180ms ease-out, y2 180ms ease-out" }}
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
            <span
              className="pointer-events-none absolute right-1.5 top-1 z-[17] font-mono text-[10px] text-content-secondary"
              aria-hidden="true"
            >
              → {formatExpiryDay(expiryMs)}
            </span>
          </>
        ) : null}

        {/* "now" (spot) reference tag — pinned to the now boundary at the live price, so it
            sits closer to the centre instead of duplicating the right-edge axis label. */}
        {geometry && nowX != null && spotY != null ? (
          <span
            className="pointer-events-none absolute z-[17] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[rgba(240,240,240,0.1)] bg-bg-primary/95 px-2 py-1 font-mono text-[10px] font-semibold leading-[1.2] text-content-primary shadow-[0_1px_8px_rgba(0,0,0,0.85)] backdrop-blur-[4px]"
            style={{ left: nowX, top: nowTagY ?? spotY, transition: "top 180ms ease-out, left 180ms ease-out" }}
            aria-hidden="true"
          >
            NOW {formatUsdSmart(spot)}
          </span>
        ) : null}

        {/* "your price" — the star: a centered, draggable handle pinned to the strike line */}
        {geometry && strikesAsc.length > 1 ? (
          <div
            role="slider"
            aria-label="Strike"
            aria-orientation="vertical"
            aria-valuemin={strikesAsc[0].strike}
            aria-valuemax={strikesAsc[strikesAsc.length - 1].strike}
            aria-valuenow={strike}
            aria-valuetext={formatStrikePrice(strike)}
            tabIndex={0}
            title="Drag to change the strike"
            className="group absolute z-[18] flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none items-center gap-2 rounded-md border border-accent-primary/30 bg-accent-primary/20 px-3 py-2 font-mono shadow-[0_2px_16px_rgba(0,0,0,0.7)] backdrop-blur-[4px] active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            style={{ left: leftSectionCenterX, top: geometry.strikeY, animation: pulse ? "strike-pulse 1.4s ease-out 2" : undefined }}
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerEnd}
            onPointerCancel={onDragPointerEnd}
            onKeyDown={onDragKeyDown}
          >
            <span className="flex items-center gap-0.5" aria-hidden="true">
              <MoveVertical className="h-4 w-4 shrink-0 text-content-primary" />
              <Grab className="h-4 w-4 shrink-0 text-content-primary" />
            </span>
            <span className="text-[9px] uppercase tracking-widest text-content-primary">Strike</span>
            <span className="text-[12px] font-semibold tabular-nums text-content-primary">{formatStrikePrice(strike)}</span>
          </div>
        ) : geometry ? (
          <span
            className="pointer-events-none absolute z-[16] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-accent-primary/30 bg-accent-primary/20 px-3 py-2 font-mono text-[10px] font-semibold leading-[1.2] text-content-primary shadow-[0_2px_12px_rgba(0,0,0,0.7)] backdrop-blur-[4px]"
            style={{ left: leftSectionCenterX, top: geometry.strikeY }}
            aria-hidden="true"
          >
            STRIKE {formatStrikePrice(strike)}
          </span>
        ) : null}

        </div>
        {/* right axis: price + PnL at each tick, sharing the price's own line */}
        {rightAxis.ticks.length > 0 ? (
          <div
            className="relative shrink-0 border-l border-bg-border"
            style={{ width: PRICE_COLUMN_WIDTH }}
            aria-hidden="true"
          >
            {rightAxis.ticks.map((t, i) => (
              <div
                key={i}
                className="pointer-events-none absolute right-1.5 -translate-y-1/2 text-right font-mono text-[9px] leading-[1.15] tabular-nums"
                style={{ top: t.y }}
              >
                <div className="text-content-secondary">{t.price}</div>
                {t.readout ? <div className={readoutTone(t.readout)}>{t.readout}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* the two outcomes and the strike, one plain compact caption below the plot — kept out of
          the data instead of floated over it */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs leading-[1.35] text-content-primary">
        <span className="flex items-center gap-1.5">
          <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-additional-green-primary-deep" />
          {right.title}
        </span>
        <span className="flex items-center gap-1.5">
          <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-additional-red-primary" />
          {wrong.title}
        </span>
        <span className="text-content-secondary">Strike {formatStrikePrice(strike)}</span>
      </div>
    </>
  );

  return frameless ? body : <AppCard className="p-4 max-md:p-3">{body}</AppCard>;
}
