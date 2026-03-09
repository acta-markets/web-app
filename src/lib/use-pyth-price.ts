"use client";

import { useEffect, useRef, useState } from "react";

export type PythPoint = { t: number; v: number };

type HermesStreamEvent = {
  parsed?: Array<{
    id: string;
    price: { price: string; expo: number; publish_time: number };
  }>;
};

function toNumber(v: string, expo: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n * Math.pow(10, expo);
}

const LIVE_POINTS_CAP = 120;

/**
 * Subscribes to a Pyth price feed via SSE and returns the latest price
 * and a capped rolling window of recent ticks for chart display.
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

  useEffect(() => {
    if (!pythId) return;

    lastSeenRef.current = null;

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
