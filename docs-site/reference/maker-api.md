# Acta Maker API Reference

## Endpoint

Quote plane:

```
wss://devnet-api.acta.markets/maker
wss://beta-api.acta.markets/maker
```

Data plane:

```
wss://devnet-api.acta.markets/maker/data
wss://beta-api.acta.markets/maker/data
```

Use `/maker` for RFQ subscriptions, quote submission, quote replacement, and
quote cancellation. Use `/maker/data` for private maker reads and recovery
queries such as `GetMyQuotes`, `GetMakerPositions`, `GetMyTrades`, and
`GetMmSummary`. `/maker` also accepts these reads, but a separate data
connection keeps them off the quote connection.

Call `GetMmSummary` after connect, reconnect, manual refresh, detected drift, or a
transaction that produces no owner push. Do not poll it.

## Connection flow

```
Connect -> Hello -> Welcome -> AuthRequest -> AuthChallenge -> AuthSuccess -> Snapshot -> Subscribe -> ...
```

On a fresh connection the server sends `AuthRequest` right after `Welcome`.
Maker endpoints ignore `StartAuth`. A reconnect may send `ResumeAuth` with the
previous maker session ID instead. Resume credentials are bound to the endpoint
role: a maker credential is rejected on the taker endpoint.

`AuthSuccess.expires_at` is the Unix-second deadline for resuming with that
credential. An authenticated connection stays live until disconnect,
replacement, logout, blacklist, or server shutdown.

### Hello (first message)

Protocol constraints:

- Current server protocol: `protocol_version=1.0.0`
- Current server minimum supported version: `min_supported_version=1.0.0`
- `Hello` is the first client message
- `Hello` timeout: `5000ms`
- Version compatibility check is semver-based: client `protocol_version >= min_supported_version`

```json
{
  "type": "Hello",
  "data": {
    "protocol_version": "1.0.0",
    "features": [],
    "client_name": "maker-bot",
    "client_version": "0.1.0"
  }
}
```

### Welcome (server -> client)

```json
{
  "type": "Welcome",
  "data": {
    "protocol_version": "1.0.0",
    "server_version": "0.1.0",
    "min_supported_version": "1.0.0",
    "enabled_features": [],
    "server_time_unix_ms": 1710000000000
  }
}
```

`server_time_unix_ms` is required. Use it for clock skew estimation (see [WS common conventions](ws-common.md)).

If the client's `protocol_version` is incompatible, the server sends `VersionMismatch` instead of `Welcome` and closes the connection.

`features` is opt-in. The server echoes the subset it enabled in `Welcome.enabled_features`. A feature missing from `enabled_features` is not active.

| Feature | Effect |
|---------|--------|
| `quote_expired` | The server sends `QuoteExpired` events instead of expiring quotes silently. |
| `cancel_on_disconnect` | On disconnect (socket close or liveness timeout), Core removes active and retained non-winning quotes owned by that session, including retained quotes in locked RFQs. A session takeover keeps the quotes; cleanup of the replaced connection cannot cancel the new owner's book. Selected quotes (`QuoteSelected`) stay locked and settle or expire on their own timers. Without this feature, resting quotes survive a disconnect and can be filled while the maker is offline. Resume does not restore cancelled quotes. |

### Subscribe

```json
{
  "type": "Subscribe",
  "data": {
    "request_id": "uuid",
    "channels": ["rfqs", "chain_events"],
    "underlying_mints": ["UnderlyingMintBase58"],
    "quote_mints": ["QuoteMintBase58"]
  }
}
```

`request_id` is required. The server responds with `SubscribeAck` echoing the
`request_id` and the channels that were newly added.

`underlying_mints` and `quote_mints` filter market broadcasts. Omitting both preserves the current scope (unrestricted on a fresh session). Providing either replaces both: an omitted peer or an empty list means unrestricted for that dimension. To preserve one dimension while changing the other, send both lists.

### Connection policy defaults

- Auth deadline (after challenge issued): `15s`
- Idle timeout: `90s`
- Server WS ping interval: `30s`
- Max consecutive parse errors before close: `3`
- Inbound message size: `32 KiB`
- Message rate limit per connection: token bucket `30 msg/s` sustained, `60` burst
- Quote rate limit per connection: token bucket `50 quote tokens/s` sustained, `100` burst. Covers `Quote`/`ReplaceQuote`/`BatchQuotes`/`CancelQuote`/`CancelAllQuotes`; `BatchQuotes` costs `max(1, quotes.length)` tokens. Exceeding it is a soft `rate_limited` reject; exceeding the message-rate bucket closes the connection.
- Query rate limit per connection: token bucket `20 query tokens/s` sustained, `40` burst
- `BatchQuotes` hard max: `50` quote elements; cost is `max(1, quotes.length)` quote tokens

### Snapshot (server -> maker)

```json
{
  "type": "Snapshot",
  "data": {
    "markets": [
      {
        "pda": "MarketPdaBase58",
        "underlying": "UnderlyingMintBase58",
        "quote": "QuoteMintBase58",
        "expiry_ts": 1710600000,
        "is_put": false
      }
    ]
  }
}
```

`Snapshot.markets` uses the compact `MarketInfo` shape (`pda`, `underlying`, `quote`, `expiry_ts`, `is_put`), not the `MarketDescriptor` from `RfqBroadcast` (`chain_id`, `program_id`, `market_pda`, `underlying_mint`, `quote_mint`, `collateral_mint`, `settlement_mint`). `GetMarketDescriptors` returns full descriptors.

## Message index

### Client -> Server

- `Hello`, `AuthChallenge`, `Logout`
- `Subscribe`, `Unsubscribe`, `Ping`
- `AddMints`, `RemoveMints`, `AddChannels`, `RemoveChannels`
- `Quote`, `ReplaceQuote`, `BatchQuotes`, `CancelQuote`, `CancelAllQuotes`
- `IndicativePricesResponse`
- `GetOrderStatus`, `GetMyQuotes`, `GetMakerPositions`, `GetMarketsForMaker`, `GetMmSummary`, `GetMyTrades`, `GetTokenCaps`, `GetMyCaps`, `GetSubscriptions`
- `GetActiveRfqs`, `GetMarkets`, `GetMarketDescriptors`, `GetExpiries`, `GetTokens`

### Server -> Maker (direct)

- `Welcome`, `VersionMismatch`, `LogoutSuccess`
- `AuthRequest`, `AuthSuccess`, `AuthError`
- `Snapshot`
- `RfqBroadcast`, `RfqSkipped`
- `QuoteRefreshRequested`, `QuoteAcknowledged`, `QuoteBestStatus`, `QuoteOutbid`, `QuoteSelected`
- `QuoteRejected`, `QuoteFilled`, `QuoteCancelled`, `QuoteExpired`, `RfqAvailableAgain`, `RfqClosed`
- `CancelQuoteAck`, `CancelAllQuotesAck`, `BatchQuotesAck`
- `IndicativePricesRequest`
- `SubscriptionUpdated`
- `Error`, `RequestError`, `Pong`
- `SubscribeAck`, `UnsubscribeAck`

