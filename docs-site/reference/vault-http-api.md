# Vault HTTP API

Public vault endpoints return indexed state and history. Capital transactions are wallet-signed; operator commands use the authenticated `/vault` WebSocket session.

## Base URL and types

Use `https://devnet-api.acta.markets/api/v1` or `https://beta-api.acta.markets/api/v1` for the corresponding environment.

Addresses are base58 strings. Token amounts, share amounts, large counters and Unix-second timestamps are decimal strings unless a field is listed as a JSON number. Share prices and the high-water mark use a scale of `1_000_000_000`. Parse exact values with `BigInt` or another integer-safe representation.

Basis-point fields are JSON numbers; 100 basis points means 1%. Percent-return fields are JSON numbers in percentage units. Nullable fields contain `null` when the observation or result is unavailable.

## Vault list and detail

- `GET /vaults` returns `{ "vaults": Vault[] }`.
- `GET /vaults/{pda}` returns one `Vault` object.

The list has no query filters or pagination. Filter the returned vaults in the client.

Closed vaults are omitted from the list; closed or unknown vault detail returns `404`. Their indexed history can remain available.

### Vault fields

| Fields | JSON type | Meaning |
| --- | --- | --- |
| `vault_pda`, `governance`, `fee_recipient`, `primary_delegate` | string | Vault and authority addresses. |
| `vault_id` | string | 32-byte identifier encoded as 64 lowercase hex characters, without `0x`. |
| `main_mint`, `second_mint`, `share_mint` | string | Asset and share-mint addresses. |
| `main_decimals`, `second_decimals` | number | Token decimals. |
| `main_token_program`, `second_token_program` | `legacy_spl` or `token_2022` | Token-program family. |
| `phase` | `idle`, `active`, `settling`, `processing_capital` | Trading/capital phase. |
| `safety` | `normal`, `frozen`, `emergency_unwind`, `withdraw_only`, `closing` | Safety mode. |
| `capabilities` | number | Strategy capability bitmask. |
| `accepting_deposits`, `equity_computed` | boolean | Intake and capital-pricing flags. |
| `active_expiry`, `open_positions` | string | Current expiry and position count. |
| `total_shares` | string | Contract's boundary supply checkpoint, not the live mint supply. |
| `share_price`, `share_price_hwm` | string | Fixed-scale price per share and high-water mark. |
| `equity`, `capital_generation` | string | Accounted value in main atoms and capital generation. |
| `pending_deposit_count`, `pending_withdraw_count` | number | Queue counts. |
| `pending_deposit_amount`, `pending_withdraw_shares` | string | Pending main-token amount and pending shares. |
| `performance_fee_bps`, `management_fee_bps`, `manager_stake_min_bps` | number | Fee and stake settings. |
| `last_hwm_update_ts`, `last_hwm_reset_ts`, `last_settlement_ts` | string | Recorded timestamps. |
| `cap_limit`, `capital_fallback_delay_secs` | string | Deposit capacity and fallback delay. |
| `deposit_window_set_ts` | string or null | Recorded intake-window timestamp. |
| `main_balance`, `second_balance`, `live_share_supply`, `observed_manager_stake_shares` | string or null | Separately observed balances and supply. |
| `balance_updated_at`, `balance_chain_slot` | string or null | Freshness and chain slot of those observations. |
| `policy` | object | Policy fields below. |
| `projection` | object | Indexed event coordinate below. |
| `performance` | object | Performance variant below. |

`policy` contains the numeric fields `max_open_positions`, `max_rebalance_drift_bps` and `min_main_liquidity_bps`.

`projection` contains `version` and `slot` as strings, `transaction_index` and `event_index` as numbers, and `signature` as a string. Balance observations have separate freshness fields: `balance_updated_at` and `balance_chain_slot`.

`performance` is one of:

- `{ "status": "unavailable" }`
- `{ "status": "no_track_record" }`
- `status: "short_track_record"` with `cycles_completed`, `last_cycle_return_pct`, `cumulative_return_pct` as numbers and `track_record_secs` as a string.
- `status: "annualized"` with the same fields plus numeric `annualized_return_pct`.

Annualization requires at least 30 days of completed-cycle history. See [NAV and fees](../protocol/vault-accounting.md) for the distinction between boundary equity, share price and live share ownership.

## Position memberships

`GET /vaults/{pda}/positions`

| Query | Type | Default / range |
| --- | --- | --- |
| `settled` | boolean | Optional settlement filter. |
| `limit` | integer | 100; 1–200. |
| `cursor` | string | Optional opaque cursor. |

The response is `{ "positions": VaultPosition[], "next_cursor": string | null }`.

| Position fields | JSON type |
| --- | --- |
| `vault`, `position`, `market`, `counterparty` | string |
| `order_id` | string |
| `role` | `writer` or `holder` |
| `position_type` | `covered_call` or `cash_secured_put` |
| `status` | `open`, `funded`, `liquidated`, `settled` |
| `strike`, `quantity`, `net_premium` | string |
| `created_at`, `acquired_at` | string |
| `funded_amount`, `settled_at`, `transaction_signature` | string or null |
| `is_otm` | boolean or null |

