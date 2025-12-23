export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const ids = [...sp.getAll("ids[]"), ...sp.getAll("ids")]
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return new Response("Missing ids[]", { status: 400 });
  }

  const qs = new URLSearchParams();
  for (const id of ids) qs.append("ids[]", id);
  qs.set("parsed", sp.get("parsed") ?? "true");
  qs.set("encoding", sp.get("encoding") ?? "hex");
  qs.set("ignore_invalid_price_ids", sp.get("ignore_invalid_price_ids") ?? "true");

  const endpoint = `https://hermes.pyth.network/v2/updates/price/stream?${qs.toString()}`;

  const upstream = await fetch(endpoint, {
    headers: {
      Accept: "text/event-stream"
    },
    cache: "no-store"
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Hermes stream error (${upstream.status})`, { status: 502 });
  }

  // Pass-through SSE stream.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}


