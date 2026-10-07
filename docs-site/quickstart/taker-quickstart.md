# Acta Taker Quickstart

A taker authenticates over WebSocket, requests quotes, signs a trade and tracks the position. The [TypeScript client SDK](web-client-ts-sdk.md) wraps this flow.

A taker needs only a Solana wallet keypair. There is no registration or on-chain setup. Any wallet can open RFQs, subject to rate limits and, on closed mainnet, [invite gating](#invite-gating-closed-mainnet).

## Endpoint

```
wss://devnet-api.acta.markets/taker
wss://beta-api.acta.markets/taker
```

## Connection and authentication

The first message from the client is `Hello`. The server accepts any client `protocol_version` `>= min_supported_version` (semver). Otherwise it closes the connection with `VersionMismatch`.

```json
{
  "type": "Hello",
  "data": {
    "protocol_version": "1.0.0",
    "features": [],
    "client_name": "my-app",
    "client_version": "0.1.0"
  }
}
```

The server responds with `Welcome` (`server_time_unix_ms` is for clock sync). Taker auth is lazy. Authenticate right away or before the first action that needs it. Discovery (`GetMarkets`, `GetMarketDescriptors`, `GetTokenCaps`, `GetIndicativePrices`, …) works without auth. The list is under "Authentication requirements" in the [Taker API reference](../reference/taker-api.md).

### Fresh sign

Send `StartAuth` with your wallet pubkey. The server replies with `AuthRequest` carrying the challenge:

```
Acta RFQ Authentication

Sign this message to authenticate your wallet.

Wallet: {base58_pubkey}
Nonce: {hex_32_random_bytes}
Issued At: {RFC3339_timestamp}
```

Validate the whole challenge against the [canonical auth rules](../reference/ws-common.md#what-to-sign) (domain, wallet, nonce, timestamp, final newline) and reject anything else. Sign the original UTF-8 bytes with your wallet key (Ed25519, no prefix or hashing). Base58-encode the 64-byte signature and reply:

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "<from AuthRequest>",
    "signature": "<base58 ed25519 signature>",
    "pubkey": "<taker wallet pubkey, base58>"
  }
}
```

The signature is verified against `pubkey`. Auth must finish within 15 seconds of the challenge. By default the fourth failed attempt closes the connection. On success the server sends `AuthSuccess { session_id, expires_at }`, then `Snapshot`.

### Session resume

`AuthSuccess.expires_at` is a Unix timestamp (seconds). Store `session_id` and `expires_at`. On reconnect, if `now < expires_at`, skip the wallet signature:

```json
{ "type": "ResumeAuth", "data": { "session_id": "<saved session_id>" } }
```

A valid session returns `AuthSuccess`. An invalid, expired or revoked one returns `AuthError { reason: "session_expired" }`. Fall back to a fresh sign. Sessions have a 24h default TTL (sliding, capped at 7 days) and survive disconnects. A failed `ResumeAuth` counts toward the 3-attempt limit.

## Discovery

`GetMarketDescriptors` returns `size_rule`, decimals, oracle PDAs and symbols, which you need to validate quantity and render prices.

```json
{ "type": "GetMarketDescriptors", "data": { "request_id": "<uuid>", "active_only": true } }
{ "type": "GetTokens",            "data": { "request_id": "<uuid>", "active_only": true } }
{ "type": "GetExpiries",          "data": { "request_id": "<uuid>" } }
```

Query requests need `request_id`, and responses echo it. Cache descriptors and refresh on `MarketCreated` / `MarketFinalized`.

`size_rule = { min_size, max_size, step }` is in underlying atomic units, keyed by underlying mint. A valid `quantity` satisfies `min_size <= quantity <= max_size` and `(quantity - min_size) % step == 0`. If a market's underlying mint has no rule, `RfqRequest` and the whole `GetMarketDescriptors` request fail with `missing_size_rule_for_underlying_mint`.

## The RFQ flow

```
RfqRequest -> RfqCreated -> QuoteReceived (0..N) -> AcceptQuote
  -> SponsoredTxToSign -> [sign] -> SubmitSignedSponsoredTx
  -> OrderAccepted -> OrderSubmitted -> OrderConfirmed -> RfqClosed
