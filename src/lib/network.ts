export type Network = "mainnet" | "devnet";

export function getNetwork(): Network {
  const value = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  return value === "mainnet" || value === "mainnet-beta" ? "mainnet" : "devnet";
}

export const IS_MAINNET = getNetwork() === "mainnet";

export function getRpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (getNetwork() === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
}

export function getWalletChain(): "solana:mainnet" | "solana:devnet" {
  return getNetwork() === "mainnet" ? "solana:mainnet" : "solana:devnet";
}

export function getDefaultRfqWsUrl(): string {
  return getNetwork() === "mainnet" ? "wss://beta-api.acta.markets" : "wss://devnet-api.acta.markets";
}
