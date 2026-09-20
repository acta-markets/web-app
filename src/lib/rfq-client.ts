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

import { ActaWsClient, WalletAuthProvider } from "@acta-markets/ts-sdk/ws";

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
  const url = options?.url ? normalizeWsUrl(options.url) : getRfqBackendUrl();
  return new ActaWsClient({
    url,
    role: "taker",
    autoReconnect: true,
    debug: options?.debug ?? false,
  });
}

export function getRfqBackendUrl(): string {
  return normalizeWsUrl(RFQ_WS_URL);
}

export interface WalletAdapter {
  /** Wallet address (base58 public key) */
  address: string;
  /** Sign arbitrary message - returns 64-byte ed25519 signature */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export function createWalletAuthProvider(wallet: WalletAdapter): WalletAuthProvider {
  return new WalletAuthProvider({
    publicKeyBase58: wallet.address,
    signMessage: (message) => wallet.signMessage(message),
  });
}

let clientInstance: ActaWsClient | null = null;

export function getRfqClient(): ActaWsClient {
  if (!clientInstance) {
    clientInstance = createRfqClient();
  }
  return clientInstance;
}
