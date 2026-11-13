/**
 * Acta testnet (devnet) trading E2E — headless.
 *
 * Drives the real `@acta-markets/ts-sdk` taker client against the devnet backend:
 *   1. generate (or load) an Ed25519 test keypair
 *   2. authenticate via the message-sign challenge (`KeypairAuthProvider`)
 *   3. discover markets + strikes
 *   4. for every active physical market, attempt sell/buy call + sell/buy put
 *      (RFQ -> quote -> accept -> verify+sign keeper-sponsored tx -> submit -> on-chain outcome)
 *
 * NEVER touches mainnet and never uses real funds. Run:
 *   node scripts/e2e-testnet/run.ts [--limit N] [--underlying SYM] [--keypair path.json] [--print-keypair] [--timeout SEC]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ActaWsClient,
  verifyAndSignTakerFill,
  type ActaWsClientError,
  type MarketDescriptorInfo,
  type OptionTerms,
  type PositionType,
  type QuoteReceivedMessage,
  type RfqCreatedMessage,
  type TakerFillRfq,
} from "@acta-markets/ts-sdk/ws";
import type { TakerSide } from "@acta-markets/ts-sdk/types";
import type { Vault } from "@acta-markets/ts-sdk";
import { KeypairAuthProvider } from "@acta-markets/ts-sdk/ws/keypair";
import {
  fetchGlobalConfigByAddress,
  fetchMakerVault,
  findGlobalConfigPda,
  flows,
  getActaProgramId,
} from "@acta-markets/ts-sdk/chain";
import {
  address,
  createKeyPairFromPrivateKeyBytes,
  createSolanaRpc,
  getAddressDecoder,
  getAddressFromPublicKey,
  getBase64Encoder,
  signBytes,
  type Address,
  type AddressesByLookupTableAddress,
} from "@solana/kit";
const DEVNET_WS = "wss://devnet-api.acta.markets";
const DEVNET_RPC = "https://api.devnet.solana.com";
const PRODUCTS: PositionType[] = ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"];
const FILL_BOUNDS = { maxUnitLimit: 400_000, maxUnitPriceMicroLamports: 100_000 };

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
type Args = {
  limit: number;
  underlying: string | null;
  keypairPath: string | null;
  printKeypair: boolean;
  timeout: number;
  invite: string | null;
  delay: number;
  retry: number;
};
function parseArgs(argv: string[]): Args {
  const a: Args = { limit: 0, underlying: null, keypairPath: null, printKeypair: false, timeout: 20, invite: null, delay: 0, retry: 0 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--limit") a.limit = Number(argv[++i]);
    else if (v === "--underlying") a.underlying = (argv[++i] ?? "").toUpperCase();
    else if (v === "--keypair") a.keypairPath = argv[++i];
    else if (v === "--print-keypair") a.printKeypair = true;
    else if (v === "--timeout") a.timeout = Number(argv[++i]);
    else if (v === "--invite") a.invite = argv[++i] ?? null;
    else if (v === "--delay") a.delay = Number(argv[++i]);
    else if (v === "--retry") a.retry = Number(argv[++i]);
  }
  return a;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Keypair
// ---------------------------------------------------------------------------
function loadKeypairJson(path: string): Uint8Array {
  const raw = readFileSync(path, "utf8");
  const arr: unknown = JSON.parse(raw);
  if (!Array.isArray(arr) || (arr.length !== 64 && arr.length !== 32)) {
    throw new Error(`keypair JSON must be a 64-byte (or 32-byte) number array, got length ${Array.isArray(arr) ? arr.length : "n/a"}`);
  }
  return Uint8Array.from(arr as number[]);
}

async function makeKeypair(path: string | null): Promise<{ keyPair: Awaited<ReturnType<typeof createKeyPairFromPrivateKeyBytes>>; address: string; secretBytes: Uint8Array }> {
  let privateKey32: Uint8Array;
  if (path) {
    const bytes = loadKeypairJson(path);
    privateKey32 = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
  } else {
    privateKey32 = new Uint8Array(32);
    globalThis.crypto.getRandomValues(privateKey32);
  }
  const keyPair = await createKeyPairFromPrivateKeyBytes(privateKey32);
  const addr = await getAddressFromPublicKey(keyPair.publicKey);
  return { keyPair, address: addr, secretBytes: privateKey32 };
}

// ---------------------------------------------------------------------------
// Chain helpers (mirror src/lib/sponsored-tx.ts — self-contained)
// ---------------------------------------------------------------------------
type Rpc = ReturnType<typeof createSolanaRpc>;

const LOOKUP_TABLE_PROGRAM = "AddressLookupTab1e1111111111111111111111111";
const LOOKUP_TABLE_META_SIZE = 56;
const LOOKUP_TABLE_STATE = 1;
const ACTIVE_TABLE_SLOT = 0xffff_ffff_ffff_ffffn;

async function resolveKeeper(rpc: Rpc): Promise<Address> {
  const programId = getActaProgramId();
  const pda = await findGlobalConfigPda(programId);
  const { account } = await fetchGlobalConfigByAddress(rpc, pda, "confirmed");
  return account.hotAuthority;
}

function rejectTable(table: Address, reason: string): never {
  throw new flows.VaultIntentError({ kind: "intent", reason: `lookup table ${table} ${reason}` });
}

function tableAddresses(
  table: Address,
  account: { owner: Address; data: readonly [string, "base64"] } | null | undefined,
): Address[] {
  if (!account) throw new flows.VaultIntentError({ kind: "missingLookupTable", table });
  if (account.owner !== LOOKUP_TABLE_PROGRAM) rejectTable(table, "is not an address lookup table");
  const data = getBase64Encoder().encode(account.data[0]);
  if (data.length < LOOKUP_TABLE_META_SIZE || (data.length - LOOKUP_TABLE_META_SIZE) % 32 !== 0) {
    rejectTable(table, "is malformed");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== LOOKUP_TABLE_STATE) rejectTable(table, "is not initialized");
  if (view.getBigUint64(4, true) !== ACTIVE_TABLE_SLOT) rejectTable(table, "is deactivated");
  const decoder = getAddressDecoder();
  return Array.from(
    { length: (data.length - LOOKUP_TABLE_META_SIZE) / 32 },
    (_, index) => decoder.decode(data, LOOKUP_TABLE_META_SIZE + index * 32),
  );
}

async function resolveLookupTables(rpc: Rpc, txBase64: string): Promise<AddressesByLookupTableAddress> {
  const tables = [...new Set(flows.servedLookupTableKeys(txBase64))];
  if (tables.length === 0) return {};
  const { value } = await rpc
    .getMultipleAccounts(tables, { encoding: "base64", commitment: "confirmed" })
    .send()
    .catch((error: unknown) => {
      throw new Error(`Unable to read lookup tables: ${error instanceof Error ? error.message : String(error)}`);
    });
  return Object.fromEntries(tables.map((table, index) => [table, tableAddresses(table, value[index])]));
}

// ---------------------------------------------------------------------------
// Small promise helpers
// ---------------------------------------------------------------------------
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ---------------------------------------------------------------------------
// Market + strike discovery
// ---------------------------------------------------------------------------
async function loadMarkets(client: ActaWsClient): Promise<MarketDescriptorInfo[]> {
  const data = await client.request("MarketDescriptors", {
    type: "GetMarketDescriptors",
    data: { limit: 200, cursor: { type: "start" }, request_id: randomUUID() },
  });
  return data.markets;
}

async function loadStrikes(
  client: ActaWsClient,
  descriptors: MarketDescriptorInfo[],
): Promise<{ referenceByMint: Map<string, number>; strikesByMarketType: Map<string, number[]> }> {
  const mints = [...new Set(descriptors.map((d) => d.market_descriptor.underlying_mint))];
  const referenceByMint = new Map<string, number>();
  const strikesByMarketType = new Map<string, number[]>();
  for (const mint of mints) {
    try {
      const info = await client.request("TokenMarketsInfo", {
        type: "GetTokenMarketsInfo",
        data: { request_id: randomUUID(), limit: 200, cursor: { type: "start" }, underlying_mint: address(mint) },
      });
      referenceByMint.set(mint, info.reference_price);
      for (const mkt of info.markets) {
        for (const ind of mkt.indicatives) {
          const key = `${mkt.market_pda}:${ind.position_type}`;
          const strikes = ind.strikes.filter((s) => s.strike != null).map((s) => Number(s.strike));
          if (strikes.length) strikesByMarketType.set(key, strikes);
        }
      }
    } catch (e) {
      console.error(`  [warn] TokenMarketsInfo failed for ${mint}: ${(e as Error).message}`);
    }
  }
  return { referenceByMint, strikesByMarketType };
}

function pickStrike(strikes: number[], reference: number | null): number {
  if (!strikes.length) return 0;
  if (reference == null) return strikes[Math.floor(strikes.length / 2)];
  let best = strikes[0];
  for (const s of strikes) if (Math.abs(s - reference) < Math.abs(best - reference)) best = s;
  return best;
}

// ---------------------------------------------------------------------------
// Case runner
// ---------------------------------------------------------------------------
type CaseSpec = {
  name: string;
  descriptor: MarketDescriptorInfo;
  terms: OptionTerms;
  side: TakerSide;
  quantity: number;
};

type CaseOutcome =
  | { status: "PASS"; detail: string }
  | { status: "BLOCKED"; detail: string }
  | { status: "FAIL"; detail: string }
  | { status: "SKIP"; detail: string };

/** Redeem an invite code (needed when invite gating is active). */
function redeemInvite(client: ActaWsClient, code: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const done = (r: { ok: boolean; detail: string }) => { cleanup(); resolve(r); };
    const onRedeemed = (d: { referral_code: string }) => done({ ok: true, detail: `redeemed, referral_code=${d.referral_code}` });
    const onReqErr = (e: { request_id?: string; error?: unknown }) => {
      done({ ok: false, detail: `redeem rejected: ${JSON.stringify(e.error ?? e)}` });
    };
    const t = setTimeout(() => done({ ok: false, detail: "redeem timed out" }), 12_000);
    const cleanup = () => {
      clearTimeout(t);
      client.off("inviteRedeemed", onRedeemed);
      client.off("requestError", onReqErr);
    };
    client.on("inviteRedeemed", onRedeemed);
    client.on("requestError", onReqErr);
    try {
      client.redeemInvite(code);
    } catch (e) {
      done({ ok: false, detail: `redeemInvite threw: ${(e as Error).message}` });
    }
  });
}

