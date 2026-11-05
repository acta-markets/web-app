"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPct, formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import { priceDomain } from "@/components/trade/sentence/thesis-chart";
import type { StrikeOption } from "@/lib/trade/strikes";

type Point = { t: number; v: number };

/** a level's color voice: green boxes above spot (calls), red below (puts) */
export type StrikeTone = "green" | "red";
export type ChartStrike = StrikeOption & { tone?: StrikeTone };

const MAX_POINTS = 200;
const PLOT_TOP = 12;
const PLOT_BOTTOM_PAD = 8;
const X_AXIS_BAND = 24;
/** jsdom and hidden containers measure 0 wide */
const FALLBACK_WIDTH = 640;
/** price levels: solid rectangular buttons anchored at their strike's y */
const BOX_W = 124;
const BOX_H = 30;
/** strikes closer than this (centers) nudge apart just enough to stay readable */
const MIN_PITCH = Math.round(BOX_H * 0.8);

function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Price history from CoinGecko via `/api/market/history`; mirrors the sentence chart's hook. */
function usePriceHistory(symbol: string) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=1w`)
      .then((res) => res.json() as Promise<{ points?: Array<[number, number]> }>)
      .then((data) => {
        if (!alive) return;
        setPoints(
          (data.points ?? [])
            .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map(([ms, v]) => ({ t: ms / 1000, v }))
            .sort((a, b) => a.t - b.t)
        );
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setPoints([]);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  return { points, loading };
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

/**
 * The y domain is the strike ladder itself (plus spot), so every level sits at its true
 * proportional height: $97 is as far above $94 as their prices are apart.
 */
function strikeDomain(strikes: number[], spot: number): [number, number] {
  if (!strikes.length) return priceDomain([spot], null);
  const lo = Math.min(...strikes, spot);
  const hi = Math.max(...strikes, spot);
  const pad = (hi - lo) * 0.04 || hi * 0.01;
  return [lo - pad, hi + pad];
}

/**
 * The trade2 experiment: the strike levels ARE the chart. Each listed strike is a price
 * tag anchored at its exact y, green above spot (calls) / red below (puts), and tapping
 * anywhere on the chart picks the level nearest the tapped price.
 */
export function StrikeBoxesChart({
  symbol,
  spot,
  expiryMs,
  strikeOptions,
  selected1e9,
  onSelect,
}: {
  symbol: string;
  spot: number;
  expiryMs: number;
  strikeOptions: ChartStrike[];
  /** the picked strike as a 1e9 wire value; null before the first pick */
  selected1e9: number | null;
  onSelect: (strike1e9: number) => void;
}) {
  const { points, loading } = usePriceHistory(symbol);
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const [hovered1e9, setHovered1e9] = useState<number | null>(null);
  const [focused1e9, setFocused1e9] = useState<number | null>(null);

  const plotHeight = width > 0 && width < 640 ? 360 : 440;
  const plotBottom = plotHeight - PLOT_BOTTOM_PAD;

  const geo = useMemo(() => {
    if (width <= 0) return null;
    const nowSec = Date.now() / 1000;
    const history = points.length >= 2 ? points.filter((p) => p.t <= nowSec) : [];
    const projectionWidth = Math.min(width * 0.45, Math.max(150, width * 0.3));
    const xNow = width - projectionWidth;
    const boxX = xNow + (projectionWidth - BOX_W) / 2;
    const tStart = history[0]?.t ?? nowSec;
    const expirySec = expiryMs / 1000;
    const x = (t: number) =>
      t <= nowSec
        ? ((t - tStart) / Math.max(1, nowSec - tStart)) * xNow
        : xNow + ((t - nowSec) / Math.max(1, expirySec - nowSec)) * projectionWidth;

    const selected = strikeOptions.find((o) => o.strike1e9 === selected1e9) ?? null;
    const [lo, hi] = strikeDomain(strikeOptions.map((o) => o.strike), spot);
    const y = (v: number) => PLOT_TOP + (1 - (v - lo) / (hi - lo)) * (plotBottom - PLOT_TOP);
    const levelY = (v: number) => Math.max(PLOT_TOP, Math.min(plotBottom, y(v)));

    // the history ends where its data ends; "now" is only the dot at the reference price
    const linePoints = history.map((p) => ({ x: x(p.t), y: levelY(p.v) }));
    const line = linePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = linePoints.length
      ? `${line} L${linePoints[linePoints.length - 1].x.toFixed(1)},${plotBottom} L${linePoints[0].x.toFixed(1)},${plotBottom} Z`
      : "";

    // levels anchor at their own price; only strikes closer than a box height nudge apart
    const byStrike = [...strikeOptions].sort((a, b) => b.strike - a.strike);
    const anchored: number[] = byStrike.map((o) =>
      Math.max(PLOT_TOP, Math.min(plotBottom - BOX_H, levelY(o.strike) - BOX_H / 2))
    );
    for (let i = 1; i < anchored.length; i++) {
      anchored[i] = Math.max(anchored[i], anchored[i - 1] + MIN_PITCH);
    }
    const boxes = anchored.map((boxY, i) => ({ option: byStrike[i], levelY: levelY(byStrike[i].strike), y: boxY }));

    const ySelected = selected ? levelY(selected.strike) : null;
    const ySpot = levelY(spot);
    return {
      history, x, xNow, boxX, projectionWidth, line, area, boxes, ySelected, ySpot, tStart, nowSec,
      lo, hi,
      /** the chart is the picker: invert a plot y back to the price under the cursor */
      priceAt: (plotY: number) => lo + (1 - (plotY - PLOT_TOP) / (plotBottom - PLOT_TOP)) * (hi - lo),
    };
  }, [width, points, spot, strikeOptions, selected1e9, expiryMs, plotBottom]);

  /** snap a plot-space y to the nearest listed strike */
  function strikeAtY(plotY: number): ChartStrike | null {
    if (!geo || !strikeOptions.length) return null;
    const price = geo.priceAt(Math.max(PLOT_TOP, Math.min(plotBottom, plotY)));
    let best: ChartStrike | null = null;
    let bestDist = Infinity;
    for (const o of strikeOptions) {
      const d = Math.abs(o.strike - price);
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    return best;
  }

  function chartPointer(e: React.MouseEvent<SVGSVGElement>, pick: boolean) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const struck = strikeAtY(e.clientY - rect.top);
    if (!struck) return;
    setHovered1e9(struck.strike1e9);
    if (pick) onSelect(struck.strike1e9);
  }

  return (
    <div ref={frameRef} className="relative" style={{ height: plotHeight + X_AXIS_BAND }}>
      {geo ? (
        <>
          <svg
            width={width}
            height={plotHeight}
            aria-label={`${symbol} price chart; click near a price level to pick that strike`}
            className="block cursor-crosshair"
            onClick={(e) => chartPointer(e, true)}
            onMouseMove={(e) => chartPointer(e, false)}
            onMouseLeave={() => setHovered1e9(null)}
          >
            {geo.ySelected != null ? (
              <>
                {/* up is green: everything above the picked level tints green, below red */}
                <rect
                  x={geo.xNow}
                  y={PLOT_TOP}
                  width={geo.projectionWidth}
                  height={geo.ySelected - PLOT_TOP}
                  fill="var(--additional-green-primary)"
                  fillOpacity={0.1}
                />
                <rect
                  x={geo.xNow}
                  y={geo.ySelected}
                  width={geo.projectionWidth}
                  height={plotBottom - geo.ySelected}
                  fill="var(--additional-red-primary)"
                  fillOpacity={0.08}
                />
              </>
            ) : null}

            {geo.area ? <path d={geo.area} fill="var(--accent-secondary)" fillOpacity={0.08} /> : null}
            <path
              d={geo.line}
              fill="none"
              stroke="var(--accent-secondary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* the spot price, a level of its own: solid line with its price on the left */}
            <g aria-hidden="true" pointerEvents="none">
              <line
                x1={0}
                x2={width}
                y1={geo.ySpot}
                y2={geo.ySpot}
                stroke="var(--accent-secondary)"
                strokeWidth={1.5}
              />
              <text x={8} y={geo.ySpot - 6} fontSize={10.5} fill="var(--accent-secondary)" className="font-mono">
                spot {formatUsdSmart(spot)}
              </text>
            </g>

            {geo.boxes.map(({ option, levelY, y }) => {
              const selected = option.strike1e9 === selected1e9;
              const active = option.strike1e9 === hovered1e9 || option.strike1e9 === focused1e9;
              const tone: StrikeTone = option.tone ?? (option.strike > spot ? "green" : "red");
              const toneVar = tone === "green" ? "var(--additional-green-primary)" : "var(--additional-red-primary)";
              return (
                <g
                  key={option.strike1e9}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${formatStrikePrice(option.strike)} strike${option.apr != null ? `, ${formatPct(option.apr * 100)} APR` : ", no price"}`}
                  className={cn("cursor-pointer outline-none", loading && "opacity-60")}
                  onFocus={() => setFocused1e9(option.strike1e9)}
                  onBlur={() => setFocused1e9((cur) => (cur === option.strike1e9 ? null : cur))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(option.strike1e9);
                    }
                  }}
                >
                  {selected ? (
                    <line
                      x1={0}
                      x2={width}
                      y1={levelY}
                      y2={levelY}
                      stroke="var(--content-primary)"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      strokeDasharray="5 4"
                    />
                  ) : null}
                  <rect
                    className="strike-box"
                    x={geo.boxX}
                    y={y}
                    width={BOX_W}
                    height={BOX_H}
                    fill={toneVar}
                    fillOpacity={selected ? 0.45 : active ? 0.32 : 0.25}
                    stroke={toneVar}
                    strokeWidth={selected ? 2.5 : active ? 2 : 1.5}
                  />
                  <text
                    x={geo.boxX + 12}
                    y={y + BOX_H / 2}
                    dominantBaseline="central"
                    className="fill-content-primary font-mono"
                    fontSize={12}
                  >
                    {formatStrikePrice(option.strike)}
                  </text>
                  <text
                    x={geo.boxX + BOX_W - 12}
                    y={y + BOX_H / 2}
                    dominantBaseline="central"
                    textAnchor="end"
                    fontSize={11}
                    className={
                      option.apr == null
                        ? "fill-content-secondary font-mono"
                        : tone === "green"
                          ? "fill-additional-green-primary-deep font-mono"
                          : "fill-additional-red-primary-deep font-mono"
                    }
                  >
                    {option.apr != null ? formatPct(option.apr * 100) : "—"}
                  </text>
                </g>
              );
            })}

            <line x1={geo.xNow} x2={geo.xNow} y1={PLOT_TOP} y2={plotBottom} stroke="var(--bg-border)" strokeWidth={1} />
            <circle cx={geo.xNow} cy={geo.ySpot} r={4.5} fill="var(--accent-secondary)" stroke="var(--bg-primary)" strokeWidth={2} />
          </svg>

          <div className="pointer-events-none absolute inset-x-0 font-mono text-[11px] leading-none text-content-secondary" style={{ top: plotHeight + 8 }}>
            {geo.history.length ? <span className="absolute left-0">1W</span> : null}
            <span className="absolute -translate-x-1/2" style={{ left: geo.xNow }}>Now</span>
            <span className="absolute right-0">{formatExpiryDay(expiryMs)}</span>
          </div>

          {!loading && geo.history.length === 0 ? (
            <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-content-secondary" style={{ left: geo.xNow / 2, top: plotHeight / 2 }}>
              Price history unavailable
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
