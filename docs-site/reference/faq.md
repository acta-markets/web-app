# FAQ

## Questions

### What happens to active quotes when the maker disconnects?

With cancel-on-disconnect (COD), Core removes the session's active and retained non-winning quotes when it detects the disconnect. Request `cancel_on_disconnect` in `Hello.features`; the server confirms it in `Welcome.enabled_features`. The managed Rust quote SDK requests it by default. Selected or executing quotes are not removed. Without COD, resting quotes stay fillable while you are offline.

Session resume restores subscriptions. After fresh authentication, subscribe again. The managed SDK does this either way. After reconnect, read `GetMyQuotes { scope: "live" }` and call `GetOrderStatus` for pending orders. See [cancellation semantics](maker-api.md#cancelallquotes-maker---server).

Events in flight at disconnect, such as `QuoteAcknowledged` or `QuoteFilled`, can be redelivered after reconnect. Dedupe by `order_id`.

### Can multiple maker bots share a single key?

No. Each maker pubkey gets one quote WebSocket (the `/maker/data` connection is separate). A second quote connection replaces the first. The old session receives `Error` with `generic.code = "session_replaced"` and is closed. Use separate maker keys for parallel bots.

### Why was a quote rejected?

Common `QuoteRejected.reason` values:

| Reason | Meaning |
|---|---|
| `invalid_strike` | The strike is not in the RFQ's `order_options` set. |
| `order_id_mismatch` | The submitted `order_id` does not equal `SHA-256(preimage182)`. See [Troubleshooting](#troubleshooting). |
| `quote_expiry_too_short` | `valid_until < now + 100s`. |
| `cap_exceeded` | A position-count, notional or balance cap was breached. See [Capacity limits](caps.md). |
| `rfq_not_active` | The RFQ expired or filled before the quote arrived. |

### Why are some RFQs not delivered?

The server checks RFQs against the maker's caps before broadcast. If one fails, the maker gets `RfqSkipped` with a `reason` (e.g. `token_oi_cap_exceeded`, `maker_insufficient_balance`) instead of `RfqBroadcast`. `GetMyCaps` returns current headroom. See [Capacity limits](caps.md).

### What is the appropriate value for `valid_until`?

Floor: `now + 100s`. Lower values get `quote_expiry_too_short`. Ceiling: the market's `expiry_ts`. Later values get `market_expired`. The last 90 seconds are the settlement buffer, so the trading cutoff is `valid_until - 90s`. `rfq.expires_at + 100s` covers the auction plus the settlement buffer and refresh lead. Add a few seconds for clock skew and stay at or below market expiry. Longer windows keep stale quotes live without helping fills, since the taker cannot accept after `rfq.expires_at`. Get the server clock offset from `Welcome.server_time_unix_ms` and `Pong.server_time_unix_ms`.

## Troubleshooting

### `order_id_mismatch`

`order_id` must be the SHA-256 of the 182-byte preimage in the [Maker API reference](maker-api.md) (Quote rules). Common causes:

- Endianness: all `u64` fields are little-endian.
- Field offsets: offsets are exact (`domain_tag` at byte 0, `chain_id` at byte 4, `program_id` at byte 12, etc.). One byte off shifts every later field.
- `taker` field: the taker's pubkey from `RfqBroadcast`, not the maker's.
- `is_taker_buy` flag: `0` (false). The taker is the option writer.

The Rust SDK's `compute_order_id()` builds this preimage. In other languages, test against a known-good preimage and `order_id` pair.

### `rfq_not_active`

The RFQ expired or was filled before your quote arrived. Use `BatchQuotes` to send several strikes for one RFQ at once.

### Persistent disconnects

The server sends WebSocket protocol pings every 30 seconds and closes connections idle for 90 seconds. The Rust and TypeScript SDKs answer them automatically. Raw clients must answer them. Those pongs keep the connection alive. Application `Ping` is optional and returns `Pong.server_time_unix_ms` for clock offset.
