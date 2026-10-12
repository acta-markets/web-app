# Acta WS Common Conventions

## Message envelope

All WS messages use:

```json
{ "type": "MessageType", "data": { ... } }
```

Unit variants may omit `data`, for example:

```json
{ "type": "Logout" }
```

## Encodings and units

| Field | Format |
|-------|--------|
| Pubkeys | base58 |
| Signatures | base58 (64 bytes) |
| `order_id` | 64-char hex (optional `0x` prefix) |
| `price` | `u64`, gross premium per 1 underlying unit, 1e9 scale |
| `total_premium` | `u64`, net premium amount in quote token atomic units |
| `strike` | `u64`, quote per 1 underlying unit, 1e9 scale |
| `quantity` | `u64`, underlying atomic units |
| `size_rule` | min_size, max_size, step in underlying atomic units, tied to underlying_mint |
| Timestamps | Unix seconds |
| `server_time_unix_ms` | Unix milliseconds |

`price` and `strike` are 1e9 fixed-point per 1 underlying unit, independent of mint decimals.

## Quantity and collateral by position type

`quantity` is in underlying atomic units for both position types. They differ in collateral:

Covered call: the user deposits underlying (e.g. SOL).
`quantity` maps directly to the deposit: `quantity = userInput * 10^underlying_decimals`.

Cash-secured put: the user deposits quote (e.g. USDC).
`collateral = quantity * strike / 1e9`.
Convert quote input to underlying quantity before sending:

```
quantity = round(quoteAmount * 10^underlying_decimals * 1e9 / strike)
```

And to display the deposit back in quote terms:

```
quoteAmount = quantity * strike / 1e9 / 10^underlying_decimals
```

`underlying_decimals` comes from `MarketDescriptorInfo`.

### Size rule display for CSP

To show `size_rule` in quote terms for a CSP UI, apply the same conversion:

```
min_quote = min_size * strike / 1e9 / 10^underlying_decimals
max_quote = max_size * strike / 1e9 / 10^underlying_decimals
step_quote = step    * strike / 1e9 / 10^underlying_decimals
```

Example: SOL/USDC CSP, strike $90 (90e9), `size_rule = {min: 1e9, max: 10e9, step: 1e8}`:

| Wire (SOL lamports) | Display (USDC) |
|---------------------|----------------|
| min_size = 1,000,000,000 | 90 USDC |
| max_size = 10,000,000,000 | 900 USDC |
| step = 100,000,000 | 9 USDC |

TS SDK helpers (from `@acta-markets/ts-sdk/ws`): `quoteAmountToQuantity`,
`quantityToQuoteAmount`, `sizeRuleInQuoteTerms`.

## Time and clock skew

`server_time_unix_ms` is present in:
- `Welcome.server_time_unix_ms` (required)
- `Pong.server_time_unix_ms` (required)

`Snapshot` does not include it.

Client estimate:

```
offset_ms = server_time_unix_ms - local_time_ms
estimated_server_now_ms = local_time_ms + offset_ms
```

Use this estimate for `expires_at`, `valid_until`, and `signature_deadline`.

## Authentication protocol

### Signing algorithm

Ed25519. Signatures are 64 bytes, base58-encoded on the wire.

### Challenge format

After `Hello` and `Welcome`, the server sends `AuthRequest` with a multiline plaintext `challenge`. The format differs by role:

Taker challenge (includes a `Wallet:` line):

```
Acta RFQ Authentication

Sign this message to authenticate your wallet.

Wallet: {base58_pubkey}
Nonce: {hex_encoded_32_random_bytes}
Issued At: {RFC3339_timestamp}
```

Maker challenge (no `Wallet:` line):

```
Acta RFQ Authentication

Sign this message to authenticate your wallet.

Nonce: {hex_encoded_32_random_bytes}
Issued At: {RFC3339_timestamp}
```

The server identifies the maker from `AuthChallenge.pubkey` and looks up its signing key in the on-chain maker registry.

### What to sign

