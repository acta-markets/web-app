import { NextResponse } from "next/server";

type Range = "1w" | "1m" | "3m";

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  ZBTC: "bitcoin",
  BTC: "bitcoin",
  BONK: "bonk"
  // JLP / jitoSOL / PUMP may not be reliably available on CoinGecko; we’ll gracefully fallback.
};

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function rangeToDays(r: Range) {
  switch (r) {
    case "1w":
      return 7;
    case "1m":
      return 30;
    case "3m":
      return 90;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol") ?? "");
  const range = (url.searchParams.get("range") ?? "1w") as Range;

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }
  if (!["1w", "1m", "3m"].includes(range)) {
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
    const res = await fetch(endpoint, {
      // Cache a bit to avoid rate limits.
      next: { revalidate: 60 }
    });
    if (!res.ok) {
      return NextResponse.json({ ok: true, source: "none", points: [] as Array<[number, number]> });
    }
    const json = (await res.json()) as { prices?: Array<[number, number]> };
    const points = Array.isArray(json.prices) ? json.prices : [];
    // Return as ms timestamp + price
    return NextResponse.json({ ok: true, source: "coingecko", points });
  } catch {
    return NextResponse.json({ ok: true, source: "none", points: [] as Array<[number, number]> });
  }
}


