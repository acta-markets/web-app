import { describe, expect, it } from "vitest";
import {
  NONE,
  formatBps,
  formatDate,
  formatDuration,
  formatPercent,
  formatSharePrice,
  formatTokenAmount,
  formatUsd,
  shortAddress,
  solscanUrl,
} from "./format";

describe("formatPercent", () => {
  it("formats with fixed digits and an optional sign", () => {
    expect(formatPercent(12.345)).toBe("12.35%");
    expect(formatPercent(1234.5, { digits: 1 })).toBe("1,234.5%");
    expect(formatPercent(1.2, { signed: true })).toBe("+1.20%");
    expect(formatPercent(-1.2, { signed: true })).toBe("-1.20%");
  });

  it("never shows a negative zero and falls back for missing values", () => {
    expect(formatPercent(-0.001)).toBe("0.00%");
    expect(formatPercent(null)).toBe(NONE);
    expect(formatPercent(Number.NaN)).toBe(NONE);
  });
});

describe("formatUsd", () => {
  it("keeps three significant digits and goes compact from a thousand", () => {
    expect(formatUsd(950)).toBe("$950");
    expect(formatUsd(101_797)).toBe("$102K");
    expect(formatUsd(2_108_855)).toBe("$2.11M");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
});

describe("formatTokenAmount", () => {
  it("formats base units without floating point and truncates", () => {
    expect(formatTokenAmount(350_000_000n, 9)).toBe("0.35");
    expect(formatTokenAmount(1_234_567_890_123n, 9)).toBe("1,234.56");
    expect(formatTokenAmount(1_999_999n, 6)).toBe("1.9999");
    expect(formatTokenAmount(1_500_000n, 6, { maxFractionDigits: 0 })).toBe("1");
    expect(formatTokenAmount(-2_000_000n, 6)).toBe("-2");
    expect(formatTokenAmount(7n, 0)).toBe("7");
  });

  it("compacts large amounts on request", () => {
    expect(formatTokenAmount(12_345_678n * 10n ** 6n, 6, { compact: true })).toBe("12.35M");
    expect(formatTokenAmount(999_999n * 10n ** 6n, 6, { compact: true })).toBe("999,999");
  });
});

describe("other formatters", () => {
  it("formats share price, fees and durations", () => {
    expect(formatSharePrice("1023400000")).toBe("1.0234");
    expect(formatSharePrice(5_000_000n)).toBe("0.005000");
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(250)).toBe("2.5%");
    expect(formatDuration(43_200)).toBe("12h");
    expect(formatDuration(90_000)).toBe("1d 1h");
    expect(formatDuration(3_660)).toBe("1h 1m");
    expect(formatDuration(59)).toBe("1m");
    expect(formatDuration(-5)).toBe("0m");
  });

  it("formats dates in short month form", () => {
    // midday UTC so the calendar date is the same in nearly every time zone
    expect(formatDate(Date.UTC(2026, 9, 16, 12) / 1000)).toBe("Oct 16");
    expect(formatDate(Date.UTC(2026, 9, 16, 12) / 1000, { year: true })).toBe("Oct 16, 2026");
  });

  it("includes the local zone whenever it displays a time", () => {
    const secs = Date.UTC(2026, 9, 16, 12) / 1000;
    const zone = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(new Date(secs * 1000)).find(part => part.type === "timeZoneName")!.value;
    expect(formatDate(secs, { time: true })).toContain(zone);
  });

  it("shortens addresses and links the right cluster", () => {
    expect(shortAddress("9amKA1ezPyPoYik7N1QCBE4N3d9mm2fQfmFfLNbSSbUf")).toBe("9amK…SbUf");
    expect(shortAddress("short")).toBe("short");
    // unit tests run without NEXT_PUBLIC_SOLANA_NETWORK, which means devnet
    expect(solscanUrl("tx", "abc")).toBe("https://solscan.io/tx/abc?cluster=devnet");
  });
});
