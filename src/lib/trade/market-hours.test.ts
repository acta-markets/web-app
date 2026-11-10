import { describe, expect, it } from "vitest";
import { isQqqExpiry, restrictsToFridayExpiry } from "./market-hours";

const ts = (iso: string) => Date.parse(iso) / 1000;

describe("QQQ expiry slot", () => {
  it("accepts Friday 19:30 UTC", () => {
    expect(isQqqExpiry(ts("2026-11-13T19:30:00Z"))).toBe(true);
  });

  it("rejects other weekdays, times and the bare Friday close", () => {
    expect(isQqqExpiry(ts("2026-11-12T19:30:00Z"))).toBe(false);
    expect(isQqqExpiry(ts("2026-11-13T19:00:00Z"))).toBe(false);
    expect(isQqqExpiry(ts("2026-11-13T16:00:00Z"))).toBe(false);
  });

  it("restricts only QQQ, whatever the casing", () => {
    expect(restrictsToFridayExpiry("qqq")).toBe(true);
    expect(restrictsToFridayExpiry(" QQQ ")).toBe(true);
    expect(restrictsToFridayExpiry("TSLA")).toBe(false);
    expect(restrictsToFridayExpiry("SOL")).toBe(false);
  });
});
