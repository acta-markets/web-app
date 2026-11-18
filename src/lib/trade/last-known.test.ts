import { describe, expect, it } from "vitest";
import type { TokenMarketsInfoData } from "@/lib/rfq-client";
import { lastKnownSnapshot, PREMIUM_SHOW_MS, SNAPSHOT_SHOW_MS } from "./last-known";

const savedAt = 1_800_000_000_000;
const savedSec = savedAt / 1000;

function snapshot(freshness: Array<{ type: string; updated_at?: number }>): TokenMarketsInfoData {
  return {
    request_id: "r", reference_price: 100e9,
    markets: [{ market_pda: "m", expiry_ts: savedSec + 7 * 86400, is_put: true, indicatives: freshness.map((f) => ({ position_type: "cash_secured_put", side: "sell", freshness: f, strikes: [] })) }],
  } as unknown as TokenMarketsInfoData;
}
const kinds = (s: TokenMarketsInfoData | null) => s?.markets?.flatMap((m) => m.indicatives.map((i) => i.freshness.type));

describe("the saved snapshot Trade may draw from", () => {
  it("is the saved one unchanged while its premiums are recent", () => {
    const data = snapshot([{ type: "fresh", updated_at: savedSec }]);
    expect(lastKnownSnapshot({ data, updatedAt: savedAt }, savedAt + PREMIUM_SHOW_MS)).toBe(data);
  });

  it("marks a premium stale once it is older than ten minutes, by the premium's own time", () => {
    const data = snapshot([{ type: "fresh", updated_at: savedSec }, { type: "fresh", updated_at: savedSec - 9 * 60 }]);
    const at = savedAt + 2 * 60 * 1000;
    expect(kinds(lastKnownSnapshot({ data, updatedAt: savedAt }, at))).toEqual(["fresh", "stale"]);
    expect(kinds(data)).toEqual(["fresh", "fresh"]);
  });

  it("leaves a premium that was already stale or missing as it was", () => {
    const data = snapshot([{ type: "stale", updated_at: savedSec }, { type: "no_data" }]);
    expect(lastKnownSnapshot({ data, updatedAt: savedAt }, savedAt + 60 * 60 * 1000)).toBe(data);
  });

  it("keeps dates, strikes and the reference price for a day", () => {
    const data = snapshot([{ type: "fresh", updated_at: savedSec }]);
    const shown = lastKnownSnapshot({ data, updatedAt: savedAt }, savedAt + SNAPSHOT_SHOW_MS);
    expect(shown?.reference_price).toBe(100e9);
    expect(kinds(shown)).toEqual(["stale"]);
  });

  it("is nothing after a day, or when nothing was saved", () => {
    const data = snapshot([{ type: "fresh", updated_at: savedSec }]);
    expect(lastKnownSnapshot({ data, updatedAt: savedAt }, savedAt + SNAPSHOT_SHOW_MS + 1)).toBeNull();
    expect(lastKnownSnapshot({ data: undefined, updatedAt: 0 }, savedAt)).toBeNull();
    expect(lastKnownSnapshot({ data, updatedAt: 0 }, savedAt)).toBeNull();
  });
});
