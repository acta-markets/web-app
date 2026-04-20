# MMarket page — design spec

Status: approved 2026-04-20
Owner: Valpaq

## 1. Goal

Ship a hidden, MM-only dashboard at `/market-maker` that lets a whitelisted market maker:

1. See per-token collateral balances (wallet / available / locked) in a sidebar.
2. See cap utilisation (position count, notional per underlying).
3. See their positions in a single table with an Active / Expired / All filter.
4. Deposit and withdraw stablecoin collateral through a modal.

Everything else (quoting, trade history, redeem, onboarding, mark-to-market PnL, oToken import, liquidation warnings) is explicitly out of scope.

## 2. Non-goals

- Submitting, replacing, or cancelling quotes.
- `GetMyQuotes` / `GetMyTrades` views.
- Initialising the on-chain Maker PDA (admin operation).
- Redeem / settle actions (keeper handles settlement).
- Arbitrary oToken deposits (unsupported by the protocol).
- Pre-liquidation warnings.

## 3. Access & route

- Route: `src/app/(app)/market-maker/page.tsx`, `export const dynamic = "force-dynamic"`.
- **Not added to `src/components/app-nav.tsx`.** Hidden, direct-URL only.
- Existing `middleware.ts` gating via `NEXT_PUBLIC_APP_ENABLED` is sufficient; no middleware changes.
- Four UI states inside the page:
  1. Wallet not connected → `Connect wallet` prompt (reuse `SolanaConnectButton`, pattern from `portfolio-client.tsx`).
  2. Wallet connected, MM WebSocket connecting/authenticating → skeleton.
  3. Server returns `Unauthenticated` or `Unauthorized { role: Maker }` → empty state: `"Not a registered market maker. Contact admin."`
  4. Authenticated → full dashboard.

## 4. Layout

Grid with two regions: balances sidebar on the left, positions panel on the right. `grid-cols-[320px_1fr]` on `md:` and up; stacked (`flex-col`) below that breakpoint.

