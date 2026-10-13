/** CoinGecko coin ids by token symbol, upper case. Shared by the price history and USD price routes. */
export const COINGECKO_IDS: Readonly<Record<string, string>> = {
  SOL: "solana",
  WSOL: "solana",
  ETH: "ethereum",
  ZBTC: "bitcoin",
  BTC: "bitcoin",
  BONK: "bonk",
  JITOSOL: "jito-staked-sol",
  JLP: "jupiter-perpetuals-liquidity-provider-token",
  PUMP: "pump-fun",
  USDC: "usd-coin",
  HYPE: "hyperliquid",
  ZEC: "zcash",
  NVDAX: "nvidia-xstock",
  SPYX: "sp500-xstock",
};

export function coingeckoId(symbol: string): string | undefined {
  return COINGECKO_IDS[symbol.trim().toUpperCase()];
}
