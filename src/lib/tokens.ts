/**
 * Token configuration for Acta
 *
 * Supports mainnet and devnet with different token mints.
 * Use NEXT_PUBLIC_SOLANA_NETWORK env variable to switch networks.
 */

import { IS_MAINNET, type Network } from "./network";
export { getNetwork, IS_MAINNET, type Network } from "./network";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
  /** Token mint addresses per network */
  mint: {
    mainnet: string;
    devnet: string;
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
    mint: {
      mainnet: WSOL_MINT,
      devnet: WSOL_MINT,
    },
  },
  JITOSOL: {
    symbol: "jitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    logo: "/tokens/jitosol.png",
    mint: {
      mainnet: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      devnet: "So11111111111111111111111111111111111111112",
    },
  },
  JLP: {
    symbol: "JLP",
    name: "Jupiter LP",
    decimals: 6,
    logo: "/tokens/jlp.png",
    mint: {
      mainnet: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
      devnet: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
    },
  },
  ZBTC: {
    symbol: "zBTC",
    name: "Zeus BTC",
    decimals: 8,
    logo: "/tokens/btc.svg",
    mint: {
      mainnet: "zeusLhUcFiPKG5NFuKrXEkChBXGNKPJBnqR2BC5v6R5",
      devnet: "zeusLhUcFiPKG5NFuKrXEkChBXGNKPJBnqR2BC5v6R5",
    },
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum (Wormhole)",
    decimals: 8,
    logo: "/tokens/ethereum.png",
    mint: {
      mainnet: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
      devnet: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    },
  },
  PUMP: {
    symbol: "PUMP",
    name: "Pump.fun",
    decimals: 6,
    logo: "/tokens/pump.ico",
    mint: {
      mainnet: "FpJFkYysMWRYBTMGJtZUq9BQdQvMjJo9NWHgk4D4pump",
      devnet: "FpJFkYysMWRYBTMGJtZUq9BQdQvMjJo9NWHgk4D4pump",
    },
  },
  BONK: {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    logo: "/tokens/bonk.png",
    mint: {
      mainnet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      devnet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    },
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "/tokens/usdc-official.svg",
    mint: {
      mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      devnet: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
    },
  },
  NVDAX: {
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    decimals: 8,
    logo: "/tokens/nvdax.png",
    mint: {
      mainnet: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
      devnet: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    },
  },
  SPCX: {
    symbol: "SPCX",
    name: "SpaceX (Backpack Securities)",
    decimals: 6,
    logo: "/tokens/spcx.svg",
    mint: {
      mainnet: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb",
      devnet: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb",
    },
  },
  SPYX: {
    symbol: "SPYx",
    name: "SP500 xStock",
    decimals: 8,
    logo: "/tokens/spyx.png",
    mint: {
      mainnet: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
      devnet: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    },
  },
  HYPE: {
    symbol: "HYPE",
    name: "Hyperliquid",
    decimals: 9,
    logo: "/tokens/hype.png",
    mint: {
      mainnet: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
      devnet: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
    },
  },
  ZEC: {
    symbol: "ZEC",
    name: "Zcash",
    decimals: 8,
    logo: "/tokens/zec.svg",
    mint: {
      mainnet: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
      devnet: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    },
  },
};


/**
 * Get token config by symbol (case-insensitive)
 */
export function getToken(symbol: string): TokenConfig | undefined {
  const key = symbol.toUpperCase();
  return TOKENS[key === "WSOL" ? "SOL" : key];
}

/**
 * Get token mint for current network
 */
export function getTokenMint(symbol: string): string | undefined {
  const token = getToken(symbol);
  if (!token) return undefined;
  return IS_MAINNET ? token.mint.mainnet : token.mint.devnet;
}

/**
 * Get token logo path
 */
export function getTokenLogo(symbol: string): string {
  const token = getToken(symbol);
  return token?.logo ?? "/tokens/solana.png";
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

/**
 * Normalize a server-provided token symbol to match the app's canonical names.
 * e.g. "SOL" → "WSOL" (the app uses WSOL everywhere for wrapped SOL).
 */
export function normalizeTokenSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper === "WSOL") return "SOL";
  const token = TOKENS[upper];
  if (token) return token.symbol;
  return symbol;
}

/** Mints the static list misses (e.g. PT terms), from the API's `/tokens`. */
const referenceTokens = new Map<string, { symbol: string; decimals: number }>();

export function rememberReferenceTokens(tokens: Iterable<{ mint: string; symbol: string; decimals: number }>) {
  for (const { mint, symbol, decimals } of tokens) referenceTokens.set(mint, { symbol, decimals });
}

export function getReferenceToken(mint: string): { symbol: string; decimals: number } | undefined {
  return referenceTokens.get(mint.trim());
}

export function getTokenSymbolByMint(mint: string): string | undefined {
  const normalizedMint = mint.trim();
  if (!normalizedMint) return undefined;

  if (normalizedMint === WSOL_MINT) {
    return "SOL";
  }

  const networkKey: Network = IS_MAINNET ? "mainnet" : "devnet";
  for (const token of Object.values(TOKENS)) {
    if (token.mint[networkKey] === normalizedMint) {
      return token.symbol;
    }
  }

  return referenceTokens.get(normalizedMint)?.symbol;
}


export function tokenDisplayName(mint: string): string {
  return getTokenSymbolByMint(mint) ?? `Unknown token (${mint.slice(0, 4)}…${mint.slice(-4)})`;
}
