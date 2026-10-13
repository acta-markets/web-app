// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const get = (query: string) => GET(new Request(`http://localhost/api/market/price${query}`));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/market/price", () => {
  it("asks CoinGecko once for every known symbol and answers by symbol", async () => {
    const upstream = vi.fn(async () => Response.json({ "jito-staked-sol": { usd: 143.81 }, "usd-coin": { usd: 1 } }));
    vi.stubGlobal("fetch", upstream);

    const res = await get("?symbols=usdc,jitoSOL,NOPE");
    expect(await res.json()).toEqual({ ok: true, prices: { USDC: 1, JITOSOL: 143.81 } });
    expect(upstream).toHaveBeenCalledTimes(1);
    // ids sorted, so callers asking in any order share the cached answer
    expect(String((upstream.mock.calls[0] as unknown[])[0])).toContain("ids=jito-staked-sol%2Cusd-coin&");
  });

  it("leaves out symbols the upstream has no price for", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ solana: {} })));
    expect(await (await get("?symbols=SOL")).json()).toEqual({ ok: true, prices: {} });
  });

  it("does not call out when no symbol has a price source", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(await (await get("?symbols=NOPE,")).json()).toEqual({ ok: true, prices: {} });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers 502 when the upstream fails, so clients keep the prices they have", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    expect((await get("?symbols=SOL")).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await get("?symbols=SOL")).status).toBe(502);
  });
});
