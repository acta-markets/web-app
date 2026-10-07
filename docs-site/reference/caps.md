# Capacity Limits (Caps)

Caps limit risk at quote submission, at three scopes:

- **Platform**: global open-interest and notional ceilings per underlying mint and per quote mint.
- **Market**: open-interest ceilings per market PDA (underlying, quote, expiry and put/call), shared by all its strikes.
- **Maker**: per-account position count, notional exposure, and deposited premium balance.

A breach detected at quote-validation produces `QuoteRejected` with `reason: { "cap_exceeded": <CapError> }`. A breach predictable from the maker's current state pre-filters the RFQ before broadcast and produces `RfqSkipped` instead. `GetTokenCaps` returns platform token, market and quote-mint caps. `GetMyCaps` returns the maker layer.

## Platform caps

### Token OI cap

Maximum open interest allowed for a given underlying mint across all markets.

| Field | Type | Description |
|-------|------|-------------|
| `underlying_mint` | pubkey (base58) | Underlying token mint |
| `symbol` | string | Human-readable symbol, e.g. `"SOL"` |
| `current_oi` | u64 | Current aggregate OI (underlying atomic units) |
| `max_oi` | u64 | Maximum allowed OI |
| `utilization` | f64 | `current_oi / max_oi`, not clamped to 1.0 |

### Market OI cap

Maximum OI for a single market, keyed by its on-chain PDA: one budget per (underlying, quote, expiry, put/call). All strikes of an expiry share that one budget. There is no per-strike capacity.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | string | Market identifier |
| `current_oi` | u64 | Current market OI |
| `max_oi` | u64 | Maximum allowed OI |
| `utilization` | f64 | `current_oi / max_oi` |

### Quote notional cap

Maximum notional exposure per quote mint (e.g. USDC).

| Field | Type | Description |
|-------|------|-------------|
| `quote_mint` | pubkey (base58) | Quote token mint |
| `symbol` | string | Human-readable symbol, e.g. `"USDC"` |
| `current_notional` | u64 | Current notional (quote atomic units) |
| `max_notional` | u64 | Maximum allowed notional |
| `utilization` | f64 | `current_notional / max_notional` |

### Querying platform caps

Send `GetTokenCaps` for platform-level caps. `request_id` is required. `include_markets` exists in the wire type, but the backend returns configured token, market and quote-mint caps regardless of its value.

```json
{ "type": "GetTokenCaps", "data": { "request_id": "uuid" } }
```

Response `TokenCaps`:

```json
{
  "type": "TokenCaps",
  "data": {
    "request_id": "uuid",
    "tokens": [
      {
        "underlying_mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "current_oi": 500000000000,
        "max_oi": 1000000000000,
        "utilization": 0.5
      }
    ],
    "markets": [
      {
        "market_id": "SOL-20260401-15000-C",
        "current_oi": 100000000000,
        "max_oi": 250000000000,
        "utilization": 0.4
      }
    ],
    "quotes": [
      {
        "quote_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "symbol": "USDC",
        "current_notional": 2000000000,
        "max_notional": 10000000000,
        "utilization": 0.2
      }
    ]
  }
}
```

`markets` and `quotes` are omitted only when the corresponding arrays are empty. A missing token, market or quote entry means that scope is uncapped. A configured platform budget of `0` means zero capacity: everything is rejected. Maker-level limits use the reverse convention: `0` means unlimited.

## Maker caps

### Position count

Maximum number of simultaneously open positions for your maker account.

| Field | Type | Description |
|-------|------|-------------|
| `current` | u32 | Open positions held now |
| `limit` | u32 | Maximum allowed positions |

### Notional per underlying

Maximum notional exposure per underlying mint for your maker account.

| Field | Type | Description |
|-------|------|-------------|
| `underlying_mint` | pubkey (base58) | Underlying token mint |
| `symbol` | string | Human-readable symbol |
| `current` | u64 | Current notional exposure |
| `limit` | u64 | Maximum allowed notional |

### Balance

Deposited premium balance. Only `available` can back new quotes.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | pubkey (base58) | Token mint |
| `symbol` | string | Human-readable symbol |
| `decimals` | u8 | On-chain mint decimals (divide atomic balances by `10^decimals` to render UI amounts) |
| `deposited` | u64 | Total deposited (atomic units) |
| `committed` | u64 | Locked by open positions / active quotes |
| `available` | u64 | `deposited - committed` |

### Querying maker caps

Send `GetMyCaps` for your maker-specific limits. `request_id` is required.

