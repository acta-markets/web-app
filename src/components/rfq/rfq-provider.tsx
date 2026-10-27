"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  ActaWsClient,
  createRfqClient,
  createWalletAuthProvider,
  ReferralCodeError,
  type MarketInfo,
  type MarketDescriptorInfo,
  type PositionInfo,
  type QuoteReceivedMessage,
  type IndicativePricesMessage,
  ActaWsRequestError,
  wsErrorMessage,
  type TokenCapInfo,
  type EarnAssetSummary,
  type ActaWsClientError,
  type ConnectionState,
  type TokenMarketsInfoData,
  type MyReferralInfoData,
  type InviteErrorReason,
  type ClaimErrorReason,
  type TakerFillRfq,
} from "@/lib/rfq-client";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { AppModal } from "@/components/app-ui/app-modal";
import { ReferralGateModal } from "@/components/referral/referral-gate-modal";
import { clearPendingRefCode } from "@/components/referral/ref-capture";
import { useToast } from "@/components/app-ui/toast";

interface RfqContextValue {
  /** Connection state */
  connectionState: ConnectionState;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Whether user is authenticated with wallet */
  isAuthenticated: boolean;
  /** Available markets from RFQ server */
  markets: MarketInfo[];
  /** Token OI caps by underlying token */
  tokenCaps: TokenCapInfo[];
  /** Server-computed earn summary (APR + caps per asset/type) */
  earnSummary: EarnAssetSummary[] | null;
  /** Market descriptors (includes underlying/quote metadata) */
  marketDescriptors: MarketDescriptorInfo[];
  /** User's positions (requires auth) */
  positions: PositionInfo[];
  /** Best live quote for our open RFQ */
  bestQuote: QuoteReceivedMessage | null;
  quoteSecondsRemaining: (quote: QuoteReceivedMessage) => number;
  /** Indicative prices */
  indicativePrices: IndicativePricesMessage | null;
  /** Returns cached indicatives for specific market + position type */
  getIndicativePricesCached: (
    market: string,
    positionType: "covered_call" | "cash_secured_put"
  ) => IndicativePricesMessage | null;
  /** Token markets info (single-request bootstrap for market page) */
  tokenMarketsInfo: { underlyingMint: string; data: TokenMarketsInfoData } | null;
  /** Fetch token markets info for an underlying */
  getTokenMarketsInfo: (underlyingMint: string) => void;
  /** Fetch earn summary */
  getEarnSummary: () => void;
  /** Last error */
  error: Error | null;
  /** Authenticate with wallet (triggers signing prompt) */
  authenticate: (walletAddress: string, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) => Promise<void>;
  /** Disconnect */
  disconnect: () => void;
  /** Fetch positions (requires auth) */
  fetchPositions: () => void;
  /** Get indicative prices for a market */
  getIndicativePrices: (market: string, positionType: "covered_call" | "cash_secured_put") => void;
  /** Submit RFQ request */
  submitRfq: (params: {
    market: string;
    positionType: "covered_call" | "cash_secured_put";
    strike: number;
    quantity: number;
    timeoutSeconds?: number;
  }) => void;
  /** Accept a quote */
  acceptQuote: (rfqId: string, maker: string, orderIdHex: string) => Promise<void>;
  /** Submit signed transaction */
  submitSignedTx: (orderIdHex: string, txBase64: string) => Promise<void>;
  /** Cancel our open RFQ and clear its quotes and error */
  cancelRfq: () => void;
  /** Market, type and quantity of our open RFQ, which a maker-quote fill is verified against */
  rfqTerms: (rfqId: string) => TakerFillRfq | null;
  /** Get the underlying client */
  getClient: () => ActaWsClient | null;
  /** Referral gate status — "unknown" before we know, "required" when invite gate blocks trading, "redeemed" otherwise. */
  referralStatus: ReferralStatus;
  /** Latest referral info snapshot from the server */
  referralInfo: MyReferralInfoData | null;
  /** Last referral-related error (copy-ready, user-facing) */
  referralError: string | null;
  /** Redeem an invite code. Synchronous parse errors surface via referralError; server errors arrive async. */
  redeemInvite: (rawCode: string) => void;
  /** Claim a vanity referral code. Returns a promise that resolves when the SDK call returns. */
  claimReferralCode: (rawCode: string) => Promise<void>;
  /** Refresh referral info from server */
  refreshReferralInfo: () => void;
  /** Clear the current referral error */
  clearReferralError: () => void;
  /** Re-open the referral gate modal (resets dismissal state) */
  openReferralGate: () => void;
}

