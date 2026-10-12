import { IS_MAINNET } from "@/lib/tokens";
import { PRICE_SCALE } from "./math";

/** Empty-value glyph for tiles and tables. Never used inside a sentence. */
export const NONE = "—";

export function formatPercent(
  value: number | null | undefined,
  opts: { digits?: number; signed?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return NONE;
  const digits = opts.digits ?? 2;
  const rounded = Number(value.toFixed(digits));
  const sign = rounded < 0 ? "-" : opts.signed && rounded > 0 ? "+" : "";
  const abs = Math.abs(rounded).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${sign}${abs}%`;
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats base units without going through a float, truncating rather than
 * rounding so a balance is never shown larger than it is.
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  opts: { maxFractionDigits?: number; compact?: boolean } = {},
): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;

  if (opts.compact && whole >= 1_000_000n) {
    const approx = Number(abs) / Number(base);
    const compact = approx.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
    return `${negative ? "-" : ""}${compact}`;
  }

  const maxFraction = opts.maxFractionDigits ?? (whole >= 1000n ? 2 : whole >= 1n ? 4 : Math.min(decimals, 6));
  const fraction = decimals === 0
    ? ""
    : (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${negative ? "-" : ""}${groupDigits(whole.toString())}${fraction ? `.${fraction}` : ""}`;
}

/** Share price is main-asset units per share, scaled by PRICE_SCALE. */
export function formatSharePrice(price: string | bigint): string {
  const value = Number(BigInt(price)) / Number(PRICE_SCALE);
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 6 : 4;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function formatDuration(totalSecs: number): string {
  const secs = Math.max(0, Math.floor(totalSecs));
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  const minutes = Math.floor((secs % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return secs > 0 ? `${Math.max(1, minutes)}m` : "0m";
}

export function formatCountdown(targetSecs: number, nowSecs: number): string {
  return formatDuration(targetSecs - nowSecs);
}

export function formatDate(secs: number, opts: { year?: boolean; time?: boolean } = {}): string {
  const date = new Date(secs * 1000);
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
  });
  if (!opts.time) return day;
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${time}`;
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function solscanUrl(kind: "account" | "tx" | "token", id: string): string {
  return `https://solscan.io/${kind}/${id}${IS_MAINNET ? "" : "?cluster=devnet"}`;
}
