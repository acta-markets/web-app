import { describe, expect, it } from "vitest";
import { formatStrikePrice } from "./markets";

describe("strike price display", () => {
  it.each([
    [101, "$101"],
    [101.1, "$101.1"],
    [101.4, "$101.4"],
    [101.123456789, "$101.123456789"],
    [98_000.25, "$98,000.25"],
    [0.000031001, "$0.000031001"],
    [0.000000001, "$0.000000001"],
  ])("preserves the strike %s as %s", (strike, display) => {
    expect(formatStrikePrice(strike)).toBe(display);
  });
});
