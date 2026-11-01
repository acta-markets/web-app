export { ActaClient } from "@acta-markets/ts-sdk";
export {
  ActaWsClient,
  ActaWsRequestError,
  WalletAuthProvider,
  verifyAndSignTakerFill,
  type WalletLike,
  type ConnectionState,
  type ActaWsClientOptions,
  type TakerFillRfq,
} from "@acta-markets/ts-sdk/ws";

export type {
  MarketInfo,
  MarketDescriptorInfo,
  PositionInfo,
  QuoteReceivedMessage,
  MyActiveRfqsMessage,
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

import { ActaWsClient, ActaWsRequestError, WalletAuthProvider } from "@acta-markets/ts-sdk/ws";

import { getDefaultRfqWsUrl } from "./network";
import packageJson from "../../package.json";

export const CLIENT_VERSION = packageJson.version;

export interface CreateClientOptions {
  url?: string;
  debug?: boolean;
}

function normalizeWsUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (window.location.protocol === "https:" && url.startsWith("ws://")) {
    return `wss://${url.slice("ws://".length)}`;
  }
  return url;
}

export async function createRfqClient(options?: CreateClientOptions): Promise<ActaWsClient> {
  const url = options?.url ? normalizeWsUrl(options.url) : getRfqBackendUrl();

  return new ActaWsClient({
    url,
    role: "taker",
    onDisconnect: "keep_quotes", products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"],
    clientName: "acta-web-app", clientVersion: CLIENT_VERSION,
    autoReconnect: true,
    // The app reconciles open positions and active RFQs without fetching all history.
    autoReconcile: false,
    debug: options?.debug ?? false,
  });
}

export function wsErrorMessage(err: unknown): string {
  if (err instanceof ActaWsRequestError) {
    if (!err.error) return `Request ${err.kind.replaceAll("_", " ")}`;
    return err.error.type === "Generic" ? err.error.data.message : err.error.type;
  }
  return err instanceof Error ? err.message : String(err);
}

export function getRfqBackendUrl(): string {
  return normalizeWsUrl(process.env.NEXT_PUBLIC_RFQ_WS_URL || getDefaultRfqWsUrl());
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

let clientInstance: Promise<ActaWsClient> | null = null;

export function getRfqClient(): Promise<ActaWsClient> {
  if (!clientInstance) {
    clientInstance = createRfqClient().catch(error => { clientInstance = null; throw error; });
  }
  return clientInstance;
}
