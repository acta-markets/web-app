"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import { formatUsdSmart } from "@/lib/markets";

type Point = { t: number; v: number };
type Range = "24h" | "7d" | "30d";

function rangeToSec(r: Range) {
  if (r === "24h") return 24 * 60 * 60;
  if (r === "7d") return 7 * 24 * 60 * 60;
  return 30 * 24 * 60 * 60;
}

function filterSeries(points: Point[], now: number, range: Range) {
  const ordered = [...points]
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (!ordered.length) return ordered;
  const start = now - rangeToSec(range);

  let before: Point | null = null;
  for (const p of ordered) {
    if (p.t < start) before = p;
    else break;
  }

  const inside = ordered.filter((p) => p.t >= start && p.t <= now);
  const out = before ? [before, ...inside] : inside;
  return out.length ? out : ordered.slice(Math.max(0, ordered.length - 2));
}

function toStepData(points: Point[]) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  const s = [...points].sort((a, b) => a.t - b.t);
  if (!s.length) return out;
  let lastTime = s[0]!.t;
  out.push({ time: lastTime as UTCTimestamp, value: s[0]!.v });

  for (let i = 1; i < s.length; i++) {
    const cur = s[i]!;
    // Ensure strictly increasing times to keep lightweight-charts happy.
    const t = Math.max(cur.t, lastTime + 1);
    out.push({ time: t as UTCTimestamp, value: cur.v });
    lastTime = t;
  }
  return out;
}

export function PortfolioEarningsChart({
  points,
  now,
  range
}: {
  points: Point[];
  now: number; // unix seconds
  range: Range;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const data = useMemo(() => {
    const filtered = filterSeries(points, now, range);
    return toStepData(filtered);
  }, [now, points, range]);

  // Create chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8A8A8A"
      },
      grid: {
        vertLines: { color: "#282828" },
        horzLines: { color: "#282828" }
      },
      rightPriceScale: {
        borderColor: "#282828"
      },
      timeScale: {
        borderColor: "#282828",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        // Snap the horizontal crosshair + price label to the series value at the hovered time.
        // This prevents the label from changing based on mouse Y position.
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: "rgba(128,201,182,0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelVisible: true,
          labelBackgroundColor: "#121212"
        },
        horzLine: {
          color: "rgba(128,201,182,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelVisible: true,
          labelBackgroundColor: "#121212"
        }
      },
      // Keep interactions stable: range is controlled by pills.
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#80C9B6",
      topColor: "rgba(128,201,182,0.28)",
      bottomColor: "rgba(128,201,182,0.02)",
      lineWidth: 2,
      lineType: LineType.WithSteps,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: 0.01,
        formatter: (p: number) => formatUsdSmart(p)
      }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize handling
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push data + visible range
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    series.setData(data);
    // Lightweight Charts throws if the requested visible range is outside the loaded data.
    if (data.length < 2) {
      chart.timeScale().fitContent();
      return;
    }
    const first = data[0]!.time;
    const last = data[data.length - 1]!.time;
    const desiredFrom = (now - rangeToSec(range)) as UTCTimestamp;
    const desiredTo = now as UTCTimestamp;
    const from = (Math.max(first, desiredFrom) as unknown) as UTCTimestamp;
    const to = (Math.min(last, desiredTo) as unknown) as UTCTimestamp;
    if (from >= to) {
      chart.timeScale().fitContent();
      return;
    }
    chart.timeScale().setVisibleRange({ from, to });
  }, [data, now, range]);

  return <div ref={containerRef} className="w-full" />;
}


