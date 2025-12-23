export const PYTH_PRICE_IDS = {
  // Provided by user (32-byte hex strings)
  // Keep both keys for backward compatibility; app code uses uppercased symbols.
  ZBTC: "3d824c7f7c26ed1c85421ecec8c754e6b52d66a4e45de20a9c9ea91de8b396f9",
  zBTC: "3d824c7f7c26ed1c85421ecec8c754e6b52d66a4e45de20a9c9ea91de8b396f9",
  JITOSOL: "67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb",
  BONK: "a007ed7f4e98f90b585aaecafa2bef88c28af6f0e6f601268c17530e5dfb462d",
  PUMP: "7a01fca212788bba7c5bf8c9efd576a8a722f070d2c17596ff7bb609b8d5c3b9",
  JLP: "c811abc82b4bad1f9bd711a2773ccaa935b03ecef974236942cec5e0eb845a3a",
  ETH: "c96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a"
} as const;

export type PythSymbol = keyof typeof PYTH_PRICE_IDS;

export function getPythId(symbol: string): string | null {
  const key = symbol.trim().toUpperCase() as PythSymbol;
  return PYTH_PRICE_IDS[key] ?? null;
}


