# Acta Taker API Reference

WebSocket protocol reference for taker clients.

## Endpoint

```
wss://{host}/ws/taker
```

## Current contract

This page is the external wire reference for taker integration.
All examples and field definitions here are self-contained.

Shared wire conventions: `ws-common.md`.

## Planned (not implemented)

- Global `request_id` correlation for every command is not implemented yet.
- Current protocol uses `request_id` for query/response style operations.

---

## Connection Flow

```
Connect -> Hello -> Welcome -> (optional StartAuth for taker) -> AuthRequest -> AuthChallenge -> AuthSuccess -> Snapshot -> Subscribe -> ...
```

### Protocol version and handshake constraints

- Current server protocol: `protocol_version=1.0.0`
- Current server minimum supported version: `min_supported_version=1.0.0`
- `Hello` MUST be the first client message
- `Hello` timeout: `5000ms`
- If a client sends non-`Hello` first, server closes with `hello_required` / `hello_timeout`

### Connection policy defaults

- `auth_deadline`: `15s` (after auth challenge was issued)
- `idle_timeout`: `90s`
- server WS ping interval: `30s`
- server liveness check interval: `1s`
- max consecutive parse errors before close: `3`

### Taker auth lifecycle

- Taker auth is lazy by design: `StartAuth` can be sent immediately after `Welcome` or later.
- `Snapshot` is sent after `AuthSuccess`.

### StartAuth / AuthChallenge

