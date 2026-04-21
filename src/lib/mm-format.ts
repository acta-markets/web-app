/**
 * Formatting + math helpers for the Market Maker dashboard.
 *
 * Wire conventions (see docs/internal/mm-dashboard-api.md §11):
 *   - price / strike / settlement_price: u64, 1e9 fixed-point per 1 underlying unit
 *   - quantity:                           u64, underlying atomic units
 *   - balances (deposited/committed/available):
 *                                         u64, token atomic units
 *   - timestamps:                         u64, Unix seconds
 */

import type {
  MakerPositionInfo,
  PositionStatus,
  WsU64,
} from "@acta-markets/ts-sdk/ws";

/** 1e9 fixed-point scale used by `price`, `strike`, `settlement_price`. */
export const FIXED_POINT_SCALE = 1_000_000_000n;

/**
 * Coerce an SDK u64 value (may arrive as string, number, or bigint) to bigint.
 * The SDK currently types them as `WsU64 = string | number` depending on
 * build; accept both plus bigint defensively.
 */
export function toBigInt(value: WsU64 | bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`toBigInt: non-finite number ${value}`);
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}

/**
 * Convert an atomic amount (e.g. `1_000_000_000n` with 9 decimals → `1`) to a
 * finite `number` suitable for display. Precision beyond ~15 significant digits
 * is lost — fine for UI, NOT for accounting math. Keep bigint for accounting.
 */
export function atomicToHuman(
  atomic: WsU64 | bigint | string | number,
  decimals: number,
): number {
  if (decimals < 0) throw new Error(`atomicToHuman: negative decimals ${decimals}`);
  const big = toBigInt(atomic);
  if (decimals === 0) return Number(big);
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  // Split to preserve precision for the integer part.
  return Number(whole) + Number(frac) / Number(divisor);
}

/**
 * Convert a human-readable amount (e.g. `1.5` SOL) to atomic units as bigint.
 * Truncates toward zero past `decimals` places; does NOT round.
 */
export function humanToAtomic(human: number | string, decimals: number): bigint {
  if (decimals < 0) throw new Error(`humanToAtomic: negative decimals ${decimals}`);
  const text = typeof human === "number" ? human.toString() : human.trim();
  if (text === "" || text === "-" || text === ".") return 0n;
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const [wholeRaw, fracRaw = ""] = body.split(".");
  if (!/^\d*$/.test(wholeRaw) || !/^\d*$/.test(fracRaw)) {
    throw new Error(`humanToAtomic: invalid number "${human}"`);
  }
  const fracPadded = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${wholeRaw || "0"}${fracPadded}`.replace(/^0+(?=\d)/, "");
  const atomic = BigInt(combined === "" ? "0" : combined);
  return negative ? -atomic : atomic;
}

/**
 * 1e9 fixed-point → human number. Used for strike, price, settlement_price.
 * Returns `number` so UI can format further; preserves more precision than a
 * naive `Number(x) / 1e9` by splitting the division.
 */
export function fixedPointToNumber(value: WsU64 | bigint | string | number): number {
  const big = toBigInt(value);
  const whole = big / FIXED_POINT_SCALE;
  const frac = big % FIXED_POINT_SCALE;
  return Number(whole) + Number(frac) / Number(FIXED_POINT_SCALE);
}

/**
 * Format a 1e9 fixed-point value as a USD (or other quote) string.
 *
 * Use for strike / mark / settlement. Uses en-US formatting with `maxFrac`
 * decimal places. For balance-style displays in token units, pair with
 * `atomicToHuman` + `Intl.NumberFormat` or call `formatUsd` on the result.
 */
export function fixedPointToUsd(
  value: WsU64 | bigint | string | number,
  maxFrac: number = 2,
): string {
  return formatUsd(fixedPointToNumber(value), maxFrac);
}

export function formatUsd(value: number, maxFrac: number = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  })}`;
}

export function formatAmount(
  atomic: WsU64 | bigint | string | number,
  decimals: number,
  maxFrac: number = 4,
): string {
  const n = atomicToHuman(atomic, decimals);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

/**
 * Human-readable relative time for an expiry timestamp.
 * `expiryTsSeconds` is Unix seconds. `nowMs` is injected for testability.
 *
 *   - `< 60s`              → `"<1m"`
 *   - `< 1h`               → `"23m"`
 *   - `< 24h`              → `"7h 12m"`
 *   - `>= 24h`             → `"5d 4h"`
 *   - expired (past `now`) → `"expired"`
 */
export function relativeExpiry(
  expiryTsSeconds: WsU64 | bigint | string | number,
  nowMs: number = Date.now(),
): string {
  const nowSec = Math.floor(nowMs / 1000);
  const diff = Number(toBigInt(expiryTsSeconds) - BigInt(nowSec));
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / 86_400);
  const hours = Math.floor((diff % 86_400) / 3_600);
  const minutes = Math.floor((diff % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

/**
 * Color scheme hint for rendering a position/quote status pill. Returns the
 * semantic name the UI layer maps to actual Tailwind classes.
 */
export type PillColor = "yuzu" | "amber" | "red" | "slate" | "accent";

export function pillColorForStatus(status: PositionStatus | string): PillColor {
  switch (status) {
    case "open":
      return "amber";
    case "funded":
      return "yuzu";
    case "liquidated":
      return "red";
    case "settled":
      return "slate";
    case "none":
    default:
      return "slate";
  }
}

/**
 * Intrinsic value (in quote-token human units) for a terminal-status position
 * row, derived from `settlement_price` because realized P&L is not transmitted.
 *
 *   call: max(0, settlement - strike) * quantity / 1e9
 *   put:  max(0, strike - settlement) * quantity / 1e9
 *
 * All inputs are raw SDK values (atomic units / 1e9 fixed-point). Returns a
 * `number` in human quote-token units (e.g. USDC with 6 decimals → already
 * human-scaled via `underlyingDecimals` normalization).
 *
 * Returns `null` when `settlement_price` is missing (non-terminal row).
 */
export function intrinsicForRow(row: Pick<
  MakerPositionInfo,
  | "position_type"
  | "strike"
  | "quantity"
  | "settlement_price"
  | "underlying_decimals"
>): number | null {
  if (row.settlement_price == null) return null;
  const settlement = toBigInt(row.settlement_price);
  const strike = toBigInt(row.strike);
  const qty = toBigInt(row.quantity);
  const diff =
    row.position_type === "covered_call"
      ? settlement - strike
      : strike - settlement;
  if (diff <= 0n) return 0;
  // (diff[1e9] × qty[atomic]) / 1e9 gives a value scaled by underlying atomic
  // units. Divide by 10^underlyingDecimals to land in human quote units.
  const scaled = (diff * qty) / FIXED_POINT_SCALE;
  const decimalsDivisor = 10n ** BigInt(row.underlying_decimals);
  const whole = scaled / decimalsDivisor;
  const frac = scaled % decimalsDivisor;
  return Number(whole) + Number(frac) / Number(decimalsDivisor);
}
