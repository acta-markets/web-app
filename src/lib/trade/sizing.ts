import {
  quantityToQuoteAmount,
  quoteAmountToQuantity,
  sizeRuleInQuoteTerms,
} from "@acta-markets/ts-sdk/ws";

/** A market's size rule as sent on the wire, in underlying atomic units. */
export type SizeRule = { min_size: number; max_size: number; step: number };

/** The size rule in what the user deposits: the asset for a call, USDC for a put. */
export type DepositRule = { min: number; max: number; step: number };

export function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Puts a wire quantity on the rule's step grid inside its bounds. `round` takes the
 * nearest step and can lock slightly more than the user typed; `floor` never does.
 */
export function alignQuantityToRule(quantity: number, rule: SizeRule, mode: "round" | "floor" = "round"): number {
  const snap = mode === "floor" ? Math.floor : Math.round;
  const clamped = Math.max(rule.min_size, Math.min(rule.max_size, snap(quantity)));
  if (rule.step <= 0) return clamped;
  const offset = clamped - rule.min_size;
  const steps = snap(offset / rule.step);
  const snapped = rule.min_size + steps * rule.step;
  return Math.max(rule.min_size, Math.min(rule.max_size, snapped));
}

export function decimalsFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const text = step.toString();
  if (!text.includes(".")) return 0;
  return Math.min(9, text.split(".")[1]?.length ?? 0);
}

export function formatInputValue(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "";
  if (maxDecimals <= 0) return String(Math.round(value));
  return value.toFixed(maxDecimals).replace(/\.?0+$/, "");
}

export function depositRuleFor({
  isPut,
  sizeRule,
  strike1e9,
  underlyingDecimals,
}: {
  isPut: boolean;
  sizeRule: SizeRule | null;
  strike1e9: number;
  underlyingDecimals: number;
}): DepositRule | null {
  if (!sizeRule) return null;
  if (!isPut) {
    const scale = 10 ** underlyingDecimals;
    return {
      min: sizeRule.min_size / scale,
      max: sizeRule.max_size / scale,
      step: sizeRule.step / scale,
    };
  }
  if (strike1e9 <= 0) return null;
  return sizeRuleInQuoteTerms(sizeRule, strike1e9, underlyingDecimals);
}

/** Fraction digits the deposit field accepts: at least cents for USDC. */
export function depositInputDecimals(rule: DepositRule | null, isPut: boolean, underlyingDecimals: number): number {
  if (!rule) return isPut ? 2 : Math.min(9, underlyingDecimals);
  return Math.max(isPut ? 2 : 0, decimalsFromStep(rule.step));
}

/** Wire quantity for a typed deposit, or null when it cannot be computed. */
export function depositToQuantity({
  amount,
  isPut,
  strike1e9,
  underlyingDecimals,
}: {
  amount: number;
  isPut: boolean;
  strike1e9: number;
  underlyingDecimals: number;
}): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (isPut && strike1e9 <= 0) return null;
  try {
    return isPut
      ? quoteAmountToQuantity(amount, strike1e9, underlyingDecimals)
      : Math.round(amount * 10 ** underlyingDecimals);
  } catch {
    return null;
  }
}

/** The deposit a wire quantity locks: asset units for a call, USDC for a put. */
export function quantityToDeposit({
  quantity,
  isPut,
  strike1e9,
  underlyingDecimals,
}: {
  quantity: number;
  isPut: boolean;
  strike1e9: number;
  underlyingDecimals: number;
}): number {
  return isPut
    ? quantityToQuoteAmount(quantity, strike1e9, underlyingDecimals)
    : quantity / 10 ** underlyingDecimals;
}

/** HALF and MAX: the smaller of the balance and the rule's max, snapped down to the step. */
export function presetAmounts({
  rule,
  balance,
  isPut,
}: {
  rule: DepositRule | null;
  balance: number | null;
  isPut: boolean;
}): { half: number; max: number } {
  const min = rule?.min ?? 0;
  const step = rule?.step ?? 0;
  const ruleMax = rule?.max ?? (isPut ? 5000 : 10);
  const snapDown = (value: number) =>
    step > 0 ? Math.max(min, min + Math.floor((value - min) / step) * step) : value;
  const max = snapDown(balance != null ? Math.min(balance, ruleMax) : ruleMax);
  return { half: snapDown(max / 2), max };
}

/**
 * A starting deposit, on the step grid and inside the rule: worth about `targetUsd`, or
 * `targetUnits` of the asset when the asset has a set starting size (0.1 BTC).
 */
export function defaultAmount({
  rule,
  isPut,
  spot,
  targetUsd = 100,
  targetUnits,
}: {
  rule: DepositRule | null;
  isPut: boolean;
  spot: number | null;
  targetUsd?: number;
  targetUnits?: number;
}): number | null {
  if (!rule) return null;
  const hasSpot = spot != null && spot > 0;
  const target =
    targetUnits != null
      ? isPut
        ? hasSpot ? targetUnits * spot : null
        : targetUnits
      : isPut
        ? targetUsd
        : hasSpot ? targetUsd / spot : null;
  if (target == null) return null;
  const stepped = rule.step > 0 ? rule.min + Math.round((target - rule.min) / rule.step) * rule.step : target;
  return clampNumber(stepped, rule.min, rule.max);
}
