# Acta Web Client SDK (TypeScript)

The TS SDK wraps the taker WebSocket protocol: auth, market and position queries, RFQs and sponsored transactions.

SDK event callbacks use the wire message names in lowerCamelCase. TypeScript types define the payloads. Wire messages, errors and enums are in the [Taker API reference](../reference/taker-api.md).

## Installation

```bash
yarn add @acta-markets/ts-sdk@0.1.6-vaults.2
```

0.1.6-vaults.2 adds canonical auth-challenge, market-PDA and declared-signer checks (not in 0.1.5). `ActaWsClient` validates the challenge before calling the auth provider. Raw clients can call `validateAuthChallenge`.

The client rejects frames where any of these is missing or `null`: `Welcome.server_time_unix_ms`, `AuthSuccess.expires_at`, `RfqBroadcast.sent_at_unix_ms`, `order_version` on order events, and `instruction_index` on known chain events. `*_unix_ms` fields are milliseconds. `expires_at` is Unix seconds. WS protocol version: `1.0.0`.

The taker WebSocket client and signing helpers are in `@acta-markets/ts-sdk/ws`.

## Quick start

### 1. Auth provider

`wallet` is a connected wallet adapter with `publicKey` and `signMessage`. `walletPublicKeyBase58` is the account this client authenticates as. Recreate the client when the account changes.

```typescript
import { WalletAuthProvider } from "@acta-markets/ts-sdk/ws";

const authProvider = new WalletAuthProvider({
  publicKeyBase58: walletPublicKeyBase58,
  signMessage: async (msg: Uint8Array) => await wallet.signMessage(msg), // 64-byte ed25519
});
```

Other providers: `KeypairAuthProvider` (Node/CI/bots), `CustomAuthProvider` (remote signer).

Frontend wallets (Phantom, Privy): WS auth needs `signMessage` (ed25519 over the UTF-8 challenge). Without it, use `CustomAuthProvider` with a backend signer. For the sponsored tx, `signSponsoredTxBase64(...)` signs after the byte comparison in step 8 and does not need `@solana/web3.js`. `wallet.signTransaction(...)` gives the wallet's own preview.

### 2. Connect

```typescript
import { ActaWsClient } from "@acta-markets/ts-sdk/ws";

// Devnet; for mainnet use "wss://beta-api.acta.markets"
const wssEndpoint = "wss://devnet-api.acta.markets";
const ws = new ActaWsClient({ url: wssEndpoint, role: "taker" });

// Register handlers and load the saved session before connecting (next step).

ws.on("connected", () => console.log("Connected"));
ws.on("error", (e) => console.error("Error:", e));
```

The client appends `/taker` to the base URL from `role`. Alternative: `ws.connectAnonymous()` then `await ws.authenticate(authProvider)` later.

### 3. Authenticate with session resume

```typescript
const sessionKey = `acta_session:${wssEndpoint}:${walletPublicKeyBase58}`;
const expiryKey = `${sessionKey}:expires_at`;

ws.on("authenticated", (sessionId, expiresAt) => {
  localStorage.setItem(sessionKey, sessionId);
  localStorage.setItem(expiryKey, String(expiresAt));
});

const savedSessionId = localStorage.getItem(sessionKey);
const savedExpiresAt = Number(localStorage.getItem(expiryKey) || "0");

const sessionId = savedSessionId && Date.now() / 1000 < savedExpiresAt
  ? savedSessionId
  : undefined;

ws.connectAndAuthenticate(authProvider, { sessionId });
```

Register handlers before `connectAndAuthenticate`. It tries the saved session, then the auth provider on `session_expired`. Do not send `ResumeAuth` yourself from `connected`. `connected` fires when the socket opens, before Welcome and auth. `authenticated` fires after auth and the server's connection handoff.

Store sessions per wallet and environment. Resume needs no wallet popup. Fresh authentication does not recover an older session's pending signature. See [Delivery and recovery](../reference/taker-api.md#delivery-and-recovery).

`expiresAt` is Unix seconds. It limits when you can resume. It does not close an authenticated connection.

### 4. Subscribe to live updates

```typescript
// Takers track position outcomes via chain events; `positions`/`positionUpdated`
// is a maker-only push and never fires for a taker.
ws.on("authenticated", () => ws.subscribe(["chain_events"]));

ws.on("chainEvent", (ev) => {
  // ev.event_type e.g. "PositionSettled" / "PositionLiquidated" — match to your position_pda
  console.log("Chain event:", ev);
});

// After a fill, refresh with getPositions().
```

The SDK restores subscriptions on reconnect.

