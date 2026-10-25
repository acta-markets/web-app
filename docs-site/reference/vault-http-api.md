# Vault HTTP API

Public vault endpoints return indexed state and history. Capital transactions are wallet-signed. Operator commands go over the authenticated `/vault` WebSocket session.

## Base URL and types

Devnet: `https://devnet-api.acta.markets/api/v1`. Beta: `https://beta-api.acta.markets/api/v1`.

Addresses are base58 strings. Token amounts, share amounts, large counters and Unix-second timestamps are decimal strings unless a field is listed as a JSON number. Share prices and the high-water mark use a scale of `1_000_000_000`. Parse exact values with `BigInt` or another integer-safe representation.

Basis-point fields are JSON numbers. 100 basis points is 1%. Percent-return fields are JSON numbers in percent. A nullable field is `null` when the value is not available.

## Vault list and detail

- `GET /vaults` returns `{ "vaults": Vault[] }`.
- `GET /vaults/{pda}` returns one `Vault` object.

The list has no pagination. Optional query `delegate=<pubkey>` returns only vaults that key can operate as delegate: it is the `primary_delegate` and holds an unexpired delegate grant. A value that is not a base58 pubkey returns `400` `invalid_delegate`. Apply other filters on the client.

Closed vaults are left out of the list. Detail for a closed or unknown vault returns `404`. History routes still serve closed vaults.

### Vault fields

| Fields | JSON type | Meaning |
| --- | --- | --- |
| `vault_pda`, `governance`, `fee_recipient`, `primary_delegate` | string | Vault and authority addresses. |
| `vault_id` | string | 32-byte identifier encoded as 64 lowercase hex characters, without `0x`. |
| `main_mint`, `second_mint`, `share_mint` | string | Asset and share-mint addresses. |
| `second_leg_generation` | string | Increments when governance rolls the second mint. Reload cached leg addresses and plans. |
| `main_decimals`, `second_decimals` | number | Token decimals. |
| `main_token_program`, `second_token_program` | `legacy_spl` or `token_2022` | Token-program family. |
| `staging` | object or null | Open intermediate-asset slot; fields below. `null` means no open slot. |
| `staged_generation` | string | Open or last staging generation. The next stage uses this value plus one. |
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
| `cap_limit`, `capital_fallback_delay_secs` | string | Deposit cap (`0` is uncapped) and fallback delay. |
| `capacity` | object | `cap_limit` and `remaining = max(0, cap_limit − equity − pending_deposit_amount)` in main atoms; `remaining` is `null` when uncapped. |
| `deposit_window_set_ts` | string or null | Recorded intake-window timestamp. |
| `main_balance`, `second_balance`, `live_share_supply`, `observed_manager_stake_shares` | string or null | Balances and supply read from chain separately from events. |
| `balance_updated_at`, `balance_chain_slot` | string or null | When those balances were read, and at which chain slot. |
| `policy` | object | Policy fields below. |
| `projection` | object | Indexed event coordinate below. |
| `created_at` | string or null | Chain time of the vault's creation; `null` until the stats snapshot loads. |
| `tvl_usd_1e9`, `price_time` | string or null | Indicative: `equity` at the main mint's USD oracle price, 1e9 scale, and that price's time. Both `null` without a fresh price. |
| `generation_started_at`, `premium`, `fees`, `depositors_in_generation` | see below, or null | Generation stats from the same snapshot as `performance`. |
| `performance` | object or null | Generation metrics below. |
| `metadata` | object, optional | Operator-curated display fields: `name`; optional `curator`, `strategy`, `description`, `website` and `logo_url` (`https://` URLs) and `twitter` (a bare handle, no `@`). Omitted when none are set. Display only; `governance` is the authority. |

`staging` contains `mint` (base58), `from_leg` (`main` or `second`), and decimal-string `amount`, `staged_at` and `generation`. `amount` is in the intermediate mint’s atoms; `staged_at` is Unix seconds. The slot must be unstaged before equity processing or cycle finalization. It is separate from `main_balance` and `second_balance`.

`policy` contains the numeric fields `max_open_positions`, `max_rebalance_drift_bps` and `min_main_liquidity_bps`.

`projection` contains `version` and `slot` as strings, `transaction_index` and `event_index` as numbers, and `signature` as a string. Balances carry their own timestamps in `balance_updated_at` and `balance_chain_slot`.

`generation_started_at`, `premium`, `fees`, `depositors_in_generation` and `performance` come from one stats snapshot, refreshed every 60 seconds. They are `null` unless the snapshot's generation equals `capital_generation`; the first four are also `null` when `performance.covered` is `false`.

- `premium`: per quote mint, `{ quote_mint, cycle, generation }`, each `{ received, paid }` in quote atoms. `received` is net premium of writer legs; `paid` is the gross premium of holder legs, `null` when a holder leg's market lacks decimals or its open price. `cycle` is the current `active_expiry`.
- `fees`: `management_fee_assessed`, `performance_fee_assessed` and `realized_fee_value` of the generation, in main atoms.
- `depositors_in_generation`: number of wallets with a processed deposit in the generation.

`performance` fields:

