import { NextResponse } from "next/server";

type RpcPrice = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

type ParsedPriceUpdate = {
  id: string;
  price: RpcPrice;
  ema_price: RpcPrice;
};

type HermesLatestResponse = {
  parsed: ParsedPriceUpdate[] | null;
  binary: { encoding: "hex" | "base64"; data: string[] };
};

function toNumber(v: string, expo: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n * Math.pow(10, expo);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // Support both ids and ids[] in query string.
  const ids = [
    ...sp.getAll("ids[]"),
    ...sp.getAll("ids"),
    ...(sp.get("id") ? [sp.get("id") as string] : [])
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing ids. Provide ?ids[]=<hex>&ids[]=<hex>." },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams();
  for (const id of ids) qs.append("ids[]", id);
  // Hermes defaults parsed=true, encoding=hex; make it explicit.
  qs.set("parsed", "true");
  qs.set("encoding", "hex");
  qs.set("ignore_invalid_price_ids", "true");

  const endpoint = `https://hermes.pyth.network/v2/updates/price/latest?${qs.toString()}`;

  let json: HermesLatestResponse;
  try {
    const res = await fetch(endpoint, {
      // avoid hammering; let Next cache briefly
      next: { revalidate: 5 }
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Hermes error (${res.status})` },
        { status: 502 }
      );
    }

    json = (await res.json()) as HermesLatestResponse;
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to reach Hermes." }, { status: 502 });
  }

  const out: Record<
    string,
    { price: number; conf: number; expo: number; publishTime: number }
  > = {};

  for (const p of json.parsed ?? []) {
    const price = toNumber(p.price.price, p.price.expo);
    const conf = toNumber(p.price.conf, p.price.expo);
    if (price == null || conf == null) continue;
    out[p.id.toLowerCase()] = {
      price,
      conf,
      expo: p.price.expo,
      publishTime: p.price.publish_time
    };
  }

  return NextResponse.json({ ok: true, prices: out });
}