### 5. Browse markets

```typescript
ws.on("markets", (markets) => console.log(markets));
ws.getMarkets();

// Full descriptors include size_rule, decimals, and oracle PDAs. Fetch before createRfq.
ws.on("marketDescriptors", (descriptors) => { /* cache these */ });
ws.getMarketDescriptors({ active_only: true });
```

### 6. Create RFQ

Call `getMarketDescriptors()` first. The SDK checks `quantity` against the market's `size_rule` (`min_size <= quantity <= max_size`, `(quantity - min_size) % step === 0`) and throws before sending. A missing server-side rule returns `missing_size_rule_for_underlying_mint`.

`quantity` is in underlying atomic units, including for cash-secured puts. For USDC input, convert with `quoteAmountToQuantity(usdc, strike1e9, underlying_decimals)` from `@acta-markets/ts-sdk/ws`. The formula is in [WebSocket conventions](../reference/ws-common.md).

```typescript
ws.on("rfqCreated", (rfq) => console.log(rfq.rfq_id, rfq.expires_at));

ws.on("quoteReceived", (quote) => {
  // Display net_price (after protocol fee); AcceptQuote uses gross price (hash-bound via order_id).
  const display = quote.net_price ?? quote.price;
  console.log("Quote:", display, "from", quote.maker);
});

ws.createRfq({
  market: marketPdaBase58,
  position_type: "covered_call",
  strike: 136_000_000_000,
  quantity: 5_000_000_000, // 5 SOL in lamports
  timeoutSeconds: 30,
  clientRequestId: crypto.randomUUID(), // optional idempotency key, scoped per taker
});
```

Repeating a `createRfq` with the same `clientRequestId` returns the same `rfq_id` while the RFQ is active. TTL is server-defined.

### 7. Cancel RFQ

```typescript
ws.cancelRfq(rfqId);
// Listen for rfqClosed with reason="taker_cancelled"
```

### 8. Accept quote and sign

SDK 0.1.6 requires `expectedMessageBytes`, the message you build from the selected order and approved transaction parameters, with ALT references resolved against table contents you trust. The SDK compares every byte (instructions, account flags, fee payer, blockhash, ALT references) before calling the wallet. Do not copy the expected bytes from the received transaction. A matching `orderIdHex` is not enough. Your application supplies `approvedMessageForOrder(id)`. Older SDKs leave this check to the application. `signSponsoredTxBase64Unverified` skips it and trusts the server's transaction.

```typescript
import { signSponsoredTxBase64 } from "@acta-markets/ts-sdk/ws";

let connectionEpoch = 0;
ws.on("stateChange", () => { connectionEpoch++; });

ws.on("sponsoredTxToSign", async (id, txBase64, signatureDeadline) => {
  if (id !== orderIdHex || !ws.isAuthenticated()) return;
  const epoch = connectionEpoch;
  const walletMatches = () => wallet.publicKey?.toBase58() === walletPublicKeyBase58;
  const expired = () => Date.now() / 1000 >= signatureDeadline;
  if (!walletMatches() || expired()) return;
  try {
    const signedTxBase64 = await signSponsoredTxBase64({
      txBase64, taker: wallet,
      expectedMessageBytes: await approvedMessageForOrder(id),
    });
    if (epoch !== connectionEpoch || id !== orderIdHex || !walletMatches() || expired()) return;
    await ws.submitSignedSponsoredTx({ orderIdHex: id, txBase64: signedTxBase64 });
  } catch (error) {
    console.error(id, error);
  }
});

ws.acceptQuote(rfqId, makerPubkey, orderIdHex);
```

`orderIdHex` is the selected order. If the wallet, connection or selection changes during signing, discard the result. Record that you sent the transaction before submitting (see step 10).

Browser wallets: for the wallet's own preview or simulation, deserialize with `@solana/web3.js` and call `wallet.signTransaction(tx)`. Only this path needs `@solana/web3.js`. The SDK does not depend on it.

### 9. Track order status

```typescript
ws.on("orderAccepted", (orderIdHex, orderVersion) => {});
ws.on("orderSubmitted", (orderIdHex, txSignature, orderVersion) => {});
ws.on("orderConfirmed", (orderIdHex, positionPda, orderVersion) => {});
ws.on("orderFailed", (orderIdHex, reason, orderVersion) => {});

ws.on("rfqClosed", (data) => {
  // Terminal — clean up RFQ state. data.reason: "taker_cancelled" | "expired" | "filled" | ...
});
```

### 10. Recover an interrupted order

