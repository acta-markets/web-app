import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { address } from "@solana/kit";
import { findMarketPda } from "@acta-markets/ts-sdk/chain";
import { getActaProgramId } from "@acta-markets/ts-sdk";
import { getTokenMint } from "./tokens";
import { createRfqClient, createWalletAuthProvider } from "./rfq-client";

class Socket {
  static current: Socket;
  readyState = 0;
  onopen: (() => Promise<void>) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor() { Socket.current = this; }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

const walletAddress = "11111111111111111111111111111111";
const challenge = "Acta RFQ Authentication\n\nSign this message to authenticate your wallet.\n\n"
  + `Wallet: ${walletAddress}\nNonce: ${"a".repeat(64)}\nIssued At: 2026-09-17T12:00:00Z\n`;

describe("web app authentication through the installed SDK", () => {
  let client: Awaited<ReturnType<typeof createRfqClient>> | undefined;
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ protocol_fee_bps_premium: 100, protocol_fee_bps_volume: 10, features: [] })))));
  afterEach(() => { client?.disconnect(); vi.unstubAllGlobals(); });

  it("sends the base protocol and explicit disconnect policy without discovery", async () => {
    vi.stubGlobal("WebSocket", Socket);
    client = await createRfqClient({ url: "ws://localhost" });
    client.connectAnonymous();
    const socket = Socket.current; socket.readyState = 1; socket.onopen?.();
    expect(JSON.parse(socket.sent[0]).data).toMatchObject({ protocol_version: "1.0.0", on_disconnect: "keep_quotes" });
    expect(JSON.parse(socket.sent[0]).data).not.toHaveProperty("features");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serializes the sold spread pair through the installed SDK", async () => {
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ protocol_fee_bps_premium: 100, protocol_fee_bps_volume: 10, features: ["spreads"] }))));
    client = await createRfqClient({ url: "ws://localhost" });
    client.connectAnonymous();
    const socket = Socket.current;
    socket.readyState = 1; await socket.onopen?.();
    socket.receive({ type: "Welcome", data: { protocol_version: "1.0.0", server_version: "test", min_supported_version: "1.0.0", server_now_at_ms: Date.now(), rate_limits: { connection: { type: "unlimited" }, wallet: { type: "unlimited" }, rfqs: { type: "unlimited" }, quotes: { type: "unlimited" }, queries: { type: "unlimited" }, liquidity_provider: { type: "not_applicable" } } } });
    socket.receive({ type: "AuthSuccess", data: { session_id: "session", expires_at: 9_999_999_999, role: { type: "taker" } } });
    expect(socket.sent.some(frame => JSON.parse(frame).type === "GetPositions")).toBe(false);
    const underlyingMint = address(getTokenMint("SOL")!);
    const quoteMint = address(getTokenMint("USDC")!);
    const expiryTs = 2_000_000_000;
    const market = await findMarketPda({ underlyingMint, quoteMint, expiryTs: BigInt(expiryTs), isPut: false });
    const descriptorsRequest = client.requestAll("MarketDescriptors", { type: "GetMarketDescriptors", data: { request_id: "descriptors-test", limit: 200, cursor: { type: "start" } } });
    const descriptorsId = JSON.parse(socket.sent.at(-1)!).data.request_id;
    socket.receive({ type: "MarketDescriptors", data: { next_cursor: null, request_id: descriptorsId, markets: [{
      products: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"],
      market_descriptor: { chain_id: 0, program_id: getActaProgramId(), market_pda: market, underlying_mint: underlyingMint, quote_mint: quoteMint, expiry_ts: expiryTs, is_put: false, collateral_mint: underlyingMint, settlement_mint: quoteMint },
      underlying_symbol: "SOL", quote_symbol: "USDC", underlying_decimals: 9, quote_decimals: 6,
      size_rule: { min_size: 1, max_size: 1e12, step: 1 }, underlying_oracle_pda: walletAddress, quote_oracle_pda: walletAddress,
    }] } });
    await descriptorsRequest;
    const request = { market_pda: market, terms: { type: "call_spread" as const, lower_strike: 100e9, upper_strike: 120e9 }, side: "sell" as const, quantity: 1e9, timeout_seconds: 30, request_id: "00000000-0000-0000-0000-000000000002" };
    const pending = client.createRfq(request);
    await vi.waitFor(() => expect(socket.sent.some(raw => JSON.parse(raw).type === "RfqRequest")).toBe(true));
    const frame = socket.sent.map(raw => JSON.parse(raw)).find(message => message.type === "RfqRequest");
    expect(frame.data).toMatchObject({ terms: { type: "call_spread", lower_strike: 100e9, upper_strike: 120e9 }, side: "sell", quantity: 1e9, timeout_seconds: 30 });
    socket.receive({ type: "CommandAccepted", data: { request_id: request.request_id } });
    await pending;
  });

  it.each(["canonical", "order-sized"])("handles a %s challenge before the wallet", async kind => {
    vi.stubGlobal("WebSocket", Socket);
    const signMessage = vi.fn(async (_message: Uint8Array) => new Uint8Array(64).fill(7));
    client = await createRfqClient({ url: "ws://localhost" });
    const errors = vi.fn();
    client.on("error", errors);
    client.connectAndAuthenticate(createWalletAuthProvider({ address: walletAddress, signMessage }));
    const socket = Socket.current;
    socket.readyState = 1;
    await socket.onopen?.();
    socket.receive({ type: "Welcome", data: {
      protocol_version: "1.0.0", server_version: "test", min_supported_version: "1.0.0",
      server_now_at_ms: 1_800_000_000_000,
      rate_limits: { connection: { type: "unlimited" }, wallet: { type: "unlimited" }, rfqs: { type: "unlimited" }, quotes: { type: "unlimited" }, queries: { type: "unlimited" }, liquidity_provider: { type: "not_applicable" } },
    } });
    await vi.waitFor(() => expect(socket.sent.some(s => JSON.parse(s).type === "StartAuth")).toBe(true));
    socket.receive({ type: "AuthRequest", data: { challenge: kind === "canonical" ? challenge : "a".repeat(32) } });

    if (kind === "canonical") {
      await vi.waitFor(() => expect(socket.sent.some(s => JSON.parse(s).type === "AuthChallenge")).toBe(true));
      expect(signMessage).toHaveBeenCalledOnce();
      expect(Array.from(signMessage.mock.calls[0][0])).toEqual(Array.from(new TextEncoder().encode(challenge)));
    } else {
      await vi.waitFor(() => expect(errors).toHaveBeenCalled());
      expect(signMessage).not.toHaveBeenCalled();
      expect(socket.sent.some(s => JSON.parse(s).type === "AuthChallenge")).toBe(false);
    }
  });
});
