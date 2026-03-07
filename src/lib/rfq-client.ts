/**
 * RFQ Client - Thin wrapper around @acta-markets/ts-sdk
 *
 * Uses the official SDK for WebSocket communication with the RFQ server.
 * 
 * Auth flow:
 * 1. Server sends `AuthRequest { challenge: <human-readable text> }`
 * 2. Client signs UTF-8 bytes of challenge text
 * 3. Client responds with `AuthChallenge { challenge, signature: base58(ed25519), pubkey }`
 */

// Re-export SDK client and types
export { ActaClient } from "@acta-markets/ts-sdk";
export {
  ActaWsClient,
  WalletAuthProvider,
  type WalletLike,
  type ConnectionState,
  type ActaWsClientOptions,
} from "@acta-markets/ts-sdk/ws";

export type {
  MarketInfo,
  MarketDescriptorInfo,
  PositionInfo,
  QuoteReceivedMessage,
  IndicativePricesMessage,
  TokenCapInfo,
  TokenCapsMessage,
  ServerMessage,
  EarnAssetSummary,
  EarnSummaryData,
} from "@acta-markets/ts-sdk/ws";

import { ActaWsClient, WalletAuthProvider, type WalletLike } from "@acta-markets/ts-sdk/ws";

// ============================================================================
// Configuration
// ============================================================================

const RFQ_WS_URL = process.env.NEXT_PUBLIC_RFQ_WS_URL || "wss://devnet-api.acta.markets";

export interface CreateClientOptions {
  url?: string;
  debug?: boolean;
}

function normalizeWsUrl(url: string): string {
  if (typeof window === "undefined") return url;
  // Browsers block insecure ws:// from secure https pages.
  if (window.location.protocol === "https:" && url.startsWith("ws://")) {
    return `wss://${url.slice("ws://".length)}`;
  }
  return url;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function patchQueryMessagesForServer(client: ActaWsClient): void {
  const c = client as unknown as {
    send: (message: unknown) => void;
    getMarkets: () => void;
    getPositions: () => void;
    getMyActiveRfqs: () => void;
    getOrderStatus: (orderIdHex: string) => void;
    getMarketDescriptors: (args?: { active_only?: boolean }) => void;
    getExpiries: (args?: {
      underlying_mint?: string;
      quote_mint?: string;
      is_put?: boolean | null;
    }) => void;
    getTokens: (args?: { active_only?: boolean }) => void;
    getTokenCaps: (args?: { include_markets?: boolean }) => void;
    getIndicativePrices: (req: { market: string; position_type: "covered_call" | "cash_secured_put" }) => void;
  };

  // Server on oracle-update branch requires `request_id` in query-style messages.
  c.getMarkets = () => {
    c.send({ type: "GetMarkets", data: { request_id: createRequestId() } });
  };
  c.getPositions = () => {
    c.send({ type: "GetPositions", data: { request_id: createRequestId() } });
  };
  c.getMyActiveRfqs = () => {
    c.send({ type: "GetMyActiveRfqs", data: { request_id: createRequestId() } });
  };
  c.getOrderStatus = (orderIdHex: string) => {
    c.send({
      type: "GetOrderStatus",
      data: { request_id: createRequestId(), order_id: orderIdHex },
    });
  };
  c.getMarketDescriptors = (args?: { active_only?: boolean }) => {
    c.send({
      type: "GetMarketDescriptors",
      data: { request_id: createRequestId(), active_only: args?.active_only ?? true },
    });
  };
  c.getExpiries = (args?: {
    underlying_mint?: string;
    quote_mint?: string;
    is_put?: boolean | null;
  }) => {
    c.send({
      type: "GetExpiries",
      data: {
        request_id: createRequestId(),
        underlying_mint: args?.underlying_mint,
        quote_mint: args?.quote_mint,
        is_put: args?.is_put ?? null,
      },
    });
  };
  c.getTokens = (args?: { active_only?: boolean }) => {
    c.send({
      type: "GetTokens",
      data: { request_id: createRequestId(), active_only: args?.active_only ?? true },
    });
  };
  c.getTokenCaps = (args?: { include_markets?: boolean }) => {
    c.send({
      type: "GetTokenCaps",
      data: { request_id: createRequestId(), include_markets: args?.include_markets ?? false },
    });
  };
  c.getIndicativePrices = (req: { market: string; position_type: "covered_call" | "cash_secured_put" }) => {
    c.send({
      type: "GetIndicativePrices",
      data: { request_id: createRequestId(), ...req },
    });
  };
  (c as unknown as { getEarnSummary: () => void }).getEarnSummary = () => {
    c.send({
      type: "GetEarnSummary",
      data: { request_id: createRequestId() },
    });
  };
}

// ============================================================================
// Factory function for creating client
// ============================================================================

export function createRfqClient(options?: CreateClientOptions): ActaWsClient {
  const configuredUrl = options?.url || RFQ_WS_URL;
  const url = normalizeWsUrl(configuredUrl);
  console.log("[RFQ] Creating ActaWsClient with URL:", url);
  console.log("[RFQ] Options:", { role: "taker", autoReconnect: true, debug: true });
  
  const client = new ActaWsClient({
    url, 
    role: "taker",
    autoReconnect: true,
    debug: true,
  });

  patchQueryMessagesForServer(client);
  
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
      const mutableMessage = new Uint8Array(message);
      let challengeText: string | null = null;

      // The SDK sends human-readable challenge text as UTF-8.
      try {
        challengeText = new TextDecoder().decode(mutableMessage);
        console.log("  Challenge text:", challengeText.slice(0, 200));
      } catch {
        console.log("  (raw bytes, not UTF-8)");
      }

      // Prevent blank/invalid wallet popups when challenge is empty.
      if (challengeText != null && challengeText.trim().length === 0) {
        throw new Error("RFQ auth challenge is empty. Please retry in a few seconds.");
      }

      return wallet.signMessage(mutableMessage);
    },
  };
  
  return new WalletAuthProvider(walletLike);
}

// ============================================================================
// Singleton instance (optional, for simple use cases)
// ============================================================================

let clientInstance: ActaWsClient | null = null;

export function getRfqClient(): ActaWsClient {
  if (!clientInstance) {
    clientInstance = createRfqClient();
  }
  return clientInstance;
}