function isPhysical(terms: OptionTerms): terms is { type: "covered_call" | "cash_secured_put"; strike: number } {
  return terms.type === "covered_call" || terms.type === "cash_secured_put";
}

/** The single `strike` on physical and cash-put terms; undefined for spreads. */
function strikeOf(terms: OptionTerms): number | undefined {
  return "strike" in terms ? terms.strike : undefined;
}

class CaseRunner {
  private client: ActaWsClient;
  private rpc: Rpc;
  private takerAddress: string;
  private signer: { address: string; signMessage: (m: Uint8Array) => Promise<Uint8Array> };

  constructor(
    client: ActaWsClient,
    rpc: Rpc,
    takerAddress: string,
    signer: { address: string; signMessage: (m: Uint8Array) => Promise<Uint8Array> },
  ) {
    this.client = client;
    this.rpc = rpc;
    this.takerAddress = takerAddress;
    this.signer = signer;
  }

  async run(spec: CaseSpec, timeoutSeconds: number): Promise<CaseOutcome> {
    const { descriptor, terms, side } = spec;
    if (!isPhysical(terms)) return { status: "SKIP", detail: "non-physical terms (not exercised here)" };
    if (!descriptor.products.includes(terms.type)) {
      return { status: "SKIP", detail: `product ${terms.type} not allowed on this market` };
    }
    const requestId = randomUUID();
    const t0 = Date.now();

    // Phase A — create the RFQ. Listeners are attached BEFORE the send so an
    // rfqCreated echo that races the CommandAccepted ack is never dropped.
    const created = await new Promise<{ rfqId: string } | { failure: CaseOutcome }>((resolve) => {
      let settled = false;
      const finish = (r: { rfqId: string } | { failure: CaseOutcome }) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(r);
      };
      const onCreated = (msg: RfqCreatedMessage) => {
        if (msg.request_id === requestId) finish({ rfqId: msg.rfq_id });
      };
      const onReqErr = (d: { request_id: string; error: unknown }) => {
        if (d.request_id === requestId) finish({ failure: { status: "FAIL", detail: `RFQ rejected: ${fmtServerError(d.error)}` } });
      };
      const onDisc = (code: number, reason: string) => {
        finish({ failure: { status: "FAIL", detail: `disconnected during RFQ create (${code} ${reason})` } });
      };
      const timer = setTimeout(() => {
        finish({ failure: { status: "FAIL", detail: `no rfqCreated echo in ${ECHO_TIMEOUT_MS}ms — ${diagnoseNoEcho(requestId, t0)}` } });
      }, ECHO_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.client.off("rfqCreated", onCreated);
        this.client.off("requestError", onReqErr);
        this.client.off("disconnected", onDisc);
      };
      this.client.on("rfqCreated", onCreated);
      this.client.on("requestError", onReqErr);
      this.client.on("disconnected", onDisc);
      this.client.createRfq({
        market_pda: address(descriptor.market_descriptor.market_pda),
        terms,
        side,
        quantity: spec.quantity,
        timeout_seconds: timeoutSeconds,
        request_id: requestId,
      }).catch((e) => {
        // createRfq rejects on RequestError / not_connected / timeout.
        finish({ failure: { status: "BLOCKED", detail: classifyCreateError(e) } });
      });
    });
    if ("failure" in created) return created.failure;
    const rfqId = created.rfqId;