export type ReferralStatus = "unknown" | "required" | "redeemed";

const INVITE_COPY: Record<InviteErrorReason, string> = {
  code_disabled: "This invite code has been disabled.",
  invalid_code: "We couldn't find that invite code.",
  code_exhausted: "This invite code has no slots left.",
  code_expired: "This invite code has expired.",
  code_owner_inactive: "The referrer hasn't made a trade yet.",
  code_owner_blacklisted: "This referrer is no longer active.",
  already_registered: "You've already redeemed an invite.",
  internal_error: "Something went wrong, please try again.",
};

const CLAIM_COPY: Record<ClaimErrorReason, string> = {
  not_registered: "Redeem an invite first.",
  invalid_format: "Use 4–16 letters or digits (A–Z, 0–9).",
  code_taken: "That code is already taken.",
  reserved: "That code is reserved, pick another.",
  internal_error: "Something went wrong, please try again.",
};

function referralCodeErrorMessage(err: ReferralCodeError): string {
  if (err.detail.kind === "length") {
    return `Use ${err.detail.min}–${err.detail.max} letters or digits (A–Z, 0–9).`;
  }
  return "Use only letters A–Z and digits 0–9.";
}

const RfqContext = createContext<RfqContextValue | null>(null);

export function useRfqContext(): RfqContextValue {
  const ctx = useContext(RfqContext);
  if (!ctx) {
    throw new Error("useRfqContext must be used within RfqProvider");
  }
  return ctx;
}

interface RfqProviderProps {
  children: ReactNode;
}

const RFQ_SESSION_KEY = "acta_rfq_ws_session";
export const RFQ_TTL_SECONDS = 30;

function isAuthFailureError(err: ActaWsClientError): boolean {
  return err.type === "Unauthenticated" || err.type === "Unauthorized" ||
    (err.type === "client_generic" && (
      err.data.message.toLowerCase().includes("user rejected") ||
      err.data.message.toLowerCase().includes("auth timeout")
    ));
}

function errorText(err: ActaWsClientError): string {
  return err.type === "client_generic" || err.type === "Generic" ? err.data.message : err.type;
}

const quotePrice = (quote: QuoteReceivedMessage) => Number(quote.net_price ?? quote.price);

function isMissingMarketDescriptorError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("missing market descriptor") ||
    lower.includes("call getmarketdescriptors() before createrfq")
  );
}

function loadStoredSessionId(walletAddress: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RFQ_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      sessionId?: string;
      walletAddress?: string;
      expiresAt?: number | null;
    };
    if (!parsed.sessionId || !parsed.walletAddress) return null;
    if (parsed.walletAddress !== walletAddress) return null;
    if (typeof parsed.expiresAt !== "number" || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed.sessionId;
  } catch {
    return null;
  }
}

function persistSession(walletAddress: string, sessionId: string, expiresAt: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RFQ_SESSION_KEY,
      JSON.stringify({ walletAddress, sessionId, expiresAt })
    );
  } catch {
  }
}

