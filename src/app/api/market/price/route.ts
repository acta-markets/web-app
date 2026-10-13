import { NextResponse } from "next/server";
import { coingeckoId } from "@/lib/coingecko";

const MAX_SYMBOLS = 20;

/**
 * Latest USD prices by token symbol: `?symbols=SOL,USDC` answers
 * `{ ok: true, prices: { SOL: 110.28, USDC: 1 } }`, keyed in upper case.
 * Symbols without a price source are left out; an upstream failure is a 502
 * so callers keep the prices they already have.
 */
export async function GET(req: Request) {
  const requested = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);
  const ids = new Map<string, string>();
  for (const symbol of requested) {
    const id = coingeckoId(symbol);
    if (id) ids.set(symbol, id);
  }
  if (ids.size === 0) return NextResponse.json({ ok: true, prices: {} });

  // sorted, so every caller asking for the same coins shares one cached upstream answer
  const query = [...new Set(ids.values())].sort().join(",");
  const endpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(query)}&vs_currencies=usd`;
  try {
    const res = await fetch(endpoint, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Price source unavailable" }, { status: 502 });
    const json = (await res.json()) as Record<string, { usd?: unknown } | undefined>;
    const prices: Record<string, number> = {};
    for (const [symbol, id] of ids) {
      const usd = json[id]?.usd;
      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) prices[symbol] = usd;
    }
    return NextResponse.json({ ok: true, prices });
  } catch {
    return NextResponse.json({ ok: false, error: "Price source unavailable" }, { status: 502 });
  }
}
