# Vaults integration

What the vault UI reads, from where, and how often. Code lives in `src/lib/vaults/` (data layer) and `src/components/vaults/` (hooks).

## Sources of truth

| Data | Source | Why |
| --- | --- | --- |
| Vault list, vault detail, share price, phase/safety, caps, performance | HTTP `GET /vaults`, `/vaults/{pda}` | Backend projection of chain events, served from RAM |
| User's share balance, main-token balance, open deposit/withdraw request PDAs | Solana RPC (`fetchVaultDepositorState`) | Authoritative and immediate after the user's own tx |
| User's requests across all vaults, lifetime totals | HTTP `GET /depositors/{wallet}` | One call for the portfolio page |
| User's processed/cancelled/refunded history | HTTP `.../history` (paginated) | Only the backend indexes past events |
| Vault cycles and positions | HTTP `/vaults/{pda}/cycles`, `/positions` (paginated) | Detail-page tabs |
| Deposit, withdraw, cancel, refund, self-process | Chain transactions built in `depositor.ts` | Only the wallet can sign these |

There is no public vault WebSocket; depositor data comes from the HTTP routes below. The WS is for RFQ; vaults change on cycle boundaries (hours/days), so polling is enough.

After the user sends a tx, re-read RPC state (`fetchVaultDepositorState`) and call `refresh()` on the HTTP hooks. The HTTP projection lags the chain by a few seconds; RPC does not.

## Endpoints

Base: `${getApiBaseUrl()}/api/v1`. All integers above 2^53 are decimal strings; parse with `BigInt`. Share prices are scaled by `PRICE_SCALE = 1e9` (`math.ts`).

| Route | Fetcher | Tier | Cached |
| --- | --- | --- | --- |
| `GET /vaults` | `fetchVaults` | Light | 5 s |
| `GET /vaults/{pda}` | `fetchVault` (404 → `null`) | Light | 5 s |
| `GET /vaults/{pda}/positions?settled&limit&cursor` | `fetchVaultPositions` | Heavy | 5 s |
| `GET /vaults/{pda}/cycles?limit&cursor` | `fetchVaultCycles` | Heavy | 5 s |
| `GET /vaults/{pda}/depositors/{wallet}` | `fetchVaultDepositor` | Heavy | no |
| `GET /vaults/{pda}/depositors/{wallet}/history?limit&cursor` | `fetchVaultDepositorHistory` | Heavy | no |
| `GET /depositors/{wallet}` | `fetchDepositorPortfolio` | Heavy | no |
| `GET /depositors/{wallet}/history?limit&cursor` | `fetchDepositorHistory` | Heavy | no |

A wallet with no activity gets empty fields, not 404. 404 on per-vault routes means the vault is unknown (or the PDA is not base58). `/vaults` and `/vaults/{pda}` cover open vaults only, so a closed vault is 404 there; its cycles, positions and depositor routes are still served.

Pagination: pass `next_cursor` back as `cursor` and treat it as opaque; `null` means the last page. `limit` outside the range returns 400 `invalid_limit`.
- History: default 50, max 200, newest first.
- Cycles: default 50, max 200, newest first.
- Positions: default 100, 1..=200.

## Load, limits, errors

These are the backend defaults; they can be tuned in rfq-server config (`http_light_*`, `http_heavy_*`, `http_max_in_flight`, `database.public_read_*`).

- **Light tier:** 30 req/s per IP, burst 60. List and detail are served from memory and don't need the DB; performance is refreshed in the background every 15 s.
- **Heavy tier:** 10 req/s per IP, burst 20. These routes hit Postgres per request through a dedicated 4-connection pool with a 2 s statement timeout, so public reads cannot starve RFQ writes.
- **Global:** at most 256 in-flight requests per server; above that the server returns 503 immediately.
- **`Cache-Control: public, max-age=5`** is set on successful `/vaults`, `/vaults/{pda}`, `/cycles` and `/positions` responses (not on per-wallet routes), so a CDN in front of the API absorbs repeated reads. The browser fetch uses `no-store` so that `refresh()` after a tx is real.

The limit is per IP (IPv6 grouped by /64), and users behind one NAT share it. Keep the per-page request count low.

| Status | `code` | Meaning | Client action |
| --- | --- | --- | --- |
| 429 | `rate_limited` | Per-IP bucket empty | Back off; `err.retryable` |
| 503 | `server_busy` | Global in-flight cap | Back off; `err.retryable` |
| 503 | `db_busy` | Pool exhausted or query timed out | Back off; `err.retryable` |
| 503 | `db_disabled` | Server runs without DB; list and detail still work | Permanent: hide cycles, positions and depositor data; don't retry |
| 400 | `invalid_limit`, `invalid_cursor`, `invalid_wallet` | Client bug | Don't retry |
| 404 | `not_found` | Unknown vault | Show "not found" |

`VaultApiError.retryable` is true for 429 and for 503 except `db_disabled`. On retryable errors, keep the last data on screen and retry with backoff (e.g. 2 s, 4 s, 8 s, capped at the normal poll interval). Don't clear the UI.

### Polling budget

