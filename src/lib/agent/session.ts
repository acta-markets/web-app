import { fetchAllPages } from "@acta-markets/ts-sdk";
import { ActaHttpClient, ActaHttpError } from "@acta-markets/ts-sdk/http";
import {
  ActaWsClient,
  type ActaWsClientOptions,
  type EarnSummaryData,
  type MarketDescriptorInfo,
  type TokenInfo,
  type TokenMarketsInfoData,
  type WelcomeMessage,
} from "@acta-markets/ts-sdk/ws";
import { createSolanaRpc } from "@solana/kit";
import type { AgentConfig } from "./config";
import { AgentError, plainText } from "./errors";
import { authProviderFor, type ActaSigner } from "./signer";

const CONNECT_TIMEOUT_MS = 20_000;
const REFERENCE_TTL_MS = 60_000;

/** The products this build trades. The venue sends strikes and quotes only for what a client names. */
export const AGENT_PRODUCTS = ["covered_call", "cash_secured_put"] as const;

/**
 * One connection to the venue, opened on first use. With a signer it signs in as that wallet;
 * without one it stays anonymous and can only read.
 *
 * Nothing happens when a session is constructed: an MCP client may start the process only to
 * ask what tools exist, and that must not sign anything or open a socket.
 */
export class ActaSession {
  readonly rpc: ReturnType<typeof createSolanaRpc>;
  readonly http: ActaHttpClient;
  private client: ActaWsClient | null = null;
  private opening: Promise<ActaWsClient> | null = null;
  private welcome: WelcomeMessage | null = null;
  private clockOffsetMs = 0;
  private fatal: AgentError | null = null;
  private tokenCache: { at: number; value: Promise<TokenInfo[]> } | null = null;
  private descriptorCache: { at: number; value: Promise<MarketDescriptorInfo[]> } | null = null;
  /** The venue asked this wallet for an invite code before it may trade. */
  inviteRequired = false;

  constructor(
    readonly config: AgentConfig,
    readonly signer: ActaSigner | null,
    private readonly options: { makeSocket?: ActaWsClientOptions["makeSocket"]; autoReconnect?: boolean; http?: ActaHttpClient } = {},
  ) {
    this.rpc = createSolanaRpc(config.rpcUrl);
    this.http =
      options.http ?? new ActaHttpClient({ baseUrl: config.apiUrl, client: { name: config.clientName, version: config.clientVersion } });
  }

  /** The venue's clock in Unix seconds: quote validity is judged against it, not this machine's. */
  nowSec(): number {
    return (Date.now() + this.clockOffsetMs) / 1000;
  }

  /** How long before its `valid_until` the venue stops accepting a quote. */
  get settlementBufferSeconds(): number {
    return this.welcome?.settlement_buffer_seconds ?? 0;
  }

  get state(): string {
    return this.client?.getConnectionState() ?? "not_connected";
  }

  /** The live client: signed in when the session has a signer, connected otherwise. */
  async connect(): Promise<ActaWsClient> {
    if (this.fatal) throw this.fatal;
    if (!this.opening) {
      this.opening = this.open().catch((error) => {
        this.close();
        throw error;
      });
    }
    const client = await this.opening;
    if (this.fatal) throw this.fatal;
    // After a dropped socket the client reconnects by itself; wait for it rather than fail the call.
    if (this.signer && !client.isAuthenticated()) {
      await client.waitForAuthenticated(CONNECT_TIMEOUT_MS).catch(() => {
        throw new AgentError("not_connected", "The connection to the venue dropped and has not come back yet.", "retry");
      });
    }
    return client;
  }

