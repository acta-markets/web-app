/**
 * Token configuration for Acta
 *
 * Supports mainnet and testnet with different token mints.
 * Use NEXT_PUBLIC_SOLANA_NETWORK env variable to switch networks.
 */

export type Network = "mainnet" | "testnet";

export function getNetwork(): Network {
  const env = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  if (env === "testnet") return "testnet";
  if (env === "mainnet" || env === "mainnet-beta") return "mainnet";

  // Safer default for local development: avoid accidental mainnet mints
  // when env vars are not loaded.
  return process.env.NODE_ENV === "production" ? "mainnet" : "testnet";
}

export const IS_MAINNET = getNetwork() === "mainnet";

// ============================================================================
// Token Configuration
// ============================================================================

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
  /** Pyth price feed ID (hex string without 0x prefix) */
  pythId: string;
  /** Token mint addresses per network */
  mint: {
    mainnet: string;
    testnet: string;
  };
}

/**
 * All supported tokens with their configurations.
 * These are the mainnet tokens with their real addresses.
 */
export const TOKENS: Record<string, TokenConfig> = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    logo: "/tokens/solana.png",
    pythId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    mint: {
      mainnet: "So11111111111111111111111111111111111111112",
      testnet: "So11111111111111111111111111111111111111112",
    },
  },
  JITOSOL: {
    symbol: "jitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    logo: "/tokens/jitosol.png",
    pythId: "67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb",
    mint: {
      mainnet: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      testnet: "So11111111111111111111111111111111111111112", // Testnet underlying mint
    },
  },
  JLP: {
    symbol: "JLP",
    name: "Jupiter LP",
    decimals: 6,
    logo: "/tokens/jlp.png",
    pythId: "c811abc82b4bad1f9bd711a2773ccaa935b03ecef974236942cec5e0eb845a3a",
    mint: {
      mainnet: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
      testnet: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
    },
  },
  ZBTC: {
    symbol: "zBTC",
    name: "Zeus BTC",
    decimals: 8,
    logo: "/tokens/btc.svg",
    pythId: "3d824c7f7c26ed1c85421ecec8c754e6b52d66a4e45de20a9c9ea91de8b396f9",
    mint: {
      mainnet: "zeusLhUcFiPKG5NFuKrXEkChBXGNKPJBnqR2BC5v6R5",
      testnet: "zeusLhUcFiPKG5NFuKrXEkChBXGNKPJBnqR2BC5v6R5",
    },
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum (Wormhole)",
    decimals: 8,
    logo: "/tokens/ethereum.png",
    pythId: "c96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a",
    mint: {
      mainnet: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
      testnet: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    },
  },
  PUMP: {
    symbol: "PUMP",
    name: "Pump.fun",
    decimals: 6,
    logo: "/tokens/pump.ico",
    pythId: "7a01fca212788bba7c5bf8c9efd576a8a722f070d2c17596ff7bb609b8d5c3b9",
    mint: {
      mainnet: "FpJFkYysMWRYBTMGJtZUq9BQdQvMjJo9NWHgk4D4pump",
      testnet: "FpJFkYysMWRYBTMGJtZUq9BQdQvMjJo9NWHgk4D4pump",
    },
  },
  BONK: {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    logo: "/tokens/bonk.png",
    pythId: "a007ed7f4e98f90b585aaecafa2bef88c28af6f0e6f601268c17530e5dfb462d",
    mint: {
      mainnet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      testnet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    },
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "/tokens/usdc-official.svg",
    pythId: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    mint: {
      mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      testnet: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // Testnet quote/premium mint
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get token config by symbol (case-insensitive)
 */
export function getToken(symbol: string): TokenConfig | undefined {
  const key = symbol.toUpperCase();
  return TOKENS[key];
}

/**
 * Get token mint for current network
 */
export function getTokenMint(symbol: string): string | undefined {
  const token = getToken(symbol);
  if (!token) return undefined;
  return IS_MAINNET ? token.mint.mainnet : token.mint.testnet;
}

/**
 * Get token logo path
 */
export function getTokenLogo(symbol: string): string {
  const token = getToken(symbol);
  return token?.logo ?? "/tokens/solana.png";
}

/**
 * Get Pyth price feed ID for token
 */
export function getTokenPythId(symbol: string): string | undefined {
  const token = getToken(symbol);
  return token?.pythId;
}

/**
 * Get all supported token symbols
 */
export function getSupportedTokens(): string[] {
  return Object.keys(TOKENS);
}

/**
 * Check if a token is supported
 */
export function isTokenSupported(symbol: string): boolean {
  return symbol.toUpperCase() in TOKENS;
}