A dual-vault position has one chain position and a role-specific membership for each participating vault.

## Cycles

`GET /vaults/{pda}/cycles?limit=50&cursor=...`

`limit` defaults to 50 and accepts 1–200. The response is `{ "cycles": VaultCycle[], "next_cursor": string | null }`.

| Cycle fields | JSON type |
| --- | --- |
| `cycle_number`, `expiry`, `started_at` | string |
| `share_price_start`, `equity_start` | string |
| `performance_fee_assessed`, `management_fee_assessed` | string |
| `finished_at`, `share_price_end`, `equity_end` | string or null |
| `positions_opened`, `positions_settled` | number |
| `return_pct` | number or null |

An unfinished cycle can have valuation data without a completed-cycle return. Read `capital_generation` from vault detail.

## Pending request queues

- `GET /vaults/{pda}/deposit-requests`
- `GET /vaults/{pda}/withdraw-requests`

Both accept `limit` (default 50, range 1–100) and an optional `cursor`. Both return `{ "requests": Request[], "next_cursor": string | null }`.

A deposit request contains `wallet`, `amount`, `created_at` as strings and nullable string `transaction_signature`. A withdrawal request contains `wallet`, `shares`, `created_at` as strings and nullable string `transaction_signature`.

These routes return pending requests. Completed payouts are recorded in depositor history.

## Depositor state

- `GET /vaults/{pda}/depositors/{wallet}` returns one `DepositorState`.
- `GET /depositors/{wallet}` returns `{ "wallet": string, "vaults": DepositorState[] }`.

| DepositorState field | JSON type |
| --- | --- |
| `vault`, `wallet` | string |
| `deposit_request` | object or null |
| `withdraw_request` | object or null |
| `totals` | object or null |

`deposit_request` contains string `amount`, string `created_at` and nullable string `transaction_signature`. `withdraw_request` contains string `shares`, string `created_at` and nullable string `transaction_signature`.

`totals` contains string fields `shares_minted`, `shares_burned`, `total_deposited`, `total_withdrawn` and `last_activity_at`.

For a valid wallet with no indexed activity, the single-vault route returns `vault` and `wallet` with the three optional fields set to `null`. The cross-vault route can return an empty `vaults` array.

The totals summarize indexed capital activity. Read current share balances from the wallet's token accounts on Solana, including shares transferred between wallets.

## Depositor history

- `GET /vaults/{pda}/depositors/{wallet}/history`
- `GET /depositors/{wallet}/history`

Both accept `limit` (default 50, range 1–200) and an optional opaque `cursor`. The response is `{ "events": DepositorEvent[], "next_cursor": string | null }`.

| Event field | JSON type |
| --- | --- |
| `vault` | string |
| `action` | `deposit_processed`, `withdraw_processed`, `deposit_cancelled`, `withdraw_cancelled`, `deposit_refunded` |
| `amount`, `second_amount`, `shares`, `event_time`, `transaction_signature` | string |
| `boundary_price` | string or null |

A final redemption can return the second asset; `second_amount` records it separately from the main-asset `amount`. Events record processed requests and cancellations.

## Pagination example

Fetch the first page, then pass back the returned cursor unchanged:

```sh
curl 'https://devnet-api.acta.markets/api/v1/vaults/<vault-pda>/cycles?limit=50'
curl --get 'https://devnet-api.acta.markets/api/v1/vaults/<vault-pda>/cycles' \
  --data-urlencode 'limit=50' \
  --data-urlencode 'cursor=<returned-next_cursor>'
```

`next_cursor: null` ends pagination. Return the cursor unchanged to the same route with the same filters, and URL-encode it in the query string.

## Errors and freshness

List and detail use an in-memory read model. Other routes require the database. List, detail, positions, cycles and pending queues may be cached for five seconds.

Errors use `{ "error": "Human-readable message", "code": "error_code" }`.

| HTTP status | Codes | Handling |
| --- | --- | --- |
| 400 | `invalid_cursor`, `invalid_limit`, `invalid_wallet`, `invalid_request` | Correct the input. |
| 404 | `not_found` | Check the address and route. Closed vaults no longer have list/detail entries. |
| 503 | `db_disabled` | Database access is not configured for this route. |
| 503 | `db_busy`, `unavailable`, `caps_projection_unavailable`, `chain_replay_unavailable`, `position_history_unavailable` | Back off and retry while retaining the last known result and its freshness. |
| 500 | `history_projection_incomplete`, `data_validation_error`, `schema_error`, `db_error` | Report the failed read and retain the previous data. |
| 429 | Rate limit | Slow requests and follow any retry guidance in the response. |

After submitting a wallet transaction, confirm it and read the affected chain accounts. HTTP data updates after indexing. See [Backend services and data](../protocol/backend.md) and [Transaction recovery](../protocol/recovery.md).
