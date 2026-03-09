"use client";

import { useEffect, useRef, useState } from "react";

export type PythPoint = { t: number; v: number };

type HermesStreamEvent = {
  parsed?: Array<{
    id: string;
    price: { price: string; expo: number; publish_time: number };
  }>;
};

type HermesLatestResponse = {
  ok: true;
  prices: Record<string, { price: number; conf: number; expo: number; publishTime: number }>;
} | { ok: false; error: string };

function toNumber(v: string, expo: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n * Math.pow(10, expo);
}

const LIVE_POINTS_CAP = 120;

/**
 * Returns the latest Pyth price via:
 * 1. One-shot REST fetch on mount for an immediate value (no polling).
 * 2. SSE stream for continuous live updates and chart points.
 */
export function usePythPrice(pythId?: string): {
  price: number | null;
  publishTime: number | null;
  livePoints: PythPoint[];
} {
  const [price, setPrice] = useState<number | null>(null);
  const [publishTime, setPublishTime] = useState<number | null>(null);
  const [livePoints, setLivePoints] = useState<PythPoint[]>([]);
  const lastSeenRef = useRef<number | null>(null);

  // One-shot initial fetch so the price is available immediately,
  // before the SSE stream delivers its first event (~1-2s).
  useEffect(() => {
    if (!pythId) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/pyth/latest?ids[]=${encodeURIComponent(pythId)}`);
        const data = (await res.json()) as HermesLatestResponse;
        if (!alive || !res.ok || data.ok !== true) return;
        const p = data.prices[pythId.toLowerCase()];
        if (p && Number.isFinite(p.price)) {
          setPrice(p.price);
          setPublishTime(p.publishTime);
          lastSeenRef.current = p.publishTime;
          setLivePoints([{ t: p.publishTime, v: p.price }]);
        }
      } catch {
        // ignore; SSE will deliver the price shortly
      }
    })();
    return () => { alive = false; };
  }, [pythId]);

  // SSE stream for live updates.
  useEffect(() => {
    if (!pythId) return;

    const url = `/api/pyth/stream?parsed=true&ids[]=${encodeURIComponent(pythId)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data) as HermesStreamEvent;
        const p = json.parsed?.[0];
        if (!p) return;
        const val = toNumber(p.price.price, p.price.expo);
        if (val == null) return;

        const pt = p.price.publish_time;
        if (lastSeenRef.current === pt) return;
        lastSeenRef.current = pt;

        setPrice(val);
        setPublishTime(pt);
        setLivePoints((prev) => {
          const next = [...prev, { t: pt, v: val }];
          return next.length > LIVE_POINTS_CAP
            ? next.slice(next.length - LIVE_POINTS_CAP)
            : next;
        });
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      setPrice(null);
      setPublishTime(null);
      setLivePoints([]);
      lastSeenRef.current = null;
    };
  }, [pythId]);

  return { price, publishTime, livePoints };
}