  private open(): Promise<ActaWsClient> {
    const { config, signer } = this;
    const client = new ActaWsClient({
      url: config.wsUrl,
      role: "taker",
      onDisconnect: "keep_quotes",
      products: [...AGENT_PRODUCTS],
      clientName: config.clientName,
      clientVersion: config.clientVersion,
      autoReconnect: this.options.autoReconnect ?? true,
      autoReconcile: false,
      // never `debug`: the SDK logs to stdout, which is the protocol channel of a stdio server
      ...(this.options.makeSocket ? { makeSocket: this.options.makeSocket } : {}),
    });
    this.client = client;
    client.on("welcome", (message) => {
      this.welcome = message;
      this.clockOffsetMs = Number(message.server_now_at_ms) - Date.now();
    });
    client.on("requireInvite", () => {
      this.inviteRequired = true;
    });
    client.on("inviteRedeemed", () => {
      this.inviteRequired = false;
    });
    client.on("error", () => {});

    return new Promise<ActaWsClient>((resolve, reject) => {
      let settled = false;
      const settle = (run: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        run();
      };
      const timer = setTimeout(
        () => settle(() => reject(new AgentError("connect_timeout", "The venue did not answer in time.", "retry"))),
        CONNECT_TIMEOUT_MS,
      );
      client.on("versionMismatch", () => {
        // The venue moved to a wire format this build cannot read. Retrying cannot help.
        this.fatal = new AgentError(
          "update_required",
          "The venue speaks a newer protocol than this build. Update @acta-markets/mcp and start it again.",
          "stop",
        );
        settle(() => reject(this.fatal));
      });
      if (signer) {
        client.on("authenticated", () => settle(() => resolve(client)));
        client.on("authError", (reason) =>
          settle(() => reject(new AgentError("sign_in_failed", `Sign-in was refused (${plainText(reason, 60)}).`, "stop"))));
        client.connectAndAuthenticate(authProviderFor(signer));
      } else {
        client.on("welcome", () => settle(() => resolve(client)));
        client.connectAnonymous();
      }
    });
  }

  /** Every token of the active markets. Sizing, strike grid and fees come from here. */
  async tokens(): Promise<TokenInfo[]> {
    const cached = this.tokenCache;
    if (cached && Date.now() - cached.at < REFERENCE_TTL_MS) return cached.value;
    const value = this.http.tokens().then((tokens) => [...tokens.values()]);
    this.tokenCache = { at: Date.now(), value };
    value.catch(() => {
      if (this.tokenCache?.value === value) this.tokenCache = null;
    });
    return value;
  }

  /** Every market's full descriptor: what a fill is verified against. */
  async descriptors(): Promise<MarketDescriptorInfo[]> {
    const cached = this.descriptorCache;
    if (cached && Date.now() - cached.at < REFERENCE_TTL_MS) return cached.value;
    const value = this.connect().then((client) => client.getMarketDescriptorsAsync()).then((data) => data.markets);
    this.descriptorCache = { at: Date.now(), value };
    value.catch(() => {
      if (this.descriptorCache?.value === value) this.descriptorCache = null;
    });
    return value;
  }

  /** One underlying's expiries, strikes and indicative premiums: the WS `TokenMarketsInfo`, over HTTP. */
  tokenMarkets(mint: string): Promise<TokenMarketsInfoData> {
    return this.pages<TokenMarketsInfoData>(`/tokens/${encodeURIComponent(mint)}/markets`, (all, page) => all.markets.push(...page.markets));
  }

  /** APR range and nearest expiry per asset and product: the WS `EarnSummary`, over HTTP. */
  earnSummary(): Promise<EarnSummaryData> {
    return this.pages<EarnSummaryData>("/earn-summary", (all, page) => all.assets.push(...page.assets));
  }

  // Reference reads need no socket, so the read-only tools open none.
  private pages<T extends { next_cursor: string | null }>(path: string, append: (all: T, page: T) => void): Promise<T> {
    return fetchAllPages<T>(async (cursor, limit) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor.type === "after") params.set("cursor", cursor.id);
      const response = await fetch(`${this.config.apiUrl}/api/v1${path}?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (response.ok) return (await response.json()) as T;
      const body = (await response.json().catch(() => null)) as { code?: unknown; error?: unknown } | null;
      throw new ActaHttpError(response.status, typeof body?.code === "string" ? body.code : "http_error", typeof body?.error === "string" ? body.error : response.statusText);
    }, append);
  }

  close(): void {
    this.client?.disconnect();
    this.client = null;
    this.opening = null;
    this.tokenCache = null;
    this.descriptorCache = null;
  }
}
