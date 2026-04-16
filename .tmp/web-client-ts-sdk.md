 # Acta Web Client SDK (TypeScript)
 
 Integration guide for **taker web apps** using the TypeScript SDK.

## Current (code-backed)

Wire-level semantics are defined by:
- `../reference/taker-api.md`
- `../reference/ws-common.md`

## Planned (not implemented)

- Future protocol additions should be treated as planned unless reflected in the reference docs `Current` sections.
 
 ## Overview
 
 This SDK enables your web app to:
 - Connect to Acta via WebSocket
 - Authenticate with wallet signature
 - Browse markets and positions
 - Run the RFQ → quote → sponsored tx signing flow

For the full WebSocket protocol reference, see `../reference/taker-api.md`.

## SDK events and wire messages

| SDK event | Wire message |
|-----------|--------------|
| `connected` | transport event (no wire message) |
| `versionMismatch` | `VersionMismatch` |
| `authenticated` | `AuthSuccess` |
| `rfqCreated` | `RfqCreated` |
| `quoteReceived` | `QuoteReceived` |
| `sponsoredTxToSign` | `SponsoredTxToSign` |
| `orderAccepted` | `OrderAccepted` |
| `orderSubmitted` | `OrderSubmitted` |
| `orderConfirmed` | `OrderConfirmed` |
| `orderFailed` | `OrderFailed` |
| `rfqClosed` | `RfqClosed` |
| `rfqAvailableAgain` | `RfqAvailableAgain` |
| `markets` | `Markets` |
| `marketDescriptors` | `MarketDescriptors` |
| `positions` | `Positions` |
| `indicativePrices` | `IndicativePrices` |
 
 ## Installation
 
 ```bash
 yarn add @acta-markets/ts-sdk-v1
 ```
 
 ## Quick Start
 
 ### 1. Create Auth Provider
 
 ```typescript
 import { WalletAuthProvider } from "@acta-markets/ts-sdk-v1";
 
 const authProvider = new WalletAuthProvider({
   publicKeyBase58: walletPublicKeyBase58,
   signMessage: async (msg: Uint8Array) => {
     // Return 64-byte ed25519 signature
     return await wallet.signMessage(msg);
   },
 });
 ```
 
 **Other options:**
 - `KeypairAuthProvider` — For Node.js / CI / bots
 - `CustomAuthProvider` — For remote signers
 
 ### Frontend wallets (Phantom / Privy)
 
 Requirements:
 - WS auth needs `signMessage` (ed25519 over UTF-8 challenge text)
 - Sponsored tx signing can use `ws.signSponsoredTxBase64(...)` (signs message bytes) or `wallet.signTransaction(...)`
 
 ```typescript
 import { WalletAuthProvider, ws } from "@acta-markets/ts-sdk-v1";
 
 const authProvider = new WalletAuthProvider({
   publicKey: wallet.publicKey, // or publicKeyBase58
   signMessage: (msg) => wallet.signMessage(msg),
 });
 
 // When the server sends a sponsored tx:
 const signedTxBase64 = await ws.signSponsoredTxBase64({
   txBase64,
   taker: wallet, // must provide signMessage or signMessages
 });
 ```
 
 If a wallet doesn't expose `signMessage`, use `CustomAuthProvider` with a backend signer.
 
 ### 2. Connect to WebSocket
 
 ```typescript
 import { ActaClient } from "@acta-markets/ts-sdk-v1";
 
 const client = new ActaClient({
   ws: {
     url: "wss://{host}",
     role: "taker",
   },
 });
 
// Recommended: connect and start auth flow in one call
client.ws!.connectAndAuthenticate(authProvider);
// Or via facade:
// client.connectWsAndAuthenticate(authProvider);

// Alternative UX: connect anonymously, authenticate later
// client.ws!.connectAnonymous();
// await client.ws!.authenticate(authProvider);
 
 client.ws!.on("connected", () => console.log("Connected"));
 client.ws!.on("error", (e) => console.error("Error:", e));
 ```
 
 ### 3. Browse Markets (No Auth Required)
 
 ```typescript
 client.ws!.on("markets", (markets) => {
   console.log("Markets:", markets);
 });
 client.ws!.getMarkets();
 
// Full market descriptors with decimals + oracle PDA metadata.
 client.ws!.on("marketDescriptors", (markets) => {
   console.log("Market descriptors:", markets);
 });
 client.ws!.getMarketDescriptors({ active_only: true });
 ```
 
 ### 4. Authenticate
 
 ```typescript
// If you connected anonymously first:
 await client.ws!.authenticate(authProvider);
 
 client.ws!.on("authenticated", (sessionId) => {
   console.log("Authenticated:", sessionId);
 });
 ```
 
 ### 5. Get User Positions
 
 ```typescript
 client.ws!.on("positions", (positions) => {
   console.log("Positions:", positions);
 });
 client.ws!.getPositions(); // Requires auth
 ```
 
 ### 6. Create RFQ
 
 ```typescript
 // Listen for RFQ creation receipt
 client.ws!.on("rfqCreated", (rfq) => {
   console.log("RFQ created:", rfq.rfq_id, "expires:", rfq.expires_at);
 });
 
 // Listen for quotes
 client.ws!.on("quoteReceived", (quote) => {
   console.log("Quote received:", quote.price, "from:", quote.maker);
 });
 
 // Create RFQ
 client.ws!.createRfq({
   market: marketPdaBase58,
   position_type: "cash_secured_put",
   strike: 136_000_000_000,
   quantity: 20_000_000,
   timeoutSeconds: 30,
   clientRequestId: uuid(), // Optional: for idempotency
 });
 ```