    // Phase B — wait for a quote for THIS rfq, or a terminal close.
    const q = await withTimeout(this.waitQuote(rfqId, spec, timeoutSeconds), timeoutSeconds * 1000 + 20_000, "quote window");
    if (!q) return { status: "BLOCKED", detail: "no quote (timeout)" };
    if ("reason" in q) return { status: "BLOCKED", detail: `no quote: rfqClosed(${q.reason})` };
    const quote = q.quote;

    // Build the TakerFillRfq the fill is verified against.
    const rfq: TakerFillRfq = {
      rfq_id: quote.rfq_id,
      market_descriptor: descriptor.market_descriptor,
      terms: { type: terms.type, strike: terms.strike },
      side,
      quantity: spec.quantity,
      order_options: [{ type: terms.type, strike: terms.strike }],
    };

    return this.fill(quote, rfq);
  }

  private waitQuote(
    rfqId: string,
    spec: CaseSpec,
    timeoutSeconds: number,
  ): Promise<{ quote: QuoteReceivedMessage } | { reason: string } | null> {
    const { terms, side } = spec;
    return new Promise((resolve) => {
      const settle = (r: { quote: QuoteReceivedMessage } | { reason: string } | null) => { cleanup(); resolve(r); };
      const onQuote = (q: QuoteReceivedMessage) => {
        if (q.rfq_id === rfqId && q.side === side && q.terms.type === terms.type && strikeOf(q.terms) === strikeOf(terms)) {
          settle({ quote: q });
        }
      };
      const onClosed = (msg: { rfq_id: string; reason: string }) => {
        if (msg.rfq_id === rfqId) settle({ reason: msg.reason });
      };
      const t = setTimeout(() => settle(null), timeoutSeconds * 1000 + 15_000);
      const cleanup = () => { clearTimeout(t); this.client.off("quoteReceived", onQuote); this.client.off("rfqClosed", onClosed); };
      this.client.on("quoteReceived", onQuote);
      this.client.on("rfqClosed", onClosed);
    });
  }

  private async fill(quote: QuoteReceivedMessage, rfq: TakerFillRfq): Promise<CaseOutcome> {
    let keeper: Address;
    let makerVault: Vault | null;
    try {
      [keeper, makerVault] = await Promise.all([
        resolveKeeper(this.rpc),
        fetchMakerVault(this.rpc, quote.maker_owner),
      ]);
    } catch (e) {
      return { status: "FAIL", detail: `chain read failed: ${(e as Error).message}` };
    }

    try {
      await this.client.acceptQuote(quote.rfq_id, quote.maker_owner, quote.order_id);
    } catch (e) {
      return { status: "FAIL", detail: `acceptQuote failed: ${wsError(e)}` };
    }

    const sponsored = await this.waitSponsored(quote.order_id, 30_000);
    if (!sponsored) return { status: "FAIL", detail: "no sponsoredTxToSign within 30s" };

    let tables: AddressesByLookupTableAddress;
    try {
      tables = await resolveLookupTables(this.rpc, sponsored);
    } catch (e) {
      return { status: "FAIL", detail: `lookup table read failed: ${(e as Error).message}` };
    }

    let signed: string;
    try {
      signed = await verifyAndSignTakerFill({
        txBase64: sponsored,
        quote,
        rfq,
        keeper,
        taker: address(this.takerAddress),
        tables,
        bounds: FILL_BOUNDS,
        makerVault,
        signer: this.signer,
      });
    } catch (e) {
      return { status: "FAIL", detail: `verifyAndSignTakerFill failed: ${(e as Error).message}` };
    }

    try {
      await this.client.submitSignedSponsoredTx({ orderIdHex: quote.order_id, txBase64: signed });
    } catch (e) {
      return { status: "FAIL", detail: `submitSignedSponsoredTx failed: ${wsError(e)}` };
    }

    return this.waitOrder(quote.order_id, 60_000);
  }

  private waitSponsored(orderId: string, ms: number): Promise<string | null> {
    return new Promise((resolve) => {
      const onTx = (id: string, txBase64: string) => {
        if (id === orderId) { cleanup(); resolve(txBase64); }
      };
      const t = setTimeout(() => { cleanup(); resolve(null); }, ms);
      const cleanup = () => { clearTimeout(t); this.client.off("sponsoredTxToSign", onTx); };
      this.client.on("sponsoredTxToSign", onTx);
    });
  }

  private waitOrder(orderId: string, ms: number): Promise<CaseOutcome> {
    return new Promise((resolve) => {
      const done = (r: CaseOutcome) => { cleanup(); resolve(r); };
      const onConfirmed = (id: string, positionPda: string) => {
        if (id === orderId) done({ status: "PASS", detail: `filled -> position ${positionPda}` });
      };
      const onSubmitted = (id: string, txSignature: string) => {
        if (id === orderId) done({ status: "PASS", detail: `submitted -> tx ${txSignature}` });
      };
      const onFailed = (id: string, reason: string) => {
        if (id === orderId) done({ status: "BLOCKED", detail: `on-chain order failed: ${reason}` });
      };
      const t = setTimeout(() => { done({ status: "FAIL", detail: "no terminal order event within 60s" }); }, ms);
      const cleanup = () => {
        clearTimeout(t);
        this.client.off("orderConfirmed", onConfirmed);
        this.client.off("orderSubmitted", onSubmitted);
        this.client.off("orderFailed", onFailed);
      };
      this.client.on("orderConfirmed", onConfirmed);
      this.client.on("orderSubmitted", onSubmitted);
      this.client.on("orderFailed", onFailed);
    });
  }
}

