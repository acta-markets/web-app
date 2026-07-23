# Acta HTTP API
> Trading is WebSocket-based. See `maker-api.md` and `taker-api.md`.

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

Common codes:
- `invalid_id` (400)
- `not_found` (404)
- `db_disabled` (503)
- `data_validation_error` (500)
- `schema_error` (500)
- `db_error` (500)

Temporary unavailability may return HTTP `503`.

---

## Health

### GET `/health`

Returns service health and metadata.

### GET `/ready`

Returns readiness status.

### GET `/live`

Returns process liveness.

### GET `/metrics`

Prometheus metrics endpoint.

---

## Markets

### GET `/api/v1/markets`

List markets.

Query:
- `underlying` (optional symbol string)

`GET /api/v1/markets` returns tradable markets only: not finalized, not disabled, and before the effective trading cutoff. `underlying` filters by symbol before that tradability filter. There is no `active=false` mode; use `/api/v1/markets/:pda` for a specific market.

Response:

```json
{
  "markets": [
    {
      "pda": "MarketPdaBase58",
      "underlying_mint": "UnderlyingMintBase58",
      "quote_mint": "QuoteMintBase58",
      "expiry_ts": 1710600000,
      "is_put": false,
      "is_finalized": false,
      "settlement_price": null,
      "underlying_symbol": "SOL",
      "quote_symbol": "USDC"
    }
  ]
}
```

`underlying_feed_id_hex` / `quote_feed_id_hex` are not part of current HTTP `MarketDto`.

### GET `/api/v1/markets/:pda`

Get a single market DTO.

---

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

### GET `/api/v1/makers/:pda`

Get a single maker DTO.

---

## Participant history

RFQ, quote, and order history is not exposed by the public HTTP API. Use the
authenticated maker/taker session protocols for participant-specific state.

---

## Stats

### GET `/api/v1/stats`

```json
{
  "total_volume_24h": 1000000,
  "total_trades_24h": 150,
  "active_markets": 12,
  "active_makers": 5,
  "connected_makers": 3
}
```

This differs from WS `GlobalStats` in `Snapshot` and `StatsUpdate`. HTTP includes `connected_makers` (live WS sessions) and omits `total_price_24h` and `active_rfqs`.

---

## Related

- WS common conventions: `ws-common.md`
- Maker WS reference: `maker-api.md`
- Taker WS reference: `taker-api.md`