If `clientRequestId` is provided, repeating the same request returns the same
`rfq_id` while the RFQ is active. Scope is per taker pubkey; TTL is server-defined.
 
 ### 7. Cancel RFQ
 
 ```typescript
 client.ws!.cancelRfq(rfqId);
 // Listen for rfqClosed with reason="taker_cancelled"
 ```
 
 ### 8. Accept Quote & Sign Transaction
 
 ```typescript
client.ws!.on("sponsoredTxToSign", async (orderIdHex, txBase64, signatureDeadline) => {
  // signatureDeadline is unix timestamp (seconds) for the signer deadline.
  console.log("Sign before:", new Date(signatureDeadline * 1000).toISOString());

  // txBase64 is a base64-encoded VersionedTransaction (v0)
  const { VersionedTransaction } = await import("@solana/web3.js");

  // Decode transaction
  const txBytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBytes);

  // Wallet signs (shows preview UI)
  const signedTx = await wallet.signTransaction(tx);

  // Submit back
  const signedBytes = signedTx.serialize();
  const signedTxBase64 = btoa(String.fromCharCode(...signedBytes));

  await client.ws!.submitSignedSponsoredTx({
    orderIdHex,
    txBase64: signedTxBase64,
  });
 });
 
 // Accept the quote
 client.ws!.acceptQuote(rfqId, makerPubkey, orderIdHex);
 ```
 
 ### 9. Track Order Status
 
 ```typescript
 client.ws!.on("orderAccepted", (orderIdHex) => {
   console.log("Order accepted:", orderIdHex);
 });
 
 client.ws!.on("orderSubmitted", (orderIdHex, sig) => {
   console.log("Submitted:", sig);
 });
 
 client.ws!.on("orderConfirmed", (orderIdHex, positionPda) => {
   console.log("Confirmed! Position:", positionPda);
 });
 
 client.ws!.on("orderFailed", (orderIdHex, reason) => {
   console.error("Failed:", reason);
   // May get RfqAvailableAgain if RFQ still valid
 });
 ```
 
 ### 10. Handle RFQ Closed
 
 ```typescript
 client.ws!.on("rfqClosed", (data) => {
   console.log("RFQ closed:", data.rfq_id, "reason:", data.reason);

   // Clean up UI state for this RFQ
 });
 ```

For order-level fill details (`tx_signature`, `position_pda`), rely on `orderConfirmed`.
 
 ---
 
 ## Taker State Machine
 
 ```
 Ready → RfqCreating → RfqOpen → Selecting → AwaitingSponsoredTx
                                                     ↓
                               Signing → OrderPending → Closed
 ```
 
 | State | Description |
 |-------|-------------|
 | `Ready` | Authenticated, can create RFQ |
 | `RfqCreating` | Sent RfqRequest, awaiting RfqCreated |
 | `RfqOpen` | RFQ active, awaiting quotes |
 | `Selecting` | Receiving quotes, selecting best |
 | `AwaitingSponsoredTx` | Sent AcceptQuote, awaiting tx |
 | `Signing` | User signing transaction |
 | `OrderPending` | Submitted, awaiting confirmation |
 | `Closed` | RFQ finished (success or failure) |
 
**Terminal RFQ event**: `RfqClosed` — always transition to Closed.
 
 ---
 
 ## Connection Management
 
 ### Auto-Reconnect & Keepalive
 
 ```typescript
 const client = new ActaClient({
   ws: {
     url: "wss://{host}",
     role: "taker",
     autoReconnect: true,
     reconnectDelay: 1000,
     maxReconnectDelay: 30000,
    reconnectJitterRatio: 0.2,
     pingInterval: 30000,
    protocolVersion: "1.0.0",
    maxPendingMessages: 100,
    pendingMessagesOverflowPolicy: "drop_oldest", // "drop_oldest" | "drop_newest" | "throw"
   },
 });
 
 client.ws!.on("disconnected", (code, reason) => {
   console.warn("Disconnected:", code, reason);
 });

client.ws!.on("versionMismatch", (msg) => {
  console.error("Protocol mismatch:", msg.message);
  // On VersionMismatch, SDK stops auto-reconnect until explicit reconnect call.
});
 ```
 
 ### Recovery After Disconnect
 