```

### 1. Open the RFQ

`quantity` is in underlying atomic units, including for cash-secured puts. A CSP UI that takes a quote-token amount (e.g. USDC) converts first: `quantity = round(quoteAmount * 10^underlying_decimals * 1e9 / strike)`. See "Quantity and collateral by position type" in [WebSocket conventions](../reference/ws-common.md).

```json
{
  "type": "RfqRequest",
  "data": {
    "market": "<market PDA, base58>",
    "position_type": "covered_call",
    "strike": 136000000000,
    "quantity": 5000000000,
    "timeout_seconds": 30,
    "client_request_id": "<optional uuid>"
  }
}
```

`position_type` is `covered_call` or `cash_secured_put`. `client_request_id` is an optional idempotency key. Repeating it while the RFQ is active returns the same `rfq_id`. The server replies with `RfqCreated { rfq_id, rfq_version, expires_at, created_at, order_options }` and broadcasts the RFQ to makers.

### 2. Collect quotes

Makers stream `QuoteReceived`. Each quote is firm and hash-bound via `order_id`:

```json
{
  "type": "QuoteReceived",
  "data": {
    "rfq_id": "<uuid>",
    "strike": 136000000000,
    "maker": "<maker owner pubkey, base58>",
    "price": 50000000,
    "net_price": 49750000,
    "valid_until": 1710000350,
    "nonce": 42,
    "order_id": "0x<64 hex>"
  }
}
```

- `price`: gross premium per 1 underlying unit (1e9 scale). Order operations use this and `order_id`.
- `net_price`: display-only estimate after protocol fee. The actual net is computed on-chain at open.

You pick the winner. The server's "best" ranking is a hint. One quote fills the full quantity, with no partial fills.

### 3. Accept and sign the sponsored transaction

Name the winning quote by `order_id`:

```json
{
  "type": "AcceptQuote",
  "data": {
    "rfq_id": "<uuid>",
    "maker": "<maker owner pubkey, base58>",
    "order_id": "0x<64 hex>"
  }
}
```

The server locks the quote and builds a transaction to sign:

```json
{
  "type": "SponsoredTxToSign",
  "data": {
    "order_id": "0x<64 hex>",
    "tx_base64": "<base64 v0 VersionedTransaction>",
    "signature_deadline": 1710000040
  }
}
```

`tx_base64` is a v0 `VersionedTransaction`. The keeper is the fee payer and co-signer. The taker signs as the collateral authority. Steps in any language:

1. base64-decode `tx_base64` to bytes.
2. Deserialize as a v0 `VersionedTransaction`.
3. Sign with the taker wallet key into the taker's signer slot. Leave the keeper's slot and account order alone. The message bytes are fixed.
4. Re-serialize the partially-signed transaction and base64-encode it.
5. Submit before `signature_deadline` (Unix seconds):

```json
{
  "type": "SubmitSignedSponsoredTx",
  "data": { "order_id": "0x<64 hex>", "tx_base64": "<signed, base64>" }
}
```

The wallet has to sign versioned (v0) transactions. Legacy-only wallets do not work. Headless takers can sign the raw message bytes with the keypair, as shown below. WS auth also needs arbitrary-byte signing.

### Sponsored transaction: raw signing

Before signing, check the program, market, quote terms, amounts, accounts and instructions against your accepted order. A byte-level signer does not need to rebuild a `VersionedTransaction`. `tx_base64` decodes to Solana's wire format:

```
<shortvec(sig_count)> | sig[0..64] | sig[1..64] | … | <message bytes>
```

- `shortvec(sig_count)` is a compact-u16 (little-endian base128 varint) count of signatures. For a 2-signer sponsored tx it is a single byte `0x02`.
- Each signature slot is 64 bytes, ordered to match the message's required signers.
- Slot 0 is the keeper (fee payer and co-signer). It is zeroed now. The keeper fills it after you submit.
- Slot 1 is the taker. You fill it.

To sign:

1. Read the `shortvec` at offset 0 → `sig_count` and its byte length `n`.
2. `msg_start = n + sig_count * 64`. The message bytes are `tx[msg_start..]`.
3. Sign those message bytes with the taker key (raw 64-byte Ed25519). That is a valid transaction signature.
4. Write the 64 bytes into slot 1: `tx[n + 64 .. n + 128] = signature`.
5. base64-encode the whole buffer and return it in `SubmitSignedSponsoredTx`.

Do not modify the message bytes, account order, or the keeper's slot.

The maker's signature is not a signer slot. It is an Ed25519-program verify instruction over `order_id`, placed right before `open_position` in the message.

Library shortcuts:
- Rust (`solana-sdk`): deserialize with `bincode`, sign `tx.message.serialize()` with the taker `Keypair`, set `tx.signatures[1]`. Or work on the raw bytes as above.
- Python (`solders`): `tx = VersionedTransaction.from_bytes(raw)`, sign `bytes(tx.message)`, assign into `tx.signatures[1]`, re-serialize.
- TypeScript: `signSponsoredTxBase64({ txBase64, taker, expectedMessageBytes })` from `@acta-markets/ts-sdk/ws` (no `@solana/web3.js`).

In SDK 0.1.6 the TypeScript helper checks the transaction against an expected message you build yourself from the accepted order, configured program and accounts, approved blockhash, instructions and resolved ALT references. Do not copy the expected message from the received transaction. Older SDK versions leave this check to the application. `signSponsoredTxBase64Unverified` skips it.

### 4. Track the order

The server relays keeper progress:

| Event | Meaning |
|---|---|
| `OrderAccepted` | Signed transaction enqueued in Core (not on-chain yet). Also sent on an exact `AcceptQuote` retry. |
| `OrderSubmitted` | Tx sent to Solana. Carries `tx_signature`, `order_version`. |
| `OrderConfirmed` | Position opened on-chain. Carries `position_pda`, `order_version`. |
| `OrderFailed` | Settlement failed. Carries `reason`, `order_version`. |
| `RfqClosed` | Terminal RFQ event. On a fill it follows `OrderConfirmed`. Drop per-RFQ state only here. |

Apply an update only if its `order_version` / `rfq_version` is higher than the one you hold.

### 5. Failure and retry

`OrderFailed` alone is not a reason to trade again:

| Reason | Retryable? |
|---|---|
| `blockhash_expired` | The keeper may retry, up to five attempts. Check `GetOrderStatus` and wait for `RfqAvailableAgain` or `RfqClosed` before selecting another quote. |
| `on_chain`, `submission_rejected`, `safety_timeout`, `shutdown` | No. |

On a signature timeout or tx-build failure, only the winning quote is discarded. Still-valid losing quotes are restored and the RFQ returns to active if not expired.

## Cancelling

```json
{ "type": "CancelRfq", "data": { "rfq_id": "<uuid>", "request_id": "<uuid>" } }
```

The server responds with `RfqClosed { reason: "taker_cancelled" }`.

## Position lifecycle

Position collateral stays in escrow until settlement after market finalization. Options cannot be exercised early. For an ITM position, the maker supplies the settlement asset. If the position remains unfunded, a permissionless liquidator can supply that asset and receive the collateral.

| Status | Meaning |
|---|---|
| `open` | Collateral locked, net premium paid to taker. |
| `funded` | Maker deposited the settlement asset (`DepositFundsToPosition`). |
| `settled` | Market finalized after expiry; assets distributed by ITM/OTM outcome. |
| `liquidated` | An unfunded ITM position was closed by a permissionless liquidator, who fronts the settlement to the taker. |

Track outcomes with the `chain_events` channel (`ChainEvent(position_settled)`, `ChainEvent(position_liquidated)`) and `GetPositions`. `PositionUpdated` and the `positions` channel are maker-only. Settlement and payoffs are in [Options and settlement](../reference/protocol-flow.md).

## Reconnection and recovery

Subscriptions do not survive a disconnect, and missed events are not replayed. After reconnect, re-auth (resume or fresh), resubscribe, then re-read state:

```json
{ "type": "GetMyActiveRfqs", "data": { "request_id": "<uuid>" } }
{ "type": "GetOrderStatus",  "data": { "request_id": "<uuid>", "order_id": "0x<64 hex>" } }
{ "type": "GetPositions",    "data": { "request_id": "<uuid>" } }
```

Events may be redelivered after reconnect. Dedupe by `order_id` and `*_version`.

Only a successful `ResumeAuth` of the same session transfers an unfinished signature. If the pending order's signature was not sent, repeat the exact `AcceptQuote` to get the signing payload. For a submitted or enqueued order, query `GetOrderStatus` and do not resend trading commands.

`OrderStatus` is `{ request_id, order_id, state }`, with `state` one of `{ "type": "pending" }`, `{ "type": "confirmed", "position_pda": "..." }` or `{ "type": "unknown" }`. It has no `order_version`. `unknown`, a missing position or a timeout means the outcome is still unknown. See [Delivery and recovery](../reference/taker-api.md#delivery-and-recovery).

## Invite gating (closed mainnet)

On closed mainnet an unregistered wallet gets `RequireInvite` after auth, and `RfqRequest` returns `InviteRequired` until it redeems an invite:

```json
{ "type": "RedeemInvite", "data": { "request_id": "<uuid>", "code": "abc123" } }
```

No signature is needed because the authenticated session proves wallet ownership. The response carries the taker's shareable `referral_code`. Devnet needs no invite. Error codes (`invalid_code`, `code_exhausted`, `code_expired`, `code_disabled`, …) are in the [Taker API reference](../reference/taker-api.md).

## Operational defaults

| Topic | Value |
|---|---|
| Application `Ping` | Optional clock sample. `Pong` carries `server_time_unix_ms`. Transport pongs keep the connection alive; default idle timeout 90s. |
| Server WS ping | Every 30s. Raw clients answer protocol pings. |
| Clock skew | Track `offset = server_time − local_time` from `Welcome` and `Pong`. Apply it to `expires_at` and `signature_deadline`. |
| Signature deadline | `min(now + 30s, quote effective_expiry, rfq.expires_at)`. |
| Rate limits | Per-taker active-RFQ cap (default 10) and platform cap. `RateLimit` errors carry a reason code. |

`valid_until` is set by the maker.

## Integrating from other languages

The reference docs are the wire spec. A taker client needs:

1. An Ed25519 keypair and the ability to sign raw bytes (challenge auth + tx signing).
2. A Solana library that can deserialize, partially sign and re-serialize a v0 `VersionedTransaction`, e.g. `solders` / `solana-py` (Python), `solana-sdk` (Rust), `@solana/web3.js` (TS).
3. A WebSocket client that answers protocol pings.

No direct RPC is needed. Markets, quotes, positions and the sponsored transaction arrive over WebSocket.

## Reference

- [Taker API reference](../reference/taker-api.md): messages and error variants
- [Taker wire examples](taker-wire-examples.md): a full JSON session and branch cases
- [TypeScript client SDK](web-client-ts-sdk.md): the same flow via `@acta-markets/ts-sdk`
- [Options and settlement](../reference/protocol-flow.md): trade flow, economics, settlement, risk
- [WebSocket conventions](../reference/ws-common.md): units, envelopes, collateral formulas, timeouts
- [Capacity limits](../reference/caps.md): OI and notional caps
- [Endpoints and maker registration](../reference/sandbox.md)
- [Integration FAQ](../reference/faq.md)
