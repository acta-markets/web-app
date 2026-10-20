# Vaults integration

What the vault UI reads, from where, and how often. Code lives in `src/lib/vaults/` (data layer) and `src/components/vaults/` (hooks).

## Sources of truth

| Data | Source | Why |
| --- | --- | --- |
| Vault list, vault detail, share price, phase/safety, capacity, performance, USD TVL, premium | HTTP `GET /vaults`, `/vaults/{pda}` | Backend projection of chain events and a 60 s stats snapshot, served from RAM |
| Open legs at spot | HTTP `/vaults/{pda}/exposure` | Positions at most 15 s old, spot per request |
| User's share balance, main-token balance, open deposit/withdraw request PDAs | Solana RPC (`fetchVaultDepositorState`) | Authoritative and immediate after the user's own tx |
| User's requests across all vaults, lifetime totals | HTTP `GET /depositors/{wallet}` | One call for the portfolio page |
| User's processed/cancelled/refunded history | HTTP `.../history` (paginated) | Only the backend indexes past events |
| Vault cycles and positions | HTTP `/vaults/{pda}/cycles`, `/positions` (paginated) | Detail-page tabs |
| Deposit, withdraw, cancel, refund, self-process | Chain transactions built in `depositor.ts` | Only the wallet can sign these |

Depositor data comes from the HTTP routes below; vaults change on cycle boundaries (hours/days), so polling is enough. Since SDK 0.2.0 the WS `vaults` channel also sends `VaultCatalogChanged` (`{ vault_pda }`, client event `vaultCatalogChanged`) when a vault is created, re-delegated or closed. The app does not subscribe to it: the list pages have no WS connection, and the 30 s poll picks the change up.

After the user sends a tx, re-read RPC state (`fetchVaultDepositorState`) and call `refresh()` on the HTTP hooks. The HTTP projection lags the chain by a few seconds; RPC does not.

## Endpoints

Base: `${getApiBaseUrl()}/api/v1`. All integers above 2^53 are decimal strings; parse with `BigInt`. Share prices are scaled by `PRICE_SCALE = 1e9` (`math.ts`).

| Route | Fetcher | Tier | Cached |
| --- | --- | --- | --- |
| `GET /vaults` | `fetchVaults` | Light | 5 s |
| `GET /vaults/{pda}` | `fetchVault` (404 → `null`) | Light | 5 s |
| `GET /vaults/{pda}/positions?settled&limit&cursor` | `fetchVaultPositions` | Heavy | 5 s |
| `GET /vaults/{pda}/exposure` | `fetchVaultExposure` | Heavy | no |
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

- **Light tier:** 30 req/s per IP, burst 60. List and detail are served from memory and don't need the DB; the performance snapshot is refreshed every 60 s.
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

`ActaHttpError.retryable` is true for 429 and for 503 except `db_disabled`. On retryable errors, keep the last data on screen and retry with backoff (e.g. 2 s, 4 s, 8 s, capped at the normal poll interval). Don't clear the UI.

### Polling budget

`use-vaults.ts` polls every 30 s (`VAULT_REFRESH_MS`), and only after the previous request has finished, so requests never overlap.

- **List page:** one `/vaults` call. It already contains everything for cards, including `performance`. Don't fan out per-vault requests from the list.
- **Detail page:** `/vaults/{pda}`, `/cycles` and `/exposure` on poll. Exposure is polled only there; a failed read (a 503 means positions older than 15 s) hides the block instead of showing stale numbers.
- **Deposit modal:** the wallet's history in that vault down to the generation start, for the return since entry. It reloads when the share count or the generation changes.
- **Portfolio page:** `/depositors/{wallet}` on poll. Fetch history on open and on "load more"; don't poll deep pages.
- **Hidden tab:** stop polling (`document.visibilityState === "hidden"`) and refresh when it becomes visible again. `usePolled` does this.
- **After a user tx:** one RPC read plus one `refresh()`. Don't loop.

## List page

`GET /vaults` returns all vaults. Sort and filter on the client for now (the list is small). Useful keys:
- `performance.apy_30d`, then `performance.returns.all`;
- `tvl_usd_1e9`, falling back to `equity`;
- `accepting_deposits`;
- `safety`;
- `main_mint`.

`capacity.remaining` is the room left under `cap_limit` (`null` when uncapped).

### `performance`

