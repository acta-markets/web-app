import { getTokenPythId } from "@/lib/tokens";

export type MarketType = "call" | "csp";

export type Market = {
  asset: string;
  type: MarketType;
  minApr: number;
  maxApr: number;
  capFilledPct: number; // 0..100
  spotPrice: number;
  pythId?: string;
  // price options are the "I’m ok to sell/buy at" prices
  priceOptions: number[];
};

export const MARKETS: Market[] = [
  {
    asset: "WSOL",
    type: "call",
    minApr: 0,
    maxApr: 0,
    capFilledPct: 0,
    spotPrice: 0,
    pythId: getTokenPythId("WSOL"),
    priceOptions: [0]
  },
  {
    asset: "WSOL",
    type: "csp",
    minApr: 0,
    maxApr: 0,
    capFilledPct: 0,
    spotPrice: 0,
    pythId: getTokenPythId("WSOL"),
    priceOptions: [0]
  },
  {
    asset: "jitoSOL",
    type: "call",
    minApr: 12,
    maxApr: 34,
    capFilledPct: 54,
    spotPrice: 236.42,
    pythId: getTokenPythId("JITOSOL"),
    priceOptions: [250, 270, 295]
  },
  {
    asset: "jitoSOL",
    type: "csp",
    minApr: 10,
    maxApr: 29,
    capFilledPct: 61,
    spotPrice: 236.42,
    pythId: getTokenPythId("JITOSOL"),
    priceOptions: [225, 210, 195]
  },
  {
    asset: "JLP",
    type: "call",
    minApr: 14,
    maxApr: 42,
    capFilledPct: 33,
    spotPrice: 1.53,
    pythId: getTokenPythId("JLP"),
    priceOptions: [1.6, 1.75, 2.0]
  },
  {
    asset: "JLP",
    type: "csp",
    minApr: 12,
    maxApr: 38,
    capFilledPct: 48,
    spotPrice: 1.53,
    pythId: getTokenPythId("JLP"),
    priceOptions: [1.45, 1.35, 1.2]
  },
  {
    asset: "ETH",
    type: "call",
    minApr: 10,
    maxApr: 36,
    capFilledPct: 28,
    spotPrice: 3925.12,
    pythId: getTokenPythId("ETH"),
    priceOptions: [4100, 4300, 4600]
  },
  {
    asset: "ETH",
    type: "csp",
    minApr: 9,
    maxApr: 33,
    capFilledPct: 71,
    spotPrice: 3925.12,
    pythId: getTokenPythId("ETH"),
    priceOptions: [3800, 3600, 3400]
  },
  {
    asset: "zBTC",
    type: "call",
    minApr: 8,
    maxApr: 22,
    capFilledPct: 19,
    spotPrice: 98000,
    pythId: getTokenPythId("ZBTC"),
    priceOptions: [102000, 108000, 115000]
  },
  {
    asset: "zBTC",
    type: "csp",
    minApr: 7,
    maxApr: 19,
    capFilledPct: 41,
    spotPrice: 98000,
    pythId: getTokenPythId("ZBTC"),
    priceOptions: [95000, 90000, 82000]
  },
  {
    asset: "PUMP",
    type: "call",
    minApr: 45,
    maxApr: 180,
    capFilledPct: 22,
    spotPrice: 0.0124,
    pythId: getTokenPythId("PUMP"),
    priceOptions: [0.014, 0.016, 0.02, 0.03]
  },
  {
    asset: "PUMP",
    type: "csp",
    minApr: 38,
    maxApr: 140,
    capFilledPct: 47,
    spotPrice: 0.0124,
    pythId: getTokenPythId("PUMP"),
    priceOptions: [0.011, 0.0095, 0.008, 0.006]
  },
  {
    asset: "BONK",
    type: "call",
    minApr: 22,
    maxApr: 95,
    capFilledPct: 35,
    spotPrice: 0.000031,
    pythId: getTokenPythId("BONK"),
    priceOptions: [0.000034, 0.000038, 0.000045]
  },
  {
    asset: "BONK",
    type: "csp",
    minApr: 18,
    maxApr: 74,
    capFilledPct: 58,
    spotPrice: 0.000031,
    pythId: getTokenPythId("BONK"),
    priceOptions: [0.000029, 0.000026, 0.000022]
  }
];

export function getMarket(asset: string, type: MarketType): Market | undefined {
  const a = asset.toUpperCase();
  return MARKETS.find((m) => m.asset.toUpperCase() === a && m.type === type);
}

export function formatPct(n: number) {
  return `${Math.round(n)}%`;
}

export function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * Smart USD formatting for token prices:
 * - Avoid thousands grouping for large prices (e.g. zBTC) to reduce visual noise.
 * - Show more decimals for very small prices (e.g. PUMP at 0.0017).
 * - For 3-digit prices (100-999), show no decimals for cleaner display.
 */
export function formatUsdSmart(n: number) {
  const abs = Math.abs(n);

  // For large ticket assets (e.g. zBTC), decimals are mostly noise.
  // Keep grouping so the magnitude is readable in locales that group with spaces.
  if (abs >= 1000) {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    });
  }
  
  // For 3-digit prices (100-999), no decimals for cleaner display
  if (abs >= 100) {
    return n.toLocaleString(undefined, {
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

  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: max,
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    useGrouping
  });
}


