"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "@solana/addresses";
import {
  ActaWsClient,
  createRfqClient,
  createWalletAuthProvider,
  type MarketInfo,
  type PositionInfo,
  type QuoteReceivedMessage,
  type IndicativePricesMessage,
  type ConnectionState,
  type ServerError,
} from "./rfq-client";

// Re-export types for components
export type { QuoteReceivedMessage, IndicativePricesMessage, ConnectionState };

interface UseRfqOptions {
  /** Enable debug logging */
  debug?: boolean;
}

interface UseRfqReturn {
  /** Connection state */
  connectionState: ConnectionState;
  /** Whether WebSocket is connected (anonymous or authenticated) */
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
  /** Connect anonymously (no wallet required) */
  connectAnonymous: () => void;
  /** Authenticate with wallet (triggers signing prompt) */
  authenticate: (walletAddress: string, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) => Promise<void>;
  /** Disconnect */
  disconnect: () => void;
  /** Fetch markets */
  fetchMarkets: () => void;
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

function isAuthFailureError(err: ServerError): boolean {
  return err.type === "unauthenticated" || err.type === "unauthorized" ||
    (err.type === "generic" && (
      err.data.code === "unauthenticated" ||
      err.data.message.toLowerCase().includes("user rejected") ||
      err.data.message.toLowerCase().includes("auth timeout")
    ));
}

function isRecoverableRfqBusinessError(err: ServerError): boolean {
  const code = err.type === "generic" ? err.data.code : err.type;
  return (
    code === "quote_not_found" ||
    code === "quote_expired" ||
    code === "quote_refresh_required" ||
    code === "rfq_expired" ||
    code === "rfq_closed"
  );
}

function resetToAnonymous(client: ActaWsClient) {
  clearPendingAuthState(client);
  client.disconnect();
  window.setTimeout(() => {
    client.connectAnonymous();
  }, 250);
}

export function useRfq(options: UseRfqOptions = {}): UseRfqReturn {
  const clientRef = useRef<ActaWsClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [currentQuote, setCurrentQuote] = useState<QuoteReceivedMessage | null>(null);
  const [indicativePrices, setIndicativePrices] = useState<IndicativePricesMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Initialize client
  useEffect(() => {
    const client = createRfqClient({ debug: options.debug });
    clientRef.current = client;

    // Connection events
    client.on("connecting", () => {
      console.log("[useRfq] Connecting...");
      setConnectionState("connecting");
    });

    client.on("connected", () => {
      console.log("[useRfq] Connected (anonymous)");
      setError(null);
    });

    client.on("stateChange", (state) => {
      console.log("[useRfq] State change:", state);
      setConnectionState(state);
    });

    client.on("authenticated", (sessionId) => {
      console.log("[useRfq] Authenticated, session:", sessionId);
      setConnectionState("authenticated");
      // Auto-fetch positions on auth
      client.getPositions();
    });

    client.on("disconnected", (code, reason) => {
      console.log("[useRfq] Disconnected:", code, reason);
      setConnectionState("disconnected");
    });

    client.on("error", (serverErr) => {
      console.error("[useRfq] Error:", serverErr);
      if (isAuthFailureError(serverErr)) {
        resetToAnonymous(client);
      }
      const message = serverErr.type === "generic" ? serverErr.data.message : serverErr.type;
      setError(new Error(message));
      if (!isRecoverableRfqBusinessError(serverErr)) {
        setConnectionState("error");
      }
    });

    // Data events
    client.on("markets", (m) => {
      console.log("[useRfq] Markets received, count:", m.length);
      console.log("[useRfq] Markets data:", JSON.stringify(m, null, 2));
      setMarkets(m);
    });

    client.on("positions", (p) => {
      console.log("[useRfq] Positions:", p);
      setPositions(p);
    });

    client.on("indicativePrices", (msg) => {
      console.log("[useRfq] Indicative prices:", msg);
      setIndicativePrices(msg);
    });

    client.on("quoteReceived", (q) => {
      console.log("[useRfq] Quote received:", q);
      setCurrentQuote(q);
    });

    // Order events
    client.on("sponsoredTxToSign", (orderId, txBase64) => {
      console.log("[useRfq] Sponsored TX to sign:", orderId, "length:", txBase64.length);
    });

    client.on("orderSubmitted", (orderId, sig) => {
      console.log("[useRfq] Order submitted:", orderId, sig);
    });

    client.on("orderConfirmed", (orderId, positionPda) => {
      console.log("[useRfq] Order confirmed:", orderId, positionPda);
    });

    client.on("orderFailed", (orderId, reason) => {
      console.error("[useRfq] Order failed:", orderId, reason);
      setError(new Error(`Order failed: ${reason}`));
    });

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [options.debug]);

  // Connect anonymously (no wallet signature required)
  const connectAnonymous = useCallback(() => {
    const client = clientRef.current;
    if (!client) {
      console.error("[useRfq] Client not initialized");
      return;
    }

    console.log("[useRfq] Connecting anonymously...");
    console.log("[useRfq] Client state before connect:", client.getConnectionState());
    client.connectAnonymous();
    console.log("[useRfq] connectAnonymous() called");
  }, []);

  // Authenticate with wallet (triggers signing prompt)
  const authenticate = useCallback(
    async (walletAddress: string, signMessage: (msg: Uint8Array) => Promise<Uint8Array>) => {
      const client = clientRef.current;
      if (!client) {
        console.error("[useRfq] Client not initialized");
        return;
      }

      const authProvider = createWalletAuthProvider({
        address: walletAddress,
        signMessage,
      });

      console.log("[useRfq] Authenticating wallet:", walletAddress);
      setConnectionState("authenticating");
      
      try {
        await client.authenticate(authProvider);
      } catch (err) {
        console.error("[useRfq] Authentication failed:", err);
        const serverErr = err as ServerError;
        if (isAuthFailureError(serverErr)) {
          resetToAnonymous(client);
        }
        const message = serverErr?.type === "generic" ? serverErr.data.message : String(err);
        setError(new Error(message));
        throw err;
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionState("disconnected");
  }, []);

  const fetchMarkets = useCallback(() => {
    console.log("[useRfq] fetchMarkets called, client exists:", !!clientRef.current);
    clientRef.current?.getMarkets();
  }, []);

  const fetchPositions = useCallback(() => {
    clientRef.current?.getPositions();
  }, []);

  const getIndicativePrices = useCallback((market: string, positionType: "covered_call" | "cash_secured_put") => {
    clientRef.current?.getIndicativePrices({
      market: market as Address<string>,
      position_type: positionType,
    });
  }, []);

  const submitRfq = useCallback((params: {
    market: string;
    positionType: "covered_call" | "cash_secured_put";
    strike: number;
    quantity: number;
    timeoutSeconds?: number;
  }) => {
    const client = clientRef.current;
    if (!client) return;
    
    client.createRfq({
      market: params.market as Address<string>,
      position_type: params.positionType,
      strike: params.strike,
      quantity: params.quantity,
      timeoutSeconds: params.timeoutSeconds ?? 30,
    });
  }, []);

  const acceptQuote = useCallback((rfqId: string, maker: string, orderIdHex: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.acceptQuote(rfqId, maker as Address<string>, orderIdHex);
  }, []);

  const submitSignedTx = useCallback((orderIdHex: string, txBase64: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.submitSignedSponsoredTx({ orderIdHex, txBase64 });
  }, []);

  const getClient = useCallback(() => clientRef.current, []);

  return {
    connectionState,
    isConnected: connectionState !== "disconnected" && connectionState !== "error",
    isAuthenticated: connectionState === "authenticated",
    markets,
    positions,
    currentQuote,
    indicativePrices,
    error,
    connectAnonymous,
    authenticate,
    disconnect,
    fetchMarkets,
    fetchPositions,
    getIndicativePrices,
    submitRfq,
    acceptQuote,
    submitSignedTx,
    getClient,
  };
}