```json
{ "type": "StartAuth", "data": { "pubkey": "WalletPubkeyBase58" } }
```

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "sign-me",
    "signature": "base58sig",
    "pubkey": "WalletPubkeyBase58"
  }
}
```

### Subscribe

```json
{
  "type": "Subscribe",
  "data": {
    "channels": ["markets", "trades", "stats"],
    "markets": ["MarketPdaBase58"]
  }
}
```

No `request_id` in `SubscribeData` for current protocol.

### Snapshot (server -> taker)

```json
{
  "type": "Snapshot",
  "data": {
    "stats": {
      "total_volume_24h": 0,
      "total_trades_24h": 0,
      "total_price_24h": 0,
      "active_markets": 1,
      "active_makers": 0,
      "active_rfqs": 0
    },
    "active_rfqs": [],
    "positions": [],
    "recent_trades": [],
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

Current snapshot payload does not include `my_active_rfqs` / `my_pending_orders`.

---

## Message Index

### Client -> Server

- `Hello`, `StartAuth`, `AuthChallenge`
- `Subscribe`, `Unsubscribe`, `Ping`
- `RfqRequest`, `AcceptQuote`, `CancelRfq`, `SubmitSignedSponsoredTx`
- `GetIndicativePrices`
- `GetMarkets`, `GetMarketDescriptors`, `GetExpiries`, `GetTokens`
- `GetPositions`, `GetMyActiveRfqs`, `GetOrderStatus`, `GetSubscriptions`

### Server -> Taker (direct)

- `Welcome`, `VersionMismatch`
- `AuthRequest`, `AuthSuccess`, `AuthError`
- `Snapshot`
- `RfqCreated`, `QuoteReceived`
- `SponsoredTxToSign`, `OrderAccepted`, `OrderSubmitted`, `OrderConfirmed`, `OrderFailed`
- `RfqAvailableAgain`, `RfqClosed`
- `IndicativePrices`
- `Error`, `Pong`

### Server -> Taker (responses / query results)

- `Markets`, `MarketDescriptors`, `Expiries`, `Tokens`
- `Positions`, `MyActiveRfqs`, `OrderStatus`, `Subscriptions`

### Server -> Taker (broadcast if subscribed)

- `TradeExecuted`, `StatsUpdate`, `PositionUpdated`, `ChainEvent`
- `MarketCreated`, `MarketFinalized`

---

## RFQ Flow

### RfqRequest (taker -> server)

```json
{
  "type": "RfqRequest",
  "data": {
    "market": "MarketPdaBase58",
    "position_type": "cash_secured_put",
    "strike": 136000000000,
    "quantity": 20000000,
    "timeout_seconds": 30,
    "client_request_id": "optional-uuid"
  }
}
```

`client_request_id` is optional and used for idempotent RFQ creation.

### RfqCreated (server -> taker)

```json
{
  "type": "RfqCreated",
  "data": {
    "rfq_id": "uuid",
    "rfq_version": 1,
    "client_request_id": "optional-uuid",
    "expires_at": 1710000030,
    "created_at": 1710000000,
    "order_options": [{ "strike": 136000000000 }]
  }
}
```

### QuoteReceived (server -> taker)

```json
{
  "type": "QuoteReceived",
  "data": {
    "rfq_id": "uuid",
    "strike": 136000000000,
    "maker": "MakerOwnerPubkeyBase58",
    "price": 50000000,
    "valid_until": 1710000020,
    "nonce": 42,
    "order_id": "0x...64chars"
  }
}
```

### AcceptQuote (taker -> server)

```json
{
  "type": "AcceptQuote",
  "data": {
    "rfq_id": "uuid",
    "maker": "MakerOwnerPubkeyBase58",
    "order_id": "0x...64chars"
  }
}
```

### SponsoredTxToSign (server -> taker)

```json
{
  "type": "SponsoredTxToSign",
  "data": {
    "order_id": "0x...64chars",
    "tx_base64": "...",
    "signature_deadline": 1710000040
  }
}
```

### SubmitSignedSponsoredTx (taker -> server)

```json
{
  "type": "SubmitSignedSponsoredTx",
  "data": {
    "order_id": "0x...64chars",
    "tx_base64": "..."
  }
}
```

### OrderStatus (server -> taker)

```json
{
  "type": "OrderStatus",
  "data": {
    "request_id": "uuid",
    "order_id": "0x...64chars",
    "status": "submitted",
    "rfq_id": "uuid",
    "tx_signature": "5eyk...base58sig",
    "position_pda": "PositionPdaBase58",
    "error_reason": null
  }
}
```

`order_version` is not part of `OrderStatusMessage` in current wire schema.

### Terminal semantics: OrderConfirmed vs RfqClosed

- `OrderConfirmed` is the order-level confirmation event: the selected order is confirmed and includes
  on-chain identifiers such as `tx_signature` and `position_pda`.
- `RfqClosed` is the terminal RFQ event: the RFQ is finished and must be
  treated as closed for further quoting/accept actions.
- In successful fill flow, takers receive `OrderConfirmed` followed by `RfqClosed`
  in close succession.
- `RfqClosed.your_quote` / `RfqClosed.winner` are optional fields and may be omitted.

---

## Discovery

Current taker discovery requests:

```json
{ "type": "GetMarkets", "data": { "request_id": "uuid" } }
{ "type": "GetMarketDescriptors", "data": { "request_id": "uuid", "active_only": true } }
{ "type": "GetExpiries", "data": { "request_id": "uuid" } }
{ "type": "GetTokens", "data": { "request_id": "uuid", "active_only": true } }
{ "type": "GetPositions", "data": { "request_id": "uuid" } }
{ "type": "GetMyActiveRfqs", "data": { "request_id": "uuid" } }
{ "type": "GetOrderStatus", "data": { "request_id": "uuid", "order_id": "0x...64chars" } }
{ "type": "GetSubscriptions", "data": { "request_id": "uuid" } }
{ "type": "GetIndicativePrices", "data": { "request_id": "uuid", "market": "MarketPdaBase58", "position_type": "covered_call" } }
```

`request_id` is required for these query-style requests in current wire types.

Query-style responses echo the same `request_id`:

- `Markets`, `MarketDescriptors`, `Expiries`, `Tokens`
- `Positions`, `MyActiveRfqs`, `OrderStatus`, `Subscriptions`
- `IndicativePrices`

`active_only` behavior:
- default is `true` when omitted (wire default for `GetMarketDescriptors`, `GetTokens`)
- for `GetMarketDescriptors`/`GetTokens`, `active_only=true` means non-finalized markets with `expiry_ts > now`; `active_only=false` returns all markets/tokens

### MarketDescriptors payload

`MarketDescriptors` returns `MarketDescriptorInfo[]`:

```typescript
type MarketDescriptorInfo = {
  market: {
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
  underlying_oracle_pda: string;
  quote_oracle_pda: string;
  underlying_decimals: number;
  quote_decimals: number;
  underlying_symbol?: string;
  quote_symbol?: string;
};
```

---

## Indicative Prices

### GetIndicativePrices (taker -> server)

```json
{
  "type": "GetIndicativePrices",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "position_type": "covered_call"
  }
}
```

### IndicativePrices (server -> taker)

```json
{
  "type": "IndicativePrices",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "position_type": "covered_call",
    "updated_at": 1710000000,
    "is_stale": false,
    "strikes": [
      { "strike": 450000000000, "best_price": 5000000 },
      { "strike": 460000000000, "best_price": null }
    ]
  }
}
```

---

## Authentication requirements

### Does not require auth

- `GetMarkets`
- `GetMarketDescriptors`
- `GetExpiries`
- `GetTokens`
- `GetIndicativePrices`
- `GetSubscriptions`

### Requires auth

- `GetPositions`
- `GetMyActiveRfqs`
- `GetOrderStatus`
- `RfqRequest`, `AcceptQuote`, `CancelRfq`, `SubmitSignedSponsoredTx`
- `Subscribe`, `Unsubscribe`

---

## Errors

`Error` payload is variant-tagged `ServerError` (see `ws-common.md`).

Client parsing rule for taker integrations:

1. Switch on `Error.data.type`.
2. If `type == "generic"`, switch on `Error.data.data.code`.
3. Keep fallback handling for unknown `generic.code`.

Common typed variants:
- `rfq_not_found`, `rfq_not_active`
- `quote_not_found`, `quote_expired`
- `signature_timeout`
- `invalid_position_type`, `invalid_market`
- `oracle_not_ready`, `oracle_price_not_ready`, `oracle_price_stale`
- `market_metadata_incomplete`, `token_metadata_incomplete`
- `server_shutting_down`
- `unauthenticated`, `unauthorized`

Common `generic.code` values in taker flows:
- `rfq_not_found`, `quote_not_found`, `quote_expired`, `quote_refresh_required`
- `rate_limited`
- `hello_required`, `hello_timeout`, `hello_already_sent`
- `message_too_large`, `parse_error`, `too_many_parse_errors`
- `internal_error`

---

## Related

- Taker TS SDK quickstart: `../quickstart/web-client-ts-sdk.md`
- Shared WS conventions: `ws-common.md`
