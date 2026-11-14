import { describe, expect, it } from "vitest";
import { createHistoryStore, type PricePoint } from "./store";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 12);
/** An hourly series covering the last `days` days and ending now. */
const hourly = (days: number): PricePoint[] =>
  Array.from({ length: days * 24 + 1 }, (_, i) => [NOW - (days * 24 - i) * HOUR, 100 + i]);

describe("history store", () => {
  it("returns the series it was given for the same coin and range", () => {
    const store = createHistoryStore();
    const week = hourly(7);
    store.remember("bitcoin", 7, week);
    expect(store.recall("bitcoin", 7, NOW)).toBe(week);
  });

  it("cuts a longer series down to the asked window when the exact range was never seen", () => {
    const store = createHistoryStore();
    store.remember("bitcoin", 90, hourly(90));
    store.remember("bitcoin", 30, hourly(30));
    const week = store.recall("bitcoin", 7, NOW)!;
    expect(week).toHaveLength(7 * 24 + 1);
    expect(week[0][0]).toBe(NOW - 7 * 24 * HOUR);
    expect(week[week.length - 1][0]).toBe(NOW);
  });

  it("has nothing for an unseen coin, a shorter range only, or an empty series", () => {
    const store = createHistoryStore();
    store.remember("bitcoin", 1, hourly(1));
    store.remember("solana", 7, []);
    expect(store.recall("ethereum", 7, NOW)).toBeNull();
    expect(store.recall("bitcoin", 7, NOW)).toBeNull();
    expect(store.recall("solana", 7, NOW)).toBeNull();
  });
});
