import { describe, expect, it } from "vitest";

import {
  atomicToHuman,
  fixedPointToNumber,
  fixedPointToUsd,
  formatAmount,
  formatUsd,
  humanToAtomic,
  intrinsicForRow,
  pillColorForStatus,
  relativeExpiry,
  toBigInt,
} from "./mm-format";

describe("toBigInt", () => {
  it("accepts bigint, number, and string", () => {
    expect(toBigInt(42n)).toBe(42n);
    expect(toBigInt(42)).toBe(42n);
    expect(toBigInt("42")).toBe(42n);
  });

  it("truncates fractional numbers", () => {
    expect(toBigInt(1.9)).toBe(1n);
  });

  it("rejects non-finite", () => {
    expect(() => toBigInt(Infinity)).toThrow();
    expect(() => toBigInt(NaN)).toThrow();
  });
});

describe("atomicToHuman", () => {
  it("handles 9-decimal SOL amounts", () => {
    expect(atomicToHuman(1_000_000_000n, 9)).toBe(1);
    expect(atomicToHuman(1_500_000_000n, 9)).toBeCloseTo(1.5);
  });

  it("handles 6-decimal USDC amounts", () => {
    expect(atomicToHuman(5_000_000n, 6)).toBe(5);
    expect(atomicToHuman(123_456n, 6)).toBeCloseTo(0.123456);
  });

  it("handles zero decimals", () => {
    expect(atomicToHuman(123n, 0)).toBe(123);
  });

  it("throws on negative decimals", () => {
    expect(() => atomicToHuman(1n, -1)).toThrow();
  });
});

describe("humanToAtomic", () => {
  it("roundtrips with atomicToHuman for whole numbers", () => {
    expect(humanToAtomic("1", 9)).toBe(1_000_000_000n);
    expect(humanToAtomic(2.5, 6)).toBe(2_500_000n);
  });

  it("truncates beyond decimals (does not round)", () => {
    // 1.123456789 with 6 decimals → 1.123456 → 1_123_456
    expect(humanToAtomic("1.123456789", 6)).toBe(1_123_456n);
  });

  it("handles empty and partial inputs", () => {
    expect(humanToAtomic("", 6)).toBe(0n);
    expect(humanToAtomic(".", 6)).toBe(0n);
    expect(humanToAtomic("0.1", 9)).toBe(100_000_000n);
  });

  it("rejects invalid", () => {
    expect(() => humanToAtomic("abc", 6)).toThrow();
  });
});

describe("fixedPointToNumber / fixedPointToUsd", () => {
  it("converts 1e9 fixed-point", () => {
    expect(fixedPointToNumber(150_000_000_000n)).toBe(150);
    expect(fixedPointToNumber(5_000_000_000n)).toBe(5);
  });

  it("formats as USD with 2 decimals by default", () => {
    expect(fixedPointToUsd(150_000_000_000n)).toBe("$150");
    expect(fixedPointToUsd(150_250_000_000n)).toBe("$150.25");
  });
});

describe("formatUsd / formatAmount", () => {
  it("formatUsd handles non-finite", () => {
    expect(formatUsd(NaN)).toBe("—");
    expect(formatUsd(Infinity)).toBe("—");
  });

  it("formatUsd thousands separator", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.5");
  });

  it("formatAmount clamps fraction digits", () => {
    expect(formatAmount(1_123_456n, 6, 2)).toBe("1.12");
    expect(formatAmount(1_123_456n, 6, 6)).toBe("1.123456");
  });
});

describe("relativeExpiry", () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_SEC = 1_700_000_000;

  it("returns 'expired' for past timestamps", () => {
    expect(relativeExpiry(NOW_SEC - 1, NOW_MS)).toBe("expired");
    expect(relativeExpiry(NOW_SEC, NOW_MS)).toBe("expired");
  });

  it("formats sub-minute as <1m", () => {
    expect(relativeExpiry(NOW_SEC + 30, NOW_MS)).toBe("<1m");
  });

  it("formats minutes under an hour", () => {
    expect(relativeExpiry(NOW_SEC + 23 * 60, NOW_MS)).toBe("23m");
  });

  it("formats hours + minutes under a day", () => {
    expect(relativeExpiry(NOW_SEC + 7 * 3600 + 12 * 60, NOW_MS)).toBe("7h 12m");
  });

  it("formats days + hours", () => {
    expect(relativeExpiry(NOW_SEC + 5 * 86_400 + 4 * 3600, NOW_MS)).toBe("5d 4h");
  });
});

describe("pillColorForStatus", () => {
  it("maps known statuses", () => {
    expect(pillColorForStatus("open")).toBe("amber");
    expect(pillColorForStatus("funded")).toBe("yuzu");
    expect(pillColorForStatus("liquidated")).toBe("red");
    expect(pillColorForStatus("settled")).toBe("slate");
    expect(pillColorForStatus("none")).toBe("slate");
  });

  it("falls back to slate for unknown", () => {
    expect(pillColorForStatus("whatever")).toBe("slate");
  });
});

describe("intrinsicForRow", () => {
  it("returns null without settlement_price", () => {
    expect(
      intrinsicForRow({
        position_type: "covered_call",
        strike: 150_000_000_000,
        quantity: 1_000_000_000,
        settlement_price: null,
        underlying_decimals: 9,
      }),
    ).toBeNull();
  });

  it("call: pays settlement - strike when ITM", () => {
    // strike=150, settlement=155, qty=1 SOL → intrinsic=5 (quote units)
    const v = intrinsicForRow({
      position_type: "covered_call",
      strike: 150_000_000_000,
      quantity: 1_000_000_000,
      settlement_price: 155_000_000_000,
      underlying_decimals: 9,
    });
    expect(v).toBeCloseTo(5);
  });

  it("call: zero when OTM", () => {
    const v = intrinsicForRow({
      position_type: "covered_call",
      strike: 150_000_000_000,
      quantity: 1_000_000_000,
      settlement_price: 140_000_000_000,
      underlying_decimals: 9,
    });
    expect(v).toBe(0);
  });

  it("put: pays strike - settlement when ITM", () => {
    const v = intrinsicForRow({
      position_type: "cash_secured_put",
      strike: 150_000_000_000,
      quantity: 2_000_000_000,
      settlement_price: 140_000_000_000,
      underlying_decimals: 9,
    });
    // (150 - 140) * 2 = 20
    expect(v).toBeCloseTo(20);
  });

  it("put: zero when OTM", () => {
    const v = intrinsicForRow({
      position_type: "cash_secured_put",
      strike: 150_000_000_000,
      quantity: 1_000_000_000,
      settlement_price: 160_000_000_000,
      underlying_decimals: 9,
    });
    expect(v).toBe(0);
  });
});
