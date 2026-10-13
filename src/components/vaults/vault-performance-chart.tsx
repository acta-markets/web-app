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
import { formatPercent } from "@/lib/vaults/format";
import type { SeriesPoint } from "@/lib/vaults/metrics";

export type VaultChartKind = "percent" | "amount";

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  return value.toLocaleString("en-US", {
    notation: abs >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: abs >= 100 ? 0 : abs >= 1 ? 2 : 4
  });
}

/** lightweight-charts needs strictly increasing times. */
function toChartData(points: readonly SeriesPoint[]) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  let last = -Infinity;
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) continue;
    const t = Math.max(p.t, last + 1);
    out.push({ time: t as UTCTimestamp, value: p.v });
    last = t;
  }
  return out;
}

/** Vault history chart, themed like the Portfolio income chart. Remount (key) when `kind` changes. */
export function VaultPerformanceChart({
  points,
  kind,
  rangeStart
}: {
  points: readonly SeriesPoint[];
  kind: VaultChartKind;
  /** left edge of the visible range; the data may start earlier so the line enters it */
  rangeStart: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const data = useMemo(() => toChartData(points), [points]);

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
        vertLines: { color: "#282828", style: LineStyle.Dashed },
        horzLines: { color: "#282828", style: LineStyle.Dashed }
      },
      rightPriceScale: { borderColor: "#282828" },
      timeScale: { borderColor: "#282828", timeVisible: false, secondsVisible: false },
      crosshair: {
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
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#80C9B6",
      topColor: "rgba(128,201,182,0.28)",
      bottomColor: "rgba(128,201,182,0.02)",
      lineWidth: 2,
      // equity only changes at cycle boundaries; returns read better as a line
      lineType: kind === "amount" ? LineType.WithSteps : LineType.Simple,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: kind === "percent" ? 0.01 : 0.0001,
        formatter: (v: number) => (kind === "percent" ? formatPercent(v) : formatAmount(v))
      }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [kind]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    series.setData(data);
    if (data.length < 2) {
      chart.timeScale().fitContent();
      return;
    }
    const first = data[0]!.time;
    const last = data[data.length - 1]!.time;
    const from = Math.max(first, rangeStart ?? first) as UTCTimestamp;
    // setVisibleRange throws on an empty range
    if (from >= last) {
      chart.timeScale().fitContent();
      return;
    }
    chart.timeScale().setVisibleRange({ from, to: last });
  }, [data, rangeStart]);

  return <div ref={containerRef} className="w-full" />;
}
