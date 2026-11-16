// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { positionShareCard } from "@/lib/share/card";
import { encodeShareCard } from "@/lib/share/params";

const fonts = vi.hoisted(() => ({ loaded: 4 }));
vi.mock("@/lib/share/server-assets", async (original) => ({
  ...(await original<typeof import("@/lib/share/server-assets")>()),
  // no network in a test: a face is a name and an empty file, which is never drawn here
  shareCardFonts: async () => Array.from({ length: fonts.loaded }, () => ({ name: "JetBrains Mono", data: new ArrayBuffer(0), weight: 400, style: "normal" })),
  publicImage: async () => null,
}));
// the drawing itself is not under test, and its response is what joins the headers: keep the real class
import { GET } from "./route";

const card = positionShareCard(
  {
    isOpen: true,
    pnlNum: 12.5,
    pnlText: "+$12.50",
    symbol: "SOL",
    sentence: "SOL ends below $150 by Nov 28",
    side: "sell",
    productLabel: "Covered call",
    nowText: "$141.20",
    premiumText: "$31.40",
    expiryText: "Nov 28",
  } as never,
  { devnet: true, nowMs: Date.UTC(2026, 10, 16) },
);
const get = (query: string) => GET(new NextRequest(`https://devnet.acta.markets/share/card?${query}`));

describe("/share/card caching", () => {
  beforeEach(() => {
    fonts.loaded = 4;
  });

  it("states one rule for a complete card, not its own joined to the image response's year", async () => {
    const res = await get(`c=${encodeShareCard(card)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=604800, immutable");
  });

  it("lets nothing keep a card drawn without one of its faces", async () => {
    fonts.loaded = 3;
    const res = await get(`c=${encodeShareCard(card)}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses an address that is not a card", async () => {
    expect((await get("c=abc")).status).toBe(400);
  });
});
