"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  ActaWsClient,
  createRfqClient,
  createWalletAuthProvider,
  type MarketInfo,
  type PositionInfo,
  type QuoteReceivedMessage,
  type IndicativePricesMessage,
  type ConnectionState,
} from "@/lib/rfq-client";

interface RfqContextValue {
  /** Connection state */
  connectionState: ConnectionState;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Whether user is authenticated with wallet */
  isAuthenticated: boolean;
  /** Available markets from RFQ server */
  markets: MarketInfo[];
  /** User's positions (requires auth) */
  positions: PositionInfo[];
  /** Current/latest quote received */
  currentQuote: QuoteReceivedMessage | null;
  /** Indicative prices */
  indicativePrices: IndicativePricesMessage | null;
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
    lower.includes("rfq_closed")
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

export function RfqProvider({ children }: RfqProviderProps) {
  const clientRef = useRef<ActaWsClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [currentQuote, setCurrentQuote] = useState<QuoteReceivedMessage | null>(null);
  const [indicativePrices, setIndicativePrices] = useState<IndicativePricesMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);

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
      // Fetch markets immediately after connecting
      console.log("[RfqProvider] Fetching markets...");
      client.getMarkets();
    });

    client.on("stateChange", (state) => {
      console.log("[RfqProvider] State change:", state);
      setConnectionState(state);
    });

    client.on("authenticated", (sessionId) => {
      console.log("[RfqProvider] Authenticated, session:", sessionId);
      setConnectionState("authenticated");
      // Fetch positions on auth
      client.getPositions();
    });

    client.on("disconnected", (code, reason) => {
      console.log("[RfqProvider] Disconnected:", code, reason);
      setConnectionState("disconnected");
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
    client.on("markets", (m) => {
      console.log("[RfqProvider] Markets received:", m.length);
      console.log("[RfqProvider] Markets:", m);
      setMarkets(m);
    });

    client.on("positions", (p) => {
      console.log("[RfqProvider] Positions:", p);
      setPositions(p);
    });

    client.on("indicativePrices", (msg) => {
      console.log("[RfqProvider] Indicative prices:", msg);
      setIndicativePrices(msg);
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
  }, []);

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

      console.log("[RfqProvider] Authenticating wallet:", walletAddress);
      setConnectionState("authenticating");

      try {
        await client.authenticate(authProvider);
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

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionState("disconnected");
  }, []);

  const fetchPositions = useCallback(() => {
    clientRef.current?.getPositions();
  }, []);

  const getIndicativePrices = useCallback(
    (market: string, positionType: "covered_call" | "cash_secured_put") => {
      clientRef.current?.getIndicativePrices({
        market: market as any,
        position_type: positionType,
      });
    },
    []
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

  const getClient = useCallback(() => clientRef.current, []);

  const value: RfqContextValue = {
    connectionState,
    isConnected: connectionState !== "disconnected" && connectionState !== "error",
    isAuthenticated: connectionState === "authenticated",
    markets,
    positions,
    currentQuote,
    indicativePrices,
    error,
    authenticate,
    disconnect,
    fetchPositions,
    getIndicativePrices,
    submitRfq,
    acceptQuote,
    submitSignedTx,
    getClient,
  };

  return <RfqContext.Provider value={value}>{children}</RfqContext.Provider>;
}

