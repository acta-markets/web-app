# Acta Rust Maker SDK

[`acta-maker-sdk`](https://crates.io/crates/acta-maker-sdk) is the Rust client for the maker WebSocket protocol. It handles auth, reconnects, request/response matching and quote state tracking.

The managed client owns the connection, re-authentication, subscription replay, recovery reads, and the message receiver. `WsClient` is the raw client for tests, recorded sessions, or custom auth.

Runnable examples are in [github.com/acta-markets/rust-maker-sdk](https://github.com/acta-markets/rust-maker-sdk).

## Installation

```toml
[dependencies]
acta-maker-sdk = { version = "0.4.3", features = ["ws-client"] }
```

Vault operators use the `/vault` session described in [Managing a vault](../protocol/vault-owner.md).

Quote-only integrations need `ws-client`. `chain` adds Solana instruction builders. `chain-rpc` adds on-chain reads.

## Connection

The code runs inside an async function returning `Result`. Inputs: `url: String`, `hello: HelloData`, `subscribe_data: SubscribeData`, `maker_owner: [u8; 32]`, and `quote_signing_secret: [u8; 32]`. The signing key must be registered under that maker owner.

```rust
use acta_maker_sdk::{BytesSigner, encode_base58};
use acta_maker_sdk::ws::managed::{ManagedWsConfig, MakerWsEndpoint, spawn_managed_ws};
use std::sync::Arc;

let signer = Arc::new(BytesSigner::from_secret(quote_signing_secret));
let maker_owner_base58 = encode_base58(&maker_owner);

let quote_config = ManagedWsConfig::new(url.clone(), hello.clone(), signer.clone())
    .with_auth_pubkey(maker_owner_base58.clone())
    .with_cancel_on_disconnect(true)
    .low_latency()
    .with_initial_subscribe(subscribe_data);

let quote_handle = spawn_managed_ws(quote_config)?;
let mut messages = quote_handle.subscribe_messages(); // Consume recovery before quoting.

let data_config = ManagedWsConfig::new(url, hello, signer.clone())
    .with_auth_pubkey(maker_owner_base58)
    .with_endpoint(MakerWsEndpoint::Data);

let data_handle = spawn_managed_ws(data_config)?;
```

`url` accepts `http(s)://` and `ws(s)://` interchangeably. The default endpoint appends `/maker`; `with_endpoint(MakerWsEndpoint::Data)` appends `/maker/data`. `hello` carries the protocol version (use `WS_PROTOCOL_VERSION`), opt-in `features`, and `client_name` / `client_version` strings.

The signer is an `Arc<dyn SignerLike + Send + Sync>` and signs the auth challenge; `.with_auth_pubkey(...)` names the maker owner. Use the same owner in `QuoteBuilder::maker_owner`. `ManagedWsConfig::new_async` takes an `AsyncSignerLike` for HSM- or KMS-backed keys. `BytesSigner` holds an ed25519 keypair in memory and zeroes it on drop.

The managed quote client requests cancel-on-disconnect (COD) by default. On disconnect the server cancels the connection's active and retained non-winning quotes. Selected and executing orders stay. To turn COD off, set `.with_cancel_on_disconnect(false)` and leave `cancel_on_disconnect` out of `HelloData.features`. The setter keeps features you added by hand. The data client does not add COD. If a required feature is missing from `Welcome.enabled_features`, the session ends with `FeatureUnsupported`.

`low_latency()` uses 2 s ping/pong deadlines, a 1 s write timeout and larger buffers. The default gap policy is `EndpointDefault`: reconnect on inbound gaps for Quote, report them to the caller for Data. `low_latency()` selects `Reconnect` on either endpoint.

`Ready` requires successful `GetMmSummary`, `GetActiveRfqs` and `GetMyQuotes { scope: Live }`. The quote endpoint first syncs its subscription target with the server and waits for the acks. `initial_subscribe` seeds that target. Its `request_id` is not sent. Recovery uses fresh request IDs. Later subscription changes update the target once acknowledged.

Resume can restore a server-side mint scope. The SDK sends both mint lists, including empty ones, to replace it with its local target. `Ready` carries the connection epoch whose recovery reads completed. Apply those reads and your open orders before quoting again. The reads are not one atomic snapshot.

## Quoting

Keep the applied `recovery_epoch: u64` with the strategy state and build quotes from `RfqBroadcast`. `RfqBinding` checks the market PDA and terms under the configured Acta program before deriving the preimage and wire message. For another deployment use `from_broadcast_for_program` with a program ID from your own config, not one taken from the RFQ:

```rust
use acta_maker_sdk::{AtomicNonceGenerator, Nonce, Price, QuoteExpiry, RfqBinding};
use acta_maker_sdk::ws::types::ClientMessage;

static NONCE_GEN: AtomicNonceGenerator = AtomicNonceGenerator::new();

// `rfq` is the current borrowed RfqBroadcastMessage; `price` is your premium.
// Choose `valid_until: QuoteExpiry` within the market and settlement deadlines.
let quote = RfqBinding::from_broadcast(rfq)?
    .quote()
    .maker_owner(maker_owner)
    .price(Price::new(price))
    .valid_until(valid_until)
    .nonce(Nonce::new(NONCE_GEN.next_u64()?))
    .sign(signer.as_ref())?;

quote_handle.send_in_epoch(ClientMessage::Quote(quote), recovery_epoch).await?;
```

`QuoteExpiry` stores whole Unix seconds; build it with `QuoteExpiry::from_unix_seconds(...)` or `QuoteExpiry::after(...)`. `RfqBinding` can also pick a permitted strike from `order_options`. The [`managed_quote` example](https://github.com/acta-markets/rust-maker-sdk/blob/main/examples/managed_quote.rs) shows recovery, epoch checks and gap handling.

`send_in_epoch` rejects if the connection has changed. Pass the epoch whose recovery you applied, not the latest transport epoch.

Constraints:

- `now + 100s ≤ valid_until ≤ market.expiry_ts`. The last 90s are reserved for settlement, so trading ends at `valid_until − 90s`. Use `rfq.expires_at + 100s` plus a little slack, capped at market expiry.
- `is_taker_buy` is `false` because the taker is the option writer. `true` produces an `order_id` the server rejects.
- Use a fresh nonce and order ID per quote. The server checks the hash-bound order ID, not nonce uniqueness. `AtomicNonceGenerator` can be a `static`.

## Quote lifecycle

Lifecycle events arrive on the managed receiver with a connection epoch and sequence. Key local state by order ID and RFQ/order version.

| Event | Meaning |
|---|---|
| `QuoteAcknowledged` | Server accepted the quote. On a replace, includes `replaced_order_id`. |
| `QuoteRejected` | Refused. See `reason`. Resending the same payload fails again. |
| `QuoteBestStatus` / `QuoteOutbid` | Current book position. |
| `QuoteRefreshRequested` | Settlement-buffer cutoff approaching. Resubmit with `valid_until ≥ min_valid_until`. |
| `QuoteSelected` | Quote locked; awaiting the taker signature. |
| `QuoteFilled` | Position opened on-chain. Carries `position_pda` and `tx_signature`. |
| `QuoteCancelled` | Removes only the listed `order_ids`. An empty list removes nothing. Not an ACK for a cancel command. |
| `QuoteExpired` | Emitted only when `quote_expired` was opted into via `Hello`. |
| `RfqAvailableAgain` | Settlement reverted; re-quote with a fresh `order_id`. |
| `RfqClosed` | Closes the auction. Selected or executing orders are tracked separately. |

Use `ReplaceQuote` to change a quote. The old quote stays live until the replacement validates.

```rust
quote_handle.send_in_epoch(ClientMessage::ReplaceQuote(ReplaceQuoteMessage {
    old_order_id,
    rfq_id, strike, price, valid_until, nonce, order_id, signature,
}), recovery_epoch).await?;
```

Build the preimage as for a fresh `Quote`, with a new `nonce` and `order_id`. The server confirms with `QuoteAcknowledged { replaced_order_id: Some(old_order_id) }`. Events for `old_order_id` can arrive until then.

## Querying state

`handle.send_await(msg, timeout)` correlates request and response via `request_id` and returns `Arc<ServerMessage>`. Supported response shapes:

- `GetMyQuotes`, `GetMyTrades`, `GetMakerPositions`, `GetMmSummary`, `GetOrderStatus`: maker state, best sent on the data handle
- `GetActiveRfqs`, `GetMarketsForMaker`, `GetMarketDescriptors`: recovery and instrument metadata, best sent on the data handle
- `GetSubscriptions`: quote-plane session view
- `GetTokenCaps`, `GetMyCaps`: risk and per-maker limits

`send_await` also supports `Quote` / `ReplaceQuote` (by `order_id`), batches (by their order IDs), and subscription/cancellation commands (by `request_id`). `CancelQuote` waits for `CancelQuoteAck`, not `QuoteCancelled`. A correlated protocol error is returned as the response. Commands with no correlation key return `SendAwaitError::NoCorrelationKey`.

`MakerQuoteClient` exposes trading operations and `MakerDataClient::request` returns the request's typed payload. Raw `ManagedWsHandle::send_await` returns `Arc<ServerMessage>` and you match the response variant yourself.

`AddMints`, `RemoveMints`, `AddChannels` and `RemoveChannels` change subscriptions incrementally. Each returns `SubscriptionUpdated` with the current state.

Query bounds:

| Query | Default rows | Cap |
|---|---|---|
| `GetMyQuotes { scope: History }` | `200` | `1000` |
| `GetMyTrades` | `50` | `200` |
| `GetMakerPositions` | `100` | `500` |

`GetMakerPositions` sets `has_more` on truncation. All three page with a keyset cursor. Pass `cursor` and `cursor_id` together or not at all. `cursor` is the unix seconds of the last row (`created_at` for quotes and positions, `confirmed_at` for trades). `cursor_id` is the last row's hex `order_id`, `pda` or trade `id`. Rows are ordered by second with the id as tie-break. Stop when `has_more` is `false`. `GetMyQuotes { scope: Live }` is complete and unpaged. Use it, not History, for recovery. `GetMarketsForMaker` supports filters and has no result cap. Do not poll these. The WebSocket query bucket is `20` query tokens per second with a burst of `40`.

## Reconnection

The SDK reconnects by default. First handshake: TCP up -> `Hello` -> `Welcome` + server-issued `AuthRequest` -> challenge signed by `quote_signing` -> `AuthChallenge(maker_owner, signature)` -> authenticated -> subscription acknowledgement and recovery reads -> ready. If no challenge is pending, the SDK sends `StartAuth(maker_owner)`, which maker endpoints ignore. After a disconnect it sends `Hello` and tries `ResumeAuth` with the last session ID; `session_expired` clears that ID and falls back to the full signed-challenge flow on the same connection. Backoff is 250 ms initial, 5 s cap, +/-20% jitter.

`ManagedWsConfig` sets `connect_timeout`, `max_reconnect_attempts` (`0` means unlimited) and `reconnect_jitter_ratio`. The session closes when attempts run out.

Trading commands are bound to a connection epoch and are not replayed after reconnect. Typed calls return `NotReady` until `Ready`. Raw reads made before `Ready` are not part of recovery.

The writer sends Quote, BatchQuotes, ReplaceQuote, CancelQuote and CancelAllQuotes in FIFO order. Ping and authentication use a separate control lane.

`write_timeout` covers one socket write, not queueing or Core execution.

A receiver that falls behind gets `ManagedReceiveError::Gap`. The gap policy decides whether the session reconnects. If an acknowledgment is lost, query `GetOrderStatus`, and query again while it returns `unknown`.

The server does not replay missed events. Lifecycle events can repeat. Dedupe by order ID and entity version.

## Indicative pricing

If the account is enrolled in pre-trade pricing, the server sends `IndicativePricesRequest`. Reply with `IndicativePricesResponse` matched by `request_id`. Indicative quotes are non-binding and have a tighter latency budget than auction quotes.

## Errors

`NotReady` means there is no ready connection epoch. `SubscriptionPending` means a subscription change is still awaiting its ack.

| Error | Meaning |
|---|---|
| `WsClientError` | Transport failure. The reconnection loop retries. |
| `ManagedWsError::Closed` | The connection task has stopped. |
| `ManagedWsError::QueueFull` | The outbound queue or writer lane is full. |
| `SendAwaitError::Timeout` | The `send_await` deadline elapsed. |
| `Disconnected` | The connection dropped before the response. |
| `QueueFull` | The request was never queued to the socket. |

Terminal session states arrive through `subscribe_state()` as `Closed { reason }`: `SessionReplaced`, `ProtocolVersionMismatch`, `AuthenticationRejected`, `ReconnectLimitReached`, `FeatureUnsupported`, `SessionPanicked`.

Protocol-level errors arrive as `ServerMessage::Error` (session-level) or `ServerMessage::RequestError` (per-request, correlated by `request_id`). Variants (`AuthError`, `QuoteError`, `CapError`, `RfqError`) are exhaustive enums. The full list is in the [Maker API reference](../reference/maker-api.md).

## Low-level WsClient

The [`hello_auth` example](https://github.com/acta-markets/rust-maker-sdk/blob/main/examples/hello_auth.rs) shows the Hello, challenge and subscription sequence by hand. You supply request IDs yourself.

Convenience methods exist for every `ClientMessage` variant. `WsClient` does not reconnect, re-authenticate, or queue outbound messages.

## Reference

- [Maker API reference](../reference/maker-api.md): messages and error variants
- [Maker quickstart](maker-quickstart.md): the same flow in JSON
- [Maker wire examples](maker-wire-examples.md): request and response payloads
- [WebSocket conventions](../reference/ws-common.md): units, envelopes, error codes
- [Capacity limits](../reference/caps.md): risk and quoting limits
- [Integration FAQ](../reference/faq.md)
