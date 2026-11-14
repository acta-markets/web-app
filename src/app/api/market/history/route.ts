import { NextResponse } from "next/server";
import { COINGECKO_IDS } from "@/lib/coingecko";
import { createHistoryStore, type PricePoint } from "./store";

type Range = "1d" | "1w" | "1m" | "3m";

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function rangeToDays(r: Range) {
  switch (r) {
    case "1d":
      return 1;
    case "1w":
      return 7;
    case "1m":
      return 30;
    case "3m":
      return 90;
  }
}

/** CoinGecko ends every series at the current price, so an older last point means a stale cache entry. */
const MAX_AGE_MS = 15 * 60 * 1000;

/**
 * How long a series is reused before asking CoinGecko again. Its keyless API allows only a few
 * calls a minute, and the series is hourly (five-minute for one day) while the chart draws the
 * live price itself, so five minutes costs nothing visible and keeps us well under the limit.
 */
const REVALIDATE_S = 300;

const store = createHistoryStore();

function isStale(points: PricePoint[]) {
  const last = points[points.length - 1];
  return !last || Date.now() - last[0] > MAX_AGE_MS;
}

/** The series, or null when CoinGecko refused (rate limit, outage) or sent nothing usable. */
async function fetchPrices(endpoint: string, init: RequestInit): Promise<PricePoint[] | null> {
  const res = await fetch(endpoint, init);
  if (!res.ok) return null;
  const json = (await res.json()) as { prices?: PricePoint[] };
  return Array.isArray(json.prices) && json.prices.length > 0 ? json.prices : null;
}

/** The series from CoinGecko, refreshed past a stale cache entry where possible; null on failure. */
async function loadPrices(endpoint: string): Promise<PricePoint[] | null> {
  try {
    const points = await fetchPrices(endpoint, { next: { revalidate: REVALIDATE_S } });
    // The data cache serves a stale entry while it revalidates, and keeps it when the refresh
    // fails, so an idle or rate-limited server can hand back a series that ends days ago.
    if (points && isStale(points)) {
      const fresh = await fetchPrices(endpoint, { cache: "no-store" }).catch(() => null);
      if (fresh && !isStale(fresh)) return fresh;
    }
    return points;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol") ?? "");
  const range = (url.searchParams.get("range") ?? "1w") as Range;

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }
  if (!["1d", "1w", "1m", "3m"].includes(range)) {
    return NextResponse.json({ ok: false, error: "Invalid range" }, { status: 400 });
  }

  const id = COINGECKO_IDS[symbol];
  if (!id) {
    return NextResponse.json({ ok: true, source: "none", points: [] as PricePoint[] });
  }

  const days = rangeToDays(range);
  const endpoint = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id
  )}/market_chart?vs_currency=usd&days=${days}`;

  const points = await loadPrices(endpoint);
  if (points) {
    store.remember(id, days, points);
    return NextResponse.json({ ok: true, source: "coingecko", points });
  }
  // CoinGecko refused: serve the last series we saw for this coin rather than an empty chart.
  const held = store.recall(id, days);
  if (held) {
    return NextResponse.json({ ok: true, source: "coingecko", points: held });
  }
  // Nothing to show yet. `retry` tells the chart this is a passing failure, unlike an asset
  // that has no history at all, so it asks again instead of settling on "unavailable".
  return NextResponse.json({ ok: true, source: "none", points: [] as PricePoint[], retry: true });
}


