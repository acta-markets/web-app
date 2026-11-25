// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { afterBody, aiCatalog, HOSTED_SERVER, hostedContext, rateLimiter, serverCard, shortCache } from "./hosted";
import { listAssets, marketSnapshot } from "./markets";

describe("hosted context", () => {
  it("has no wallet and may move nothing", () => {
    const context = hostedContext();
    expect(context.session.signer).toBeNull();
    expect(context.limits.readOnly).toBe(true);
    // constructing it opens nothing: the session connects on the first tool that needs the venue
    expect(context.session.state).toBe("not_connected");
  });
});

describe("the server's version", () => {
  it("is one number: the site's endpoint and its card say what the package on npm says", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "packages/mcp/package.json"), "utf8")) as { version: string };
    expect(HOSTED_SERVER.version).toBe(pkg.version);
    expect(JSON.stringify(serverCard("https://devnet.acta.markets"))).toContain(`"version":"${pkg.version}"`);
  });
});

describe("hosted reads over HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());

  const row = (symbol: string, type: string) => ({
    underlying_symbol: symbol,
    quote_symbol: "USDC",
    position_type: type,
    nearest_expiry_ts: 4_102_444_800,
    apr: { type: "available", min: 0.1, max: 0.2 },
  });

  it("reads every page of the earn summary and opens no socket", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const page = url.includes("cursor=")
        ? { assets: [row("ETH", "covered_call")], next_cursor: null }
        : { assets: [row("BTC", "cash_secured_put")], next_cursor: "c1" };
      return Response.json(page);
    }));
    const { session } = hostedContext();
    const result = await listAssets(session);
    expect(result.assets.map((a) => a.asset)).toEqual(["BTC", "ETH"]);
    expect(urls[0]).toMatch(/\/api\/v1\/earn-summary\?limit=200$/);
    expect(urls[1]).toMatch(/cursor=c1/);
    expect(session.state).toBe("not_connected");
  });

  it("an underlying with no market is no_markets, not a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "no market uses this token", code: "unknown_mint" }, { status: 404 })));
    const { session } = hostedContext();
    await expect(marketSnapshot(session, { symbol: "BTC", mint: "mint", decimals: 8, token: {} as never })).rejects.toMatchObject({ code: "no_markets" });
  });
});

describe("shortCache", () => {
  it("answers from memory until the time is up, then forgets", () => {
    let now = 1_000;
    const cache = shortCache(15_000, 200, () => now);
    cache.set("a", { n: 1 });
    now += 14_999;
    expect(cache.get("a")).toEqual({ n: 1 });
    now += 1;
    expect(cache.get("a")).toBeUndefined();
  });

  it("holds a bounded number of answers", () => {
    const cache = shortCache(15_000, 2, () => 0);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect([cache.get("b"), cache.get("c")]).toEqual([2, 3]);
  });
});

describe("rateLimiter", () => {
  it("lets a caller through up to the limit in a window, each caller on its own", () => {
    let now = 0;
    const allow = rateLimiter(2, 60_000, () => now);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
    expect(allow("b")).toBe(true);
    now = 60_000;
    expect(allow("a")).toBe(true);
  });
});

describe("discovery documents", () => {
  const origin = "https://devnet.acta.markets";

  it("the server card satisfies the published schema's required fields and patterns", () => {
    const card = serverCard(origin);
    expect(card.$schema).toBe("https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.description.length).toBeGreaterThan(0);
    expect(card.description.length).toBeLessThanOrEqual(100);
    expect(card.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(card.remotes).toEqual([{ type: "streamable-http", url: `${origin}/mcp` }]);
    // a card lists no tools and no capabilities: those come from the server itself
    expect(Object.keys(card)).not.toContain("tools");
    expect(Object.keys(card)).not.toContain("capabilities");
  });

  it("the catalog points at the card and nowhere else", () => {
    const catalog = aiCatalog(origin);
    expect(catalog.entries).toEqual([
      { identifier: "urn:air:acta.markets:acta:mcp", type: "application/mcp-server-card+json", url: `${origin}/mcp/server-card` },
    ]);
  });
});

describe("afterBody", () => {
  const stream = (chunks: string[], gate?: Promise<void>) =>
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          await gate;
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

  it("keeps what the reply needs alive until the stream has been read to its end", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let closed = 0;
    // the handler has returned: the stream is open and the tool behind it is still working
    const response = afterBody(new Response(stream(["a", "b"], gate), { status: 200 }), () => closed++, { "X-Test": "1" });
    expect(closed).toBe(0);
    expect(response.headers.get("X-Test")).toBe("1");
    release();
    expect(await response.text()).toBe("ab");
    expect(closed).toBe(1);
  });

  it("closes at once when there is no body, and once when the reader walks away", async () => {
    let closed = 0;
    afterBody(new Response(null, { status: 204 }), () => closed++);
    expect(closed).toBe(1);

    const response = afterBody(new Response(stream(["a", "b", "c"])), () => closed++);
    await response.body!.cancel();
    expect(closed).toBe(2);
  });

  it("keeps the status of the reply", () => {
    expect(afterBody(new Response("no", { status: 405 }), () => {}).status).toBe(405);
  });
});