| Field | JSON type | Meaning |
| --- | --- | --- |
| `capital_generation`, `computed_at` | string | The generation and time the snapshot describes. |
| `covered` | boolean | `false` when the generation's history is incomplete; every metric below is then `null`. |
| `returns` | object | `7d`, `30d`, `90d`, `all`: `{ return_pct, from_time, to_time }` or `null`. Booked share price return after fees, in percent, between the checkpoints it names; `null` when the generation is younger than the window. |
| `apy_30d`, `apy_90d` | number or null | The 30- and 90-day returns annualized by compounding (APY), in percent. |
| `max_drawdown_pct` | number or null | Largest peak-to-trough fall of the booked share price, as a non-negative percentage. |
| `worst_cycle_return_pct`, `losing_cycles`, `cycles_completed` | number or null | Finished cycles of the generation. |

The booked share price is a step function between checkpoints, so returns move only at cycle boundaries. [Shares, equity and fees](../protocol/vault-accounting.md) explains boundary equity, share price and live share ownership.

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

## Exposure

`GET /vaults/{pda}/exposure`

Open and funded positions at an indicative spot: `{ vault_pda, as_of, positions, totals }`. Positions are reloaded after 10 seconds and never served older than 15; `as_of` is when they were read, and a failed reload past that returns `503`. `spot` is read on every request. Without a database the route returns `503` `db_disabled`.

| Position fields | JSON type | Meaning |
| --- | --- | --- |
| `position`, `market`, `underlying_mint`, `quote_mint` | string | Addresses. |
| `position_type`, `role`, `status` | string | As in position memberships; only `open` and `funded`. |
| `strike`, `quantity`, `expiry` | string | Strike in quote per underlying, 1e9 scale; quantity in underlying atoms. |
| `underlying_decimals`, `quote_decimals` | number or null | `null` when market metadata is missing; `intrinsic` is then `null`. |
| `spot`, `spot_time` | string or null | Underlying price in quote, 1e9 scale, from the oracle cache; `null` when the leg is stale or retired. |
| `distance_pct` | number or null | Call `100 × (strike − spot) / spot`, put `100 × (spot − strike) / spot`. Positive is out of the money. |
| `itm` | boolean or null | `spot` past the strike; equality is out of the money. |
| `intrinsic` | string or null | Value moved if the position expired at `spot`, in quote atoms: `0` out of the money, positive for `holder`, negative for `writer`. Not a cash flow or fair value. |

`totals` has one entry per quote mint: `notional_at_strike` and signed `outstanding_intrinsic` in quote atoms, each `null` when any position of that mint lacks the value.

## Cycles

`GET /vaults/{pda}/cycles?limit=50&cursor=...`

`limit` defaults to 50 and accepts 1–200. The response is `{ "cycles": VaultCycle[], "next_cursor": string | null }`.

| Cycle fields | JSON type |
| --- | --- |
| `cycle_number`, `expiry`, `started_at` | string |
| `capital_generation` | string, or null when the cycle's opening event is not retained |
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

Completed payouts are in depositor history.

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

The totals sum indexed capital activity. Shares can move between wallets, so read current balances from the wallet's token accounts on Solana.

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

A final redemption can pay out the second asset. `second_amount` records it apart from the main-asset `amount`.

`@acta-markets/ts-sdk/http` `depositorPerformance({ history, shares, sharePrice, generationStart })` turns all pages of one vault's history into FIFO deposit lots of the current generation, each with its return since entry. Pass the wallet's share balance plus escrowed withdrawal shares, the vault's `share_price` and `generation_started_at`. It reports no money gain, because shares are transferable.

## Pagination example

Fetch the first page, then pass the returned cursor back:

```sh
curl 'https://devnet-api.acta.markets/api/v1/vaults/<vault-pda>/cycles?limit=50'
curl --get 'https://devnet-api.acta.markets/api/v1/vaults/<vault-pda>/cycles' \
  --data-urlencode 'limit=50' \
  --data-urlencode 'cursor=<returned-next_cursor>'
```

`next_cursor: null` is the last page. Send the cursor unchanged to the same route with the same filters, URL-encoded.

## Errors and freshness

List and detail are served from memory. Other routes read the database. List, detail, positions, cycles and pending queues can be cached for five seconds; exposure is `no-store`.

Errors use `{ "error": "Human-readable message", "code": "error_code" }`.

| HTTP status | Codes | Handling |
| --- | --- | --- |
| 400 | `invalid_cursor`, `invalid_limit`, `invalid_wallet`, `invalid_delegate`, `invalid_request` | Correct the input. |
| 404 | `not_found` | Check the address and route. Closed vaults no longer have list/detail entries. |
| 503 | `db_disabled` | Database access is not configured for this route. |
| 503 | `db_busy`, `unavailable`, `caps_projection_unavailable`, `chain_replay_unavailable`, `position_history_unavailable` | Retry later. Keep showing the last result with its timestamp. |
| 500 | `history_projection_incomplete`, `data_validation_error`, `schema_error`, `db_error` | Report the failed read. Keep the previous data. |
| 429 | Rate limit | Slow down. |

HTTP data changes only after the backend indexes a transaction, so read chain accounts right after you submit one. See [Backend services and data](../protocol/backend.md) and [Transaction recovery](../protocol/recovery.md).
