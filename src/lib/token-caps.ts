function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function toNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export type TokenCapLike = {
  current_oi?: unknown;
  max_oi?: unknown;
  utilization?: unknown;
};

export function getCapFilledPct(cap: TokenCapLike | null | undefined): number | null {
  if (!cap) return null;

  const currentOi = toNumber(cap.current_oi);
  const maxOi = toNumber(cap.max_oi);
  if (currentOi != null && maxOi != null && maxOi > 0) {
    return clampPct((currentOi / maxOi) * 100);
  }

  const utilization = toNumber(cap.utilization);
  if (utilization == null) return null;
  const asPercent = utilization <= 1 ? utilization * 100 : utilization;
  return clampPct(asPercent);
}

export function getCapLeftPct(cap: TokenCapLike | null | undefined): number | null {
  const filled = getCapFilledPct(cap);
  if (filled == null) return null;
  return clampPct(100 - filled);
}