Validate the whole challenge **before signing**. Require the exact text and blank lines above, a nonce of exactly 64 lowercase hex characters, a UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` format, and a final `\n` after it. Reject anything else. A maker challenge has no `Wallet:` line. A taker challenge must have one, matching the wallet being authenticated.

Then sign the original UTF-8 bytes: no normalization, prefix or hashing. The fixed text is the authentication domain. The same key signs orders, so signing arbitrary text from an endpoint can authorize an order.

Managed SDK clients validate before signing. Raw clients use `validate_maker_auth_challenge` (Rust) or `validateAuthChallenge` (TypeScript). These check format only. Which endpoint to trust is your configuration.

### AuthChallenge (client -> server)

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "Acta RFQ Authentication\n\nSign this message...",
    "signature": "3q7uQqYc3...base58sig",
    "pubkey": "PubkeyBase58"
  }
}
```

For a maker, `pubkey` is the `maker_owner` pubkey registered on-chain. Sign with the registered quote-signing key. The server looks up `maker_owner` and verifies against that key.

For a taker, `pubkey` is the taker's wallet pubkey (the `Wallet:` value in the challenge). The signature is verified against it.

### Auth constraints

- Max auth attempts per connection: `3`. The connection closes after the third failure.
- Auth deadline after challenge issued: `15s`.

### Ping / Pong

```json
{ "type": "Ping" }
```

`Ping` is a unit variant (no `data` field). Server responds with:

```json
{
  "type": "Pong",
  "data": {
    "server_time_unix_ms": 1710000000000
  }
}
```

The server sends protocol pings every 30s and closes the connection after 90s without inbound traffic. Answering protocol pings is enough. Application `Ping` is optional.

### Logout

```json
{ "type": "Logout" }
```

Unit variant, no `data` field. Server responds with `LogoutSuccess` and closes the connection.

```json
{ "type": "LogoutSuccess", "data": {} }
```

## Fee model

The protocol charges a fee per trade, set per quote mint in basis points. The on-chain config stores two rates: `protocol_fee_bps_premium` and `protocol_fee_bps_volume`.

- `price` in the `Quote` message is the gross premium per 1 underlying unit (1e9 scale). This is what the maker signs and what goes into the order_id preimage as `gross_price`.
- On chain, gross premium is first scaled to quote-token atomic units. The premium-side fee uses `protocol_fee_bps_premium`. The volume-side cap uses strike notional and `protocol_fee_bps_volume`. The charged fee is `min(premium_fee, volume_fee)`.
- `net_price` in WS payloads is approximate, for display. The exact amount is the on-chain net premium.
- `total_premium` in position data is the net premium from on-chain state (in quote token atomic units).
- Makers quote and sign gross. The contract applies the fee at position open.

## Auth messages

### AuthSuccess

```json
{
  "type": "AuthSuccess",
  "data": {
    "session_id": "uuid",
    "expires_at": 1710086400,
    "maker_pda": "MakerPdaBase58"
  }
}
```

`expires_at` wire contract:
- Required integer, Unix seconds, for makers and takers. It is the session-resume deadline, not the socket lifetime.

`maker_pda` wire contract:
- The on-chain maker account PDA (base58) for registered makers.
- Omitted for admins, takers and unregistered makers.

### AuthError

```json
{
  "type": "AuthError",
  "data": {
    "reason": "session_expired",
    "message": "optional detail"
  }
}
```

`reason` is a `snake_case` code. `message` is optional and may be omitted.

Current `reason` codes:
- `session_expired`, `already_authenticated`
- `auth_timeout`, `too_many_auth_attempts`
- `invalid_pubkey`, `invalid_signature`, `pubkey_mismatch`, `challenge_mismatch`
- `maker_not_registered`

## Error format

Two error message types exist:

### Error: connection-level errors

Sent when no `request_id` is available (the message had no `request_id` field, or the error
occurred before routing):

```json
{ "type": "Error", "data": { "type": "RfqNotFound" } }
```

`data` is a tagged `ServerError` variant (`type` + optional nested `data`).

Endpoint-policy violations use a typed error rather than closing the socket:

