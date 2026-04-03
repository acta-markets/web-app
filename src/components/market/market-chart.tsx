"use client";

import { useEffect, useMemo, useState } from "react";
import type { PythPoint } from "@/lib/use-pyth-price";
import { AppCard } from "@/components/app-ui/app-card";
import { AppPill } from "@/components/app-ui/app-pill";
import { formatUsdSmart } from "@/lib/markets";

type Point = PythPoint;
type Range = "1w" | "1m" | "3m";

function formatPctDelta(p: number) {
  const s = Math.abs(p) < 0.01 ? p.toFixed(2) : p.toFixed(2);
  return `${p >= 0 ? "+" : ""}${s}%`;
}

export function MarketChart({
  symbol,
  strikePrice,
  expiryLabel,
  expiryTs,
  range,
  onRangeChange,
  onClose,
  livePoints,
}: {
  symbol: string;
  strikePrice: number;
  expiryLabel: string;
  expiryTs: number;
  range: Range;
  onRangeChange: (r: Range) => void;
  onClose?: () => void;
  livePoints: Point[];
}) {
  const [historyPoints, setHistoryPoints] = useState<Point[]>([]);

  useEffect(() => {
    let alive = true;
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`
        );
        const data = (await res.json()) as {
          ok?: boolean;
          points?: Array<[number, number]>;
        };
        if (!alive) return;
        const pts = (data.points ?? [])
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .map(([ms, price]) => ({ t: Math.round(ms / 1000), v: price }));
        setHistoryPoints(pts);
      } catch {
        // ignore
      }
    }
    void loadHistory();
    return () => {
      alive = false;
    };
  }, [range, symbol]);

  const historySeries = useMemo(() => {
    const out = [...historyPoints].sort((a, b) => a.t - b.t);
    const max = 220;
    if (out.length <= max) return out;
    const step = (out.length - 1) / (max - 1);
    const sampled: Point[] = [];
    for (let i = 0; i < max; i++) sampled.push(out[Math.round(i * step)]!);
    return sampled;
  }, [historyPoints]);

  const liveSeries = useMemo(() => {
    const out = [...livePoints].sort((a, b) => a.t - b.t);
    const max = 120;
    if (out.length <= max) return out;
    const step = (out.length - 1) / (max - 1);
    const sampled: Point[] = [];
    for (let i = 0; i < max; i++) sampled.push(out[Math.round(i * step)]!);
    return sampled;
  }, [livePoints]);

  const combinedSeries = useMemo(() => {
    const merged = [...historyPoints, ...livePoints].sort((a, b) => a.t - b.t);
    const out: Point[] = [];
    for (const p of merged) {
      const prev = out[out.length - 1];
      if (prev && prev.t === p.t) {
        out[out.length - 1] = p;
      } else {
        out.push(p);
      }
    }
    return out;
  }, [historyPoints, livePoints]);

  const last = combinedSeries.length ? combinedSeries[combinedSeries.length - 1].v : null;
  const first = combinedSeries.length ? combinedSeries[0].v : null;
  const pct = first != null && first !== 0 && last != null ? ((last - first) / first) * 100 : 0;

  const svg = useMemo(() => {
    const w = 320;
    const h = 140;
    const pad = 12;

    const s = combinedSeries;
    // Anchor "now" to the end of the loaded history window so history doesn't reflow on each live tick.
    const nowT =
      historySeries.length >= 2
        ? historySeries[historySeries.length - 1].t
        : s.length
          ? s[s.length - 1].t
          : Math.floor(Date.now() / 1000);

    const scaleBase = historyPoints.length >= 2 ? historyPoints : s;
    let dataMin = Math.min(...scaleBase.map((p) => p.v));
    let dataMax = Math.max(...scaleBase.map((p) => p.v));
    if (dataMin === dataMax) {
      dataMin -= 1;
      dataMax += 1;
    }
    const dataRange = dataMax - dataMin;
    const yMin = dataMin - dataRange * 0.12;
    const yMax = dataMax + dataRange * 0.12;

    const startT = s[0]?.t ?? nowT - 60;
    const endT = Math.max(expiryTs, nowT + 1);

    const histSpan = Math.max(1, nowT - startT);
    const futSpan = Math.max(1, endT - nowT);
    const totalSpan = histSpan + futSpan;
    const naturalHistFrac = histSpan / totalSpan;
    const histFrac = Math.max(0.55, Math.min(0.78, naturalHistFrac));

    const innerW = w - pad * 2;
    const leftW = innerW * histFrac;
    const rightW = innerW - leftW;

    const x = (t: number) => {
      if (t <= nowT) {
        const p = (t - startT) / histSpan;
        return pad + Math.max(0, Math.min(1, p)) * leftW;
      }
      const p = (t - nowT) / futSpan;
      return pad + leftW + Math.max(0, Math.min(1, p)) * rightW;
    };
    const y = (v: number) => pad + (1 - (v - yMin) / (yMax - yMin)) * (h - pad * 2);

    const hist = (historySeries.length >= 2 ? historySeries : s)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`)
      .join(" ");

    const livePath =
      liveSeries.length >= 1
        ? [
            (() => {
              const lastH = (historySeries.length ? historySeries[historySeries.length - 1] : s[s.length - 1])!;
              const firstL = liveSeries[0]!;
              return `M ${x(lastH.t).toFixed(2)} ${y(lastH.v).toFixed(2)} L ${x(firstL.t).toFixed(2)} ${y(firstL.v).toFixed(2)}`;
            })(),
            ...liveSeries.slice(1).map((p) => `L ${x(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`)
          ].join(" ")
        : "";

    const yStrikeRaw = y(strikePrice);
    const yStrike = Math.max(pad, Math.min(h - pad, yStrikeRaw));
    const strikeOff =
      strikePrice > yMax ? "above" : strikePrice < yMin ? "below" : null;
    const lastValue = last ?? (s.length ? s[s.length - 1].v : strikePrice);
    const yLast = y(lastValue);
    const xNow = x(nowT);
    const xExpiry = x(endT);
    const xStrike = x(expiryTs);
    const yStrikeAtExpiry = yStrike;
    const yLastAtNow = yLast;

    return {
      w,
      h,
      hist,
      livePath,
      yStrike,
      yLast,
      strikeOff,
      xNow,
      xExpiry,
      xStrike,
      yStrikeAtExpiry,
      yLastAtNow,
      nowT
    };
  }, [combinedSeries, historySeries, historyPoints, liveSeries, strikePrice, last, expiryTs]);

  return (
    <AppCard className="overflow-clip p-3">
      <div className="flex flex-col gap-1">
        <div className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
          Price
        </div>
        <div className="flex items-baseline gap-1.5">
          <div className="font-mono text-xl font-bold leading-[1.2] tracking-[-0.4px] text-content-primary">
            {last != null ? formatUsdSmart(last) : "—"}
          </div>
          <div className="font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-accent-secondary">
            {formatPctDelta(pct)}
          </div>
        </div>
        <div className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">
          Expiry: {expiryLabel}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-1">
          {(["1w", "1m", "3m"] as const).map((r) => (
            <AppPill
              key={r}
              active={range === r}
              onClick={() => onRangeChange(r)}
              className="flex flex-1 cursor-pointer justify-center"
            >
              {r.toUpperCase()}
            </AppPill>
          ))}
        </div>

        <div className="aspect-[218/112] w-full bg-[#19191A]">
          {combinedSeries.length < 2 ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-content-secondary">
              Waiting for live price history...
            </div>
          ) : (
          <svg viewBox={`0 0 ${svg.w} ${svg.h}`} className="block h-full w-full">
            {/* grid */}
            <g opacity="0.25" stroke="rgba(255,255,255,0.25)" strokeWidth="1">
              <line x1="0" y1={svg.h / 2} x2={svg.w} y2={svg.h / 2} />
            </g>

            {/* future region tint */}
            <rect
              x={Math.max(0, svg.xNow)}
              y="0"
              width={Math.max(0, svg.w - Math.max(0, svg.xNow))}
              height={svg.h}
              fill="rgba(255,255,255,0.03)"
            />

            {/* strike line */}
            <g>
              <line
                x1="0"
                y1={svg.yStrike}
                x2={svg.w}
                y2={svg.yStrike}
                stroke="rgba(128,201,182,0.65)"
                strokeWidth="1"
                strokeDasharray="6 6"
              />
              <text
                x={10}
                y={svg.strikeOff === "above" ? 14 : svg.strikeOff === "below" ? svg.h - 6 : Math.max(14, svg.yStrike - 6)}
                fill="rgba(128,201,182,0.95)"
                fontSize="10"
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
              >
                Strike {formatUsdSmart(strikePrice)} {svg.strikeOff === "above" ? "\u2191" : svg.strikeOff === "below" ? "\u2193" : ""}
              </text>
            </g>

            {/* projection to expiry */}
            <g>
              <line
                x1={svg.xNow}
                y1={svg.yLastAtNow}
                x2={svg.xStrike}
                y2={svg.yStrikeAtExpiry}
                stroke="rgba(128,201,182,0.45)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1={svg.xStrike}
                y1="0"
                x2={svg.xStrike}
                y2={svg.h}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
              <text
                x={Math.max(10, svg.xStrike - 8)}
                y={svg.h - 10}
                textAnchor="end"
                fill="rgba(255,255,255,0.55)"
                fontSize="10"
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
              >
                Expiry {expiryLabel}
              </text>
            </g>

            {/* price line */}
            <path d={svg.hist} fill="none" stroke="rgba(128,201,182,0.75)" strokeWidth="2" strokeLinejoin="round" />
            {svg.livePath ? (
              <path
                d={svg.livePath}
                fill="none"
                stroke="rgba(128,201,182,0.95)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ) : null}

            {/* last dot */}
            <circle cx={svg.xNow} cy={svg.yLast} r="3" fill="rgba(128,201,182,0.95)" />
          </svg>
          )}
        </div>
      </div>
    </AppCard>
  );
}
