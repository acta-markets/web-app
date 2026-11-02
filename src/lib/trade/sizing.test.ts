import { describe, expect, it } from "vitest";
import {
  alignQuantityToRule,
  defaultAmount,
  depositInputDecimals,
  depositRuleFor,
  depositToQuantity,
  formatInputValue,
  presetAmounts,
  quantityToDeposit,
} from "./sizing";

// SOL-like market: 9 decimals, 0.1 SOL minimum and step, 10 SOL maximum
const solRule = { min_size: 1e8, max_size: 1e10, step: 1e8 };

describe("aligning a quantity to the size rule", () => {
  // 1000 USDC at a $150 strike is 6.666… SOL
  const typed = depositToQuantity({ amount: 1000, isPut: true, strike1e9: 150e9, underlyingDecimals: 9 })!;

  it("rounds to the nearest step by default, which can lock more than typed", () => {
    const q = alignQuantityToRule(typed, solRule);
    expect(q).toBe(6.7e9);
    expect(quantityToDeposit({ quantity: q, isPut: true, strike1e9: 150e9, underlyingDecimals: 9 })).toBe(1005);
  });

  it("floors when asked, so it never locks more than typed", () => {
    const q = alignQuantityToRule(typed, solRule, "floor");
    expect(q).toBe(6.6e9);
    expect(quantityToDeposit({ quantity: q, isPut: true, strike1e9: 150e9, underlyingDecimals: 9 })).toBe(990);
  });

  it("clamps into the rule's bounds", () => {
    expect(alignQuantityToRule(1, solRule, "floor")).toBe(1e8);
    expect(alignQuantityToRule(5e10, solRule, "floor")).toBe(1e10);
  });
});

describe("deposit rules and conversions", () => {
  it("states a call's rule in the asset and a put's rule in USDC at the strike", () => {
    expect(depositRuleFor({ isPut: false, sizeRule: solRule, strike1e9: 0, underlyingDecimals: 9 }))
      .toEqual({ min: 0.1, max: 10, step: 0.1 });
    expect(depositRuleFor({ isPut: true, sizeRule: solRule, strike1e9: 150e9, underlyingDecimals: 9 }))
      .toEqual({ min: 15, max: 1500, step: 15 });
    expect(depositRuleFor({ isPut: true, sizeRule: solRule, strike1e9: 0, underlyingDecimals: 9 })).toBeNull();
    expect(depositRuleFor({ isPut: false, sizeRule: null, strike1e9: 0, underlyingDecimals: 9 })).toBeNull();
  });

  it.each([
    ["BONK", 5, false, 100_000, 0, 10_000_000_000],
    ["JLP", 6, true, 100, 4.5e9, 22_222_222],
    ["zBTC", 8, false, 0.01, 0, 1_000_000],
    ["SOL", 9, false, 0.5, 0, 500_000_000],
  ])("converts a %s deposit with %i decimals", (_asset, decimals, isPut, amount, strike1e9, quantity) => {
    expect(depositToQuantity({ amount, isPut, strike1e9, underlyingDecimals: decimals })).toBe(quantity);
  });

  it("has no quantity for an empty or unpriceable deposit", () => {
    expect(depositToQuantity({ amount: 0, isPut: false, strike1e9: 0, underlyingDecimals: 9 })).toBeNull();
    expect(depositToQuantity({ amount: Number.NaN, isPut: false, strike1e9: 0, underlyingDecimals: 9 })).toBeNull();
    expect(depositToQuantity({ amount: 10, isPut: true, strike1e9: 0, underlyingDecimals: 9 })).toBeNull();
  });

  it("keeps at least cents for USDC and follows the step otherwise", () => {
    expect(depositInputDecimals({ min: 15, max: 1500, step: 15 }, true, 9)).toBe(2);
    expect(depositInputDecimals({ min: 0.1, max: 10, step: 0.1 }, false, 9)).toBe(1);
    expect(depositInputDecimals(null, false, 6)).toBe(6);
    expect(formatInputValue(6.7000000001, 4)).toBe("6.7");
  });
});

describe("preset and default amounts", () => {
  const rule = { min: 0.1, max: 10, step: 0.1 };

  it("caps MAX at the balance on the step grid, and HALF at half of that", () => {
    const { half, max } = presetAmounts({ rule, balance: 3.37, isPut: false });
    expect(max).toBeCloseTo(3.3);
    expect(half).toBeCloseTo(1.6);
  });

  it("falls back to fixed caps without a rule", () => {
    expect(presetAmounts({ rule: null, balance: null, isPut: true })).toEqual({ half: 2500, max: 5000 });
  });

  it("starts near $100: in USDC for a put, in the asset at spot for a call", () => {
    expect(defaultAmount({ rule: { min: 15, max: 1500, step: 15 }, isPut: true, spot: 160 })).toBe(105);
    expect(defaultAmount({ rule, isPut: false, spot: 160 })).toBeCloseTo(0.6);
    expect(defaultAmount({ rule: { min: 15, max: 50, step: 5 }, isPut: true, spot: 160 })).toBe(50);
  });

  it("has no default before the rule or, for a call, the spot is known", () => {
    expect(defaultAmount({ rule: null, isPut: true, spot: 160 })).toBeNull();
    expect(defaultAmount({ rule, isPut: false, spot: null })).toBeNull();
  });
});
