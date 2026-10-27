export type MarketType = "call" | "csp";

import type { EarnAssetSummary } from "@/lib/rfq-client";

export function summaryCapFilledPct(summary: Pick<EarnAssetSummary, "cap_filled_pct"> | null | undefined): number | null {
  const value = summary?.cap_filled_pct;
  return value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value * 100));
}

export function formatPct(n: number) {
  return `${Math.round(n)}%`;
}

export function formatStrikePrice(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  });
}

/**
 * Smart USD formatting for token prices:
 * - Avoid thousands grouping for large prices (e.g. zBTC) to reduce visual noise.
 * - Show more decimals for very small prices (e.g. PUMP at 0.0017).
 * - For 3-digit prices (100-999), show no decimals for cleaner display.
 */
export function formatUsdSmart(n: number) {
  const abs = Math.abs(n);

  if (abs >= 1000) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    });
  }
  
  if (abs >= 100) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: false
    });
  }

  const useGrouping = false;

  let max = 2;
  if (abs >= 1) {
    max = 2;
  } else if (abs >= 0.1) {
    max = 4;
  } else if (abs >= 0.01) {
    max = 5;
  } else if (abs >= 0.001) {
    max = 6;
  } else {
    max = 8;
  }

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: max,
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    useGrouping
  });
}

