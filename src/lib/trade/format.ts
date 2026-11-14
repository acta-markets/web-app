import { numberFormat } from "@/lib/number-format";
import { displayQuoteSymbol } from "@/lib/tokens";

// Built once and reused: `toLocaleDateString` builds a new formatter on every call.
const DATE_WITH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" });
const DATE_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" });
const DAY_UTC = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const TIME_UTC = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function formatDate(d: Date) {
  return DATE_WITH_YEAR.format(d);
}

export function formatShortDate(d: Date) {
  return DATE_SHORT.format(d);
}

/** A quote-denominated amount with the network's quote label: "USDC" on mainnet, "USDC-DEV" on devnet. */
export function formatUsdc(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${numberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${displayQuoteSymbol()}`;
}

/** Expiry day in UTC, e.g. "Nov 7". Settlement times are UTC, so the day never shifts with the viewer. */
export function formatExpiryDay(expiryMs: number) {
  return DAY_UTC.format(new Date(expiryMs));
}

/** e.g. "Nov 7, 08:00 UTC" */
export function formatExpiryUtc(expiryMs: number) {
  const date = new Date(expiryMs);
  const day = DAY_UTC.format(date);
  const time = TIME_UTC.format(date);
  return `${day}, ${time} UTC`;
}

/** A derived price such as a break-even: cents for everyday prices, more digits for tiny ones. */
export function formatPrice(n: number) {
  const abs = Math.abs(n);
  const maximumFractionDigits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  return numberFormat({
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs >= 1 && abs < 1000 ? 2 : 0,
    maximumFractionDigits,
  }).format(n);
}

/** A dollar amount such as a premium: cents, or "<$0.01" for dust. */
export function formatUsdAmount(n: number) {
  if (n > 0 && n < 0.01) return "<$0.01";
  return numberFormat({ style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** Time left in words, rounded: "4 days", "1 day", "20 hours", "under an hour". */
export function formatTimeAway(expiryMs: number, nowMs: number) {
  const hours = (expiryMs - nowMs) / 3_600_000;
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (hours >= 1) {
    const whole = Math.round(hours);
    return `${whole} hour${whole === 1 ? "" : "s"}`;
  }
  return "under an hour";
}

/** Exact time left, e.g. "3d 1h", "5h", "40m". */
export function formatCountdown(expiryMs: number, nowMs: number) {
  const minutes = Math.max(0, Math.floor((expiryMs - nowMs) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/** A token amount with grouping and at most `maxDecimals` fraction digits. */
export function formatAmount(value: number, maxDecimals = 4) {
  if (!Number.isFinite(value)) return "—";
  return numberFormat({ maximumFractionDigits: maxDecimals }).format(value);
}

/** Time to expiry: in hours inside the last day, whole days before that. */
export function formatTerm(expiryMs: number, nowMs: number): { long: string; short: string } {
  const msToExpiry = expiryMs - nowMs;
  const hours = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60)));
  const days = Math.max(1, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
  if (days <= 1 || hours < 24) {
    return { long: `${hours} hour${hours !== 1 ? "s" : ""}`, short: `${hours}h` };
  }
  return { long: `${days} days`, short: `${days}d` };
}