```json
{
  "type": "Error",
  "data": {
    "type": "WrongEndpoint",
    "data": {
      "endpoint": "maker_data",
      "allowed_endpoints": ["maker"]
    }
  }
}
```

Endpoint values are `maker`, `maker_data`, and `taker`.

### RequestError: request-correlated errors

Sent when the failure belongs to a client request. `request_id` echoes the request's `request_id`:

```json
{
  "type": "RequestError",
  "data": {
    "request_id": "uuid",
    "error": { "type": "RfqNotFound" }
  }
}
```

The inner `error` has the same `ServerError` shape as `Error.data`.

Both fire `error` in the TypeScript SDK (see [TypeScript client SDK](../quickstart/web-client-ts-sdk.md)).

### Parsing rule (applies to both `Error.data` and `RequestError.data.error`)

1. Branch on `type`.
2. If `type != "Generic"`, treat it as a typed variant.
3. If `type == "Generic"`, branch on `data.code`.

Generic code example:

```json
{
  "type": "Error",
  "data": {
    "type": "Generic",
    "data": { "code": "parse_error", "message": "invalid payload" }
  }
}
```

Typed variant examples:

```json
{ "type": "Error", "data": { "type": "RfqNotFound" } }
```

```json
{
  "type": "Error",
  "data": {
    "type": "Unauthenticated",
    "data": { "action": "submit_quotes" }
  }
}
```

### Common `generic.code` values

- `parse_error`
- `message_too_large`
- `too_many_parse_errors`
- `hello_required`
- `hello_timeout`
- `hello_already_sent`
- `session_replaced`
- `session_expired`
- `already_authenticated`
- `trading_paused`
- `internal_error`

The list grows; handle unknown codes.

A wire `u64` can exceed `Number.MAX_SAFE_INTEGER`. The TS SDK holds most WS amounts as `number`. For an oversized amount it reports `unsafe_integer` and still dispatches the message. Do not sign or account with those rounded values. Inbound nonces are parsed losslessly. For full-range amounts in raw JSON, use a lossless parser and bigint. `BigInt(JSON.parse(...).amount)` is already rounded.

## Correlation semantics

Correlation is per request, via `request_id` on messages that have a defined response. There is no global correlation id.