```
┌─ MMarket ─────────────────────────────────────────────────┐
│  Title + connection pill (live / reconnecting / error)    │
├──────────────┬─────────────────────────────────────────────┤
│ Balances     │ Caps: "12 / 50 positions"  [bar]           │
│              │       "SOL 24k / 100k notional" [bar]      │
│ USDC         │                                             │
│  wallet X    │ [Segmented: Active | Expired | All]         │
│  avail  Y    │                                             │
│  locked Z    │ ┌──────────────────────────────────────┐   │
│  [+] [-]     │ │ Asset Type Col Strike Qty Premium    │   │
│              │ │       Expiry Status Intrinsic        │   │
│ USDT ...     │ │ ...rows...                            │   │
│              │ └──────────────────────────────────────┘   │
│ USDH ...     │                                             │
│              │                                             │
│ [Deposit/    │                                             │
│  Withdraw]   │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

Visual primitives: `AppCard`, `AppTable` (`AppTh`/`AppTd`), `AppSegmented`, `AppModal`, `AppPill`, `shadow-neo*`, `font-mono`, `tabular-nums`. No new design-system primitives are introduced.

## 5. Positions table

### Columns

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Asset | `underlying_mint` → symbol via `tokens.underlyings` from `getTokens()` | Fallback: shortened mint if symbol missing. |
| 2 | Type | `position_type` | `Call` for `covered_call`, `Put` for `cash_secured_put`. Rendered as `AppPill`. |
| 3 | Collateral | Derived: `quote_mint` symbol for CSP, `underlying_mint` symbol for CC | Symbol only. |
| 4 | Strike | `strike / 1e9` | USD formatted, 2–4 decimals depending on magnitude. |
| 5 | Qty | `quantity / 10^underlying_decimals` | From matching `MarketDescriptor.underlying_decimals`. |
| 6 | Premium | `total_premium / 10^quote_decimals` | Quote-token units (usually USDC). |
| 7 | Expiry | `expiry_ts` | Relative countdown (`2d 4h`, `12m`, `Expired`). Uses `useNow` pattern from portfolio. |
| 8 | Status | `status` | Pill: `open` / `funded` / `settled` / `liquidated`. Colour by state. |
| 9 | Intrinsic | Computed (see §6) | `–` when spot unavailable or status ∈ `{settled, liquidated}`. |

Columns explicitly dropped from the Rysk reference: `Chain ID` (Solana-only), `Strike Ntl.` (redundant with Strike × Qty).

### Filter

Segmented control above the table:

- `Active` (default) — `status ∈ {open, funded}` AND `expiry_ts > now`.
- `Expired` — `status ∈ {settled, liquidated}` OR `expiry_ts ≤ now`.
- `All` — no filter.

Data is always fetched with no status filter; filtering is client-side. This keeps the WS request cacheable and avoids refetching when switching segments.

### Sort

Default: `expiry_ts` ascending (soonest first). No column-header sort in MVP.

## 6. Intrinsic column (Pyth)

Live mark-to-market for active positions only.

```
CoveredCall    (call):  intrinsic_usd = max(0, spot − strike) × qty
CashSecuredPut (put):   intrinsic_usd = max(0, strike − spot) × qty
```

- Spot source: existing `src/lib/use-pyth-price.ts` hook (Hermes SSE via `/api/pyth/stream`).
- Pyth ID lookup: `getTokenPythId(symbol)` from `src/lib/tokens.ts`. If unknown → render `–`.
- Render: plain USD value; colour-neutral; no P/L sign (it's a mark, not realised).
- Throttle Pyth-driven re-renders to at most once per 500 ms to protect the table.
- Settled/liquidated rows render `–` (settlement price is not in `MakerPositionInfo`; deriving it from the market is out of scope for MVP).

## 7. Caps bar

Single block above the table, rendered from `GetMyCaps` response:

- Top line: `{current} / {limit} positions` with a horizontal progress bar.
- Per-underlying notional bars (one row per `notional[]` entry that has `limit > 0`): `{symbol} {current} / {limit}`, bar with same styling.
- When `limit == 0` (treated as unlimited in protocol) the row is hidden.
- Colour thresholds: neutral <70%, amber 70–90%, red >90%.

## 8. Sidebar (balances)

One card per mint present in `MakerBalances.balances_by_mint`, ordered alphabetically by symbol. For each:

```
┌─ USDC ─────────────────────────┐
│ wallet:    1 234.56            │
│ available:   789.01            │
│ locked:      200.00            │
│                     [+]  [−]   │
└────────────────────────────────┘
```

- `wallet` — balance of the owner's ATA for this mint, fetched via `useWalletBalance(mint)` (Solana RPC `getTokenAccountBalance`).
- `available` — `balance.available / 10^decimals`.
- `locked` — `balance.locked_as_collateral / 10^decimals`.
- `[+]` opens the deposit/withdraw modal pre-selected for this mint in `deposit` mode.
- `[−]` opens the same modal in `withdraw` mode.
- Bottom of sidebar: single full-width `Deposit / Withdraw` button that opens the modal with no pre-selected mint.

Decimals and symbol are sourced from `GetTokens`; if a mint is not present in `GetTokens` we fall back to shortened mint and `decimals = 0` (and hide `[+]` / `[−]`).

## 9. Deposit / Withdraw modal

### UI

`AppModal` with:

```
[Deposit | Withdraw]         ← two-button toggle
Token:   [USDC ▼]            ← select, seeded from tokens list
Amount:  [___________] [Max]
 hint:   wallet: 1234.56  ·  available: 789.01
[Cancel]  [Confirm]
```

`Max`:

- Deposit → wallet balance from `useWalletBalance`.
- Withdraw → `MakerBalances.balances_by_mint[mint].available`.

### State machine

```
idle  → building_tx → awaiting_signature → sending → confirming
                                            │           │
                                            ▼           ▼
                                          error       success
