import { NextResponse } from "next/server";
import { COINGECKO_IDS } from "@/lib/coingecko";

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

function isStale(points: Array<[number, number]>) {
  const last = points[points.length - 1];
  return !last || Date.now() - last[0] > MAX_AGE_MS;
}

async function fetchPrices(endpoint: string, init: RequestInit): Promise<Array<[number, number]> | null> {
  const res = await fetch(endpoint, init);
  if (!res.ok) return null;
  const json = (await res.json()) as { prices?: Array<[number, number]> };
  return Array.isArray(json.prices) ? json.prices : [];
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
    return NextResponse.json({ ok: true, source: "none", points: [] as Array<[number, number]> });
  }

  const days = rangeToDays(range);
  const endpoint = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id
  )}/market_chart?vs_currency=usd&days=${days}`;

  try {
    let points = await fetchPrices(endpoint, { next: { revalidate: 60 } });
    if (!points) {
      return NextResponse.json({ ok: true, source: "none", points: [] as Array<[number, number]> });
    }
    // The data cache serves a stale entry while it revalidates, and keeps it when the refresh
    // fails, so an idle or rate-limited server can hand back a series that ends days ago.
    if (isStale(points)) {
      const fresh = await fetchPrices(endpoint, { cache: "no-store" });
      if (fresh && !isStale(fresh)) points = fresh;
    }
    return NextResponse.json({ ok: true, source: "coingecko", points });
  } catch {
    return NextResponse.json({ ok: true, source: "none", points: [] as Array<[number, number]> });
  }
}


