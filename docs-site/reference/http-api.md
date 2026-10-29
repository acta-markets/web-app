# Acta HTTP API

Trading runs over WebSocket. See the [Maker API reference](maker-api.md) and [Taker API reference](taker-api.md).

## Base URL

```
https://devnet-api.acta.markets
https://beta-api.acta.markets
```

## Response and units

- JSON: `application/json`
- Timestamps: Unix seconds
- `price` / `strike`: `u64` in 1e9 scale (premium and strike conventions match WS docs)
- `quantity`: underlying atomic units
- Pubkeys/addresses: base58 strings

## Error format

```json
{ "error": "Human-readable message", "code": "error_code" }
```

Codes (HTTP status):
- `invalid_request`, `invalid_cursor`, `invalid_limit`, `invalid_delegate`, `invalid_wallet` (400)
- `not_found` (404)
- `rate_limited` (429): per-IP rate limit; retry with backoff
- `db_disabled` (503): server runs without a database; permanent, do not retry
- `db_busy` (503): database pool exhausted or query timed out; retry with backoff
- `server_busy` (503): global in-flight limit reached; retry with backoff
- `unavailable`, `caps_projection_unavailable`, `chain_replay_unavailable`, `position_history_unavailable` (503): the backing projection is not established yet; retry with backoff
- `token_metadata_incomplete`, `missing_size_rule_for_underlying_mint` (503): `/tokens` while an active market lacks decimals or a size rule
- `history_projection_incomplete`, `caps_projection_incomplete`, `data_validation_error`, `schema_error`, `db_error`, `invalid_program_id`, `encode_failed`, `invalid_stats` (500)