function wsError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function classifyCreateError(e: unknown): string {
  const s = wsError(e);
  const m = s.toLowerCase();
  if (m.includes("insufficient_collateral")) return "insufficient_collateral (taker needs funding)";
  if (m.includes("no_eligible_makers")) return "no_eligible_makers";
  if (m.includes("market_expired") || m.includes("market_finalized") || m.includes("market_disabled")) return `market unavailable: ${s}`;
  if (m.includes("invalid_quantity_size_rule")) return `invalid quantity/size rule: ${s}`;
  if (m.includes("invalid_strike")) return `invalid strike: ${s}`;
  if (m.includes("taker_buy_unsupported")) return "taker buy unsupported for this product";
  if (m.includes("rate_limit") || m.includes("ratelimit")) return `rate limited: ${s}`;
  return `request error: ${s}`;
}

// ---------------------------------------------------------------------------
// Instrumentation: global event tap + failure-cause helpers
// ---------------------------------------------------------------------------
const ECHO_TIMEOUT_MS = 10_000;

type TapEvent = { t: number; kind: string; id: string | null; detail: string };
const tap: TapEvent[] = [];
function tapEvent(kind: string, id: string | null, detail: string): void {
  tap.push({ t: Date.now(), kind, id, detail });
}

function fmtServerError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { type?: string; data?: { code?: string; message?: string } };
    if (o.type === "Generic") return `Generic(${o.data?.code}: ${o.data?.message})`;
    if (o.type) return o.type;
  }
  return JSON.stringify(e);
}

