import type { Vault } from "./types";

export const PRICE_SCALE = 1_000_000_000n;

export function parseUnits(value: string, decimals: number): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  return BigInt(`${match[1] || "0"}${fraction.padEnd(decimals, "0")}`);
}

export function formatUnits(value: bigint, decimals: number, maxFractionDigits = decimals): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function sharesToMain(shares: bigint, sharePrice: bigint): bigint {
  return (shares * sharePrice) / PRICE_SCALE;
}

export function mainToShares(amount: bigint, sharePrice: bigint): bigint {
  if (sharePrice === 0n) return 0n;
  return (amount * PRICE_SCALE) / sharePrice;
}

export function depositCapacity(vault: Vault): bigint | null {
  const cap = BigInt(vault.cap_limit);
  if (cap === 0n) return null;
  const used = BigInt(vault.equity) + BigInt(vault.pending_deposit_amount);
  return used >= cap ? 0n : cap - used;
}