WebSocket codes are a separate set; see the [WS error code catalog](ws-common.md#ws-error-codes).

## Health

### GET `/health`

Returns service health and metadata.

### GET `/ready`

Returns `200` when required components are healthy, `503` otherwise, including during shutdown.

### GET `/live`

Returns process liveness.

### GET `/metrics`

Prometheus metrics endpoint.

## Reference data

`/venue`, `/tokens` and `/markets` come from one in-memory snapshot. The same snapshot answers WS discovery (`GetTokens`, `GetMarkets`, `GetMarketDescriptors`, `GetExpiries`, `Snapshot.markets`), so HTTP and WS always agree. These routes need no database and share the light per-IP rate limit (30 req/s, burst 60).

The snapshot is rebuilt when the market registry changes, when a market reaches its trading cutoff or expiry, and at least every 30 s. When the token or market list changes, every authenticated maker, taker and vault operator WS session gets [`ReferenceChanged`](ws-common.md#referencechanged) with the new ETags.

### Caching

Every response carries a strong `ETag` and a `Cache-Control` header:

| Route | `Cache-Control` |
|---|---|
| `/venue`, `/tokens` | `public, max-age=60` |
| `/markets` | `public, max-age=5` |

Send the last `ETag` in `If-None-Match`. If nothing changed you get `304 Not Modified` with no body and the same headers. `If-None-Match` accepts a comma-separated list, `*` and the `W/` prefix. Polling this way is cheap, but `ReferenceChanged` tells you when to re-read.

`ReferenceChanged.tokens_etag` is the `/tokens` ETag. `ReferenceChanged.markets_etag` is the ETag of the unfiltered `GET /api/v1/markets?active=false` body, so compare it only with that request, not with the default list or a filtered one.

### GET `/api/v1/venue`

The program id and the limits the server validates against. `null` means no limit. Values come from server configuration and change only on restart.

```json
{
  "program_id": "ProgramIdBase58",
  "min_quote_validity_seconds": 60,
  "settlement_buffer_seconds": 50,
  "quote_refresh_lead_seconds": 10,
  "min_rfq_timeout_seconds": 5,
  "max_rfq_timeout_seconds": 120,
  "signature_timeout_seconds": 30,
  "max_quotes_per_rfq": 50,
  "max_active_rfqs_per_taker": 50,
  "pre_expiry_cutoff_seconds": 10800
}
```

| Field | Meaning |
|---|---|
| `min_quote_validity_seconds` | Minimum `valid_until - now` on a quote; at least `settlement_buffer_seconds + quote_refresh_lead_seconds`. Use this value, not the sum |
| `settlement_buffer_seconds` | A quote stops being acceptable at `valid_until - settlement_buffer_seconds` |
| `quote_refresh_lead_seconds` | How long before that cutoff the server sends `QuoteRefreshRequested` |
| `min_rfq_timeout_seconds` / `max_rfq_timeout_seconds` | Allowed range for `RfqRequest.timeout_seconds` |
| `signature_timeout_seconds` | Time a taker has to return a signed sponsored transaction |
| `max_quotes_per_rfq` | Quotes kept per RFQ, or `null` |
| `max_active_rfqs_per_taker` | Open RFQs per taker at once, or `null` |
| `pre_expiry_cutoff_seconds` | Default no-trade window before market expiry; a market can override it |

The example shows server defaults. Deployments can differ, so read the live endpoint. A misconfigured program id returns `500` `invalid_program_id`.

### GET `/api/v1/tokens`

Each token of the active markets, once, sorted by mint. Markets name tokens by mint, so join on `mint` for symbol and decimals.

```json
{
  "tokens": [
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "decimals": 6,
      "oracle_feed_ids": ["eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"]
    },
    {
      "mint": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "decimals": 9,
      "oracle_feed_ids": ["ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"],
      "size_rule": { "min_size": 100000000, "max_size": 1000000000000, "step": 10000000 },
      "strike_tick": 500000000,
      "quote_mints": ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
    }
  ]
}
```

This is the same [`TokenInfo`](ws-common.md#tokeninfo) as on WS. Only underlyings have `size_rule`, `strike_tick` and `quote_mints`. `oracle_feed_ids` is omitted when no feed is known.

`503` when token metadata is inconsistent (for example one mint with two decimal values) or an underlying has no size rule (`missing_size_rule_for_underlying_mint`, same as WS). The body is the usual error object; retry later.

### GET `/api/v1/markets`

Query parameters, all optional:

| Parameter | Type | Meaning |
|---|---|---|
| `underlying` | mint (base58) | Underlying mint |
| `quote` | mint (base58) | Quote mint |
| `expiry` | u64 | Exact `expiry_ts`, Unix seconds |
| `is_put` | bool | `true` for puts, `false` for calls |
| `active` | bool | Default `true`: tradable markets only. `false`: every market the server holds in memory |

`underlying` and `quote` take mints, not symbols. Results are sorted by `expiry_ts`, then PDA.

```json
{
  "markets": [
    {
      "pda": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      "underlying": "So11111111111111111111111111111111111111112",
      "quote": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "expiry_ts": 1767225600,
      "is_put": true,
      "status": "finalized",
      "settlement_price": 150000000000
    },
    {
      "pda": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "underlying": "So11111111111111111111111111111111111111112",
      "quote": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "expiry_ts": 4102444800,
      "is_put": false,
      "status": "active"
    }
  ]
}
```

| `status` | Meaning |
|---|---|
| `active` | Tradable: not finalized, not disabled, before the trading cutoff |
| `closed` | Disabled, past its trading cutoff, or expired and not yet finalized |
| `finalized` | Settlement price published; `settlement_price` is set (1e9 scale) |

`active=false` is not full history. The server only holds markets finalized since it last started, so older ones are missing. Use your own records or the chain for those.

There is no single-market route (`GET /api/v1/markets/{pda}` was removed). Filter the list, or send `GetMarketDescriptors` on WS for the full descriptor (oracle PDAs, decimals, collateral and settlement mints).

## Makers

### GET `/api/v1/makers`

```json
{
  "makers": [
    {
      "pda": "MakerPdaBase58",
      "owner": "MakerOwnerBase58",
      "quote_signing": "MakerQuoteSigningBase58",
      "total_trades": 12,
      "total_volume": 1000000,
      "total_quotes": 55
    }
  ]
}
```

### GET `/api/v1/makers/{pda}`

Get a single maker DTO.

## Vaults and depositors

The [Vault HTTP API](vault-http-api.md) covers `/api/v1/vaults`, vault detail, cycles, positions and depositor state/history. They serve indexed data. Current share ownership is in Solana token accounts.

`/maker` quote sessions and taker WebSocket sessions subscribed to the `vaults` channel receive [`VaultCatalogChanged`](ws-common.md#vaultcatalogchanged) when a vault is created, re-delegated or closed (not when a delegate is disabled), and [`VaultProjectionAdvanced`](ws-common.md#vaultprojectionadvanced) when any vault row changes. Re-read `/api/v1/vaults` or the vault detail on them instead of polling. Neither is replayed, so also re-list after every (re)connect.

## Participant history

Participant RFQ, quote and order history is not in the public HTTP API. Use the authenticated maker/taker WebSocket sessions.

## Stats

### GET `/api/v1/stats`

```json
{
  "usd": { "notional_24h": "1500.00", "premium_24h": "49.00", "priced_trades_24h": 149 },
  "total_volume_24h": 1000000,
  "total_volume_24h_exact": "1000000",
  "total_trades_24h": 150,
  "active_markets": 12,
  "active_makers": 5,
  "connected_makers": 3
}
```

This differs from WS `GlobalStats` in `Snapshot` and `StatsUpdate`. HTTP includes `connected_makers` (live WS sessions) and omits `total_price_24h` and `active_rfqs`.

`usd` holds underlying notional and gross paid premium as exact decimal dollar strings.
USD prices, USDC included, come from the local oracle cache when the signed transaction is
submitted. Only confirmed trades count. `priced_trades_24h < total_trades_24h` means some
confirmed trades have no stored USD value. They are not repriced at current prices.
The legacy `total_volume_24h` fields are raw aggregates, not dollars.