export function RfqProvider({ children }: RfqProviderProps) {
  const showDebugBadge = process.env.NEXT_PUBLIC_RFQ_DEBUG_BADGE === "true";
  const { selectedAccount, isConnected: walletConnected, signMessage, disconnectWallet } = useSolana();
  const clientRef = useRef<ActaWsClient | null>(null);
  const walletAddressRef = useRef<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [tokenCaps, setTokenCaps] = useState<TokenCapInfo[]>([]);
  const [earnSummary, setEarnSummary] = useState<EarnAssetSummary[] | null>(null);
  const [marketDescriptors, setMarketDescriptors] = useState<MarketDescriptorInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const pendingRfqRef = useRef<{ requestId: string; strike: number; rfqId: string | null; rfq: TakerFillRfq } | null>(null);
  const abandonedRequestsRef = useRef(new Set<string>());
  const quotesRef = useRef(new Map<string, QuoteReceivedMessage>());
  const quoteExpiryTimerRef = useRef<number | null>(null);
  const serverClockOffsetMsRef = useRef(0);
  const [bestQuote, setBestQuote] = useState<QuoteReceivedMessage | null>(null);
  const [indicativePrices, setIndicativePrices] = useState<IndicativePricesMessage | null>(null);
  const [indicativePricesByKey, setIndicativePricesByKey] = useState<Record<string, IndicativePricesMessage>>({});
  const [tokenMarketsInfo, setTokenMarketsInfo] = useState<RfqContextValue["tokenMarketsInfo"]>(null);
  const tokenMarketsRequest = useRef<{ requestId: string; underlyingMint: string } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const pendingRfqAuthWalletRef = useRef<string | null>(null);
  const authInFlightRef = useRef<{ wallet: string; promise: Promise<void>; controller: AbortController } | null>(null);
  const authWalletRef = useRef<string | null>(null);
  const authWarmupTimerRef = useRef<number | null>(null);
  const [authWarmupDone, setAuthWarmupDone] = useState(false);
  const prefetchedIndicativeKeysRef = useRef<Set<string>>(new Set());
  const [showAuthSignModal, setShowAuthSignModal] = useState(false);
  const [dismissedAuthSignModal, setDismissedAuthSignModal] = useState(false);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>("unknown");
  const [referralInfo, setReferralInfo] = useState<MyReferralInfoData | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralGateOpen, setReferralGateOpen] = useState(false);
  const pendingReferralReqsRef = useRef<Map<string, "invite" | "claim">>(new Map());
  const { show: showToast } = useToast();
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const getIndicativeKey = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => `${market}:${positionType}`,
    []
  );

  const anonymousReconnectTimer = useRef<number | null>(null);
  const resetToAnonymous = useCallback((client: ActaWsClient) => {
    if (anonymousReconnectTimer.current !== null) window.clearTimeout(anonymousReconnectTimer.current);
    client.disconnect();
    setConnectionState("disconnected");
    anonymousReconnectTimer.current = window.setTimeout(() => {
      anonymousReconnectTimer.current = null;
      client.connectAnonymous();
    }, 250);
  }, []);

  const quoteSecondsRemaining = useCallback((quote: QuoteReceivedMessage) =>
    Math.max(0, Math.ceil(Number(quote.valid_until) - (Date.now() + serverClockOffsetMsRef.current) / 1000)), []);

  const refreshBestQuote = useCallback(() => {
    if (quoteExpiryTimerRef.current != null) window.clearTimeout(quoteExpiryTimerRef.current);
    quoteExpiryTimerRef.current = null;
    const now = (Date.now() + serverClockOffsetMsRef.current) / 1000;
    let best: QuoteReceivedMessage | null = null;
    let nextExpiry = Infinity;
    for (const [key, quote] of quotesRef.current) {
      const validUntil = Number(quote.valid_until);
      if (validUntil <= now) {
        quotesRef.current.delete(key);
        continue;
      }
      nextExpiry = Math.min(nextExpiry, validUntil);
      if (!best || quotePrice(quote) > quotePrice(best)) best = quote;
    }
    setBestQuote(best);
    if (Number.isFinite(nextExpiry)) {
      quoteExpiryTimerRef.current = window.setTimeout(refreshBestQuote, Math.min((nextExpiry - now) * 1000, 2 ** 31 - 1));
    }
  }, []);

  const dropRfq = useCallback(() => {
    pendingRfqRef.current = null;
    quotesRef.current.clear();
    refreshBestQuote();
  }, [refreshBestQuote]);

  const fetchPortfolioPrereqs = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.getPositions();
  }, []);

  walletAddressRef.current = selectedAccount?.address ?? null;

  useEffect(() => {
    console.log("[RfqProvider] Initializing...");
    const client = createRfqClient({ debug: true });
    clientRef.current = client;

    client.on("connecting", () => {
      console.log("[RfqProvider] Connecting...");
      setConnectionState("connecting");
    });

    client.on("welcome", (welcome) => {
      serverClockOffsetMsRef.current = Number(welcome.server_time_unix_ms) - Date.now();
    });

    client.on("connected", () => {
      console.log("[RfqProvider] Connected (anonymous)");
      setConnectionState("connected");
      setError(null);
      client.getEarnSummary();
    });

    client.on("stateChange", (state) => {
      console.log("[RfqProvider] State change:", state);
      setConnectionState(state);
      if (state === "disconnected") {
        tokenMarketsRequest.current = null;
        setTokenMarketsInfo(null);
      }
    });

    client.on("authenticated", (sessionId, expiresAt) => {
      if (!walletAddressRef.current || authWalletRef.current !== walletAddressRef.current) {
        resetToAnonymous(client);
        return;
      }
      console.log("[RfqProvider] Authenticated, session:", sessionId);
      setConnectionState("authenticated");
      if (walletAddressRef.current) {
        persistSession(walletAddressRef.current, sessionId, expiresAt);
      }
      client.getMarketDescriptors();
      client.getTokenCaps({ include_markets: false });
      client.getMyReferralInfo();
    });

    client.on("disconnected", (code, reason) => {
      console.log("[RfqProvider] Disconnected:", code, reason);
      setConnectionState("disconnected");
      prefetchedIndicativeKeysRef.current.clear();
      tokenMarketsRequest.current = null;
      setTokenMarketsInfo(null);
      abandonedRequestsRef.current.clear();
      dropRfq();
      pendingReferralReqsRef.current.clear();
    });

    client.on("error", (serverErr) => {
      console.error("[RfqProvider] Error:", serverErr);

      if (serverErr.type === "Generic" && serverErr.data.code === "session_replaced") {
        console.warn("[RfqProvider] Session replaced by newer connection, disconnecting.");
        client.disconnect();
        return;
      }

      if (serverErr.type === "InviteRequired") {
        setReferralStatus("required");
        return;
      }

      if (isAuthFailureError(serverErr)) {
        resetToAnonymous(client);
      }
      setError(new Error(errorText(serverErr), { cause: serverErr }));
    });

    client.on("requireInvite", () => {
      console.log("[RfqProvider] requireInvite received");
      setReferralStatus("required");
    });

    client.on("inviteRedeemed", (data) => {
      console.log("[RfqProvider] inviteRedeemed:", data.referral_code);
      setReferralStatus("redeemed");
      setReferralError(null);
      clearPendingRefCode();
      pendingReferralReqsRef.current.delete(data.request_id);
      client.getMyReferralInfo();
      showToastRef.current("Invite redeemed — welcome to Acta.", "success");
    });

    client.on("referralCodeClaimed", (data) => {
      console.log("[RfqProvider] referralCodeClaimed:", data.referral_code);
      setReferralError(null);
      pendingReferralReqsRef.current.delete(data.request_id);
      client.getMyReferralInfo();
      showToastRef.current(`Custom code "${data.referral_code}" is yours.`, "success");
    });

    client.on("myReferralInfo", (data) => {
      console.log("[RfqProvider] myReferralInfo:", data.status, data.referral_code);
      const hasCode = typeof data.referral_code === "string" && data.referral_code.length > 0;
      const derived: ReferralStatus = hasCode || data.status === "active" ? "redeemed" : "required";
      setReferralInfo(hasCode ? data : null);
      setReferralStatus((prev) => (prev === "unknown" ? derived : prev));
    });

    client.on("requestError", ({ request_id, error }) => {
      const kind = pendingReferralReqsRef.current.get(request_id);
      if (!kind) return;
      pendingReferralReqsRef.current.delete(request_id);
      if (kind === "invite" && error.type === "Invite") {
        setReferralError(INVITE_COPY[error.data] ?? "Invite failed, please try again.");
      } else if (kind === "claim" && error.type === "Claim") {
        setReferralError(CLAIM_COPY[error.data] ?? "Claim failed, please try again.");
      } else {
        setReferralError("Something went wrong, please try again.");
      }
    });

    client.on("tokenCaps", (data) => setTokenCaps(data.tokens));

    client.on("earnSummary", (data) => {
      console.log("[RfqProvider] Earn summary received:", data.assets?.length ?? 0, "assets");
      setEarnSummary(data.assets ?? []);
    });

    client.on("snapshot", (snap) => {
      console.log("[RfqProvider] Snapshot received, markets:", snap.markets?.length ?? 0);
      if (snap.markets) {
        setMarkets(snap.markets);
      }
    });

    client.on("markets", (m) => {
      console.log(`[RfqProvider] Markets received: ${m.length}`);
      setMarkets(m);
    });

    client.on("marketDescriptors", (m) => {
      console.log("[RfqProvider] Market descriptors received:", m.length);
      setMarketDescriptors(m);
    });

    client.on("positions", (p) => {
      console.log("[RfqProvider] Positions:", p);
      setPositions(p);
    });

    client.on("tokenMarketsInfo", (data: TokenMarketsInfoData) => {
      console.log("[RfqProvider] TokenMarketsInfo received:", data.markets?.length ?? 0, "markets");
      const pending = tokenMarketsRequest.current;
      if (!pending || pending.requestId !== data.request_id) return;
      tokenMarketsRequest.current = null;
      setTokenMarketsInfo({ underlyingMint: pending.underlyingMint, data });
      const updates: Record<string, IndicativePricesMessage> = {};
      for (const mkt of data.markets ?? []) {
        for (const ind of mkt.indicatives ?? []) {
          const pt = ind.position_type as "covered_call" | "cash_secured_put";
          const key = getIndicativeKey(mkt.market_pda, pt);
          updates[key] = {
            request_id: data.request_id,
            market: mkt.market_pda as IndicativePricesMessage["market"],
            position_type: pt,
            strikes: ind.strikes,
            updated_at: ind.updated_at,
            is_stale: ind.is_stale,
          };
        }
      }
      if (Object.keys(updates).length > 0) {
        setIndicativePricesByKey((prev) => ({ ...prev, ...updates }));
      }
    });

    client.on("indicativePrices", (msg) => {
      setIndicativePrices(msg);
      const key = getIndicativeKey(String(msg.market), msg.position_type as "covered_call" | "cash_secured_put");
      setIndicativePricesByKey((prev) => ({ ...prev, [key]: msg }));
    });

    client.on("rfqCreated", (msg) => {
      if (msg.request_id && abandonedRequestsRef.current.delete(msg.request_id)) {
        client.cancelRfq(msg.rfq_id);
        return;
      }
      const pending = pendingRfqRef.current;
      if (pending && msg.request_id === pending.requestId) pending.rfqId = msg.rfq_id;
    });
    client.on("quoteReceived", (quote) => {
      const pending = pendingRfqRef.current;
      if (!pending?.rfqId || quote.rfq_id !== pending.rfqId || Number(quote.strike) !== pending.strike) return;
      quotesRef.current.set(quote.maker, quote);
      refreshBestQuote();
    });
    client.on("quotesUpdate", (update) => {
      const pending = pendingRfqRef.current;
      if (!pending?.rfqId || update.rfq_id !== pending.rfqId) return;
      quotesRef.current.clear();
      for (const quote of update.quotes) {
        if (Number(quote.strike) === pending.strike) quotesRef.current.set(quote.maker, quote);
      }
      refreshBestQuote();
    });
    client.on("rfqClosed", (msg) => {
      const pending = pendingRfqRef.current;
      if (pending?.rfqId && msg.rfq_id === pending.rfqId) dropRfq();
    });

    client.on("orderSubmitted", (orderId, sig) => {
      console.log("[RfqProvider] Order submitted:", orderId, sig);
    });

    client.on("orderConfirmed", (orderId, positionPda) => {
      console.log("[RfqProvider] Order confirmed:", orderId, positionPda);
      client.getMyReferralInfo();
    });

    console.log("[RfqProvider] Connecting...");
    client.connectAnonymous();

    return () => {
      console.log("[RfqProvider] Cleaning up...");
      clientRef.current = null;
      authInFlightRef.current?.controller.abort();
      authInFlightRef.current = null;
      client.disconnect();
      if (anonymousReconnectTimer.current !== null) window.clearTimeout(anonymousReconnectTimer.current);
      clientRef.current = null;
      if (quoteExpiryTimerRef.current != null) window.clearTimeout(quoteExpiryTimerRef.current);
    };
  }, [getIndicativeKey, refreshBestQuote, dropRfq, resetToAnonymous]);

  const authenticate = useCallback(
    (walletAddress: string, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) => {
      const previous = authInFlightRef.current;
      if (previous?.wallet === walletAddress) return previous.promise;
      if (previous) {
        previous.controller.abort();
        if (clientRef.current) resetToAnonymous(clientRef.current);
      }
      pendingRfqAuthWalletRef.current = null;
      if (anonymousReconnectTimer.current !== null) {
        window.clearTimeout(anonymousReconnectTimer.current);
        anonymousReconnectTimer.current = null;
      }
      const controller = new AbortController();
      const attempt = Promise.resolve().then(async () => {
        if (controller.signal.aborted || walletAddressRef.current !== walletAddress) throw new Error("Wallet changed during sign-in");
        authWalletRef.current = walletAddress;
        const client = clientRef.current;
        if (!client) {
          throw new Error("RFQ connection is unavailable");
        }

        const authProvider = createWalletAuthProvider({
          address: walletAddress,
          signMessage,
        });

        const maybeSessionId = loadStoredSessionId(walletAddress);
        console.log("[RfqProvider] Authenticating wallet:", walletAddress, {
          resumeSession: !!maybeSessionId,
        });
        setConnectionState("authenticating");

        try {
          await new Promise<void>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
              cleanup();
              reject(new Error("RFQ auth timeout"));
            }, 20000);

            const cleanup = () => {
              window.clearTimeout(timeoutId);
              client.off("authenticated", onAuthenticated);
              client.off("error", onError);
              controller.signal.removeEventListener("abort", onAbort);
            };

            const onAbort = () => {
              cleanup();
              reject(new Error("Wallet changed during sign-in"));
            };
            const onAuthenticated = () => {
              cleanup();
              if (walletAddressRef.current !== walletAddress) reject(new Error("Wallet changed during sign-in"));
              else resolve();
            };

            const onError = (serverErr: ActaWsClientError) => {
              cleanup();
              reject(serverErr);
            };

            controller.signal.addEventListener("abort", onAbort, { once: true });
            client.on("authenticated", onAuthenticated);
            client.on("error", onError);
            client.connectAndAuthenticate(authProvider, maybeSessionId ? { sessionId: maybeSessionId } : undefined);
          });
        } catch (err) {
          console.error("[RfqProvider] Authentication failed:", err);
          const serverErr = err as ActaWsClientError;
          if (clientRef.current === client && authInFlightRef.current?.controller === controller) {
            resetToAnonymous(client);
            setError(new Error(serverErr?.type ? errorText(serverErr) : String(err)));
          }
          throw err;
        }
      }).finally(() => {
        if (authInFlightRef.current?.controller === controller) authInFlightRef.current = null;
      });
      authInFlightRef.current = { wallet: walletAddress, promise: attempt, controller };
      return attempt;
    },
    [resetToAnonymous]
  );

  const walletAddress = selectedAccount?.address;
  const rfqConnected = connectionState !== "disconnected" && connectionState !== "error";

  useEffect(() => {
    const attempt = authInFlightRef.current;
    if ((attempt && attempt.wallet !== walletAddress) || (authWalletRef.current && authWalletRef.current !== walletAddress)) {
      authInFlightRef.current = null;
      attempt?.controller.abort();
      authWalletRef.current = null;
      if (clientRef.current) resetToAnonymous(clientRef.current);
    }
    if (!walletConnected || !walletAddress || !selectedAccount) {
      pendingRfqAuthWalletRef.current = null;
      setAuthWarmupDone(false);
      if (authWarmupTimerRef.current != null) {
        window.clearTimeout(authWarmupTimerRef.current);
        authWarmupTimerRef.current = null;
      }
      return;
    }

    pendingRfqAuthWalletRef.current = walletAddress;
    setAuthWarmupDone(false);

    if (authWarmupTimerRef.current != null) {
      window.clearTimeout(authWarmupTimerRef.current);
    }
    authWarmupTimerRef.current = window.setTimeout(() => {
      setAuthWarmupDone(true);
      authWarmupTimerRef.current = null;
    }, 900);

    return () => {
      if (authWarmupTimerRef.current != null) {
        window.clearTimeout(authWarmupTimerRef.current);
        authWarmupTimerRef.current = null;
      }
    };
  }, [walletConnected, walletAddress, selectedAccount, resetToAnonymous]);

  useEffect(() => {
    if (!walletConnected || !walletAddress || !rfqConnected || authInFlightRef.current || !authWarmupDone) {
      return;
    }
    if (pendingRfqAuthWalletRef.current !== walletAddress) {
      return;
    }

    void authenticate(walletAddress, signMessage).catch((err) => {
      console.error("[RfqProvider] RFQ auth after wallet connect failed:", err);
    });
  }, [walletConnected, walletAddress, rfqConnected, authWarmupDone, authenticate, signMessage]);

  useEffect(() => {
    setReferralGateOpen(referralStatus === "required");
  }, [referralStatus]);

  const prevWalletConnectedRef = useRef(walletConnected);
  useEffect(() => {
    const wasConnected = prevWalletConnectedRef.current;
    prevWalletConnectedRef.current = walletConnected;
    if (!wasConnected || walletConnected) return;

    console.log("[RfqProvider] Wallet disconnected; clearing per-user state");
    setReferralStatus("unknown");
    setReferralInfo(null);
    setReferralError(null);
    pendingReferralReqsRef.current.clear();
    setPositions([]);
    abandonedRequestsRef.current.clear();
    dropRfq();
    setError(null);

    const client = clientRef.current;
    if (client) resetToAnonymous(client);
  }, [walletConnected, dropRfq, resetToAnonymous]);

  useEffect(() => {
    if (connectionState !== "authenticating") {
      setShowAuthSignModal(false);
      setDismissedAuthSignModal(false);
      return;
    }
    if (dismissedAuthSignModal) return;
    const timeoutId = window.setTimeout(() => {
      setShowAuthSignModal(true);
    }, 800);
    return () => window.clearTimeout(timeoutId);
  }, [connectionState, dismissedAuthSignModal]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionState("disconnected");
  }, []);

  const fetchPositions = useCallback(() => {
    fetchPortfolioPrereqs();
  }, [fetchPortfolioPrereqs]);

  const getIndicativePrices = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => {
      prefetchedIndicativeKeysRef.current.add(getIndicativeKey(market, positionType));
      clientRef.current?.getIndicativePrices({
        market: market as any,
        position_type: positionType,
      });
    },
    [getIndicativeKey]
  );

  const getTokenMarketsInfo = useCallback((underlyingMint: string) => {
    const client = clientRef.current;
    if (!client) return;
    const requestId = crypto.randomUUID();
    tokenMarketsRequest.current = { requestId, underlyingMint };
    setTokenMarketsInfo(previous => previous?.underlyingMint === underlyingMint ? previous : null);
    void client.request("TokenMarketsInfo", {
      type: "GetTokenMarketsInfo", data: { request_id: requestId, underlying_mint: underlyingMint },
    }).catch(() => {
      if (tokenMarketsRequest.current?.requestId !== requestId) return;
      tokenMarketsRequest.current = null;
      setTokenMarketsInfo(null);
    });
  }, []);

  const getEarnSummary = useCallback(() => {
    clientRef.current?.getEarnSummary();
  }, []);

  const getIndicativePricesCached = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => {
      return indicativePricesByKey[getIndicativeKey(market, positionType)] ?? null;
    },
    [indicativePricesByKey, getIndicativeKey]
  );

  const cancelRfq = useCallback(() => {
    const pending = pendingRfqRef.current;
    if (pending) {
      const client = clientRef.current;
      if (!pending.rfqId) abandonedRequestsRef.current.add(pending.requestId);
      else if (client?.isAuthenticated()) client.cancelRfq(pending.rfqId);
    }
    dropRfq();
    setError(null);
  }, [dropRfq]);

  const submitRfq = useCallback(
    (params: {
      market: string;
      positionType: "covered_call" | "cash_secured_put";
      strike: number;
      quantity: number;
      timeoutSeconds?: number;
    }) => {
      const client = clientRef.current;
      if (!client) {
        setError(new Error("RFQ connection is unavailable"));
        return;
      }

      const rfqRequest = {
        market: params.market as any,
        position_type: params.positionType,
        strike: params.strike,
        quantity: params.quantity,
        timeoutSeconds: params.timeoutSeconds ?? RFQ_TTL_SECONDS,
      };
      console.log("[RfqProvider] Submitting RFQ:", rfqRequest);
      const descriptor = marketDescriptors.find((d) => d.market?.market_pda === params.market);
      if (!descriptor) {
        console.warn("[RfqProvider] Missing descriptor for market before RFQ; refreshing descriptors", {
          market: params.market,
        });
        client.getMarketDescriptors();
        setError(new Error("Market metadata is still loading. Please retry in a moment."));
        return;
      }
      cancelRfq();
      const requestId = crypto.randomUUID();
      pendingRfqRef.current = {
        requestId,
        strike: params.strike,
        rfqId: null,
        rfq: { market: descriptor.market, position_type: params.positionType, quantity: params.quantity },
      };
      void client.createRfq({ ...rfqRequest, requestId }).catch((err) => {
        const pending = pendingRfqRef.current;
        if (pending?.requestId !== requestId) return;
        const timedOut = err instanceof ActaWsRequestError && err.kind === "timeout";
        if (timedOut && pending.rfqId) return;
        if (timedOut) cancelRfq();
        else dropRfq();
        const message = wsErrorMessage(err);
        if (isMissingMarketDescriptorError(message)) {
          client.getMarketDescriptors();
          setError(new Error("Market metadata refreshed. Please retry quote request."));
          return;
        }
        setError(new Error(message, { cause: err }));
      });
    },
    [marketDescriptors, cancelRfq, dropRfq]
  );

  const acceptQuote = useCallback(async (rfqId: string, maker: string, orderIdHex: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("RFQ connection is unavailable");
    if (!client.isAuthenticated()) throw new Error("RFQ connection is not authenticated");
    await client.acceptQuote(rfqId, maker as any, orderIdHex);
  }, []);

  const submitSignedTx = useCallback(async (orderIdHex: string, txBase64: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("RFQ connection is unavailable");
    if (!client.isAuthenticated()) throw new Error("RFQ connection is not authenticated");
    await client.submitSignedSponsoredTx({ orderIdHex, txBase64 });
  }, []);

  const redeemInvite = useCallback((rawCode: string) => {
    const client = clientRef.current;
    if (!client) {
      setReferralError("Not connected. Please retry in a moment.");
      return;
    }
    setReferralError(null);
    try {
      const requestId = client.redeemInvite(rawCode);
      pendingReferralReqsRef.current.set(requestId, "invite");
    } catch (err) {
      if (err instanceof ReferralCodeError) {
        setReferralError(referralCodeErrorMessage(err));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setReferralError(message || "Something went wrong, please try again.");
    }
  }, []);

  const claimReferralCode = useCallback(async (rawCode: string) => {
    const client = clientRef.current;
    if (!client) {
      setReferralError("Not connected. Please retry in a moment.");
      return;
    }
    setReferralError(null);
    try {
      const requestId = await client.claimReferralCode(rawCode);
      pendingReferralReqsRef.current.set(requestId, "claim");
    } catch (err) {
      if (err instanceof ReferralCodeError) {
        setReferralError(referralCodeErrorMessage(err));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setReferralError(message || "Something went wrong, please try again.");
    }
  }, []);

  const refreshReferralInfo = useCallback(() => {
    clientRef.current?.getMyReferralInfo();
  }, []);

  const clearReferralError = useCallback(() => {
    setReferralError(null);
  }, []);

  const openReferralGate = useCallback(() => {
    setReferralGateOpen(true);
  }, []);

  const closeReferralGate = useCallback(() => {
    setReferralGateOpen(false);
    void disconnectWallet();
  }, [disconnectWallet]);

  const getClient = useCallback(() => clientRef.current, []);
  const rfqTerms = useCallback((rfqId: string) => {
    const pending = pendingRfqRef.current;
    return pending?.rfqId === rfqId ? pending.rfq : null;
  }, []);

  const value: RfqContextValue = {
    connectionState,
    isConnected: connectionState !== "disconnected" && connectionState !== "error",
    isAuthenticated: connectionState === "authenticated" && authWalletRef.current === selectedAccount?.address,
    markets,
    tokenCaps,
    earnSummary,
    marketDescriptors,
    positions,
    bestQuote,
    quoteSecondsRemaining,
    indicativePrices,
    getIndicativePricesCached,
    tokenMarketsInfo,
    getTokenMarketsInfo,
    getEarnSummary,
    error,
    authenticate,
    disconnect,
    fetchPositions,
    getIndicativePrices,
    submitRfq,
    acceptQuote,
    submitSignedTx,
    cancelRfq,
    getClient,
    rfqTerms,
    referralStatus,
    referralInfo,
    referralError,
    redeemInvite,
    claimReferralCode,
    refreshReferralInfo,
    clearReferralError,
    openReferralGate,
  };

  return (
    <RfqContext.Provider value={value}>
      {children}
      {showDebugBadge ? (
        <div className="fixed bottom-3 right-3 z-[120] rounded-lg border border-white/20 bg-black/80 px-3 py-2 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
          <div className="text-white/70">state: {connectionState}</div>
        </div>
      ) : null}
      <AppModal
        open={showAuthSignModal}
        onClose={() => {
          setShowAuthSignModal(false);
          setDismissedAuthSignModal(true);
        }}
        title="Awaiting Wallet Signature"
        showHowItWorks={false}
      >
        <div className="space-y-3">
          <p className="text-sm text-content-secondary">
            Please check your wallet and sign the authentication message to continue.
          </p>
          <p className="text-xs text-content-tertiary">
            Keep this tab open. This popup closes automatically after successful authentication.
          </p>
        </div>
      </AppModal>
      <ReferralGateModal
        open={referralGateOpen}
        state={referralStatus === "required" ? "redeem" : "loading"}
        onClose={closeReferralGate}
      />
    </RfqContext.Provider>
  );
}