- `Subscribe` / `Unsubscribe` carry a mandatory `request_id`. The server echoes it in `SubscribeAck` / `UnsubscribeAck`, and the `subscribed` / `unsubscribed` arrays contain only the channels this call added or removed, not the full subscription list.
- `GetSubscriptions` carries `request_id`. `Subscriptions` echoes it.
- Query-style `Get*` operations require `request_id` and echo it in their responses.
- Exception: `GetTokenMarketsInfo` can return an uncorrelated error, or no response for an empty market set. See [its failure behavior](taker-api.md#tokenmarketsinfo).
- Indicative pricing uses `request_id` on both `IndicativePricesRequest` (server → maker) and `IndicativePricesResponse` (maker → server).
- Broadcasts (`RfqBroadcast`, `TradeExecuted`, `StatsUpdate`, etc.) don't carry `request_id`.

### SubscribeAck / UnsubscribeAck

```json
{
  "type": "SubscribeAck",
  "data": {
    "request_id": "uuid",
    "subscribed": ["rfqs", "trades"]
  }
}
```

```json
{
  "type": "UnsubscribeAck",
  "data": {
    "request_id": "uuid",
    "unsubscribed": ["stats"]
  }
}
```

## Lifecycle terms

### RFQ lifecycle
- Terminal RFQ event: `RfqClosed`. Close RFQ state only on this event.
- Fill-details event (maker): `QuoteFilled`, sent to the winning maker.
- Order-level confirmation (taker): `OrderConfirmed`. Confirms selected order with
  on-chain identifiers (`tx_signature`, `position_pda`).

### Position lifecycle (post-fill)
- `open`: position created, collateral locked, premium paid to taker.
- `funded`: maker deposited settlement asset via `DepositFundsToPosition`.
- `settled`: market finalized, assets distributed based on ITM/OTM outcome.
- `liquidated`: an unfunded ITM position was closed by a liquidation transaction.

Trade lifecycle and payoff: [Protocol flow](protocol-flow.md).

## Supported channels

`WsChannel` values and what each carries.

| Channel | Producer(s) | Audience |
|---|---|---|
| `rfqs` | `RfqBroadcast`, `IndicativePricesRequest`, quote/order lifecycle | Makers. Takers do not subscribe. A taker's own RFQ/quote/order events (`RfqCreated`, `QuoteReceived`, `OrderAccepted`, `SponsoredTxToSign`, `Order*`, `RfqClosed`) are delivered session-addressed regardless of subscription. |
| `trades` | `TradeExecuted` | Public trade tape. Participants also receive their own fills session-addressed. |
| `stats` | `StatsUpdate` | Global venue stats. |
| `chain_events` | `ChainEvent` (position opened / settled / liquidated, market finalized) | Anyone. A taker tracks position outcomes (settlement / liquidation) here. |
| `markets` | `MarketCreated`, `MarketFinalized` | Anyone tracking the tradable market set. |
| `positions` | None (no public producer) | `PositionUpdated` is delivered owner-direct to the maker's session by PDA lookup, not via this channel. The channel yields nothing for takers. |

`TradeExecuted` can be lost, delayed or repeated. Dedupe by `trade.id`. Do not count frames as trades.

## Timeout hierarchy

```
market.expiry_ts
  └─ rfq.expires_at                     # Auction window (no new quotes or accepts after this)
       └─ quote_refresh_lead

quote.valid_until                        # Cryptographic expiry (on-chain enforcement)
  └─ effective_expiry                    # = valid_until - settlement_buffer (server-side trading cutoff)

rfq.signature_deadline
  └─ tx_submit_timeout
```

### `rfq.expires_at` vs `quote.valid_until`

- `rfq.expires_at` is the auction deadline: makers quote and the taker accepts until then. An order already enqueued stays open until it executes or fails.
- `quote.valid_until` is the expiry the maker signs into the order. The program rejects settlement after it.

Set `valid_until` later than `expires_at` to leave time to build, sign and confirm the transaction. The settlement buffer defaults to 90 seconds. Core does not enforce the relationship between the two.

### Recommended `valid_until` range

```
min:  now + min_signature_expiry_seconds          (default 100s)
max:  rfq.expires_at + settlement_buffer_seconds  (recommended upper bound)
hard max: market.expiry_ts
```

Values above the recommended max are accepted up to `market.expiry_ts`. Later values return `QuoteRejected.reason = "market_expired"`.

Example: RFQ with `expires_at = now + 60s`, settlement buffer 90s:

```
valid_until range: [now + 100s, now + 150s]
effective_expiry:  [now + 10s,  now + 60s]
```

### Invariants

- `quote.valid_until >= now + min_signature_expiry_seconds` (default 100s; server rejects shorter expiries)
- `quote.valid_until <= market.expiry_ts` (hard server-side bound)
- `effective_expiry = quote.valid_until - settlement_buffer` (default 90s)
- `rfq.expires_at < market.expiry_ts` (recommended client-side validation)
- `signature_deadline <= min(effective_expiry, rfq.expires_at)`

`signature_deadline` appears in `QuoteSelected` (server -> maker, see [Maker API reference](maker-api.md)) and `SponsoredTxToSign` (server -> taker, see [Taker API reference](taker-api.md)).

## Reconciliation safety

Versioned entities:
- `rfq_version` for RFQ lifecycle progression
- `order_version` for order lifecycle progression

`order_version` is present on order lifecycle pushes, not on `OrderStatus`. Lifecycle precedence uses ranks `accepted = 1`, `submitted = 2`, `failed = 3`, `confirmed = 4`. Confirmation can replace a locally recorded failure. A transition may skip a rank. A replay keeps the same rank.

`GetOrderStatus` returns `state: pending | confirmed { position_pda } | unknown`. `unknown` or a timeout means the outcome is not known yet, not that the order failed. Reconnect reads are not an atomic snapshot.

On the client, apply an update only if `new_version > current_version`. Ignore lower versions. An equal version is a replay.
