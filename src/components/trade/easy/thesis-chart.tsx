"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { cn } from "@/lib/cn";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import type { Direction, ZoneLabel } from "@/lib/trade/thesis";

type Point = { t: number; v: number };
type Range = "1w" | "1m" | "3m";

const RANGES: Array<{ value: Range; label: string }> = [
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
];
const RANGE_NAMES: Record<Range, string> = { "1w": "last week", "1m": "last month", "3m": "last 3 months" };
const MAX_POINTS = 200;
const PLOT_TOP = 12;
const PLOT_BOTTOM_PAD = 8;
const X_AXIS_BAND = 24;
/** jsdom and hidden containers measure 0 wide */
const FALLBACK_WIDTH = 640;
/** the strike stays this far from either edge, so both outcome zones keep room for a label */
const STRIKE_MARGIN = 0.38;

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

  // another asset's series would be the wrong prices entirely, so only a range change holds the frame
  const sameAsset = state?.symbol === symbol;
  return {
    points: sameAsset ? state.points : [],
    loading: !sameAsset || state.range !== range,
  };
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceStep(span: number, count: number) {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * magnitude;
}

/** Axis prices share one precision, set by the tick step: $95, $100, $105 or $0.0021, $0.0022. */
function formatTick(value: number, step: number) {
  const decimals = step >= 1 ? 0 : Math.min(8, Math.ceil(-Math.log10(step)));
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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
    if (strike - lo < STRIKE_MARGIN * (hi - lo)) lo = (strike - STRIKE_MARGIN * hi) / (1 - STRIKE_MARGIN);
    if (hi - strike < STRIKE_MARGIN * (hi - lo)) hi = (strike - STRIKE_MARGIN * lo) / (1 - STRIKE_MARGIN);
  }
  return [Math.max(0, lo), hi];
}

