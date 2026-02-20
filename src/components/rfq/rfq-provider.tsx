"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  ActaWsClient,
  createRfqClient,
  createWalletAuthProvider,
  type MarketInfo,
  type MarketDescriptorInfo,
  type PositionInfo,
  type QuoteReceivedMessage,
  type IndicativePricesMessage,
  type ConnectionState,
} from "@/lib/rfq-client";
import { useSolana } from "@/components/solana/solana-wallet-provider";

interface RfqContextValue {
  /** Connection state */
  connectionState: ConnectionState;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Whether user is authenticated with wallet */
  isAuthenticated: boolean;
  /** Available markets from RFQ server */
  markets: MarketInfo[];
  /** Market descriptors (includes underlying/quote metadata) */
  marketDescriptors: MarketDescriptorInfo[];
  /** User's positions (requires auth) */
  positions: PositionInfo[];
  /** Current/latest quote received */
  currentQuote: QuoteReceivedMessage | null;
  /** Indicative prices */
  indicativePrices: IndicativePricesMessage | null;
  /** Returns cached indicatives for specific market + position type */
  getIndicativePricesCached: (
    market: string,
    positionType: "covered_call" | "cash_secured_put"
  ) => IndicativePricesMessage | null;
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
  acceptQuote: (rfqId: string, maker: string, orderIdHex: string) => void;
  /** Submit signed transaction */
  submitSignedTx: (orderIdHex: string, txBase64: string) => void;
  /** Clear transient RFQ UI state (quote/error) */
  clearTransientState: () => void;
  /** Get the underlying client */
  getClient: () => ActaWsClient | null;
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

function clearPendingAuthState(client: ActaWsClient) {
  const internal = client as unknown as {
    authRequested?: boolean;
    authProvider?: unknown;
    startAuthSent?: boolean;
  };
  internal.authRequested = false;
  internal.authProvider = null;
  internal.startAuthSent = false;
}

function isAuthFailureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("user rejected") || lower.includes("auth timeout");
}

function isRecoverableRfqBusinessError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("quote_not_found") ||
    lower.includes("quote_expired") ||
    lower.includes("quote_refresh_required") ||
    lower.includes("rfq_expired") ||
    lower.includes("rfq_closed") ||
    lower.includes("marketmetadataincomplete") ||
    lower.includes("market_metadata_incomplete") ||
    lower.includes("tokenmetadataincomplete") ||
    lower.includes("token_metadata_incomplete")
  );
}

function resetToAnonymous(client: ActaWsClient) {
  clearPendingAuthState(client);
  client.disconnect();
  // Reconnect without auth intent so market data keeps working.
  window.setTimeout(() => {
    client.connectAnonymous();
  }, 250);
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
    if (typeof parsed.expiresAt === "number" && parsed.expiresAt > 0 && parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed.sessionId;
  } catch {
    return null;
  }
}

function persistSession(walletAddress: string, sessionId: string, expiresAt: number | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RFQ_SESSION_KEY,
      JSON.stringify({ walletAddress, sessionId, expiresAt })
    );
  } catch {
    // ignore storage errors
  }
}