`use-vaults.ts` polls every 30 s (`VAULT_REFRESH_MS`), and only after the previous request has finished, so requests never overlap.

- **List page:** one `/vaults` call. It already contains everything for cards, including `performance`. Don't fan out per-vault requests from the list.
- **Detail page:** `/vaults/{pda}` on poll. Fetch cycles and positions when their tab opens, then poll them no faster than every 30 s.
- **Portfolio page:** `/depositors/{wallet}` on poll. Fetch history on open and on "load more"; don't poll deep pages.
- **Hidden tab:** stop polling (`document.visibilityState === "hidden"`) and refresh when it becomes visible again. `usePolled` does this.
- **After a user tx:** one RPC read plus one `refresh()`. Don't loop.

## List page

`GET /vaults` returns all vaults. Sort and filter on the client for now (the list is small). Useful keys:
- `performance.status`, then `annualized_return_pct` / `cumulative_return_pct`;
- `equity`;
- `accepting_deposits`;
- `safety`;
- `main_mint`.

`depositCapacity(vault)` gives the room left under `cap_limit`.

### `performance`

`performance` is tagged by `status`; each variant carries only the fields that exist. Switch on `status`:

| `status` | Fields | Show |
| --- | --- | --- |
| `unavailable` | none | "—" (server hasn't loaded performance yet; not "New vault") |
| `no_track_record` | none | "New vault" |
| `short_track_record` | track record | Cumulative and last-cycle return, "annualized after 30 days" |
| `annualized` | track record + `annualized_return_pct` | Annualized as the headline number |

Track record fields:

| Field | Meaning |
| --- | --- |
| `cycles_completed` | Number of finished cycles (≥ 1) |
| `last_cycle_return_pct` | Return of the latest finished cycle |
| `cumulative_return_pct` | `(Π(1 + r/100) − 1) × 100` over all finished cycles |
| `track_record_secs` | Calendar span from the start of the first finished cycle to the end of the last one, idle gaps included (string). `annualized` needs ≥ 30 days |

All values are percentages: `1.0` means 1%. They are compounded from **completed** cycles only. Don't annualize on the client before `annualized`; a short track record gives meaningless numbers.

When sorting by yield, put `annualized` first, then `short_track_record` by cumulative return, then `no_track_record`, then `unavailable`. A cycle's return is its share-price change, `share_price_end / share_price_start − 1`. Fees are minted as shares, so the return is after fees. On a new capital generation the share price resets, and cumulative return still compounds the per-cycle returns.

For a chart, use `/cycles`. Only `finished_at != null` means finished. The running cycle has `finished_at = null` but may already have `share_price_end`, `equity_end` and `return_pct` set at the equity boundary; don't treat it as final.

## Detail page and actions

Gate each button with the matching function in `rules.ts`. It mirrors the contract's intake checks and returns a reason, or `null` if the action is allowed.

| Block | Show |
| --- | --- |
| `safety` | Vault is frozen/unwinding/withdraw-only/closing |
| `phase` | Vault is settling or processing capital |
| `window_closed` | Deposits are not open in this idle window |
| `cutoff` | Active cycle past expiry; wait for settlement |
| `priced` | Idle capital is priced; requests are processed now |
| `authority` | Only the manager can process yet (see below) |

Requests are processed by the manager. If the manager doesn't process them, anyone (including the user) can after `capital_fallback_delay_secs`:
- counted from the request's `created_at` in idle;
- counted from `active_expiry` in processing-capital.

The delay defaults to 43200 s (max 259200). `created_at` is chain block time.

In idle, deposits are only processed once idle capital is priced. A non-manager can price it only together with an aged withdraw request, so a deposit-only queue can't be self-processed: offer cancel instead.

`selfProcessDepositBlock` / `selfProcessWithdrawBlock` return `authority` until then. Show a countdown from those timestamps.

Native-SOL vaults (`isNativeVault`) wrap and unwrap automatically. `buildRequestDepositInstructions` tops up wSOL, and the cancel/refund/self-process builders take `unwrap`. Unwrap closes the whole wSOL account, so the hook passes it only when the wallet held no other wSOL.

**Gap:** withdrawing the last shares of a vault (`shares == live_share_supply`) needs `process_final_withdrawal`. The TS SDK has the builder (`VaultManagerPlanner.processFinalWithdrawal`), but `depositor.ts` has no wrapper for it yet. Block that case in the UI until the wrapper is added.

## Portfolio page

1. `GET /depositors/{wallet}` returns one `VaultDepositor` per vault the wallet has a request, totals or history in. Each has open requests and `totals`, which may be `null` if nothing has been processed yet. `totals.total_withdrawn` counts the main leg only; second-leg payouts from a final redemption show up as `second_amount` on history events.
2. Join with the `/vaults` list by `vault` for the name, share price and performance. Don't call `/vaults/{pda}` per row. A vault missing from `/vaults` is closed: show the row from `totals` and history alone.
3. Current position value is share balance (RPC) × `share_price` / `PRICE_SCALE` (`sharesToMain`). The backend does not track share transfers between wallets, so the RPC balance is the truth.
4. `GET /depositors/{wallet}/history` gives a cross-vault feed; each event carries `vault`.
