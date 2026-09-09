/**
 * Auth flow:
 * 1. Server sends `AuthRequest { challenge: <human-readable text> }`
 * 2. Client signs UTF-8 bytes of challenge text
 * 3. Client responds with `AuthChallenge { challenge, signature: base58(ed25519), pubkey }`
 */

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
  ServerError,
  ActaWsClientError,
  EarnAssetSummary,
  EarnSummaryData,
  TokenMarketsInfoData,
  TokenMarketEntry,
  TokenMarketIndicatives,
} from "@acta-markets/ts-sdk/ws";

export {
  parseReferralCode,
  normalizeReferralCode,
  ReferralCodeError,
} from "@acta-markets/ts-sdk/ws";

export type {
  ReferralCode,
  ReferralCodeFormatError,
  InviteErrorReason,
  ClaimErrorReason,
  TakerStatus,
} from "@acta-markets/ts-sdk/ws";

export type {
  MyReferralInfoData,
  InviteRedeemedData,
  ReferralCodeClaimedData,
} from "@acta-markets/ts-sdk/ws";

import { ActaWsClient, WalletAuthProvider, type WalletLike } from "@acta-markets/ts-sdk/ws";

const RFQ_WS_URL = process.env.NEXT_PUBLIC_RFQ_WS_URL || "wss://beta-api.acta.markets";

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

export function createRfqClient(options?: CreateClientOptions): ActaWsClient {
  const configuredUrl = options?.url || RFQ_WS_URL;
  const url = normalizeWsUrl(configuredUrl);
  return new ActaWsClient({
    url,
    role: "taker",
    autoReconnect: true,
    debug: options?.debug ?? false,
  });
}

export interface WalletAdapter {
  /** Wallet address (base58 public key) */
  address: string;
  /** Sign arbitrary message - returns 64-byte ed25519 signature */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export function createWalletAuthProvider(wallet: WalletAdapter): WalletAuthProvider {
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

      if (challengeText != null && challengeText.trim().length === 0) {
        throw new Error("RFQ auth challenge is empty. Please retry in a few seconds.");
      }

      return wallet.signMessage(mutableMessage);
    },
  };
  
  return new WalletAuthProvider(walletLike);
}

let clientInstance: ActaWsClient | null = null;

export function getRfqClient(): ActaWsClient {
  if (!clientInstance) {
    clientInstance = createRfqClient();
  }
  return clientInstance;
}