Store the selected `rfq_id`, maker, `order_id`, auth session and whether `SubmitSignedSponsoredTx` was sent, per wallet and backend, so they survive reconnect and page reload. Do not store signed transactions.

After resuming the same auth session, check `GetMyActiveRfqs`. If the order is still `pending_signature`, repeat that exact `AcceptQuote` to get its signing payload. The original signature deadline still applies. If it is `enqueued` or already sent, query `GetOrderStatus` and do not sign or submit again.

```typescript
ws.on("orderStatus", ({ order_id, state }) => {
  switch (state.type) {
    case "confirmed":
      console.log(order_id, "opened position", state.position_pda);
      break;
    case "pending":
      console.log(order_id, "execution pending");
      break;
    case "unknown":
      console.log(order_id, "outcome unresolved");
      break;
  }
});
```

After `OrderFailed`, a timeout or `unknown`, the order may still have executed, so do not replay it. When `RfqAvailableAgain` reopens the auction, pick from the current quotes. The old winning quote is discarded.

## Connection management

```typescript
// Devnet; for mainnet use "wss://beta-api.acta.markets"
const wssEndpoint = "wss://devnet-api.acta.markets";
const ws = new ActaWsClient({
  url: wssEndpoint,
  role: "taker",
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectJitterRatio: 0.2,
  pingInterval: 30000,
  protocolVersion: "1.0.0",
  maxPendingMessages: 100,
  pendingMessagesOverflowPolicy: "drop_oldest", // "drop_oldest" | "drop_newest" | "throw"
});

ws.on("disconnected", (code, reason) => {});
ws.on("versionMismatch", (msg) => {
  // Auto-reconnect stops on VersionMismatch until explicit reconnect
});
```

The SDK reconnects and resumes after network drops, but not after `VersionMismatch`. After `authenticated` it restores subscriptions and, with the default `autoReconcile`, requests `GetMyActiveRfqs` and `GetPositions`. Wait for those responses before rebuilding state, and request `GetOrderStatus` for each pending order. An order missing from those responses is still unknown.


## Error handling

```typescript
ws.on("error", (e) => {
  if (e.type === "Generic") console.error(e.data.code, e.data.message);
  else console.error(e.type);
});

ws.on("requestError", (envelope) => {
  // { request_id, error: ServerError } - correlates with a specific request
});
```

Most query methods (`getMarkets`, `getPositions`, `getOrderStatus`, ...) return a `request_id`. Match it to `msg.request_id` on the response event.

Error codes and `OrderFailed` reasons are in the [Taker API reference](../reference/taker-api.md). Common cases are in the [Integration FAQ](../reference/faq.md).

## Other features

- Invite gating (closed mainnet): if `requireInvite` fires, redeem with `redeemInvite(rawCode)` before trading. Claim your own code with `claimReferralCode` and read stats with `getMyReferralInfo`. Errors are in the [Taker API reference](../reference/taker-api.md).
- Token caps: `getTokenCaps()` -> `tokenCaps` event. OI and notional capacity per token. Schema in [Capacity limits](../reference/caps.md).
- Earn summary: `getEarnSummary()` -> `earnSummary` event. APR ranges and capacity per asset for landing pages.
- Market price snapshot: `getTokenMarketsInfo(underlyingMint)` -> `tokenMarketsInfo` returns backend `reference_price`, size rules, decimals and indicative premiums. The response does not echo the mint; map it by request ID. See [TokenMarketsInfo](../reference/taker-api.md#tokenmarketsinfo).
- Indicative prices: `getIndicativePrices({ market, position_type })` -> `indicativePrices` event. Non-binding. The server refreshes them roughly every 30s.
- APR inputs: use spot and indicative premium from the same `TokenMarketsInfo` response. Skip the preview when the price is missing or `is_stale: true`.
- APR/APY helper: `computeApyFromScaledPrices({ positionType, underlyingAmount, grossPremiumPerUnit1e9, strike1e9, spotPrice1e9, secondsToExpiry })` from `@acta-markets/ts-sdk/ws` returns `{ apy, apr, termYield }`. Pass backend `best_price` as `grossPremiumPerUnit1e9`. It already includes the quote-mint fee adjustment, so do not subtract the fee again.

## Signing requirements

- Sponsored transactions are v0 `VersionedTransaction`. `wallet.signTransaction` needs a wallet with versioned transaction support. `signSponsoredTxBase64` signs raw message bytes.
- WS auth needs arbitrary-byte signing. Without it, use a server-side signer via `CustomAuthProvider`.

## Endpoints

- Devnet: `wss://devnet-api.acta.markets`
- Mainnet: `wss://beta-api.acta.markets`