```

- `building_tx` — call `buildDepositPremiumIx` or `buildWithdrawPremiumIx` (`@acta-markets/ts-sdk`).
- `awaiting_signature` — wallet prompt via the Wallet Standard signer adapter.
- `sending` / `confirming` — `chainClient.tx.sendAndConfirmIxs({ ixs: [ix] })`.
- `success` — show signature with Solscan link, auto-close after 2 s, refetch balances + caps.
- `error` — human-readable message in a red strip under the input; modal stays open.

### Error mapping (MVP)

| Signal | UI message |
|---|---|
| Insufficient wallet balance (deposit) | `"Insufficient wallet balance."` |
| `available < amount` (withdraw) | `"Amount exceeds available collateral."` |
| Simulated tx failed, unknown reason | `"Transaction failed: <raw>."` |
| Wallet rejected signature | `"Rejected in wallet."` |

Amounts are parsed from the input string as human-decimal and converted to atomic units without going through `Number` (string split on `.`, pad the fractional part to `decimals` places, then `BigInt` concat). Reject non-numeric / over-precision input at the form layer.

## 10. Data flow

### New files

| Path | Role |
|---|---|
| `src/lib/mm-client.ts` | Factory `createMmClient()` → `new ActaWsClient({ role: "maker", url: mmWsUrl(), autoReconnect: true, ... })` mirroring `rfq-client.ts`. The `mmWsUrl()` helper lives in the same file and resolves the env per §11. |
| `src/lib/use-mm.ts` | Hook. Manages connect → authenticate → subscribe → bootstrap. Exposes `{ status, error, balances, positions, caps, tokens, descriptors, refetchBalances, refetchPositions, refetchCaps }`. |
| `src/components/mm/mm-provider.tsx` | React context wrapper so sidebar and table share one WS connection. |
| `src/components/mm/mm-client.tsx` | Top-level `"use client"` component, 4-state gating, renders sidebar + panel. |
| `src/components/mm/mm-sidebar.tsx` | Balance rows + global deposit/withdraw button. |
| `src/components/mm/mm-positions-table.tsx` | Segmented + table. |
| `src/components/mm/mm-deposit-modal.tsx` | Deposit/withdraw modal with the state machine from §9. |
| `src/lib/use-wallet-balance.ts` | Solana RPC helper returning `{ amount, decimals, uiAmount }` for `(owner, mint)`. |
| `src/lib/mm-format.ts` | Unit conversions (`1e9`, atomic → human), relative-time formatter, pill colour helpers. |
| `src/lib/mm-signer.ts` | Adapts `useSolana().selectedAccount` into a `TransactionSigner<string>` that the SDK instruction builders accept. |

### Touched files

- `CLAUDE.md` — document the `NEXT_PUBLIC_MM_WS_URL` env.
- `docs/superpowers/specs/…` — this file.

`src/lib/tokens.ts`, `middleware.ts`, `app-nav.tsx` — **not touched**.

### Bootstrap sequence (after `authenticated` fires)

```ts
client.subscribe({ channels: ["positions"] });
client.getTokens({ active_only: true });
client.getMarketDescriptors({ active_only: true });
client.getMakerBalances();
client.getMakerPositions({ status: ["open", "funded", "settled", "liquidated"] });
client.getMyCaps();
```

- Positions request has no `min_expiry_ts` filter; we want settled/liquidated rows too for the `All` / `Expired` segments.
- `getTokens` + `getMarketDescriptors` are cached in the hook's state; they're not refetched on reconnect unless explicitly invalidated.

### Live updates

- `positionUpdated` event → merge by `pda` into the positions array; if `update_type ∈ {funded, liquidated, settled}` also trigger `refetchBalances()` and `refetchCaps()` because the balances implicitly changed.
- No push event exists for balances/caps → after a successful deposit/withdraw tx, explicit `refetchBalances()` + `refetchCaps()`.

### Reconnect

Maker sessions do not resume (`expires_at: null`). On every reconnect:

1. SDK's `autoReconnect` reopens the socket.
2. `authenticated` fires again (fresh `session_id`).
3. The hook re-runs the full bootstrap sequence above.

Connection status pill reflects: `connecting` / `authenticating` / `live` / `reconnecting` / `error`.

## 11. Env & config

New env: `NEXT_PUBLIC_MM_WS_URL`.

- If set → used verbatim.
- If unset → fall back to `NEXT_PUBLIC_RFQ_WS_URL` with `/maker` appended (taker URL uses no suffix in the SDK).

Add to `CLAUDE.md` under the Environment Setup block.

## 12. Error handling & edge cases

| Case | Behaviour |
|---|---|
| WS disconnects | SDK reconnects; UI shows `Reconnecting…` pill; stale data remains rendered. |
| `Unauthenticated` / `Unauthorized` (role=Maker) | Switch to state 3 empty view. |
| `RateLimit` on any request | Toast; no retry loop. |
| Any `RequestError` during bootstrap | Stay on skeleton; show inline error with a `Retry` button that re-runs bootstrap. |
| Positions table empty | Empty-state row inside the table: `"No positions match this filter."` |
| Balances empty | Sidebar shows only the global `Deposit` button and a hint `"No collateral deposited yet."` |
| Missing Pyth ID for an underlying | Intrinsic column shows `–` for those rows. |
| Mint present in balances but missing from `GetTokens` | Render with shortened mint; hide `[+]`/`[−]`. |

## 13. Testing

The repo has `npm test` (Jest) but no integration harness for Next.js routes. MVP coverage:

- Unit tests for pure helpers: `mm-format.ts` conversions, human-to-atomic amount parser, intrinsic calc. Co-located `*.test.ts`.
- Manual QA checklist (documented in the implementation plan) covering the four gating states, deposit, withdraw, position refresh on `positionUpdated`, and reconnect.

## 14. Open questions (deferred, not blocking)

- Show settlement price / realised intrinsic on expired rows? (needs market-descriptor lookup post-expiry)
- Add sort-by-column to the table?
- Show `MakerNotionalCapInfo` rows with `limit == 0` as informational?

These are logged here so future iterations can pick them up; they do not block v1.
