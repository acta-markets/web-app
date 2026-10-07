# Acta Maker Quickstart

A maker authenticates over WebSocket, subscribes to RFQs, quotes them and tracks fills. Rust users can start from the [Rust maker SDK](maker-rust-sdk.md).

## Connection and authentication

The first message from the client is `Hello`. The server accepts any `protocol_version` `>= min_supported_version`; otherwise it replies with `VersionMismatch` and closes the connection. `features` is opt-in. `quote_expired` makes the server send `QuoteExpired` instead of expiring quotes silently. `cancel_on_disconnect` cancels the session's open quotes when the connection ends; without it, resting quotes stay live while the maker is offline. `Welcome.enabled_features` lists what the server accepted.

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

The server responds with `Welcome` (`server_time_unix_ms` is for clock sync), then `AuthRequest` with a challenge string. Validate the whole [canonical auth challenge](../reference/ws-common.md#what-to-sign), then sign its original UTF-8 bytes with `quote_signing`, base58-encode the signature, and reply with `AuthChallenge`:

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "<from AuthRequest>",
    "signature": "<base58 ed25519 signature>",
    "pubkey": "<maker_owner pubkey, base58>"
  }
}
```

`pubkey` is the on-chain `maker_owner` wallet, not the `quote_signing` key. The server looks up the signing key registered for `maker_owner` and verifies against it. Auth must finish within 15 seconds of the challenge. By default three failed attempts are allowed; the fourth closes the connection.

## Subscription

A resumed session keeps its server-side routing and mint scope. After fresh auth, subscribe again. Omitted or null mint fields leave the saved scope unchanged; empty lists clear the mint filters. The managed SDK resubscribes in both cases and sends both mint lists.

```json
{
  "type": "Subscribe",
  "data": {
    "request_id": "<uuid>",
    "channels": ["rfqs", "chain_events"],
    "underlying_mints": [],
    "quote_mints": []
  }
}
```

`request_id` (UUID) is required. The server echoes it in `SubscribeAck`.

`AddMints`, `RemoveMints`, `AddChannels` and `RemoveChannels` change subscriptions incrementally. Each returns `SubscriptionUpdated` with the current state.

## Quoting

On `RfqBroadcast`, check the [market PDA and terms](../reference/maker-api.md#quote-flow) against your Acta program. Pick a strike from `rfq.strike` or `rfq.order_options` and compute the premium. Set `now + 100s <= valid_until <= market.expiry_ts`. Build the 182-byte order preimage (Quote rules in the [Maker API reference](../reference/maker-api.md)) and hash it to `order_id`. Sign the 32-byte hash with `quote_signing` and send `Quote`:

```json
{
  "type": "Quote",
  "data": {
    "rfq_id": "...",
    "strike": 160000000000,
    "price": 50000000,
    "valid_until": 1710000350,
    "nonce": 42,
    "order_id": "0x<64 hex>",
    "signature": "<base58 of ed25519(order_id)>"
  }
}
```

For an RFQ with several strikes, send one `Quote` per strike, or batch them in `BatchQuotes`. Each quote needs its own `order_id` and `nonce`. A new quote on the same `(rfq_id, strike)` replaces the previous one.

Reprice with `ReplaceQuote`, which is one atomic round trip. `CancelQuote` followed by `Quote` leaves a gap in the book and costs an extra round trip.

`is_taker_buy` in the order-id preimage is `0` because the taker is the option writer. `1` fails preimage validation. If your preimage builder defaults it to `true`, override it.

`QuoteRejected` carries `reason`. Resending the same payload fails again.

## Lifecycle events

Lifecycle events are keyed by `order_id`. `RfqClosed` is the terminal RFQ event. `QuoteFilled` carries fill details and is followed by `RfqClosed`.

| Event | Description |
|---|---|
| `QuoteAcknowledged` | Server accepted the quote. On a replace, includes `replaced_order_id`. |
| `QuoteRejected` | Server refused the quote. See `reason`. |
| `QuoteBestStatus` | Quote is currently the best in the book. |
| `QuoteOutbid` | Quote has been displaced by a better one. |
| `QuoteRefreshRequested` | Settlement-buffer cutoff is approaching; resubmit with `valid_until ≥ min_valid_until` before the cutoff. |
| `QuoteSelected` | Quote locked; awaiting the taker signature. |
| `QuoteFilled` | Position opened on-chain. Carries `position_pda` and `tx_signature`. |
| `QuoteCancelled` | Terminal. `reason` ∈ {`requested`, `risk_check`, `rfq_accepted`, `maker_disconnected`}. |
| `QuoteExpired` | Emitted only when `quote_expired` was enabled in `Hello`. |
| `RfqAvailableAgain` | Settlement reverted; the auction has reopened. The maker may re-quote with a fresh `order_id`. |
| `RfqClosed` | Terminal RFQ event. Drop per-RFQ state. |

## On-chain responsibilities

Quoting and the events above are off-chain. On-chain, a maker only moves funds:

- `DepositPremium` deposits program quote balance. Do this before quoting, since the fill's premium debit draws from it. `WithdrawPremium` takes idle balance back.
- `DepositFundsToPosition` is optional. After a fill it funds the settlement leg (`open` → `funded`) so the position cannot be liquidated as ITM-unfunded.

Makers do not settle or liquidate. The operator publishes the settlement price and finalizes markets. A keeper settles. Anyone can liquidate an ITM-unfunded position, and the liquidator fronts the taker payout. The risk model is in [Options and settlement](../reference/protocol-flow.md).

## Indicative pricing

If the account is enrolled in pre-trade pricing, the server periodically sends `IndicativePricesRequest` for reference prices shown in the taker UI. Indicative quotes are non-binding and have a tighter latency budget than auction quotes. Match the response by `request_id`:

```json
{
  "type": "IndicativePricesResponse",
  "data": {
    "request_id": "<from request>",
    "market": "<market PDA, base58>",
    "position_type": "covered_call",
    "prices": [
      { "strike": 150000000000, "price": 45000000 },
      { "strike": 160000000000, "price": 50000000 }
    ]
  }
}
```

## Reconnection

Cancel-on-disconnect (COD) is active when `cancel_on_disconnect` is in both `Hello.features` and `Welcome.enabled_features`. On disconnect, Core removes the connection's active and retained non-winning quotes. Selected and executing orders stay. Without COD, resting quotes stay fillable while you are offline. The server does not replay events missed while disconnected. In-flight events may arrive again after recovery; dedupe by `order_id`.

After reauthentication, read state on `/maker/data` and subscribe on `/maker`:

```json
{ "type": "GetMyQuotes",       "data": { "request_id": "...", "scope": "live" } }
{ "type": "GetActiveRfqs",     "data": { "request_id": "..." } }
{ "type": "GetMakerPositions", "data": { "request_id": "..." } }
{ "type": "GetMyTrades",       "data": { "request_id": "..." } }
```

`GetMyQuotes { scope: "live" }` returns the full unpaged owner set, including retained, selected, and executing quotes. `scope: "history"` returns paginated rows from the database. If the ACK for an order was lost, check `GetOrderStatus`. An empty live response does not tell you the order is gone. `GetMyTrades` pages with `cursor` and `cursor_id` and takes a `market` filter. Details are in the [Maker API reference](../reference/maker-api.md).

For a dashboard bootstrap, send `GetMmSummary` on `/maker/data` after auth or reconnect. Do not poll it.

## Discovery

Fetch static metadata on `/maker/data` at startup and again when markets or tokens change. Do not poll.

```json
{ "type": "GetMarketDescriptors", "data": { "request_id": "...", "active_only": true } }
{ "type": "GetExpiries",          "data": { "request_id": "..." } }
{ "type": "GetTokens",            "data": { "request_id": "...", "active_only": true } }
{ "type": "GetMarketsForMaker",   "data": { "request_id": "..." } }
```

`active_only: true` returns tradable markets (not finalized, not disabled, before the pre-expiry trading cutoff); `false` also returns settled and expired markets.

## Operational defaults

| Topic | Recommendation |
|---|---|
| Application Ping | Approximately every 30 seconds. Each `Pong` carries an updated `server_time_unix_ms`. |
| Reconnect backoff | Exponential with jitter, e.g. 250 ms initial, 5 s cap, ±20%. |
| `valid_until` margin | `rfq.expires_at + 100s` plus a little slack, capped at `market.expiry_ts`. Values below `now + 100s` or after market expiry are rejected. Longer values only widen your exposure. |
| Clock skew | Track `offset = server_time − local_time` from `Welcome` and `Pong`. Apply it to `valid_until`. |
| Quote concurrency | One active quote per `(rfq_id, strike)`. Repricing via `ReplaceQuote`. |
| Message rate | `30 msg/s` sustained, `60` burst per WebSocket connection. |
| Query rate | `20 query tokens/s` sustained, `40` burst per WebSocket connection. |
| Message size | `32 KiB` inbound WS message limit. |
| Batch quotes | Hard max `50` quote elements; cost is `max(1, quotes.length)` quote tokens. |

The server sends WebSocket protocol pings every 30 seconds and closes idle connections after 90 seconds. Your WebSocket library has to answer protocol pings.

See also: [Endpoints and maker registration](../reference/sandbox.md), [Maker wire examples](maker-wire-examples.md).