function formatPointTime(t: number) {
  return new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAxisDay(t: number) {
  return new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ThesisChart({
  symbol,
  spot,
  strike,
  expiryMs,
  direction,
  right,
  wrong,
  strikeOptions1e9 = [],
  onStrikeChange,
}: {
  symbol: string;
  spot: number;
  strike: number;
  expiryMs: number;
  direction: Direction;
  right: ZoneLabel;
  wrong: ZoneLabel;
  /** tradable strikes as 1e9 wire values; the dragged tag snaps to the nearest one */
  strikeOptions1e9?: number[];
  onStrikeChange?: (strike1e9: number) => void;
}) {
  const [range, setRange] = useState<Range>("1w");
  const { points, loading } = usePriceHistory(symbol, range);
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [draggingStrike, setDraggingStrike] = useState(false);
  /** set synchronously on grab, so a pointermove landing before React commits the pointerdown still counts as a drag */
  const draggingRef = useRef(false);
  /** the y-domain as it was when the tag was grabbed, held until release so the tag tracks the pointer instead of re-anchoring its own axis */
  const [dragDomain, setDragDomain] = useState<[number, number] | null>(null);
  /** where the pointer grabbed inside the tag, so grabbing near its edge doesn't snap the tag to the pointer */
  const grabOffsetY = useRef(0);
  /** for one series the axis only ever grows, so ending a drag or picking a nearer strike never re-anchors it */
  const heldDomain = useRef<{ symbol: string; points: Point[]; lo: number; hi: number } | null>(null);
  const lastEmittedStrike = useRef<number | null>(null);
  const strikeOptionsSorted = useMemo(() => [...strikeOptions1e9].sort((a, b) => a - b), [strikeOptions1e9]);
  const strikeDraggable = !!onStrikeChange && strikeOptionsSorted.length > 0;

  const plotHeight = width > 0 && width < 640 ? 190 : 210;
  const plotBottom = plotHeight - PLOT_BOTTOM_PAD;

  const geo = useMemo(() => {
    if (width <= 0) return null;
    const nowSec = Date.now() / 1000;
    const history = points.length >= 2 ? points.filter((p) => p.t <= nowSec) : [];
    const projectionWidth = Math.min(width * 0.45, Math.max(150, width * 0.3));
    const xNow = width - projectionWidth;
    const tStart = history[0]?.t ?? nowSec;
    const expirySec = expiryMs / 1000;
    const x = (t: number) =>
      t <= nowSec
        ? ((t - tStart) / Math.max(1, nowSec - tStart)) * xNow
        : xNow + ((t - nowSec) / Math.max(1, expirySec - nowSec)) * projectionWidth;

    const [reqLo, reqHi] = priceDomain([...history.map((p) => p.v), spot], strike);
    const held = heldDomain.current;
    const sameSeries = !!held && held.symbol === symbol && held.points === points;
    let lo = sameSeries ? Math.min(held!.lo, reqLo) : reqLo;
    let hi = sameSeries ? Math.max(held!.hi, reqHi) : reqHi;
    if (dragDomain) {
      // keep exactly the domain that was on screen when the tag was grabbed
      lo = dragDomain[0];
      hi = dragDomain[1];
    } else {
      heldDomain.current = { symbol, points, lo, hi };
    }
    const y = (v: number) => PLOT_TOP + (1 - (v - lo) / (hi - lo)) * (plotBottom - PLOT_TOP);
    const invY = (py: number) => lo + (1 - (py - PLOT_TOP) / (plotBottom - PLOT_TOP)) * (hi - lo);

    const step = niceStep(hi - lo, 3);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi && ticks.length < 4; v += step) ticks.push(v);

    // the history ends where its data ends; "now" is only the dot at the reference price, never joined to it
    const linePoints = history.map((p) => ({ x: x(p.t), y: y(p.v) }));
    const line = linePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = linePoints.length
      ? `${line} L${linePoints[linePoints.length - 1].x.toFixed(1)},${plotBottom} L${linePoints[0].x.toFixed(1)},${plotBottom} Z`
      : "";
    const yStrike = Math.max(PLOT_TOP, Math.min(plotBottom, y(strike)));
    return { history, x, y, invY, lo, hi, xNow, projectionWidth, ticks, step, line, area, yStrike, tStart };
  }, [width, points, spot, strike, expiryMs, plotBottom, dragDomain, symbol]);

  // above wins over the strike, below wins under it
  const rightOnTop = direction === "above";
  const hovered = hover != null && geo ? geo.history[hover] : null;

  function moveHover(clientX: number, target: HTMLElement) {
    if (!geo || geo.history.length === 0) return;
    const px = clientX - target.getBoundingClientRect().left;
    if (px > geo.xNow) {
      setHover(null);
      return;
    }
    let best = 0;
    for (let i = 1; i < geo.history.length; i += 1) {
      if (Math.abs(geo.x(geo.history[i].t) - px) < Math.abs(geo.x(geo.history[best].t) - px)) best = i;
    }
    setHover(best);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!geo || geo.history.length === 0) return;
    const last = geo.history.length - 1;
    const step = e.shiftKey ? 10 : 1;
    const current = hover ?? last;
    const next =
      e.key === "ArrowLeft" ? current - step
      : e.key === "ArrowRight" ? current + step
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next == null) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(last, next)));
  }

  function nearestStrikeIndex(strike1e9: number) {
    let best = 0;
    strikeOptionsSorted.forEach((s, i) => {
      if (Math.abs(s - strike1e9) < Math.abs(strikeOptionsSorted[best] - strike1e9)) best = i;
    });
    return best;
  }

  function emitStrikeFromClientY(clientY: number) {
    const frame = frameRef.current;
    if (!frame || !geo || !onStrikeChange || strikeOptionsSorted.length === 0) return;
    const py = Math.max(PLOT_TOP, Math.min(plotBottom, clientY - frame.getBoundingClientRect().top));
    const price1e9 = geo.invY(py) * 1e9;
    const next = strikeOptionsSorted[nearestStrikeIndex(price1e9)];
    if (next === lastEmittedStrike.current) return;
    lastEmittedStrike.current = next;
    onStrikeChange(next);
  }

  function onTagPointerDown(e: React.PointerEvent) {
    if (!strikeDraggable || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const frame = frameRef.current;
    if (frame && geo) grabOffsetY.current = geo.yStrike + frame.getBoundingClientRect().top - e.clientY;
    lastEmittedStrike.current = null;
    draggingRef.current = true;
    setDragDomain(geo ? [geo.lo, geo.hi] : null);
    setDraggingStrike(true);
    setHover(null);
  }

  function onTagPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    emitStrikeFromClientY(e.clientY + grabOffsetY.current);
  }

  function endStrikeDrag() {
    draggingRef.current = false;
    setDraggingStrike(false);
    setDragDomain(null);
    lastEmittedStrike.current = null;
  }

  function onTagKeyDown(e: React.KeyboardEvent) {
    if (!strikeDraggable) return;
    const current = nearestStrikeIndex(strike * 1e9);
    const next =
      e.key === "ArrowUp" ? strikeOptionsSorted[Math.min(strikeOptionsSorted.length - 1, current + 1)]
      : e.key === "ArrowDown" ? strikeOptionsSorted[Math.max(0, current - 1)]
      : e.key === "Home" ? strikeOptionsSorted[0]
      : e.key === "End" ? strikeOptionsSorted[strikeOptionsSorted.length - 1]
      : null;
    if (next == null) return;
    e.preventDefault();
    onStrikeChange?.(next);
  }

  const low = points.length ? Math.min(...points.map((p) => p.v)) : null;
  const high = points.length ? Math.max(...points.map((p) => p.v)) : null;

  return (
    <AppCard className="p-4 max-md:p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px]">
          <span className="text-content-primary">{symbol} {formatUsdSmart(spot)}</span>{" "}
          <span className="text-content-secondary">· {RANGE_NAMES[range]}</span>
        </div>
        <AppSegmented ariaLabel="Price history range" value={range} onChange={setRange} options={RANGES} />
      </div>

      <p className="sr-only">
        {`${symbol} is ${formatUsdSmart(spot)} now. Your price is ${formatStrikePrice(strike)} on ${formatExpiryDay(expiryMs)}.`}
        {low != null && high != null ? ` Over the ${RANGE_NAMES[range]} it ranged from ${formatUsdSmart(low)} to ${formatUsdSmart(high)}.` : ""}
        {` If you are right: ${right.title}. If you are wrong: ${wrong.title}.`}
      </p>

      <div ref={frameRef} className="relative mt-3" style={{ height: plotHeight + X_AXIS_BAND }}>
        {geo ? (
          <>
            <svg
              width={width}
              height={plotHeight}
              aria-hidden="true"
              className={cn("block transition-opacity", loading && geo.history.length > 0 && "opacity-50")}
            >
              {geo.ticks.map((t) => (
                <line key={t} x1={0} x2={geo.xNow} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--bg-border)" strokeWidth={1} />
              ))}

              <rect
                x={geo.xNow}
                y={rightOnTop ? PLOT_TOP : geo.yStrike}
                width={geo.projectionWidth}
                height={rightOnTop ? geo.yStrike - PLOT_TOP : plotBottom - geo.yStrike}
                fill="var(--additional-green-primary)"
                fillOpacity={0.12}
              />
              <rect
                x={geo.xNow}
                y={rightOnTop ? geo.yStrike : PLOT_TOP}
                width={geo.projectionWidth}
                height={rightOnTop ? plotBottom - geo.yStrike : geo.yStrike - PLOT_TOP}
                fill="var(--additional-red-primary)"
                fillOpacity={0.1}
              />

              {geo.area ? <path d={geo.area} fill="var(--accent-secondary)" fillOpacity={0.08} /> : null}
              <path
                d={geo.line}
                fill="none"
                stroke="var(--accent-secondary)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              <line
                x1={0}
                x2={width}
                y1={geo.yStrike}
                y2={geo.yStrike}
                stroke="var(--content-primary)"
                strokeOpacity={0.6}
                strokeWidth={1}
                strokeDasharray="5 4"
              />

              {hovered ? (
                <>
                  <line
                    x1={geo.x(hovered.t)}
                    x2={geo.x(hovered.t)}
                    y1={PLOT_TOP}
                    y2={plotBottom}
                    stroke="var(--content-secondary)"
                    strokeWidth={1}
                  />
                  <circle cx={geo.x(hovered.t)} cy={geo.y(hovered.v)} r={4} fill="var(--accent-secondary)" stroke="var(--bg-primary)" strokeWidth={2} />
                </>
              ) : null}
              <circle cx={geo.xNow} cy={geo.y(spot)} r={4.5} fill="var(--accent-secondary)" stroke="var(--bg-primary)" strokeWidth={2} />
            </svg>

            {geo.ticks.map((t) => (
              <span
                key={t}
                className="pointer-events-none absolute left-0 bg-[rgba(18,18,18,0.75)] px-0.5 font-mono text-[11px] leading-none tabular-nums text-content-secondary"
                style={{ top: geo.y(t) - 14 }}
              >
                {formatTick(t, geo.step)}
              </span>
            ))}

            {!loading && geo.history.length === 0 ? (
              <span
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-content-secondary"
                style={{ left: geo.xNow / 2, top: plotHeight / 2 }}
              >
                Price history unavailable
              </span>
            ) : null}

            {([
              [right, rightOnTop, true],
              [wrong, !rightOnTop, false],
            ] as const).map(([label, onTop, isRight]) => (
              <div
                key={isRight ? "right" : "wrong"}
                className="pointer-events-none absolute flex flex-col gap-0.5 font-mono text-xs leading-[1.25] max-md:text-[11px]"
                style={{
                  left: geo.xNow + 10,
                  width: geo.projectionWidth - 20,
                  ...(onTop ? { top: PLOT_TOP + 8 } : { bottom: X_AXIS_BAND + PLOT_BOTTOM_PAD + 8 }),
                }}
              >
                <span className="flex items-start gap-1 text-content-primary">
                  {isRight ? (
                    <Check aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-additional-green-primary-deep" />
                  ) : (
                    <X aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-additional-red-primary" />
                  )}
                  <span>
                    <span className="sr-only">{isRight ? "If right: " : "If wrong: "}</span>
                    {label.title}
                  </span>
                </span>
                <span className="pl-[18px] text-content-secondary">
                  {label.premium ? (
                    <>
                      + {label.premium}
                      <span className="max-md:hidden"> premium</span>
                    </>
                  ) : (
                    "+ the premium"
                  )}
                </span>
              </div>
            ))}

            <span
              {...(strikeDraggable
                ? {
                    role: "slider",
                    tabIndex: 0,
                    "aria-label": "Your price",
                    "aria-valuemin": strikeOptionsSorted[0],
                    "aria-valuemax": strikeOptionsSorted[strikeOptionsSorted.length - 1],
                    "aria-valuenow": Math.round(strike * 1e9),
                    "aria-valuetext": formatStrikePrice(strike),
                    "aria-orientation": "vertical",
                  }
                : {})}
              className={cn(
                "absolute right-2 -translate-y-1/2 whitespace-nowrap border border-bg-border bg-bg-primary px-2 py-1 font-mono text-xs leading-none text-content-primary max-md:right-1 max-md:px-1.5 max-md:text-[11px]",
                strikeDraggable
                  ? "z-10 cursor-grab touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                  : "pointer-events-none",
                draggingStrike && "cursor-grabbing"
              )}
              style={{ top: geo.yStrike }}
              onPointerDown={strikeDraggable ? onTagPointerDown : undefined}
              onPointerMove={strikeDraggable ? onTagPointerMove : undefined}
              onPointerUp={strikeDraggable ? endStrikeDrag : undefined}
              onPointerCancel={strikeDraggable ? endStrikeDrag : undefined}
              onLostPointerCapture={strikeDraggable ? endStrikeDrag : undefined}
              onKeyDown={strikeDraggable ? onTagKeyDown : undefined}
            >
              Your price {formatStrikePrice(strike)}
            </span>

            <div
              className="absolute inset-x-0 top-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
              style={{ height: plotHeight }}
              tabIndex={geo.history.length ? 0 : -1}
              aria-label={`${symbol} price history. Use the arrow keys to read prices.`}
              onPointerMove={(e) => moveHover(e.clientX, e.currentTarget)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(geo.history.length ? geo.history.length - 1 : null)}
              onBlur={() => setHover(null)}
              onKeyDown={onKeyDown}
            />

            {hovered ? (
              <div
                role="status"
                className="pointer-events-none absolute -translate-x-1/2 border border-bg-border bg-bg-primary px-2.5 py-1.5 font-mono text-xs leading-[1.3] shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)]"
                style={{
                  left: Math.max(60, Math.min(geo.xNow - 60, geo.x(hovered.t))),
                  top: Math.max(0, geo.y(hovered.v) - 52),
                }}
              >
                <div className="font-medium tabular-nums text-content-primary">{formatUsdSmart(hovered.v)}</div>
                <div className="text-content-secondary">{formatPointTime(hovered.t)}</div>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 font-mono text-[11px] leading-none text-content-secondary" style={{ top: plotHeight + 8 }}>
              {geo.history.length && geo.xNow > 90 ? <span className="absolute left-0">{formatAxisDay(geo.tStart)}</span> : null}
              <span className="absolute -translate-x-1/2" style={{ left: geo.xNow }}>Now</span>
              <span className="absolute right-0">{formatExpiryDay(expiryMs)}</span>
            </div>
          </>
        ) : null}
      </div>
    </AppCard>
  );
}