```json
{ "type": "GetMyCaps", "data": { "request_id": "uuid" } }
```

Response `MyCaps`:

```json
{
  "type": "MyCaps",
  "data": {
    "request_id": "uuid",
    "positions": {
      "current": 12,
      "limit": 50
    },
    "notional": [
      {
        "underlying_mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "current": 800000000000,
        "limit": 2000000000000
      }
    ],
    "balances": [
      {
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "symbol": "USDC",
        "decimals": 6,
        "deposited": 5000000000,
        "committed": 3200000000,
        "available": 1800000000
      }
    ]
  }
}
```

## How quotes consume capacity

Capacity is reserved when the venue accepts a quote, before any fill:

- A quote atomically reserves its full quantity and premium against every dimension (platform OI and notional, your position count, your notional and committed premium) for its validity window.
- The reservation is released when the quote is cancelled, replaced (a replacement needs headroom only for the delta), expires, or is rejected. It becomes position exposure on fill.
- `GetTokenCaps` and `GetMyCaps` include live reservations. Quotes on concurrent RFQs consume position-count and notional capacity before any fill, so `max_open_positions` and notional limits bound how many RFQs you can quote at once.
- Competing quotes on one RFQ each reserve full size while the auction runs. Near a platform cap this crowds out later quoters: expect `token_oi_cap_exceeded` close to the cap even when your own exposure is small.

## How caps affect quoting

| Scenario | What happens |
|----------|--------------|
| Platform OI cap reached | `RfqSkipped`: RFQ not broadcast to you |
| Maker position cap reached | `RfqSkipped`: RFQ pre-filtered |
| Maker notional cap reached | `RfqSkipped`: RFQ pre-filtered (quantity known ahead) |
| Maker balance is zero | `RfqSkipped`: RFQ pre-filtered |
| Maker balance insufficient for premium | `QuoteRejected` with `reason: cap_exceeded` |
| Quote notional cap reached | `QuoteRejected` with `reason: cap_exceeded` |
| Caps authority temporarily unavailable | `RfqSkipped` / `QuoteRejected` with `caps_unavailable`; retry |

In `QuoteRejected`, `reason` is `{ "cap_exceeded": <CapError> }`. The `CapError` is keyed by a code from the table below and carries the failing dimension's `current`/`limit`. `RfqSkipped` carries the same structure as `cap_detail`. Parse those, not the prose `message`.

`RfqSkipped` example:

```json
{
  "type": "RfqSkipped",
  "data": {
    "rfq_id": "b3f1a2c4-...",
    "market_id": "SOL-20260401-15000-C",
    "quantity": 1000000000,
    "reason": "token_oi_cap_exceeded"
  }
}
```

## CapError variants

| Variant | Fields | Description |
|---------|--------|-------------|
| `token_oi_cap_exceeded` | `underlying_mint`, `current`, `limit` | Platform OI limit reached |
| `market_oi_cap_exceeded` | `market_id`, `current`, `limit` | Market-specific OI limit |
| `maker_position_cap_exceeded` | `current`, `limit` | Too many open positions |
| `maker_notional_cap_exceeded` | `underlying_mint`, `current`, `limit` | Notional exposure limit |
| `maker_insufficient_balance` | `available`, `required` | Not enough deposited premium |
| `quote_notional_cap_exceeded` | `quote_mint`, `current`, `limit` | Quote mint notional limit |
| `maker_quote_notional_cap_exceeded` | `quote_mint`, `current`, `limit` | Maker quote-mint premium commitment limit |
| `caps_unavailable` | none | The venue's risk projection is updating or recovering (venue state, not your account). Retry |

## Monitoring caps

Platform `utilization` is `current / max` and can exceed `1.0` when a limit is lowered below existing usage. A zero platform limit reports saturated utilization `1.0`.

`PositionUpdated` carries `caps_snapshot` only for `update_type: "funded"`; fills and settlements do not push it. Poll `GetMyCaps`, or refetch on `ChainEvent`, to track capacity freed by settlement.

## Freeing capacity

Quote reservations return as described in [How quotes consume capacity](#how-quotes-consume-capacity). Position exposure returns when the position settles. Deposited premium not backing an open position or live quote can be withdrawn with the on-chain `WithdrawPremium` instruction.

## Reference

- Request/response framing for `GetTokenCaps` / `GetMyCaps` (envelope shape, `request_id` correlation): [Maker API reference](maker-api.md).
- `RfqSkipped` (sent in place of `RfqBroadcast` when a cap blocks delivery): [Maker API reference](maker-api.md#rfqskipped-server---maker).