Recommended recovery order:
1. Reconnect
2. Re-authenticate (if previously authenticated)
3. `getMyActiveRfqs()`
4. `getOrderStatus(...)` for any pending orders
5. `getPositions()` and `getMarkets()`

 ```typescript
 client.ws!.on("connected", async () => {
  // SDK auto-reconnects for network disconnects.
  // (Not for VersionMismatch: auto-reconnect is stopped in that case.)
   
   // Re-authenticate if was authenticated
   if (wasAuthenticated) {
     await client.ws!.authenticate(authProvider);
   }
   
   // Check for active RFQs
   client.ws!.getMyActiveRfqs();
   
   // Refresh state
   client.ws!.getPositions();
   client.ws!.getMarkets();
 });
 ```
 
 ---
 
 ## Error Handling
 
 ```typescript
 client.ws!.on("error", (e) => {
  // SDK emits standard Error objects
  console.error("Error:", e.message);
 });
 ```
 
 ### Error Codes
 
 | Code | Meaning | Action |
 |------|---------|--------|
 | `rfq_expired` | RFQ timed out | Create new RFQ |
 | `rfq_closed` | RFQ already finished | Create new RFQ |
 | `quote_expired` | Quote expired | Select another or wait |
 | `quote_not_found` | Quote removed | Select another |
 | `quote_refresh_required` | Quote needs refresh | Wait for new quote |
 | `rfq_already_locked` | RFQ locked on different quote | Wait for RfqAvailableAgain |
 | `unauthenticated` | Not logged in | Authenticate |
 | `rate_limited` | Too many requests | Slow down |
 
 ### RfqAvailableAgain
 
 If signature times out or transaction fails, RFQ may reopen:
 
 ```typescript
 client.ws!.on("rfqAvailableAgain", (data) => {
   console.log("RFQ reopened:", data.rfq_id, "reason:", data.reason);
   // Can select another quote
 });
 ```
 
 ---
 
 ## Indicative Prices
 
 Non-binding reference prices for UI:
 
 ```typescript
 client.ws!.on("indicativePrices", (msg) => {
   console.log("Indicative:", msg.strikes);
 });
 
 client.ws!.getIndicativePrices({
   market: marketPdaBase58,
   position_type: "covered_call",
 });
 ```
 
 **Note**: Indicative prices are informational only. Execution via firm RFQs.
 
 ---
 
 ## APR/APY Calculation
 
 ```typescript
 import { ws } from "@acta-markets/ts-sdk-v1";
 
 const { apy } = ws.computeApyFromScaledPrices({
   positionType: "cash_secured_put",
   underlyingAmount: 10,
   grossPremiumPerUnit1e9: quote.price,
   strike1e9: rfq.strike,
   secondsToExpiry: market.expiry_ts - Math.floor(Date.now() / 1000),
 });
 ```
 
 ---
 
 ## Production Notes
 
 ### Transaction Signing
 
 - Sponsored transactions are **v0 VersionedTransaction**
 - Wallet must support versioned transaction signing
 - Signing shows wallet's preview/simulation UI
 
 ### If Wallet Can't Sign Messages
 
 If your wallet can't sign arbitrary bytes:
 - WS authentication won't work directly
 - Consider server-side signer or alternative auth
 
 ---
 
 ## Troubleshooting
 
 ### Connection Issues
 
 | Problem | Solution |
 |---------|----------|
 | Connection dropped | SDK auto-reconnects; re-authenticate if needed |
| `VersionMismatch` | Update SDK/client `protocolVersion`; reconnect explicitly after fix |
 | `unauthenticated` | Call `authenticate()` before protected operations |
 | No events | Check `on("connected")` fired |
 
 ### RFQ Flow Issues
 
 | Problem | Solution |
 |---------|----------|
 | `rfq_expired` | Create new RFQ |
 | `quote_expired` | Wait for new quote or create new RFQ |
 | No quotes | Makers may be offline; try different market/size |
 | Wallet rejects tx | Ensure wallet supports versioned transactions |
 | `rfq_already_locked` | Wait for timeout or RfqAvailableAgain |
 
 ### Order Issues
 
 | Problem | Solution |
 |---------|----------|
 | `orderFailed` | Check reason; RFQ may reopen via RfqAvailableAgain |
 | No `orderConfirmed` | Query `getOrderStatus` after reconnect |
 | Transaction timeout | Server retries; wait for OrderFailed or OrderConfirmed |
 
 ---
 
 ## Support
 
- **Testnet:** `wss://{testnet-host}`
 - **Production:** `wss://{host}`
 - **Questions:** Contact the Acta team
