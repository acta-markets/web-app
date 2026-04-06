export type TokenBrand = {
  a: string; // primary
  b: string; // secondary
};

const BRAND: Record<string, TokenBrand> = {
  SOL: { a: "#14F195", b: "#9945FF" },
  WSOL: { a: "#14F195", b: "#9945FF" },
  JITOSOL: { a: "#4F9CFB", b: "#14F195" },
  // Jupiter app green (approx). If you want exact brand hexes, tell me and I’ll update.
  JLP: { a: "#00FFA3", b: "#00E599" },
  ZBTC: { a: "#F7931A", b: "#F2A900" }, // BTC orange/gold
  BONK: { a: "#F59E0B", b: "#F97316" },
  // Pump.fun green (approx).
  PUMP: { a: "#00FF66", b: "#00FFA3" },
  ETH: { a: "#627EEA", b: "#A855F7" }
};

export function getTokenBrand(symbol: string): TokenBrand {
  const key = symbol.toUpperCase();
  return BRAND[key] ?? { a: "#2AA286", b: "#80C9B6" };
}


