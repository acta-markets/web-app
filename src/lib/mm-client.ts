/**
 * Market Maker WebSocket Client
 *
 * Thin wrapper around `@acta-markets/ts-sdk` for the hidden `/market-maker`
 * dashboard. Connects to the `/maker` endpoint, which auto-challenges the
 * client; session resume is not supported (re-auth on every reconnect).
 *
 * Auth flow:
 *   Hello → Welcome → AuthRequest(challenge) → AuthChallenge(sig, pubkey) → AuthSuccess(maker_pda)
 *
 * The challenge is human-readable text; the client signs its UTF-8 bytes.
 * This mirrors `src/lib/rfq-client.ts` but with `role: "maker"`.
 */

export {
  ActaWsClient,
  WalletAuthProvider,
  type WalletLike,
  type ConnectionState,
  type ActaWsClientOptions,
} from "@acta-markets/ts-sdk/ws";

export type {
  MmSummaryData,
  MyCapsMessage,
  MakerPositionInfo,
  MakerBalanceCapInfo,
  MakerNotionalCapInfo,
  MakerPositionCapInfo,
  MakerCapsSnapshot,
  MakerQuoteInfo,
  MakerMarketInfo,
  MakerTradeInfo,
  MyTradesMessage,
  PositionUpdatedMessage,
  TradeExecutedMessage,
  TokenInfo,
  PositionInfo,
  PositionStatus,
  PositionType,
  ServerError,
  ServerMessage,
} from "@acta-markets/ts-sdk/ws";

import { ActaWsClient, WalletAuthProvider, type WalletLike } from "@acta-markets/ts-sdk/ws";

// Same host as the RFQ/taker client; SDK routes to `/maker` vs `/taker` based
// on the `role` option. No separate MM env var needed.
const DEFAULT_MM_WS_URL =
  process.env.NEXT_PUBLIC_RFQ_WS_URL || "wss://devnet-api.acta.markets";

export function mmWsUrl(): string {
  return normalizeWsUrl(DEFAULT_MM_WS_URL);
}

function normalizeWsUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (window.location.protocol === "https:" && url.startsWith("ws://")) {
    return `wss://${url.slice("ws://".length)}`;
  }
  return url;
}

export interface CreateMmClientOptions {
  url?: string;
  debug?: boolean;
  autoReconnect?: boolean;
}

export function createMmClient(options?: CreateMmClientOptions): ActaWsClient {
  const url = normalizeWsUrl(options?.url || DEFAULT_MM_WS_URL);
  return new ActaWsClient({
    url,
    role: "maker",
    autoReconnect: options?.autoReconnect ?? true,
    debug: options?.debug ?? false,
  });
}

export interface MmWalletAdapter {
  /** Base58 public key of the maker wallet. */
  address: string;
  /** Sign arbitrary bytes — returns a 64-byte ed25519 signature. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export function createMmAuthProvider(wallet: MmWalletAdapter): WalletAuthProvider {
  const walletLike: WalletLike = {
    publicKeyBase58: wallet.address,
    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      const copy = new Uint8Array(message);
      try {
        const text = new TextDecoder().decode(copy);
        if (text.trim().length === 0) {
          throw new Error("MM auth challenge is empty. Please retry in a few seconds.");
        }
      } catch {
        // Not UTF-8 — still sign raw bytes. Empty-challenge guard above handles the typical case.
      }
      return wallet.signMessage(copy);
    },
  };
  return new WalletAuthProvider(walletLike);
}

let clientInstance: ActaWsClient | null = null;

export function getMmClient(): ActaWsClient {
  if (!clientInstance) {
    clientInstance = createMmClient();
  }
  return clientInstance;
}