export function RfqProvider({ children }: RfqProviderProps) {
  const showDebugBadge = process.env.NEXT_PUBLIC_RFQ_DEBUG_BADGE === "true";
  const { selectedAccount, isConnected: walletConnected, signMessage } = useSolana();
  const clientRef = useRef<ActaWsClient | null>(null);
  const walletAddressRef = useRef<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [marketDescriptors, setMarketDescriptors] = useState<MarketDescriptorInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [currentQuote, setCurrentQuote] = useState<QuoteReceivedMessage | null>(null);
  const [indicativePrices, setIndicativePrices] = useState<IndicativePricesMessage | null>(null);
  const [indicativePricesByKey, setIndicativePricesByKey] = useState<Record<string, IndicativePricesMessage>>({});
  const [error, setError] = useState<Error | null>(null);
  const pendingRfqAuthWalletRef = useRef<string | null>(null);
  const authInFlightRef = useRef(false);
  const authWarmupTimerRef = useRef<number | null>(null);
  const [authWarmupDone, setAuthWarmupDone] = useState(false);
  const prefetchedIndicativeKeysRef = useRef<Set<string>>(new Set());
  const lastWsMessageAtRef = useRef<number>(Date.now());
  const lastWsPingAtRef = useRef<number>(0);
  const lastForcedReconnectAtRef = useRef<number>(0);
  const [wsHealth, setWsHealth] = useState<"healthy" | "quiet" | "recovering">("healthy");
  const [wsSilentSeconds, setWsSilentSeconds] = useState(0);

  const getIndicativeKey = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => `${market}:${positionType}`,
    []
  );

  const prefetchIndicativesForMarkets = useCallback(
    (client: ActaWsClient, marketsToWarm: MarketInfo[]) => {
      for (const marketInfo of marketsToWarm) {
        const marketPda = marketInfo?.pda;
        if (!marketPda) continue;
        const callKey = getIndicativeKey(marketPda, "covered_call");
        if (!prefetchedIndicativeKeysRef.current.has(callKey)) {
          prefetchedIndicativeKeysRef.current.add(callKey);
        }
        client.getIndicativePrices({ market: marketPda as any, position_type: "covered_call" });

        const putKey = getIndicativeKey(marketPda, "cash_secured_put");
        if (!prefetchedIndicativeKeysRef.current.has(putKey)) {
          prefetchedIndicativeKeysRef.current.add(putKey);
        }
        client.getIndicativePrices({ market: marketPda as any, position_type: "cash_secured_put" });
      }
    },
    [getIndicativeKey]
  );

  const fetchPortfolioPrereqs = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    // Per SDK quickstart recovery order, positions + markets are sufficient here.
    client.getMarkets();
    client.getPositions();
  }, []);

  useEffect(() => {
    walletAddressRef.current = selectedAccount?.address ?? null;
  }, [selectedAccount?.address]);

  // Initialize client and connect anonymously on mount
  useEffect(() => {
    console.log("[RfqProvider] Initializing...");
    const client = createRfqClient({ debug: true });
    clientRef.current = client;

    // Connection events
    client.on("connecting", () => {
      console.log("[RfqProvider] Connecting...");
      setConnectionState("connecting");
    });

    client.on("connected", () => {
      console.log("[RfqProvider] Connected (anonymous)");
      setError(null);
      lastWsMessageAtRef.current = Date.now();
      lastWsPingAtRef.current = 0;
      setWsHealth("healthy");
      setWsSilentSeconds(0);
      // Fetch markets immediately after connecting
      console.log("[RfqProvider] Fetching markets...");
      client.getMarkets();
    });

    client.on("stateChange", (state) => {
      console.log("[RfqProvider] State change:", state);
      setConnectionState(state);
    });

    client.on("authenticated", (sessionId, expiresAt) => {
      console.log("[RfqProvider] Authenticated, session:", sessionId);
      setConnectionState("authenticated");
      lastWsMessageAtRef.current = Date.now();
      lastWsPingAtRef.current = 0;
      setWsHealth("healthy");
      setWsSilentSeconds(0);
      if (walletAddressRef.current) {
        persistSession(walletAddressRef.current, sessionId, expiresAt ?? null);
      }
      // Fetch positions + market metadata together for stable PDA->underlying lookup.
      fetchPortfolioPrereqs();
    });

    client.on("disconnected", (code, reason) => {
      console.log("[RfqProvider] Disconnected:", code, reason);
      setConnectionState("disconnected");
      prefetchedIndicativeKeysRef.current.clear();
      lastWsPingAtRef.current = 0;
      setWsHealth("recovering");
    });

    client.on("error", (err) => {
      console.error("[RfqProvider] Error:", err);
      const message = err instanceof Error ? err.message : String(err);
      // Prevent reconnect-auth loops after user rejection/timeouts.
      if (isAuthFailureMessage(message)) {
        resetToAnonymous(client);
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      // Keep connection state for recoverable business-level RFQ errors.
      if (!isRecoverableRfqBusinessError(message)) {
        setConnectionState("error");
      }
    });

    // Data events
    client.on("message", () => {
      lastWsMessageAtRef.current = Date.now();
      setWsHealth("healthy");
      setWsSilentSeconds(0);
    });

    client.on("markets", (m) => {
      console.log("[RfqProvider] Markets received:", m.length);
      console.log("[RfqProvider] Markets:", m);
      setMarkets(m);
      // Warm indicatives immediately after markets so market page can render faster.
      prefetchIndicativesForMarkets(client, m);
    });

    client.on("marketDescriptors", (m) => {
      console.log("[RfqProvider] Market descriptors received:", m.length);
      setMarketDescriptors(m);
    });

    client.on("positions", (p) => {
      console.log("[RfqProvider] Positions:", p);
      setPositions(p);
    });

    client.on("indicativePrices", (msg) => {
      console.log("[RfqProvider] Indicative prices:", msg);
      setIndicativePrices(msg);
      const key = getIndicativeKey(String(msg.market), msg.position_type as "covered_call" | "cash_secured_put");
      setIndicativePricesByKey((prev) => ({ ...prev, [key]: msg }));
    });

    client.on("quoteReceived", (q) => {
      console.log("[RfqProvider] Quote received:", q);
      setCurrentQuote(q);
    });

    // Order events
    client.on("orderSubmitted", (orderId, sig) => {
      console.log("[RfqProvider] Order submitted:", orderId, sig);
    });

    client.on("orderConfirmed", (orderId, positionPda) => {
      console.log("[RfqProvider] Order confirmed:", orderId, positionPda);
    });

    client.on("orderFailed", (orderId, reason) => {
      console.error("[RfqProvider] Order failed:", orderId, reason);
      setError(new Error(`Order failed: ${reason}`));
    });

    // Connect anonymously on mount
    console.log("[RfqProvider] Connecting anonymously...");
    client.connectAnonymous();

    return () => {
      console.log("[RfqProvider] Cleaning up...");
      client.disconnect();
      clientRef.current = null;
    };
  }, [fetchPortfolioPrereqs, getIndicativeKey, prefetchIndicativesForMarkets]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (connectionState === "disconnected" || connectionState === "error" || markets.length === 0) return;

    const intervalId = window.setInterval(() => {
      const activeClient = clientRef.current;
      if (!activeClient) return;
      // Keep indicative prices fresh across app navigation.
      prefetchIndicativesForMarkets(activeClient, markets);
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [connectionState, markets, prefetchIndicativesForMarkets]);

  useEffect(() => {
    if (connectionState === "disconnected" || connectionState === "error") return;

    const intervalId = window.setInterval(() => {
      const client = clientRef.current;
      if (!client) return;

      const now = Date.now();
      const silentForMs = now - lastWsMessageAtRef.current;
      setWsSilentSeconds(Math.max(0, Math.floor(silentForMs / 1000)));

      if (silentForMs > 75_000) {
        setWsHealth("recovering");
      } else if (silentForMs > 35_000) {
        setWsHealth("quiet");
      } else {
        setWsHealth("healthy");
      }

      // Soft recovery: ping when socket is quiet for too long.
      if (silentForMs > 35_000 && now - lastWsPingAtRef.current > 20_000) {
        try {
          client.ping();
          lastWsPingAtRef.current = now;
          console.warn("[RfqProvider] WS quiet; sent heartbeat ping", { silentForMs });
        } catch (err) {
          console.warn("[RfqProvider] WS ping failed:", err);
        }
      }

      // Hard recovery: force reconnect if no traffic for extended period.
      if (silentForMs > 75_000 && now - lastForcedReconnectAtRef.current > 60_000) {
        lastForcedReconnectAtRef.current = now;
        console.warn("[RfqProvider] WS appears stale; forcing reconnect", { silentForMs });
        resetToAnonymous(client);
      }
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [connectionState]);

  useEffect(() => {
    const onOnline = () => {
      const client = clientRef.current;
      if (!client) return;
      if (connectionState === "disconnected" || connectionState === "error") {
        console.log("[RfqProvider] Browser back online; reconnecting WS...");
        client.connectAnonymous();
      }
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [connectionState]);

  // Authenticate with wallet
  const authenticate = useCallback(
    async (walletAddress: string, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) => {
      const client = clientRef.current;
      if (!client) {
        console.error("[RfqProvider] Client not initialized");
        return;
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
            client.off("authenticated", onAuthenticated);
            client.off("error", onError);
            reject(new Error("RFQ auth timeout"));
          }, 20000);

          const cleanup = () => {
            window.clearTimeout(timeoutId);
            client.off("authenticated", onAuthenticated);
            client.off("error", onError);
          };

          const onAuthenticated = () => {
            cleanup();
            resolve();
          };

          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };

          client.on("authenticated", onAuthenticated);
          client.on("error", onError);
          client.connectAndAuthenticate(authProvider, maybeSessionId ? { sessionId: maybeSessionId } : undefined);
        });
      } catch (err) {
        console.error("[RfqProvider] Authentication failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        if (isAuthFailureMessage(message)) {
          resetToAnonymous(client);
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    []
  );

  const walletAddress = selectedAccount?.address;
  const rfqConnected = connectionState !== "disconnected" && connectionState !== "error";

  // Trigger RFQ auth from provider so it works regardless of active page.
  useEffect(() => {
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
  }, [walletConnected, walletAddress, selectedAccount]);

  useEffect(() => {
    if (!walletConnected || !walletAddress || !rfqConnected || authInFlightRef.current || !authWarmupDone) {
      return;
    }
    if (pendingRfqAuthWalletRef.current !== walletAddress) {
      return;
    }

    authInFlightRef.current = true;
    void authenticate(walletAddress, signMessage)
      .then(() => {
        pendingRfqAuthWalletRef.current = null;
      })
      .catch((err) => {
        console.error("[RfqProvider] RFQ auth after wallet connect failed:", err);
        pendingRfqAuthWalletRef.current = null;
      })
      .finally(() => {
        authInFlightRef.current = false;
      });
  }, [walletConnected, walletAddress, rfqConnected, authWarmupDone, authenticate, signMessage]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionState("disconnected");
  }, []);

  const fetchPositions = useCallback(() => {
    // Keep metadata warm together with positions to avoid Unknown assets.
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

  const getIndicativePricesCached = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => {
      return indicativePricesByKey[getIndicativeKey(market, positionType)] ?? null;
    },
    [indicativePricesByKey, getIndicativeKey]
  );

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
        console.error("[RfqProvider] submitRfq: no client");
        return;
      }

      const rfqRequest = {
        market: params.market as any,
        position_type: params.positionType,
        strike: params.strike,
        quantity: params.quantity,
        timeoutSeconds: params.timeoutSeconds ?? 30,
      };
      console.log("[RfqProvider] Submitting RFQ:", rfqRequest);
      client.createRfq(rfqRequest);
    },
    []
  );

  const acceptQuote = useCallback((rfqId: string, maker: string, orderIdHex: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.acceptQuote(rfqId, maker as any, orderIdHex);
  }, []);

  const submitSignedTx = useCallback((orderIdHex: string, txBase64: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.submitSignedSponsoredTx({ orderIdHex, txBase64 });
  }, []);

  const clearTransientState = useCallback(() => {
    setCurrentQuote(null);
    setError(null);
  }, []);

  const getClient = useCallback(() => clientRef.current, []);

  const value: RfqContextValue = {
    connectionState,
    isConnected: connectionState !== "disconnected" && connectionState !== "error",
    isAuthenticated: connectionState === "authenticated",
    markets,
    marketDescriptors,
    positions,
    currentQuote,
    indicativePrices,
    getIndicativePricesCached,
    error,
    authenticate,
    disconnect,
    fetchPositions,
    getIndicativePrices,
    submitRfq,
    acceptQuote,
    submitSignedTx,
    clearTransientState,
    getClient,
  };

  return (
    <RfqContext.Provider value={value}>
      {children}
      {showDebugBadge ? (
        <div className="fixed bottom-3 right-3 z-[120] rounded-lg border border-white/20 bg-black/80 px-3 py-2 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
          <div>WS {wsHealth.toUpperCase()}</div>
          <div className="text-white/70">state: {connectionState}</div>
          <div className="text-white/70">silent: {wsSilentSeconds}s</div>
        </div>
      ) : null}
    </RfqContext.Provider>
  );
}