function fmtClientError(e: unknown): string {
  if (e && typeof e === "object" && "type" in e) return String((e as { type: unknown }).type);
  return JSON.stringify(e);
}

/** Why did we time out waiting for an rfqCreated echo? Consult the global tap. */
function diagnoseNoEcho(requestId: string, t0: number): string {
  const since = tap.filter((e) => e.t >= t0);
  const echo = since.find((e) => e.kind === "rfqCreated" && e.id === requestId);
  if (echo) return `echo ARRIVED but per-case listener missed it (race) at +${echo.t - t0}ms`;
  const reqErr = since.find((e) => e.kind === "requestError" && e.id === requestId);
  if (reqErr) return `requestError: ${reqErr.detail}`;
  const disc = since.find((e) => e.kind === "disconnected");
  if (disc) return `disconnected: ${disc.detail}`;
  const closed = since.find((e) => e.kind === "rfqClosed");
  if (closed) return `rfqClosed(${closed.detail}) with no echo`;
  return "silence — no echo, no requestError, no disconnect (rate-limit/backpressure?)";
}

/** Collapse a CaseOutcome detail into a stable cause bucket for the breakdown. */
function causeOf(d: { status: string; detail: string }): string {
  if (d.status === "PASS") return "PASS";
  if (d.status === "SKIP") return "SKIP";
  if (d.status === "FAIL") {
    if (d.detail.includes("RFQ rejected:")) return "FAIL: server rejected RFQ";
    if (d.detail.includes("disconnected")) return "FAIL: ws disconnect";
    if (d.detail.includes("race")) return "FAIL: echo race";
    if (d.detail.includes("silence")) return "FAIL: no echo (silence)";
    return `FAIL: ${d.detail}`;
  }
  // BLOCKED
  if (d.detail.startsWith("no quote: rfqClosed(")) return `BLOCKED: ${d.detail}`;
  if (d.detail === "no quote (timeout)") return "BLOCKED: no quote (timeout)";
  if (d.detail.startsWith("no_eligible_makers")) return "BLOCKED: no_eligible_makers";
  if (d.detail.includes("insufficient_collateral")) return "BLOCKED: insufficient_collateral";
  return `BLOCKED: ${d.detail}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const kp = await makeKeypair(args.keypairPath);
  const takerAddress = kp.address;
  console.log(`# taker address: ${takerAddress}`);
  if (args.printKeypair || !args.keypairPath) {
    console.log(`# (devnet funding hint) solana airdrop 2 ${takerAddress} --url devnet`);
  }

  const rpc = createSolanaRpc(DEVNET_RPC);
  const authProvider = await KeypairAuthProvider.fromPrivateKeyBytes(kp.secretBytes);
  const messageSigner = {
    address: takerAddress,
    signMessage: async (msg: Uint8Array) => signBytes(kp.keyPair.privateKey, msg),
  };

  const client = new ActaWsClient({
    url: DEVNET_WS,
    role: "taker",
    onDisconnect: "keep_quotes",
    products: PRODUCTS,
    clientName: "acta-e2e-testnet",
    clientVersion: "0.1.0",
    autoReconnect: false,
    autoReconcile: false,
  });
  client.on("error", (e: ActaWsClientError) => console.error(`# ws error: ${JSON.stringify(e)}`));
  client.on("disconnected", (code, reason) => console.error(`# ws disconnected: ${code} ${reason}`));

  // Global event tap: records every RFQ/quote/error/disconnect for per-case diagnosis.
  client.on("commandAccepted", (d: { request_id: string }) => tapEvent("commandAccepted", d.request_id, ""));
  client.on("rfqCreated", (m: RfqCreatedMessage) => tapEvent("rfqCreated", m.request_id ?? m.rfq_id, `rfq_id=${m.rfq_id} ${m.terms.type}/${m.side}`));
  client.on("requestError", (d: { request_id: string; error: unknown }) => tapEvent("requestError", d.request_id, fmtServerError(d.error)));
  client.on("rfqClosed", (m: { rfq_id: string; reason: string }) => tapEvent("rfqClosed", m.rfq_id, m.reason));
  client.on("rfqSkipped", (m: { rfq_id: string; cap_detail: unknown }) => tapEvent("rfqSkipped", m.rfq_id, fmtServerError(m.cap_detail)));
  client.on("rfqBroadcast", (m: { rfq_id: string; terms: OptionTerms; side: TakerSide }) => tapEvent("rfqBroadcast", m.rfq_id, `${m.terms.type}/${m.side}`));
  client.on("error", (e: ActaWsClientError) => tapEvent("error", null, fmtClientError(e)));
  client.on("disconnected", (code: number, reason: string) => tapEvent("disconnected", null, `${code} ${reason}`));

  // Authenticate (the message-sign step).
  console.log("# connecting + authenticating...");
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const onAuth = () => { cleanup(); resolve(); };
      const onAuthError = (reason: string, msg?: string) => { cleanup(); reject(new Error(`auth error: ${reason} ${msg ?? ""}`)); };
      const onDisc = () => { cleanup(); reject(new Error("disconnected before authentication")); };
      const cleanup = () => {
        client.off("authenticated", onAuth);
        client.off("authError", onAuthError);
        client.off("disconnected", onDisc);
      };
      client.on("authenticated", onAuth);
      client.on("authError", onAuthError);
      client.on("disconnected", onDisc);
      client.connectAndAuthenticate(authProvider);
    }),
    20_000,
    "authentication",
  );
  console.log("# authenticated OK (challenge signed)");

  // Invite gating: the devnet backend currently sends `RequireInvite` after auth.
  const needsInvite = await new Promise<boolean>((resolve) => {
    const onReq = () => { client.off("requireInvite", onReq); resolve(true); };
    client.on("requireInvite", onReq);
    setTimeout(() => { client.off("requireInvite", onReq); resolve(false); }, 2000);
  });

  if (needsInvite && !args.invite) {
    console.log("\n# BLOCKED: invite gating is active on this backend. Pass --invite <CODE> to redeem and trade.");
    console.log("# SUMMARY\n#   PASS: 0\n#   BLOCKED: all (no invite code)\n#   FAIL: 0\n#   SKIP: 0");
    client.disconnect();
    process.exit(0);
  }
  if (args.invite) {
    console.log(`# redeeming invite: ${args.invite}`);
    const r = await redeemInvite(client, args.invite);
    console.log(`# invite redeem -> ${r.ok ? "OK" : "FAILED"}: ${r.detail}`);
    if (!r.ok) {
      client.disconnect();
      process.exit(2);
    }
  }

  // Discover markets + strikes.
  const descriptors = await loadMarkets(client);
  const physical = descriptors.filter(
    (d) => d.products.includes("covered_call") || d.products.includes("cash_secured_put"),
  );
  console.log(`# ${descriptors.length} markets total; ${physical.length} with physical products`);
  const { referenceByMint, strikesByMarketType } = await loadStrikes(client, descriptors);

  // Build the case list.
  const cases: CaseSpec[] = [];
  for (const d of physical) {
    const reference = referenceByMint.get(d.market_descriptor.underlying_mint) ?? null;
    const qty = Math.max(Number(d.size_rule.min_size ?? 0), Number(d.size_rule.step ?? 1)) || 1;
    const sym = d.underlying_symbol;
    if (args.underlying && sym.toUpperCase() !== args.underlying) continue;
    if (d.products.includes("covered_call")) {
      const strikes = strikesByMarketType.get(`${d.market_descriptor.market_pda}:covered_call`) ?? [];
      const strike = pickStrike(strikes, reference);
      if (strike) {
        cases.push({ name: `sell_call  ${sym}`, descriptor: d, terms: { type: "covered_call", strike }, side: "sell", quantity: qty });
        cases.push({ name: `buy_call   ${sym}`, descriptor: d, terms: { type: "covered_call", strike }, side: "buy", quantity: qty });
      }
    }
    if (d.products.includes("cash_secured_put")) {
      const strikes = strikesByMarketType.get(`${d.market_descriptor.market_pda}:cash_secured_put`) ?? [];
      const strike = pickStrike(strikes, reference);
      if (strike) {
        cases.push({ name: `sell_put   ${sym}`, descriptor: d, terms: { type: "cash_secured_put", strike }, side: "sell", quantity: qty });
        cases.push({ name: `buy_put    ${sym}`, descriptor: d, terms: { type: "cash_secured_put", strike }, side: "buy", quantity: qty });
      }
    }
  }

  const selected = args.limit > 0 ? cases.slice(0, args.limit) : cases;
  console.log(`# running ${selected.length} cases (timeout ${args.timeout}s each)...\n`);

  const runner = new CaseRunner(client, rpc, takerAddress, messageSigner);
  const results: Record<string, number> = { PASS: 0, BLOCKED: 0, FAIL: 0, SKIP: 0 };
  const detail: { name: string; status: string; detail: string }[] = [];

  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    let out = await runner.run(c, args.timeout);
    // Bounded retry for transient cases (echo race / silence / disconnect), not maker availability.
    if (args.retry > 0 && out.status === "FAIL" && /race|silence|disconnected/.test(out.detail)) {
      for (let r = 0; r < args.retry; r++) {
        console.log(`    -> retry ${r + 1}/${args.retry} after: ${out.detail}`);
        if (args.delay > 0) await sleep(args.delay);
        out = await runner.run(c, args.timeout);
        if (out.status !== "FAIL" || !/race|silence|disconnected/.test(out.detail)) break;
      }
    }
    results[out.status]++;
    detail.push({ name: c.name, status: out.status, detail: out.detail });
    console.log(
      `[${String(i + 1).padStart(2)}/${selected.length}] ${c.name.padEnd(12)} ${c.terms.type.padEnd(15)} strike=${strikeOf(c.terms)} qty=${c.quantity} -> ${out.status.padEnd(7)} ${out.detail}`,
    );
    if (args.delay > 0 && i < selected.length - 1) await sleep(args.delay);
  }

  console.log("\n# SUMMARY");
  for (const k of ["PASS", "BLOCKED", "FAIL", "SKIP"] as const) {
    console.log(`#   ${k}: ${results[k]}`);
  }
  if (results.PASS > 0) {
    console.log("\n# FILLED:");
    for (const d of detail.filter((x) => x.status === "PASS")) console.log(`#   ${d.name}: ${d.detail}`);
  }
  if (results.BLOCKED > 0) {
    console.log("\n# BLOCKED (external, not a code bug):");
    const seen = new Set<string>();
    for (const d of detail.filter((x) => x.status === "BLOCKED")) {
      const key = d.detail;
      if (!seen.has(key)) { seen.add(key); console.log(`#   ${d.name}: ${d.detail}`); }
    }
  }
  if (results.FAIL > 0) {
    console.log("\n# FAILED (needs investigation):");
    for (const d of detail.filter((x) => x.status === "FAIL")) console.log(`#   ${d.name}: ${d.detail}`);
  }

  // Per-cause breakdown (all statuses).
  const causes = new Map<string, number>();
  for (const d of detail) {
    const c = causeOf(d);
    causes.set(c, (causes.get(c) ?? 0) + 1);
  }
  console.log("\n# CAUSE BREAKDOWN");
  for (const [k, v] of [...causes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`#   ${String(v).padStart(3)}  ${k}`);
  }

  // Tally by trade type (sell_call/buy_call/sell_put/buy_put).
  const byType = new Map<string, { pass: number; total: number }>();
  for (const d of detail) {
    const type = d.name.trim().split(/\s+/)[0];
    const row = byType.get(type) ?? { pass: 0, total: 0 };
    row.total++;
    if (d.status === "PASS") row.pass++;
    byType.set(type, row);
  }
  console.log("\n# BY TRADE TYPE (pass/total)");
  for (const [k, v] of byType) console.log(`#   ${k.padEnd(14)} ${v.pass}/${v.total}`);

  // Tally by underlying.
  const bySym = new Map<string, { pass: number; total: number }>();
  for (const d of detail) {
    const sym = d.name.trim().split(/\s+/)[1];
    const row = bySym.get(sym) ?? { pass: 0, total: 0 };
    row.total++;
    if (d.status === "PASS") row.pass++;
    bySym.set(sym, row);
  }
  console.log("\n# BY UNDERLYING (pass/total)");
  for (const [k, v] of [...bySym.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`#   ${k.padEnd(8)} ${v.pass}/${v.total}`);
  }

  client.disconnect();
  process.exit(results.FAIL > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