`performance` is the backend's metrics for the current capital generation, net of fees, from booked share prices at checkpoints. It is `null` until the stats snapshot loads or while it describes another generation, and `covered: false` means the generation's history is incomplete, with every metric `null`. The app computes none of these itself.

| Field | Show |
| --- | --- |
| `apy_30d` | The headline APY; "New" while `null`, "—" when not covered |
| `returns.all` | "Return", with its `from_time` as "Since" |
| `returns.7d` / `30d` / `90d` | Window returns; `null` when the generation is younger than the window |
| `max_drawdown_pct` | Non-negative peak-to-trough fall |
| `worst_cycle_return_pct`, `losing_cycles`, `cycles_completed` | Finished cycles of the generation |

All values are percentages: `1.0` means 1%.

When sorting by yield, put vaults with `apy_30d` first, then younger vaults by `returns.all`, then the rest. Vaults winding down go last.

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
3. Current position value is share balance (RPC, plus escrowed withdrawal shares) × `share_price` / `PRICE_SCALE`. The backend does not track share transfers between wallets, so the RPC balance is the truth. The SDK's `depositorPerformance` adds FIFO lots of the current generation from the wallet's history, with the return since entry per lot; the position panel shows their share-weighted return.
4. `GET /depositors/{wallet}/history` gives a cross-vault feed; each event carries `vault`.

## UI

`/earn` is the vault grid and `/earn/[vault]` (by PDA) the vault page. The option-markets table that used to live at `/earn` is now `/trade`.

- **Metadata.** `name`, `curator` and `description` come from the vault's optional `metadata` in `/api/v1/vaults`, which operators set in the backend (runbook "Vault display metadata"). Without it the name comes from the deposit asset and the curator shows as the short governance address. A curated name always shows the governance address next to it. The category is derived from the asset (Stables for stablecoins, Stocks for tokenized equities such as NVDAx, otherwise Crypto); the grid's sections are Crypto, Stocks and Stables. `registry.ts` keeps PDA-keyed entries only for sample mode.
- **One APY field.** Cards, the vault page and the modal all show `APY`: `performance.apy_30d`, "New" while it is `null`, and "—" when the generation is not covered. A deposit asset that earns its own yield (jitoSOL) gets `stakingAprPct` in the registry: the share price is denominated in that asset and misses this part, so the APY adds it to the premium. An (i) next to every APY label breaks the figure into Staking and Premium, and the parts always sum to the headline.
- **Sorting and TVL.** The grid sorts by APY (the default, in the yield order above), TVL or name. Cards show the backend's indicative `tvl_usd_1e9`; without a fresh price they show `equity` in the deposit asset, which sorts after the priced ones.
- **Deposit availability** comes from `requestDepositBlock`, never from `accepting_deposits` alone: deposits are open in `active` before expiry whatever the flag says. A vault whose safety mode rules out deposits shows "Manage" and opens the modal on Withdraw.
- **One request per kind.** A wallet can hold one pending deposit and one pending withdrawal per vault (`VAULT_REQUEST_EXISTS`). The modal blocks a second request and offers Cancel instead.
- **Invite gate.** New deposits follow the trading invite gate (`openReferralGate`). Withdraw, cancel, refund and self-processing are never gated.
- **Vault page.** Tiles: APY, TVL (asset, with USD and pending deposits below), Return (`returns.all`) and Max drawdown (worst cycle below). "Current cycle" shows the phase, `active_expiry` with a countdown and `premium` for the cycle and the generation. "At risk now" lists `/exposure` legs (strike, type, side, distance from spot) and the net intrinsic per quote mint, dropping a mint whose total is `null`.
- **Charts** (`metrics.ts`) plot `/cycles`, completed cycles only: the return series compounds per-cycle `return_pct`, so a share-price reset on a new capital generation does not show as a drop.
- **Sample data.** `NEXT_PUBLIC_VAULTS_SAMPLE=1` makes `source.ts` serve the fixture vaults in `sample-data.json`, one file with a vault per section. Each entry has its UI metadata, the vault, its cycles and exposure in the HTTP API shapes (real responses can be pasted in as they are) and a wallet position with its vault history. Timestamps were written against the file's `anchor` and are shifted to the current time on load, so expiries, return windows and request ages stay current. `sample.ts` validates the file and loads it as its own chunk, which nothing requests outside this mode. Transactions are disabled. Nothing on screen marks the figures as made up, so screenshots of this mode are not real results. It is off whenever `NODE_ENV` is `production`, so builds ignore it.
