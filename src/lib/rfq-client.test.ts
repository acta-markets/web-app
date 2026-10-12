import { afterEach, describe, expect, it, vi } from "vitest";
import { createRfqClient, createWalletAuthProvider } from "./rfq-client";

class Socket {
  static current: Socket;
  readyState = 0;
  onopen: (() => void) | null = null;
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
  let client: ReturnType<typeof createRfqClient> | undefined;
  afterEach(() => { client?.disconnect(); vi.unstubAllGlobals(); });

  it.each(["canonical", "order-sized"])("handles a %s challenge before the wallet", async kind => {
    vi.stubGlobal("WebSocket", Socket);
    const signMessage = vi.fn(async (_message: Uint8Array) => new Uint8Array(64).fill(7));
    client = createRfqClient({ url: "ws://localhost" });
    const errors = vi.fn();
    client.on("error", errors);
    client.connectAndAuthenticate(createWalletAuthProvider({ address: walletAddress, signMessage }));
    const socket = Socket.current;
    socket.readyState = 1;
    socket.onopen?.();
    socket.receive({ type: "Welcome", data: {
      protocol_version: "1.0.0", server_version: "test", min_supported_version: "1.0.0",
      enabled_features: [], server_time_unix_ms: 1_800_000_000_000,
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
