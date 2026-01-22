/**
 * RFQ Client - Thin wrapper around yuzu-ts-sdk
 *
 * Uses the official SDK (0.0.8-beta) for WebSocket communication with the RFQ server.
 * 
 * Auth flow:
 * 1. Server sends `AuthRequest { challenge: <human-readable text> }`
 * 2. Client signs UTF-8 bytes of challenge text
 * 3. Client responds with `AuthChallenge { challenge, signature: base58(ed25519), pubkey }`
 */

// Re-export SDK client and types
export { YuzuClient } from "yuzu-ts-sdk";
export { 
  YuzuWsClient, 
  WalletAuthProvider,
  type WalletLike,
  type ConnectionState,
  type YuzuWsClientOptions,
} from "yuzu-ts-sdk/ws";

export type { 
  MarketInfo, 
  PositionInfo, 
  QuoteReceivedMessage,
  IndicativePricesMessage,
} from "yuzu-ts-sdk/ws";

import { YuzuWsClient, WalletAuthProvider, type WalletLike } from "yuzu-ts-sdk/ws";

// ============================================================================
// Configuration
// ============================================================================

const RFQ_WS_URL = process.env.NEXT_PUBLIC_RFQ_WS_URL || "ws://78.46.77.51:8080";

export interface CreateClientOptions {
  url?: string;
  debug?: boolean;
}

// ============================================================================
// Factory function for creating client
// ============================================================================

export function createRfqClient(options?: CreateClientOptions): YuzuWsClient {
  const url = options?.url || RFQ_WS_URL;
  console.log("[RFQ] Creating YuzuWsClient with URL:", url);
  console.log("[RFQ] Options:", { role: "taker", autoReconnect: true, debug: true });
  
  const client = new YuzuWsClient({
    url, 
    role: "taker",
    autoReconnect: true,
    debug: true,
  });
  
  console.log("[RFQ] Client created:", client);
  return client;
}

// ============================================================================
// Helper to create wallet auth provider
// ============================================================================

export interface WalletAdapter {
  /** Wallet address (base58 public key) */
  address: string;
  /** Sign arbitrary message - returns 64-byte ed25519 signature */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export function createWalletAuthProvider(wallet: WalletAdapter): WalletAuthProvider {
  // Adapt our interface to SDK's WalletLike
  const walletLike: WalletLike = {
    publicKeyBase58: wallet.address,
    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      console.log("[WalletAuthProvider] Signing message:");
      console.log("  Length:", message.length, "bytes");
      
      // The SDK now sends human-readable text challenges
      try {
        const text = new TextDecoder().decode(message);
        console.log("  Challenge text:", text.slice(0, 200));
      } catch {
        console.log("  (raw bytes, not UTF-8)");
      }
      
      return wallet.signMessage(message);
    },
  };
  
  return new WalletAuthProvider(walletLike);
}

// ============================================================================
// Singleton instance (optional, for simple use cases)
// ============================================================================

let clientInstance: YuzuWsClient | null = null;

export function getRfqClient(): YuzuWsClient {
  if (!clientInstance) {
    clientInstance = createRfqClient();
  }
  return clientInstance;
}