### Server -> Maker (responses / query results)

- `OrderStatus`, `MyQuotes`, `MakerPositions`, `MakerMarkets`, `MmSummary`, `MyTrades`, `TokenCaps`, `MyCaps`, `Subscriptions`
- `ActiveRfqs`, `Markets`, `MarketDescriptors`, `Expiries`, `Tokens`

### Server -> Maker (broadcast if subscribed)

- `TradeExecuted`, `StatsUpdate`, `PositionUpdated`, `ChainEvent`
- `MarketCreated`, `MarketFinalized`

## Quote flow

### RfqBroadcast (server -> maker)

```json
{
  "type": "RfqBroadcast",
  "data": {
    "rfq_id": "uuid",
    "market": {
      "chain_id": 0,
      "program_id": "ProgramIdBase58",
      "market_pda": "MarketPdaBase58",
      "underlying_mint": "UnderlyingMintBase58",
      "quote_mint": "QuoteMintBase58",
      "expiry_ts": 1710600000,
      "is_put": false,
      "collateral_mint": "CollateralMintBase58",
      "settlement_mint": "SettlementMintBase58"
    },
    "position_type": "covered_call",
    "strike": 160000000000,
    "quantity": 1000000000,
    "expires_at": 1710000050,
    "taker": "TakerPubkeyBase58",
    "order_options": [
      {
        "strike": 150000000000
      },
      {
        "strike": 160000000000
      }
    ],
    "sent_at_unix_ms": 1710000000123
  }
}
```

`strike` is the primary strike from the RFQ request. `order_options` lists all quotable strikes, including the primary one. If `order_options` is empty, only `strike` is valid. Any other strike gets `QuoteRejected { reason: "invalid_strike" }`.

### RfqSkipped (server -> maker)

