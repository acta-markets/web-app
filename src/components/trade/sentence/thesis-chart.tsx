"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
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
const MAX_POINTS = 200;

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

const ACCENT = "#e6d9c3"; // neutral: green/red are reserved for the outcome zones
const GRID = "rgba(255,180,92,0.07)";
const BORDER = "rgba(255,180,92,0.16)";
const TEXT = "rgba(255,231,194,0.55)";

export function ThesisChart({
  symbol,
  spot,
  strike,
  expiryMs,
  direction,
  right,
  wrong,
  onDirection,
}: {
  symbol: string;
  spot: number;
  strike: number;
  expiryMs: number;
  direction: Direction;
  right: ZoneLabel;
  wrong: ZoneLabel;
  onDirection?: (next: Direction) => void;
}) {
  const [range, setRange] = useState<Range>("1d");
  const { points, loading } = usePriceHistory(symbol, range);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [strikeY, setStrikeY] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: 230,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: "'Courier New', Menlo, monospace",
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false, lockVisibleTimeRangeOnResize: true },
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.08, bottom: 0.14 } },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: ACCENT,
      lineWidth: 2,
      topColor: "rgba(230,217,195,0.14)",
      bottomColor: "rgba(230,217,195,0.0)",
      priceLineVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;


    const resize = () => chart.applyOptions({ width: el.clientWidth || 640 });
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

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v }));
    series.setData(data);
    const t = setTimeout(() => {
      if (data.length > 0) {
        chart.timeScale().fitContent();
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r) {
          const span = r.to - r.from;
          chart.timeScale().setVisibleLogicalRange({ from: r.from, to: r.to + span * 1.5 });
        }
      }
      const y = series.priceToCoordinate(strike);
      setStrikeY(y ?? 115);
    }, 2000);
    return () => clearTimeout(t);
  }, [points, strike]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const line = series.createPriceLine({
      price: strike,
      color: "rgba(255,231,194,0.75)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: false,
      title: `Your price ${formatStrikePrice(strike)}`,
    });
    return () => series.removePriceLine(line);
  }, [strike, points]);

  const low = points.length ? Math.min(...points.map((p) => p.v)) : null;
  const high = points.length ? Math.max(...points.map((p) => p.v)) : null;

  return (
    <AppCard className="p-4 max-md:p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px]">
          <span className="text-content-primary">{symbol} price</span>{" "}
          <span className="text-content-secondary">{RANGE_NAMES[range]}</span>
        </div>
        <AppSegmented ariaLabel="Price history range" value={range} onChange={setRange} options={RANGES} />
      </div>

      <p className="sr-only">
        {`${symbol} is ${formatUsdSmart(spot)} now. Your price is ${formatStrikePrice(strike)} on ${formatExpiryDay(expiryMs)}.`}
        {low != null && high != null ? ` Over the ${RANGE_NAMES[range]} it ranged from ${formatUsdSmart(low)} to ${formatUsdSmart(high)}.` : ""}
        {` If you are right: ${right.title}. If you are wrong: ${wrong.title}.`}
      </p>

      <div className="mt-3 flex">
        {/* history: left half */}
        <div className="w-1/2 shrink-0">
          <div
            ref={containerRef}
            className={cn(loading && points.length > 0 && "opacity-50")}
            aria-label={`${symbol} price history. Use the arrow keys to read prices.`}
            tabIndex={points.length ? 0 : -1}
            role="img"
          />
          {!loading && points.length === 0 ? (
            <div className="flex h-[230px] items-center justify-center font-mono text-xs text-content-secondary">
              Price history unavailable
            </div>
          ) : null}
        </div>

        {/* future: right half, the clickable outcome */}
        <div className="relative w-1/2 shrink-0" style={{ height: 230 }}>
          {strikeY != null ? (
            <>
              <button
                type="button"
                onClick={() => onDirection?.("above")}
                className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex cursor-pointer flex-col items-end justify-start px-3 pt-2 text-right transition hover:brightness-125"
                style={{ height: Math.max(0, strikeY), background: direction === "above" ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.13)" }}
                aria-label="Bet the price ends above"
              >
                <span className={cn("font-mono text-xs", direction === "above" ? "text-additional-green-primary-deep" : "text-content-secondary")}>
                  {direction === "above" ? "✓ " : ""}
                  {direction === "above" ? right.title : wrong.title}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDirection?.("below")}
                className="pointer-events-auto absolute inset-x-0 z-10 flex cursor-pointer flex-col items-end justify-end px-3 pb-1 text-right transition hover:brightness-125"
                style={{ top: Math.max(0, strikeY), bottom: 24, background: direction === "below" ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.13)" }}
                aria-label="Bet the price ends below"
              >
                <span className={cn("font-mono text-xs", direction !== "above" ? "text-additional-green-primary-deep" : "text-content-secondary")}>
                  {direction !== "above" ? "✓ " : ""}
                  {direction !== "above" ? right.title : wrong.title}
                </span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* outcome legend: what the strike means for this bet */}
      <div className="mt-3 flex flex-col gap-1.5 border-t border-bg-border pt-3 font-mono text-xs leading-[1.35]">
        <div className="flex items-start gap-2 text-content-primary">
          <Check aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-additional-green-primary-deep" />
          <span>
            <span className="sr-only">If right: </span>
            {right.title}
            {right.premium ? <span className="text-content-secondary"> + {right.premium} premium</span> : right.kept === false ? null : <span className="text-content-secondary"> + the premium</span>}
          </span>
        </div>
        <div className="flex items-start gap-2 text-content-primary">
          <X aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-additional-red-primary" />
          <span>
            <span className="sr-only">If wrong: </span>
            {wrong.title}
            {wrong.premium ? <span className="text-content-secondary"> + {wrong.premium} premium</span> : wrong.kept === false ? null : <span className="text-content-secondary"> + the premium</span>}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-content-secondary">
          <span>Your price {formatStrikePrice(strike)}</span>
          <span>Settles {formatExpiryDay(expiryMs)}</span>
        </div>
      </div>
    </AppCard>
  );
}