Sent instead of `RfqBroadcast` when cap limits pre-filter the maker. `reason` is a cap error code; full catalog in [CapError](#caperror-in-typed-cap-error-and-rfqskippedreason).

```json
{
  "type": "RfqSkipped",
  "data": {
    "rfq_id": "uuid",
    "market_id": "MarketPdaBase58",
    "quantity": 1000000000,
    "reason": "token_oi_cap_exceeded"
  }
}
```

### Quote (maker -> server)

```json
{
  "type": "Quote",
  "data": {
    "rfq_id": "uuid",
    "strike": 160000000000,
    "price": 50000000,
    "valid_until": 1710000350,
    "nonce": 42,
    "order_id": "0x...64chars",
    "signature": "base58sig"
  }
}
```

Rules:
- `valid_until` >= `now + 100` seconds, otherwise `quote_expiry_too_short`
- `valid_until` <= the market's `expiry_ts`, otherwise `market_expired`
- The server applies a 90-second settlement buffer: the quote is tradable until `valid_until - 90`. Set `valid_until` to `rfq.expires_at + 100` so it stays tradable for the whole auction.
- `order_id = sha256(preimage182)`
- maker signs only 32-byte `order_id`
- if `order_options` is present, strike must be from that set

Before building the preimage, derive the market PDA locally using Solana PDA seeds
`["market", underlying_mint[32], quote_mint[32], expiry_ts_u64_le[8], is_put_u8[1]]`
under the Acta program ID from your deployment configuration. Require chain ID
`0`, that configured program ID, and equality with `market_pda`. Also check that
`position_type` matches `is_put`: collateral/settlement are underlying/quote for
calls and quote/underlying for puts. Do not copy an endpoint-selected program ID
into the derivation. Rust `RfqBinding::from_broadcast` and TS
`buildSignedQuoteFromRfq` run these checks before signing. They do not check
prices or mint decimals.

Canonical `order_id` preimage layout:
- preimage is exactly 182 bytes
- numeric fields use little-endian encoding
- hash is `sha256(preimage)` and serialized as 32-byte `order_id`

Preimage fields (offset, size):
- `0,4` -> `domain_tag` (`"ACTA"`)
- `4,8` -> `chain_id` (`u64`, current value `0` for Solana)
- `12,32` -> `program_id` (bytes)
- `44,1` -> `is_taker_buy` (`u8`, current flow uses `0`)
- `45,1` -> `position_type` (`u8`, `0=covered_call`, `1=cash_secured_put`)
- `46,32` -> `market` (bytes)
- `78,8` -> `strike` (`u64`)
- `86,8` -> `quantity` (`u64`)
- `94,8` -> `gross_price` (`u64`)
- `102,8` -> `valid_until` (`u64`, unix seconds)
- `110,32` -> `maker` (bytes)
- `142,32` -> `taker` (bytes)
- `174,8` -> `nonce` (`u64`)

### ReplaceQuote (maker -> server)

Atomically replaces the quote `old_order_id` with a new one. The old quote is removed only if the new quote passes validation (caps, signature, `valid_until`). Otherwise it stays active.

```json
{
  "type": "ReplaceQuote",
  "data": {
    "old_order_id": "0x...64chars",
    "rfq_id": "uuid",
    "strike": 160000000000,
    "price": 55000000,
    "valid_until": 1710000350,
    "nonce": 43,
    "order_id": "0x...new64chars",
    "signature": "base58sig"
  }
}
```

Server responds with `QuoteAcknowledged` (with `replaced_order_id`) on success, or `QuoteRejected` / `Error` on failure.

Errors:
- `QuoteRejected` with standard reasons (`invalid_strike`, `cap_exceeded`, etc.): new quote failed validation; old quote remains active
- `Error { type: "QuoteLocked" }`: old quote is locked in `PendingSignature`/`Enqueued` (cannot replace)
- `Error { type: "QuoteNotFound" }`: `old_order_id` not found (race: already cancelled/expired)

### BatchQuotes (maker -> server)

Up to `ws.max_batch_quotes` quotes per message (default 50). Each quote element costs one quote-rate-limit token; an empty batch costs one. Each quote is validated like a standalone `Quote`, and partial success is allowed. The server replies with one `BatchQuotesAck` whose `results[]` has one entry (`QuoteAcknowledged` or a `QuoteRejected` reason) per quote that reached quote-level validation. Correlate results by `order_id`, not by position: a quote rejected before the kernel (bad signature, expired, unregistered maker) is reported as an inline error and may be missing from `results[]`. For an implicit same-strike replacement, the batched `QuoteAcknowledged` has `replaced_order_id` null; the per-quote `QuoteAcknowledged` event carries it.

```json
{
  "type": "BatchQuotes",
  "data": {
    "quotes": [
      {
        "rfq_id": "uuid-1",
        "strike": 150000000000,
        "price": 45000000,
        "valid_until": 1710000350,
        "nonce": 42,
        "order_id": "0x...64chars-a",
        "signature": "base58sig-a"
      },
      {
        "rfq_id": "uuid-2",
        "strike": 160000000000,
        "price": 50000000,
        "valid_until": 1710000350,
        "nonce": 43,
        "order_id": "0x...64chars-b",
        "signature": "base58sig-b"
      }
    ]
  }
}
```

Each entry in `quotes` has the `Quote` schema. Quotes are processed in order; a rejected quote does not block the rest.

### QuoteRejected (server -> maker)

`QuoteRejected` reports a quote validation failure with a typed `reason`.

```json
{
  "type": "QuoteRejected",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "reason": "invalid_strike",
    "message": "optional detail"
  }
}
```

`message` is optional. A cap rejection carries the failing dimension inside the
reason instead of a bare string:

```json
{
  "type": "QuoteRejected",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "reason": { "cap_exceeded": { "maker_position_cap_exceeded": { "current": 3, "limit": 3 } } },
    "message": "Maker position cap exceeded (3/3)"
  }
}
```

The value under `cap_exceeded` is a `CapError`: a bare string for
`caps_unavailable`, otherwise an object keyed by the cap code (see
[Capacity limits](caps.md) for the codes and amounts).

### QuoteRejectReason

| Value | Meaning |
|-------|---------|
| `invalid_strike` | Strike not in `order_options` set |
| `market_expired` | Target market has expired |
| `quote_expiry_too_short` | `valid_until` below minimum |
| `invalid_signature` | Maker signature verification failed |
| `maker_not_registered` | Maker not found in on-chain registry |
| `order_id_mismatch` | `order_id` does not match `sha256(preimage)` |
| `{ "cap_exceeded": CapError }` | Platform or maker cap limit exceeded; the failing dimension with `current`/`limit` is the payload |
| `rfq_not_found` | RFQ does not exist |
| `rfq_not_active` | RFQ is no longer accepting quotes |
| `duplicate_order_id` | `order_id` already submitted |

### QuoteRefreshRequested (server -> maker)

```json
{
  "type": "QuoteRefreshRequested",
  "data": {
    "rfq_id": "uuid",
    "strike": 160000000000,
    "min_valid_until": 1710000350,
    "reason": "expiring_soon"
  }
}
```

Keyed by `(rfq_id, strike)`, not `order_id`. With several strikes per RFQ, keep a local `(rfq_id, strike) -> order_id` map.

`min_valid_until` includes the settlement buffer and refresh margin. The refreshed quote needs `valid_until >= min_valid_until`.

### QuoteSelected (server -> maker)

```json
{
  "type": "QuoteSelected",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "taker": "TakerPubkeyBase58",
    "price": 50000000,
    "quantity": 1000000000,
    "strike": 160000000000,
    "signature_deadline": 1710000040
  }
}
```

### QuoteFilled (server -> maker)

```json
{
  "type": "QuoteFilled",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "taker": "TakerPubkeyBase58",
    "price": 50000000,
    "quantity": 1000000000,
    "strike": 160000000000,
    "position_pda": "PositionPdaBase58",
    "tx_signature": "5eyk...base58sig",
    "filled_at": 1710000042
  }
}
```

`QuoteFilled` carries fill details for the winning maker. `RfqClosed` is the terminal RFQ event.

On a fill:
- the winning maker receives `QuoteFilled`, then `RfqClosed`
- the taker receives `OrderConfirmed`, then `RfqClosed`
- drop RFQ state only on `RfqClosed`

### QuoteAcknowledged (server -> maker)

```json
{
  "type": "QuoteAcknowledged",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "replaced_order_id": "0x...64chars"
  }
}
```

`replaced_order_id` is set when the quote replaced your previous quote on the same (rfq, strike). Omitted when `null`.

### QuoteBestStatus (server -> maker)

```json
{
  "type": "QuoteBestStatus",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "is_best": true,
    "current_best_price": 50000000
  }
}
```

`is_best`: whether your quote is currently the highest premium.
`current_best_price`: the best price on the RFQ, possibly another maker's. Omitted when `null`.

### QuoteOutbid (server -> maker)

```json
{
  "type": "QuoteOutbid",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "your_price": 50000000,
    "current_best_price": 55000000
  }
}
```

`your_price`: your current quote price.
`current_best_price`: the new best price. Omitted when `null`.

### QuoteExpired (server -> maker)

Sent only if `"quote_expired"` is in both `Hello.features` and `Welcome.enabled_features`.

```json
{
  "type": "QuoteExpired",
  "data": {
    "rfq_id": "uuid",
    "order_id": "0x...64chars",
    "reason": "valid_until_passed"
  }
}
```

### QuoteCancelled (server -> maker)

```json
{
  "type": "QuoteCancelled",
  "data": {
    "rfq_id": "uuid",
    "order_ids": ["0x...64chars"],
    "reason": "requested",
    "cancelled_at": 1710000025
  }
}
```

`reason` values: `requested` (maker requested), `risk_check` (server-side risk), `rfq_accepted` (RFQ accepted another quote), `maker_disconnected` (COD session disconnected; this event goes to the closed session, so after reconnecting see `GetMyQuotes`).

### RfqClosed (server -> maker)

```json
{
  "type": "RfqClosed",
  "data": {
    "rfq_id": "uuid",
    "rfq_version": 3,
    "reason": "filled",
    "your_quote": {
      "order_id": "0x...64chars",
      "status": "outbid",
      "price": 50000000
    },
    "winner": {
      "maker": "WinnerMakerPubkeyBase58",
      "price": 55000000,
      "tx_signature": "5eyk...base58sig"
    },
    "closed_at": 1710000042
  }
}
```

`reason` values: `expired`, `taker_cancelled`, `filled`, `market_expired`, `ladder_timeout`.

`your_quote`: present if you had an active quote on this RFQ. `your_quote.status` values: `expired`, `outbid`, `cancelled`, `filled`.

`winner`: present when the RFQ was filled. `winner.tx_signature` is `null` until the transaction confirms.

### RfqAvailableAgain (server -> maker)

```json
{
  "type": "RfqAvailableAgain",
  "data": {
    "rfq_id": "uuid",
    "rfq_version": 2,
    "reason": "signature_timeout",
    "available_again_at": 1710000045
  }
}
```

Sent when a locked RFQ reopens for quotes, e.g. the taker did not sign in time.

`reason` values: `signature_timeout`, `tx_failed`, `tx_build_failed`.

### VersionMismatch (server -> maker)

Sent instead of `Welcome` when the client's `protocol_version` is not compatible.

```json
{
  "type": "VersionMismatch",
  "data": {
    "requested_version": "2.0.0",
    "server_version": "1.0.0",
    "min_supported_version": "1.0.0",
    "message": "Client version 2.0.0 is not supported"
  }
}
```

Connection is closed after this message.

## Quote management

### CancelQuote (maker -> server)

```json
{
  "type": "CancelQuote",
  "data": {
    "rfq_id": "uuid",
    "request_id": "uuid"
  }
}
```

Cancels all of this connection's active quotes on the RFQ, across all strikes. There is no per-`order_id` cancel. After Core applies it, the server replies with `CancelQuoteAck { request_id, rfq_id, cancelled_order_ids }` or a correlated `RequestError` (e.g. `RfqNotFound`, `RfqNotActive`, `QuoteLocked`). `QuoteCancelled` is a lifecycle event, not the receipt.

### CancelQuoteAck (server -> maker)

```json
{
  "type": "CancelQuoteAck",
  "data": {
    "request_id": "uuid",
    "rfq_id": "uuid",
    "cancelled_order_ids": ["0x...64chars"]
  }
}
```

On an Active RFQ an empty list means the connection had no quote there. `PendingSignature` and `Enqueued` reject single-RFQ cancellation as a whole with `QuoteLocked`, even for a non-winning maker.

### CancelAllQuotes (maker -> server)

```json
{
  "type": "CancelAllQuotes",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58"
  }
}
```

`market` is optional and limits cancellation to that market. CancelAll removes this connection's active and retained non-winning quotes, including those in locked RFQs. Removed retained quotes do not return on rollback. Selected (awaiting signature) and executing orders are kept. COD does the same cleanup on disconnect. Neither blocks new quotes afterwards.

Server replies with `CancelAllQuotesAck` after Core applies the cancellation. An invalid `market` returns `RequestError` with `InvalidMarket` and cancels nothing.

### CancelAllQuotesAck (server -> maker)

```json
{
  "type": "CancelAllQuotesAck",
  "data": {
    "request_id": "uuid",
    "cancelled_count": 0,
    "cancelled_order_ids": []
  }
}
```

`cancelled_count` equals `cancelled_order_ids.length`.

Quote, batch, replace and cancel commands from one connection run in FIFO order: commands sent before a cancel run first, and commands sent after it can create new quotes.

If the connection drops before the ACK, the outcome is unknown. Do not replay the command automatically.

### Dynamic subscription management

Change subscriptions incrementally:

```json
{ "type": "AddMints", "data": { "request_id": "uuid", "underlying_mints": ["MintBase58"], "quote_mints": ["MintBase58"] } }
{ "type": "RemoveMints", "data": { "request_id": "uuid", "underlying_mints": ["MintBase58"] } }
{ "type": "AddChannels", "data": { "request_id": "uuid", "channels": ["trades"] } }
{ "type": "RemoveChannels", "data": { "request_id": "uuid", "channels": ["stats"] } }
```

All four respond with `SubscriptionUpdated` with the current state:

```json
{
  "type": "SubscriptionUpdated",
  "data": {
    "request_id": "uuid",
    "channels": ["rfqs", "trades"],
    "underlying_mints": ["MintBase58"]
  }
}
```

In subscription responses, an omitted mint list means that dimension is unfiltered. In requests, omission/null preserves the current filter and an empty list clears it.

### Unsubscribe (maker -> server)

```json
{
  "type": "Unsubscribe",
  "data": {
    "request_id": "uuid",
    "channels": ["trades"]
  }
}
```

Server responds with `UnsubscribeAck` echoing `request_id` and the removed channels.

### Ping (maker -> server)

```json
{ "type": "Ping" }
```

Unit variant, no `data` field. Server responds with `Pong`.

## Discovery

### Discovery requests

All discovery requests require `request_id` (UUID), echoed in the response. Send maker-private and recovery reads on `/maker/data`. Send `GetSubscriptions` on `/maker`, since it reports quote-plane subscriptions.

```json
{ "type": "GetMyQuotes", "data": { "request_id": "uuid", "scope": "live" } }
{ "type": "GetOrderStatus", "data": { "request_id": "uuid", "order_id": "0x...64chars" } }
{ "type": "GetMakerPositions", "data": { "request_id": "uuid" } }
{ "type": "GetMarketsForMaker", "data": { "request_id": "uuid" } }
{ "type": "GetMmSummary", "data": { "request_id": "uuid" } }
{ "type": "GetSubscriptions", "data": { "request_id": "uuid" } }
{ "type": "GetActiveRfqs", "data": { "request_id": "uuid" } }
{ "type": "GetMyTrades", "data": { "request_id": "uuid" } }
{ "type": "GetTokenCaps", "data": { "request_id": "uuid" } }
{ "type": "GetMyCaps", "data": { "request_id": "uuid" } }
{ "type": "GetMarketDescriptors", "data": { "request_id": "uuid", "active_only": true } }
{ "type": "GetExpiries", "data": { "request_id": "uuid" } }
{ "type": "GetTokens", "data": { "request_id": "uuid", "active_only": true } }
```

`active_only` behavior:
- default is `true` when omitted (wire default for `GetMarketDescriptors`, `GetTokens`)
- `GetMyQuotes` requires `scope: "live"` or `scope: "history"`; it has no `active_only` field. Live is the complete, unpaged Core set of this owner's unfinished quotes across connections, including retained and selected quotes. If a source is missing or incomplete, it returns an error, not a partial set.
- History contains only persisted historical rows. `limit` defaults to 200 and is capped at 1000. Pass `cursor` (last row's `created_at`, Unix seconds) with `cursor_id` (hex `order_id`), both or neither. Stop when `has_more` is false.
- for `GetMarketDescriptors`/`GetTokens`, `active_only=true` means tradable markets: not finalized, not disabled, and before the pre-expiry trading cutoff; `active_only=false` returns all markets/tokens.
- `GetExpiries` has no `active_only` field. It returns the tradable set (same predicate as above).
- `GetMarketsForMaker` uses the wider active set (non-finalized, non-disabled, `expiry_ts > now`), so it still lists a market during its final pre-expiry no-trade window.

Optional filters for `GetMakerPositions`:

```json
{
  "type": "GetMakerPositions",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "underlying_mint": "MintBase58",
    "status": ["open"],
    "min_expiry_ts": 1710000000,
    "limit": 100
  }
}
```

All filter fields are optional. `limit` defaults to `100` and is clamped to `[1, 500]`.
Paging is described under [MakerPositions payload](#makerpositions-payload). Do not poll it.

Optional filters for `GetMarketsForMaker`:

```json
{
  "type": "GetMarketsForMaker",
  "data": {
    "request_id": "uuid",
    "underlying_mints": ["MintBase58"],
    "quote_mints": ["MintBase58"],
    "min_expiry_ts": 1710000000,
    "max_expiry_ts": 1711000000,
    "is_put": false,
    "include_stats": true
  }
}
```

All filter fields are optional. `include_stats` defaults to `false`.
The request has no result cap. Do not poll it.

### Markets payload

```json
{
  "type": "Markets",
  "data": {
    "request_id": "uuid",
    "markets": [
      {
        "pda": "MarketPdaBase58",
        "underlying": "UnderlyingMintBase58",
        "quote": "QuoteMintBase58",
        "expiry_ts": 1710600000,
        "is_put": false
      }
    ]
  }
}
```

Same compact `MarketInfo` shape as `Snapshot.markets`.

### Expiries payload

```json
{
  "type": "Expiries",
  "data": {
    "request_id": "uuid",
    "expiries_ts": [1710600000, 1711200000]
  }
}
```

List of all distinct market expiry timestamps (Unix seconds).

### MarketDescriptorInfo (from `MarketDescriptors`)

```typescript
type MarketDescriptor = {
  chain_id: number;
  program_id: string;
  market_pda: string;
  underlying_mint: string;
  quote_mint: string;
  expiry_ts: number;
  is_put: boolean;
  collateral_mint: string;
  settlement_mint: string;
};

type MarketDescriptorInfo = {
  market: MarketDescriptor;
  underlying_oracle_pda: string;
  quote_oracle_pda: string;
  underlying_decimals: number;
  quote_decimals: number;
  size_rule: {
    min_size: number;
    max_size: number;
    step: number;
  };
  underlying_symbol: string;
  quote_symbol: string;
};
```

### MakerPositions payload

`MakerPositions` returns `MakerPositionInfo[]`:

```json
{
  "type": "MakerPositions",
  "data": {
    "request_id": "uuid",
    "positions": [
      {
        "pda": "PositionPdaBase58",
        "market": "MarketPdaBase58",
        "underlying_mint": "UnderlyingMintBase58",
        "underlying_symbol": "SOL",
        "underlying_decimals": 9,
        "quote_mint": "QuoteMintBase58",
        "quote_symbol": "USDC",
        "quote_decimals": 6,
        "position_type": "covered_call",
        "status": "open",
        "strike": 160000000000,
        "quantity": 1000000000,
        "price": 50000000,
        "total_premium": 123456789,
        "created_at": 1710000042,
        "expiry_ts": 1710600000
      }
    ],
    "has_more": false
  }
}
```

`has_more`: `true` when the result was truncated at `limit` (default 100, max 500). To page with the keyset cursor, pass `cursor` (the last row's `created_at`, unix seconds) with `cursor_id` (its `pda`), both or neither. Ordering is per second with `pda` as the tie-break. Stop when `has_more` is `false`.

`status` values: `none`, `open`, `funded`, `liquidated`, `settled` (see [PositionStatus](#positionstatus)).

`reconciliation_status` is normally omitted. During lifecycle repair the server
may expose `orphan_pending` or `orphaned_closed` while retaining public
`status = "settled"`.

`is_otm` is `null` for open/funded positions. Set to `true` (out-of-the-money) or `false` (in-the-money) after settlement or liquidation. Omitted from the wire when `null`.

`settlement_price` is the on-chain settlement price (1e9 scale) for `settled`/`liquidated` positions. Omitted from the wire when `null`.

Field semantics:
- `underlying_symbol` / `quote_symbol` / `underlying_decimals` / `quote_decimals`: pre-resolved token metadata so the maker does not need a separate `GetTokens` lookup
- `price`: gross premium per 1 underlying unit (1e9 scale)
- `total_premium`: net premium amount from on-chain position state (quote atomic units)
- all amount fields are unsigned (`u64`); timestamps remain Unix seconds

### MyQuotes payload

```json
{
  "type": "MyQuotes",
  "data": {
    "request_id": "uuid",
    "has_more": false,
    "quotes": [{
      "rfq_id": "uuid",
      "order_id": "0x...64chars",
      "market": "MarketPdaBase58",
      "underlying_mint": "UnderlyingMintBase58",
      "underlying_symbol": "SOL",
      "underlying_decimals": 9,
      "quote_mint": "QuoteMintBase58",
      "quote_symbol": "USDC",
      "quote_decimals": 6,
      "strike": 160000000000,
      "price": 50000000,
      "quantity": 1000000000,
      "valid_until": 1710000350,
      "state": { "type": "active", "rank": "best", "rfq_version": 1 },
      "created_at": 1710000010
    }]
  }
}
```

| `state.type` | Fields | Meaning |
|---|---|---|
| `active` | `rank` (`best` or `outbid`), `rfq_version` | In the active book. |
| `retained` | `rfq_version` | Non-selectable quote: a locked non-winner or a frozen refresh quote. Can return on rollback or requote unless removed. |
| `awaiting_signature` | `rfq_version` | Selected quote awaiting the taker signature. |
| `executing` | `rfq_version` | Selected by the taker; the trade is pending. |
| `historical` | `status` | History only (persisted projection). |

Historical `status` is one of `submitted`, `filled`, `cancelled`, `replaced`, `expired`, `lost`. There is no top-level `status` or `selected`. `has_more` is required and is false for Live.

```json
{ "type": "GetMyQuotes", "data": { "request_id": "uuid", "scope": "history", "limit": 200 } }
```

A History row uses the same identity/amount fields with, for example, `"state": { "type": "historical", "status": "filled" }`. Live and History never mix in one response.

### GetOrderStatus / OrderStatus

```json
{ "type": "GetOrderStatus", "data": { "request_id": "uuid", "order_id": "0x...64chars" } }
{ "type": "OrderStatus", "data": { "request_id": "uuid", "order_id": "0x...64chars", "state": { "type": "pending" } } }
```

Available to the authenticated owner on `/maker`, `/maker/data`, and `/taker`; makers should use `/maker/data`. `state` is `pending`, `confirmed` (with `position_pda`), or `unknown`, encoded as a tagged object. See the shared [execution lookup contract](taker-api.md#orderstatus-server---taker).

After a lost ACK the outcome is unknown. An empty Live response, a missing position, a timeout, or `unknown` does not mean the order did not execute. Keep it as pending across reconnects. Lookup failures return `RequestError` with the request ID.

### MakerMarkets payload

```json
{
  "type": "MakerMarkets",
  "data": {
    "request_id": "uuid",
    "markets": [
      {
        "market_pda": "MarketPdaBase58",
        "underlying_mint": "UnderlyingMintBase58",
        "quote_mint": "QuoteMintBase58",
        "expiry_ts": 1710600000,
        "is_put": false,
        "is_finalized": false,
        "underlying_symbol": "SOL",
        "quote_symbol": "USDC"
      }
    ]
  }
}
```

`stats` is present when requested via `include_stats: true` in `GetMarketsForMaker`.

### MmSummary payload

`MmSummary` returns caps, positions, active quotes, markets and token metadata. Request it on `/maker/data` at startup or recovery. It costs one query token.

```json
{
  "type": "MmSummary",
  "data": {
    "request_id": "uuid",
    "maker_pda": "MakerPdaBase58",
    "caps": {
      "request_id": "uuid",
      "positions": { "current": 5, "limit": 100 },
      "notional": [
        {
          "underlying_mint": "UnderlyingMintBase58",
          "symbol": "SOL",
          "current": 50000000000,
          "limit": 200000000000
        }
      ],
      "balances": [
        {
          "mint": "QuoteMintBase58",
          "symbol": "USDC",
          "decimals": 6,
          "deposited": 1000000000,
          "committed": 500000000,
          "available": 500000000
        }
      ]
    },
    "positions": [],
    "active_quotes": [],
    "markets": [],
    "tokens": [],
    "computed_at": 1710000042,
    "positions_has_more": false
  }
}
```

Field semantics:
- `maker_pda`: on-chain maker account PDA (base58)
- `caps`: same shape as the [`MyCaps`](#mycaps-payload) response (echoes `request_id` from `GetMmSummary`)
- `positions`: `MakerPositionInfo[]`; see [MakerPositions payload](#makerpositions-payload)
- `active_quotes`: `MakerQuoteInfo[]`; see [MyQuotes payload](#myquotes-payload)
- `markets`: `MakerMarketInfo[]`; see [MakerMarkets payload](#makermarkets-payload)
- `tokens`: `TokenInfo[]`; see [Tokens payload](taker-api.md#tokens-payload)
- `computed_at`: server-side snapshot timestamp (Unix seconds)
- `positions_has_more`: `true` when the embedded `positions` were capped at 500. Page the rest with `GetMakerPositions` (see [MakerPositions payload](#makerpositions-payload)). The rest of the snapshot is complete.

Balances are in token atomic units; format with `decimals` from `caps.balances`.

### ActiveRfqs payload

```json
{
  "type": "ActiveRfqs",
  "data": {
    "request_id": "uuid",
    "rfqs": [
      {
        "rfq_id": "uuid",
        "market": "MarketPdaBase58",
        "taker": "TakerPubkeyBase58",
        "position_type": "covered_call",
        "strike": 160000000000,
        "quantity": 1000000000,
        "expires_at": 1710000050,
        "quotes_count": 3,
        "best_price": 55000000,
        "order_options": [{ "strike": 150000000000 }, { "strike": 160000000000 }]
      }
    ]
  }
}
```

`best_price` is `null` until the first quote.

### GetMyTrades (maker -> server)

```json
{
  "type": "GetMyTrades",
  "data": {
    "request_id": "uuid",
    "limit": 50,
    "cursor": 1710000042,
    "cursor_id": "uuid",
    "market": "MarketPdaBase58"
  }
}
```

All fields except `request_id` are optional.

- `limit`: max trades to return (server-defined default, usually 50).
- `cursor` / `cursor_id`: keyset cursor, the last trade's `confirmed_at` and `id`. Exclusive: returns older trades.
- `market`: filter by market PDA.

### MyTrades payload

```json
{
  "type": "MyTrades",
  "data": {
    "request_id": "uuid",
    "trades": [
      {
        "id": "uuid",
        "rfq_id": "uuid",
        "market_pda": "MarketPdaBase58",
        "underlying_mint": "UnderlyingMintBase58",
        "underlying_symbol": "SOL",
        "underlying_decimals": 9,
        "quote_mint": "QuoteMintBase58",
        "quote_symbol": "USDC",
        "quote_decimals": 6,
        "position_type": "covered_call",
        "taker": "TakerPubkeyBase58",
        "strike": 160000000000,
        "quantity": 1000000000,
        "price": 50000000,
        "tx_signature": "5eyk...base58sig",
        "position_pda": "PositionPdaBase58",
        "confirmed_at": 1710000042
      }
    ],
    "has_more": true
  }
}
```

Field semantics:
- `price`: gross premium per 1 underlying unit (1e9 scale)
- `confirmed_at`: Unix timestamp seconds when the trade was confirmed on-chain
- `tx_signature` is present, `position_pda` may be `null`
- `has_more`: `true` if more trades follow this page

`MyTrades` returns confirmed trades only, so the cursor is stable. In-flight orders show up in `GetOrderStatus` and order pushes.

### TokenCaps payload

Platform-level OI and notional caps. Full schema (fields, unlimited semantics, `include_markets` behavior): [Capacity limits](caps.md#platform-caps).

### MyCaps payload

Per-maker position count, notional, and balance caps. Full schema (fields, `decimals` rendering, unlimited semantics): [Capacity limits](caps.md#maker-caps).

### Subscriptions payload

```json
{
  "type": "Subscriptions",
  "data": {
    "request_id": "uuid",
    "channels": ["rfqs", "chain_events"]
  }
}
```

Subscription responses omit mint lists when unfiltered; filtered lists contain base58 mint addresses.

## Broadcast events

Received when subscribed to the corresponding channel.

### TradeExecuted (channel: `trades`)

```json
{
  "type": "TradeExecuted",
  "data": {
    "trade": {
      "id": "uuid",
      "market": "MarketPdaBase58",
      "position_type": "covered_call",
      "strike": 160000000000,
      "quantity": 1000000000,
      "price": 50000000,
      "taker": "TakerPubkeyBase58",
      "maker": "MakerPubkeyBase58",
      "tx_signature": "5eyk...base58sig",
      "executed_at": 1710000042
    }
  }
}
```

### StatsUpdate (channel: `stats`)

```json
{
  "type": "StatsUpdate",
  "data": {
    "stats": {
      "usd": { "notional_24h": "1500.00", "premium_24h": "49.00", "priced_trades_24h": 149 },
      "total_volume_24h": 1000000,
      "total_trades_24h": 150,
      "total_price_24h": 500000,
      "active_markets": 12,
      "active_makers": 5,
      "active_rfqs": 3
    }
  }
}
```

`stats.usd` holds exact decimal USD strings for underlying notional and gross
premium. Only confirmed orders with a captured oracle valuation count;
compare `priced_trades_24h` with `total_trades_24h` for coverage. Older servers omit
this object. The legacy numeric volume/price fields are not dollars and stick at
the last representable value after overflow; use `stats.usd`.

### PositionUpdated (owner-only push)

`PositionUpdated` is delivered directly to the session of the maker that owns the position. It is not broadcast to public channel subscribers, even though `positions` appears in the channel list. After a fill, positions move through `open` -> `funded` -> `settled` or `liquidated`. See [Protocol Flow](protocol-flow.md).

```json
{
  "type": "PositionUpdated",
  "data": {
    "position": {
      "pda": "PositionPdaBase58",
      "market": "MarketPdaBase58",
      "underlying_mint": "UnderlyingMintBase58",
      "quote_mint": "QuoteMintBase58",
      "position_type": "covered_call",
      "status": "funded",
      "strike": 160000000000,
      "quantity": 1000000000,
      "price": 50000000,
      "total_premium": 123456789,
      "created_at": 1710000042,
      "expiry_ts": 1710600000
    },
    "update_type": "funded",
    "caps_snapshot": {
      "positions": { "current": 6, "limit": 100 },
      "notional": [
        {
          "underlying_mint": "UnderlyingMintBase58",
          "symbol": "SOL",
          "current": 51000000000,
          "limit": 200000000000
        }
      ],
      "balances": [
        {
          "mint": "QuoteMintBase58",
          "symbol": "USDC",
          "decimals": 6,
          "deposited": 1000000000,
          "committed": 550000000,
          "available": 450000000
        }
      ]
    }
  }
}
```

The type admits `created`, `funded`, `liquidated`, `settled`, but the server only sends `funded`. For fills and settlement use `GetMyCaps`, position queries, or `ChainEvent`.

`caps_snapshot` is the maker's caps after this update, in the shape of `caps` in [`MmSummary`](#mmsummary-payload) without the inner `request_id`.


### MarketCreated (channel: `markets`)

```json
{
  "type": "MarketCreated",
  "data": {
    "pda": "MarketPdaBase58",
    "underlying": "UnderlyingMintBase58",
    "quote": "QuoteMintBase58",
    "expiry_ts": 1710600000,
    "is_put": false
  }
}
```

### MarketFinalized (channel: `markets`)

```json
{
  "type": "MarketFinalized",
  "data": {
    "market_pda": "MarketPdaBase58",
    "settlement_price": 160000000000
  }
}
```

### ChainEvent (channel: `chain_events`)

`ChainEvent` is internally tagged: `event_type` inside `data` names the variant, and its fields sit flat next to `event_type`.

```json
{
  "type": "ChainEvent",
  "data": {
    "event_type": "PositionOpened",
    "signature": "5eyk...base58sig",
    "slot": 250000000,
    "market": "MarketPdaBase58",
    "maker": "MakerPubkeyBase58",
    "taker": "TakerPubkeyBase58",
    "position_type": "covered_call",
    "strike": 160000000000,
    "quantity": 1000000000,
    "price": 50000000,
    "order_id": "0x...64chars",
    "instruction_index": 0
  }
}
```

Variants:

| `event_type` | Additional fields |
|--------|-------------------|
| `PositionOpened` | `market`, `maker`, `taker`, `position_type`, `strike`, `quantity`, `price`, `order_id` |
| `MarketCreated` | `market`, `underlying_mint`, `quote_mint`, `expiry_ts`, `is_put` |
| `MarketFinalized` | `market`, `settlement_price` |
| `MakerRegistered` | `owner`, `maker_pda`, `quote_signing` |
| `PositionSettled` | `position` |
| `PositionLiquidated` | `position` |

All variants require `signature` (tx signature, base58), `instruction_index` (instruction coordinate) and `slot` (Solana slot number). Deduplicate by `(signature, instruction_index)`; one transaction may contain multiple events.

## Delivery and recovery

Critical messages are `PositionUpdated`, `TradeExecuted`, `RfqBroadcast` and maker quote-lifecycle events. If one cannot be delivered under backpressure, the server closes the connection. Non-critical broadcasts such as `StatsUpdate` can be dropped without closing it.

On every (re)connect read `GetMmSummary`, `GetActiveRfqs` and `GetMyQuotes { scope: Live }`, and query `GetOrderStatus` for pending orders. The managed Rust SDK requires all three reads before `Ready`. They mix Core live state and DB projections, so they are not one atomic snapshot. `ActiveRfqs` supplies each RFQ's taker and market PDA for the quote preimage.

The wire has no replay cursor or sequence number; missed events are not replayed. Order updates by entity version. SDK receiver sequence gaps are local to the SDK.

After a missing push or an interrupted transaction, read positions and trades with `GetMmSummary`, `GetMakerPositions` and `GetMyTrades`. If `positions_has_more` is `true`, page the rest with `GetMakerPositions` (see [MakerPositions payload](#makerpositions-payload)).

## Indicative pricing workflow

### Request from taker-side cache (server -> maker)

```json
{
  "type": "IndicativePricesRequest",
  "data": {
    "request_id": "uuid",
    "market": {
      "chain_id": 0,
      "program_id": "ProgramIdBase58",
      "market_pda": "MarketPdaBase58",
      "underlying_mint": "UnderlyingMintBase58",
      "quote_mint": "QuoteMintBase58",
      "expiry_ts": 1710600000,
      "is_put": false,
      "collateral_mint": "CollateralMintBase58",
      "settlement_mint": "SettlementMintBase58"
    },
    "position_type": "covered_call",
    "strikes": [150000000000, 160000000000]
  }
}
```

### Response (maker -> server)

```json
{
  "type": "IndicativePricesResponse",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "position_type": "covered_call",
    "prices": [{ "strike": 150000000000, "price": 42000000 }]
  }
}
```

## Errors

Two error message types: `Error` (connection-level) and `RequestError` (request-correlated).
See [WS common conventions](ws-common.md) "Error format" for the envelope.

Parsing rule for maker integrations:

1. Handle `RequestError` where you pass `request_id` (e.g. query requests, `Subscribe`).
2. Handle `Error` for connection-level failures (auth, WS errors, unknown request).
3. For both, switch on `ServerError.type`.
4. If `type == "Generic"`, switch on `data.code`.
5. Keep fallback handling for unknown `generic.code`.

Maker `ServerError` variants (PascalCase on the wire):
- `RfqNotFound`, `RfqNotActive`
- `QuoteNotFound`, `QuoteExpired`, `QuoteLocked`
- `InvalidStrike`, `InvalidValidUntil`, `OrderIdMismatch`, `QuoteExpiryTooShort`
- `SignatureTimeout`
- `OracleNotReady`, `OraclePriceNotReady`, `OraclePriceStale`
- `InvalidPositionType`, `InvalidMarket`
- `MarketMetadataIncomplete`, `TokenMetadataIncomplete`
- `Cap` (position, notional, or balance cap exceeded)
- `RateLimit` (data is a plain string reason code)
- `DbDisabled` (DB unavailable for query)
- `KernelNotAvailable`
- `ServerShuttingDown`
- `Unauthenticated`, `Unauthorized`

Quote-specific validation failures are sent as `QuoteRejected` with a typed `reason`. See the `QuoteRejected` section above for its variants.

Common `Generic` variant `code` values in maker/runtime flows (non-exhaustive; match on `code`):
- Connection / handshake: `hello_required`, `hello_timeout`, `hello_already_sent`, `session_replaced`, `session_expired`, `already_authenticated`
- Limits / codec: `rate_limited`, `message_too_large`, `batch_quotes_too_large`, `parse_error`, `too_many_parse_errors`
- Maker / registration: `maker_not_registered`, `invalid_maker_signature`
- Market / server: `trading_paused`, `internal_error`

Handling:
- `rate_limited`: quote and query bucket rejects are soft (connection stays open); a message-rate breach closes the connection.
- `session_replaced`: another connection took over this session. Do not auto-reconnect in a loop.
- `parse_error`: payload bug; the same payload fails again.
- `too_many_parse_errors`: the connection is closed; fix the codec before reconnecting.

## Enums reference

### RfqCloseReason

| Value | Meaning |
|-------|---------|
| `expired` | RFQ expired without fill |
| `taker_cancelled` | Taker cancelled the RFQ |
| `filled` | RFQ was filled on-chain |
| `market_expired` | The underlying market expired |
| `ladder_timeout` | Ladder execution timeout |

### QuoteFinalStatus (in `RfqClosed.your_quote.status`)

| Value | Meaning |
|-------|---------|
| `expired` | Quote expired before selection |
| `outbid` | Another maker won |
| `cancelled` | Quote was cancelled |
| `filled` | This quote was selected and filled |

### QuoteCancelReason (in `QuoteCancelled.reason`)

| Value | Meaning |
|-------|---------|
| `requested` | Maker requested cancellation |
| `risk_check` | Server-side risk check triggered |
| `rfq_accepted` | RFQ accepted another quote |
| `maker_disconnected` | Session had `cancel_on_disconnect` enabled and disconnected |

### RfqAvailableAgainReason

| Value | Meaning |
|-------|---------|
| `signature_timeout` | Taker did not sign in time |
| `tx_failed` | On-chain transaction failed |
| `tx_build_failed` | Transaction could not be built |

When `reason = "tx_build_failed"`, a corresponding `Error` or `RequestError` is also sent to
the taker with `generic.code = "tx_build_failed"` and a `message` field
describing what went wrong.

### QuoteStatus (in `MyQuotes` response)

| Value | Meaning |
|-------|---------|
| `pending` | Quote submitted, awaiting acknowledgment |
| `best` | Currently the best quote |
| `outbid` | Outbid by another maker |
| `filled` | Quote was filled |
| `expired` | Quote expired |

### PositionStatus

Discriminant values for `MakerPositionInfo.status`:

| Value | Meaning |
|-------|---------|
| `none` | Reserved/uninitialized; should not appear on the wire for live positions. |
| `open` | Position created on-chain but maker has not yet escrowed settlement asset. |
| `funded` | Maker called `DepositFundsToPosition`. Settlement asset is escrowed. |
| `liquidated` | Unfunded ITM position seized by a third-party liquidator. |
| `settled` | Position settled at expiry; assets distributed per ITM/OTM outcome. |

Position status is a lowercase snake_case string on the wire.

### PositionUpdateType (in `PositionUpdated`)

| Value | Meaning |
|-------|---------|
| `created` | Position opened on-chain. Taker collateral locked, premium paid to taker. |
| `funded` | Maker called `DepositFundsToPosition`. Settlement asset escrowed. |
| `liquidated` | Unfunded ITM position liquidated by a third party. |
| `settled` | Position settled at expiry. Assets distributed per ITM/OTM outcome. |

State transitions: `created` -> `funded` -> `settled` or `liquidated`.
An unfunded position (`created`) can also be `settled` if OTM, or `liquidated` if ITM.

See [Protocol Flow](protocol-flow.md) for all four scenarios.

### RateLimitReason (in typed `rate_limit` error)

| Value | Meaning |
|-------|---------|
| `too_many_active_rfqs_total` | Platform-wide RFQ limit reached |
| `too_many_active_rfqs_per_taker` | Per-taker active RFQ limit reached |
| `too_many_quotes_per_rfq` | Max quotes per RFQ reached |
| `too_many_sessions_per_user` | Too many concurrent sessions |

### CapError (in typed `cap` error and `RfqSkipped.reason`)

Full variant catalog (`token_oi_cap_exceeded`, `market_oi_cap_exceeded`, `maker_position_cap_exceeded`, `maker_notional_cap_exceeded`, `maker_insufficient_balance`, `quote_notional_cap_exceeded`, `maker_quote_notional_cap_exceeded`) with fields and rejection semantics: [Capacity limits](caps.md#caperror-variants).

## Quirks and constraints

### Multiple quotes per RFQ

Each strike in `order_options` can be quoted separately, each with its own `order_id` and `nonce`. A new quote on the same `(rfq_id, strike)` replaces your previous one; `QuoteAcknowledged.replaced_order_id` names it. Across all makers, `max_quotes_per_rfq` is 50.

### `order_options` validation

If `order_options` is set, `strike` must be one of them; otherwise `invalid_strike`.

### Subscribe / Unsubscribe

Both require a `request_id`. The ack carries only the channels added or removed by this call; `GetSubscriptions` returns the full set.

### Sessions and disconnects

One quote connection per maker pubkey; the data connection is separate. A new quote connection replaces the old one, which gets `Error { generic.code = "session_replaced" }` and is closed.

A resumed session keeps its server-side routing and mint scope. After fresh auth, subscribe again. Omitted or null mint fields leave the saved scope unchanged; empty lists clear the mint filters. The managed SDK resubscribes after either path and sends both mint lists.

### Max message size

32 KB inbound. Larger messages are rejected with `generic.code = "message_too_large"`.

### Nonce

`nonce` is a `u64` in the order-id preimage. The server does not check nonce uniqueness, only that `sha256(preimage)` matches `order_id`.

### `order_id` hex

Accepted with or without `0x` prefix; case-insensitive. Must decode to exactly 32 bytes.

### Message ordering after auth

After `AuthSuccess`, the server sends `Snapshot` before any broadcast event.

### `is_taker_buy`

In the order-id preimage, `is_taker_buy` is `0`.

### `gross_price` in preimage

`gross_price` at preimage offset 94 equals `price` in `Quote`: gross premium per underlying unit, 1e9 scale. `total_premium` in position data is the net amount from on-chain state and cannot be derived from `price` alone. The fee model in [WS common conventions](ws-common.md) defines gross and net.
