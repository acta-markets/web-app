# Acta Taker API Reference

## Endpoint

```
wss://devnet-api.acta.markets/taker
wss://beta-api.acta.markets/taker
```

## Connection flow

```
Connect -> Hello -> Welcome -> Auth -> AuthSuccess -> Snapshot -> Subscribe -> ...
```

Auth is one of:
- Resume (returning user): `ResumeAuth { session_id }` → `AuthSuccess { session_id, expires_at }`
- Fresh sign (first time or resume failed): `StartAuth { pubkey }` → `AuthRequest` → `AuthChallenge` → `AuthSuccess { session_id, expires_at }`

### Protocol version and handshake constraints

- Current server protocol: `protocol_version=1.0.0`
- Current server minimum supported version: `min_supported_version=1.0.0`
- `Hello` is the first client message
- `Hello` timeout: `5000ms`
- If a client sends non-`Hello` first, server closes with `hello_required` / `hello_timeout`

### Connection policy defaults

- `auth_deadline`: `15s` (after auth challenge was issued)
- `idle_timeout`: `90s`
- server WS ping interval: `30s`
- server liveness check interval: `1s`
- max consecutive parse errors before close: `3`

### Taker auth lifecycle

- Auth is lazy: `StartAuth`/`ResumeAuth` can be sent right after `Welcome` or later.
- `Snapshot` is sent after `AuthSuccess`.

### ResumeAuth (session resume)

If the client has a saved `session_id` from a previous `AuthSuccess`, it can skip the wallet signature:

```json
{ "type": "ResumeAuth", "data": { "session_id": "uuid-from-previous-auth" } }
```

Server responds with:
- `AuthSuccess { session_id, expires_at }` if the session is valid
- `AuthError { reason: "session_expired" }` if the session is invalid, expired, or revoked

On `AuthError`, client falls back to the full sign flow (`StartAuth`).

Failed `ResumeAuth` counts toward `max_auth_attempts` (default 3). The fourth failed attempt triggers `too_many_auth_attempts` and closes the connection.

Session lifetime:
- Server stores sessions with a TTL (default: 24 hours).
- Sessions survive WS disconnects (not revoked on close).
- `expires_at` may be extended on activity (sliding window), capped at an absolute maximum (7 days).
- Persist `session_id` and `expires_at` (e.g. in localStorage) and send `ResumeAuth` on reconnect while `now < expires_at`.

### StartAuth / AuthChallenge (full sign flow)

```json
{ "type": "StartAuth", "data": { "pubkey": "WalletPubkeyBase58" } }
```

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "Acta RFQ Authentication\n\nSign this message to authenticate your wallet.\n\nWallet: WalletPubkeyBase58\nNonce: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nIssued At: 2026-09-15T00:00:00Z\n",
    "signature": "base58sig",
    "pubkey": "WalletPubkeyBase58"
  }
}
```

### AuthSuccess

```json
{
  "type": "AuthSuccess",
  "data": {
    "session_id": "uuid",
    "expires_at": 1710086400
  }
}
```

`expires_at` is Unix seconds: the deadline for `ResumeAuth`. An authenticated socket can stay open past it.

### AuthError

```json
{
  "type": "AuthError",
  "data": {
    "reason": "session_expired",
    "message": "optional detail"
  }
}
```

`reason` is a `snake_case` code. `message` is optional.

### Subscribe

```json
{
  "type": "Subscribe",
  "data": {
    "request_id": "uuid",
    "channels": ["markets", "trades", "stats"],
    "underlying_mints": ["UnderlyingMintBase58"],
    "quote_mints": ["QuoteMintBase58"]
  }
}
```

`request_id` is required. The server responds with `SubscribeAck` echoing the
`request_id` and the newly added channels.

`underlying_mints` filters by underlying mint and `quote_mints` by quote mint.
When either field is present, `Subscribe` replaces both scopes and the omitted
field matches all mints. If both are omitted, the scopes are unchanged. Use `AddMints`/`RemoveMints` for incremental updates.

Subscriptions do not survive a disconnect. Resend `Subscribe` after reconnect.

### Snapshot (server -> taker)

```json
{
  "type": "Snapshot",
  "data": {
    "markets": [
      {
        "pda": "MarketPdaBase58",
        "underlying": "UnderlyingMintBase58",
        "quote": "QuoteMintBase58",
        "expiry_ts": 1710600000,
        "is_put": false
      }
    ]
  }
}
```

`Snapshot.markets` uses the compact `MarketInfo` shape (`pda`, `underlying`, `quote`, `expiry_ts`, `is_put`), not the `MarketDescriptor` used in `RfqCreated.order_options` and discovery responses. `GetMarketDescriptors` returns the full descriptor with `chain_id`, `program_id`, `collateral_mint`, `settlement_mint`, etc.

## Message index

### Client -> Server

- `Hello`, `ResumeAuth`, `StartAuth`, `AuthChallenge`, `Logout`
- `Subscribe`, `Unsubscribe`, `Ping`
- `AddMints`, `RemoveMints`, `AddChannels`, `RemoveChannels`
- `RfqRequest`, `AcceptQuote`, `CancelRfq`, `SubmitSignedSponsoredTx`
- `GetIndicativePrices`, `GetEarnSummary`, `GetTokenMarketsInfo`
- `GetMarkets`, `GetMarketDescriptors`, `GetExpiries`, `GetTokens`
- `GetPositions`, `GetMyActiveRfqs`, `GetOrderStatus`, `GetSubscriptions`
- `GetTokenCaps`
- `RedeemInvite`, `ClaimReferralCode`, `GetMyReferralInfo`

### Server -> Taker (direct)

- `Welcome`, `VersionMismatch`, `LogoutSuccess`
- `AuthRequest`, `AuthSuccess`, `AuthError`
- `Snapshot`
- `RfqCreated`, `QuoteReceived`, `QuotesUpdate`
- `SponsoredTxToSign`, `OrderAccepted`, `OrderSubmitted`, `OrderConfirmed`, `OrderFailed`
- `RfqAvailableAgain`, `RfqClosed`
- `IndicativePrices`, `EarnSummary`
- `RequireInvite`, `InviteRedeemed`, `ReferralCodeClaimed`, `MyReferralInfo`
- `SubscriptionUpdated`
- `Error`, `RequestError`, `Pong`
- `SubscribeAck`, `UnsubscribeAck`

### Server -> Taker (responses / query results)

- `Markets`, `MarketDescriptors`, `Expiries`, `Tokens`
- `Positions`, `MyActiveRfqs`, `OrderStatus`, `Subscriptions`
- `TokenCaps`, `TokenMarketsInfo`

### Server -> Taker (broadcast if subscribed)

- `TradeExecuted`, `StatsUpdate`, `ChainEvent`
- `MarketCreated`, `MarketFinalized`

`PositionUpdated` is maker-only and is not sent to takers. Track positions with `ChainEvent` (settled/liquidated, `chain_events` channel) and `GetPositions`.

`GetPositions.price` is the maker-signed gross price from the `OpenPosition`
epoch. The server does not derive it from the on-chain net premium. A row
without it fails the read with `gross_price_proof` missing. The read also fails
if finalized audit coverage does not reach the slot where the position was
seen, or if a later audit gap retracts it.

## RFQ flow

### RfqRequest (taker -> server)

```json
{
  "type": "RfqRequest",
  "data": {
    "market": "MarketPdaBase58",
    "position_type": "cash_secured_put",
    "strike": 136000000000,
    "quantity": 20000000,
    "timeout_seconds": 30,
    "client_request_id": "optional-uuid"
  }
}
```

`client_request_id` is optional and used for idempotent RFQ creation.

### RfqCreated (server -> taker)

```json
{
  "type": "RfqCreated",
  "data": {
    "rfq_id": "uuid",
    "rfq_version": 1,
    "client_request_id": "optional-uuid",
    "expires_at": 1710000030,
    "created_at": 1710000000,
    "order_options": [{ "strike": 136000000000 }]
  }
}
```

`order_options` is the server-computed strike set for this RFQ, the same set makers receive in `RfqBroadcast.order_options`. The number of strikes depends on the market and current index price.

### QuoteReceived (server -> taker)

```json
{
  "type": "QuoteReceived",
  "data": {
    "rfq_id": "uuid",
    "strike": 136000000000,
    "maker": "MakerOwnerPubkeyBase58",
    "price": 50000000,
    "net_price": 49750000,
    "valid_until": 1710000350,
    "nonce": 42,
    "order_id": "0x...64chars"
  }
}
```

- `price`: the maker's gross quote, hash-bound via `order_id`. Use it for `AcceptQuote` and all order operations.
- `net_price`: display-only estimate after the protocol fee. Present when the server has loaded the on-chain fee config. The contract computes the actual fee at `OpenPosition` as `min(premium_fee, volume_fee)` after token-decimal scaling.

### QuotesUpdate (server -> taker)

Sent to the RFQ owner whenever its executable quote set changes. An empty
`quotes` array means no executable quotes remain.

```json
{
  "type": "QuotesUpdate",
  "data": {
    "rfq_id": "uuid",
    "quotes": [
      {
        "rfq_id": "uuid",
        "strike": 160000000000,
        "maker": "MakerOwnerPubkeyBase58",
        "price": 50000000,
        "net_price": 49750000,
        "valid_until": 1710000350,
        "nonce": 42,
        "order_id": "0x...64chars"
      }
    ]
  }
}
```

### AcceptQuote (taker -> server)

```json
{
  "type": "AcceptQuote",
  "data": {
    "rfq_id": "uuid",
    "maker": "MakerOwnerPubkeyBase58",
    "order_id": "0x...64chars"
  }
}
```

### CancelRfq (taker -> server)

```json
{
  "type": "CancelRfq",
  "data": {
    "rfq_id": "uuid",
    "request_id": "uuid"
  }
}
```

Cancels an active RFQ. `request_id` is required on the wire. The server responds with `RfqClosed` and `reason: "taker_cancelled"`.

### SponsoredTxToSign (server -> taker)

```json
{
  "type": "SponsoredTxToSign",
  "data": {
    "order_id": "0x...64chars",
    "tx_base64": "...",
    "signature_deadline": 1710000040
  }
}
```

### SubmitSignedSponsoredTx (taker -> server)

```json
{
  "type": "SubmitSignedSponsoredTx",
  "data": {
    "order_id": "0x...64chars",
    "tx_base64": "..."
  }
}
```

### OrderAccepted (server -> taker)

Sent when `SubmitSignedSponsoredTx` moves the order to Core's `Enqueued` state. It is not chain confirmation. The first `AcceptQuote` locks the quote and starts building `SponsoredTxToSign`. An exact `AcceptQuote` retry on the locked order may get `OrderAccepted` while that payload is built or after enqueueing.

```json
{
  "type": "OrderAccepted",
  "data": {
    "order_id": "0x...64chars",
    "order_version": 1
  }
}
```

### OrderStatus (server -> taker)

`GetOrderStatus` returns the execution state of one of your orders. Authenticated takers and makers can call it.

```json
{
  "type": "OrderStatus",
  "data": {
    "request_id": "uuid",
    "order_id": "0x...64chars",
    "state": { "type": "confirmed", "position_pda": "PositionPdaBase58" }
  }
}
```

| `state` | Meaning |
|---|---|
| `{ "type": "pending" }` | Execution is still pending. |
| `{ "type": "confirmed", "position_pda": "..." }` | Executed; this is the resulting position. |
| `{ "type": "unknown" }` | Outcome not known yet. Check the transaction and accounts on chain. |

The response has no `status`, `order_version`, `rfq_id` or `tx_signature` fields. Lookup failures return a correlated `RequestError`. Do not replay the order on `unknown` or on an empty position list.

Order pushes carry `order_version`: accepted `1`, submitted `2`, failed `3`, confirmed `4`. A later chain confirmation can supersede a local failure.

### OrderSubmitted (server -> taker)

```json
{
  "type": "OrderSubmitted",
  "data": {
    "order_id": "0x...64chars",
    "tx_signature": "5eyk...base58sig",
    "order_version": 2
  }
}
```

### OrderConfirmed (server -> taker)

```json
{
  "type": "OrderConfirmed",
  "data": {
    "order_id": "0x...64chars",
    "position_pda": "PositionPdaBase58",
    "order_version": 4
  }
}
```

### OrderFailed (server -> taker)

```json
{
  "type": "OrderFailed",
  "data": {
    "order_id": "0x...64chars",
    "reason": "transaction simulation failed",
    "order_version": 3
  }
}
```

`reason` values:

| Value | Meaning | Retryable? |
|-------|---------|------------|
| `blockhash_expired` | Solana blockhash expired before confirmation | No. Do not replay. Check `GetOrderStatus` and wait for `RfqAvailableAgain` / `RfqClosed` |
| `on_chain` | On-chain program error (simulation or execution) | No |
| `submission_rejected` | Solana RPC rejected the transaction | No |
| `safety_timeout` | Confirmation timed out after max retries | No |
| `shutdown` | Server shutting down during settlement | No |

The keeper retries retryable submission failures up to five times. After the last attempt the order may still have executed, and you may get neither `OrderFailed` nor `RfqAvailableAgain`. The order stays `Enqueued` unless the server knows the transaction was never forwarded, in which case it reopens or closes the RFQ. Follow `RfqAvailableAgain` / `RfqClosed` and query `GetOrderStatus` for pending orders. A rollback discards the winning quote, so use fresh quotes instead of replaying that order.

### Terminal semantics: OrderConfirmed vs RfqClosed

- `OrderConfirmed`: the order is confirmed on-chain. Carries `position_pda` and `order_version`. `tx_signature` arrives earlier, on `OrderSubmitted`, and is not repeated.
- `RfqClosed`: the RFQ is finished. No further quotes or accepts.
- A successful fill sends `OrderConfirmed`, then `RfqClosed`.
- `RfqClosed.your_quote` / `RfqClosed.winner` are optional.

## Delivery and recovery

If the server cannot deliver a message under backpressure, it drops it and closes the connection. `StatsUpdate` is the exception and may drop silently. This covers owner-direct pushes (`RfqCreated`, `QuoteReceived`, `QuotesUpdate`, `RfqClosed`, `TradeExecuted`, `OrderAccepted`, `SponsoredTxToSign`, `OrderSubmitted`, `OrderConfirmed`, `OrderFailed`) and subscribed broadcasts (`ChainEvent`, market events). A lost message shows up as a disconnect.

After `AuthSuccess`, re-read `GetMyActiveRfqs`, `GetPositions`, and `GetOrderStatus` for pending orders. Live RFQs come from Core, positions from a database built from chain data, and order status from pending orders plus execution records. The three reads are not one atomic snapshot. An order missing from one response may still have executed.

A successful `ResumeAuth` moves Core ownership from the session's previous connection to the new one before `AuthSuccess`. A fresh `StartAuth` for the same wallet does not.

| Recovered state | Client action |
|---|---|
| Same credential, same `rfq_id` and `locked_order_id`, `pending_signature`, signature not sent | Repeat the exact `AcceptQuote` to get the existing signing payload (or `OrderAccepted` while it is built). The original signature deadline still applies. |
| `enqueued`, or `SubmitSignedSponsoredTx` already sent | Query `GetOrderStatus`. Do not resubmit or re-sign automatically. |
| `unknown`, missing RFQ/position, timeout or failed lookup | Treat the outcome as unknown. |

Across reconnects, keep the selected `order_id` and whether you sent the signature. Ignore wallet results from an older connection or selection. `SignatureTimeout` does not identify the RFQ. Use the matching `RfqAvailableAgain` / `RfqClosed` or re-read state.

There is no replay cursor. Compare entity versions on lifecycle pushes. `OrderConfirmed` means executed; `RfqClosed` ends the auction but does not resolve a pending execution.

## Discovery

Discovery requests:

```json
{ "type": "GetMarkets", "data": { "request_id": "uuid" } }
{ "type": "GetMarketDescriptors", "data": { "request_id": "uuid", "active_only": true } }
{ "type": "GetExpiries", "data": { "request_id": "uuid" } }
{ "type": "GetTokens", "data": { "request_id": "uuid", "active_only": true } }
{ "type": "GetPositions", "data": { "request_id": "uuid" } }
{ "type": "GetMyActiveRfqs", "data": { "request_id": "uuid" } }
{ "type": "GetOrderStatus", "data": { "request_id": "uuid", "order_id": "0x...64chars" } }
{ "type": "GetSubscriptions", "data": { "request_id": "uuid" } }
{ "type": "GetIndicativePrices", "data": { "request_id": "uuid", "market": "MarketPdaBase58", "position_type": "covered_call" } }
{ "type": "GetTokenCaps", "data": { "request_id": "uuid" } }
{ "type": "GetEarnSummary", "data": { "request_id": "uuid" } }
{ "type": "GetTokenMarketsInfo", "data": { "request_id": "uuid", "underlying_mint": "UnderlyingMintBase58" } }
```

`request_id` is required for these query-style requests.

Query-style responses echo the same `request_id`:

- `Markets`, `MarketDescriptors`, `Expiries`, `Tokens`
- `Positions`, `MyActiveRfqs`, `OrderStatus`, `Subscriptions`
- `IndicativePrices`
- `TokenCaps`
- `EarnSummary`
- `TokenMarketsInfo`

`active_only`:
- defaults to `true` for `GetMarketDescriptors` and `GetTokens`
- `true` returns tradable markets: not finalized, not disabled, and before the pre-expiry trading cutoff; `false` returns all markets/tokens
- `GetExpiries` has no `active_only` field and returns the tradable set

### Market size rules

`GetMarketDescriptors` and `GetTokens` require a size rule for every underlying mint. If any market lacks one, the whole request fails with `missing_size_rule_for_underlying_mint`.

### MarketDescriptors payload

`MarketDescriptors` returns `MarketDescriptorInfo[]`:

```typescript
type MarketDescriptorInfo = {
  market: {
    chain_id: number;
    program_id: string;
    market_pda: string;
    underlying_mint: string;
    quote_mint: string;
    expiry_ts: number;
    is_put: boolean;
    collateral_mint: string;
    settlement_mint: string;
  };
  underlying_oracle_pda: string;
  quote_oracle_pda: string;
  underlying_decimals: number;
  quote_decimals: number;
  size_rule: {
    min_size: number;
    max_size: number;
    step: number;
  };
  underlying_symbol: string;
  quote_symbol: string;
};
```

`size_rule` semantics (per underlying mint):
- `min_size <= quantity <= max_size`
- `(quantity - min_size) % step == 0`
- if the market's underlying mint has no rule, the server rejects the RFQ (`Generic` error with `code: "missing_size_rule_for_underlying_mint"`)

For cash-secured puts, `size_rule` still applies to the underlying quantity, not the quote deposit. Convert quote-denominated input (e.g. USDC) before sending `RfqRequest`. Formulas and SDK helpers are in [WS common conventions](ws-common.md) "Quantity and collateral by position type".

`underlying_symbol`, `quote_symbol`, and token `symbol` are mandatory and non-null in discovery payloads.

### Tokens payload

`Tokens` returns:

```typescript
type TokenInfo = {
  mint: string;
  decimals: number;
  size_rule: {
    min_size: number;
    max_size: number;
    step: number;
  };
  symbol: string;
};

type Tokens = {
  request_id: string;
  underlyings: TokenInfo[];
  quotes_by_underlying: Record<string, TokenInfo[]>;
};
```

`size_rule` and `symbol` are present on every token. In `quotes_by_underlying`, each quote token carries its parent underlying's rule.

### Positions payload

`Positions` returns `PositionInfo[]`:

```json
{
  "type": "Positions",
  "data": {
    "request_id": "uuid",
    "positions": [
      {
        "pda": "PositionPdaBase58",
        "market": "MarketPdaBase58",
        "underlying_mint": "UnderlyingMintBase58",
        "quote_mint": "QuoteMintBase58",
        "position_type": "cash_secured_put",
        "status": "open",
        "strike": 136000000000,
        "quantity": 20000000,
        "price": 50000000,
        "total_premium": 987654,
        "created_at": 1710000042,
        "expiry_ts": 1710600000
      }
    ]
  }
}
```
`is_otm` is omitted for open/funded positions. After settlement or liquidation it is `true` (out-of-the-money) or `false` (in-the-money).

Field semantics:
- `price`: gross premium per 1 underlying unit (1e9 scale)
- `total_premium`: net premium amount from on-chain position state (quote atomic units)
- all amount fields are unsigned (`u64`); timestamps remain Unix seconds

### MyActiveRfqs payload

```json
{
  "type": "MyActiveRfqs",
  "data": {
    "request_id": "uuid",
    "rfqs": [
      {
        "rfq_id": "uuid",
        "market": "MarketPdaBase58",
        "position_type": "cash_secured_put",
        "strike": 136000000000,
        "quantity": 20000000,
        "expires_at": 1710000030,
        "state": "active",
        "locked_order_id": null,
        "quotes_count": 3,
        "best_price": 50000000
      }
    ]
  }
}
```

`state` values: `active`, `pending_signature`, `enqueued`.
`locked_order_id` is set when the RFQ is locked on an order (`pending_signature` or `enqueued`).
`best_price` is `null` when there are no quotes.

### Position lifecycle (taker perspective)

Once your position is `open`:

1. The maker may deposit the settlement asset before market expiry.
2. After expiry, the market is finalized with an oracle price.
3. If your position is OTM, you get your collateral back. If ITM, you receive the maker's settlement asset.
4. If the maker did not fund and your position is ITM, normal settlement fails until a liquidator submits a liquidation transaction. You receive the settlement asset when that transaction lands.

See [Protocol Flow](protocol-flow.md) for all settlement scenarios.

## Dynamic subscription management

Change subscriptions incrementally:

```json
{ "type": "AddMints", "data": { "request_id": "uuid", "underlying_mints": ["MintBase58"], "quote_mints": ["MintBase58"] } }
{ "type": "RemoveMints", "data": { "request_id": "uuid", "underlying_mints": ["MintBase58"] } }
{ "type": "AddChannels", "data": { "request_id": "uuid", "channels": ["trades"] } }
{ "type": "RemoveChannels", "data": { "request_id": "uuid", "channels": ["stats"] } }
```

All four respond with `SubscriptionUpdated` carrying the resulting state:

```json
{
  "type": "SubscriptionUpdated",
  "data": {
    "request_id": "uuid",
    "channels": ["markets", "trades"],
    "underlying_mints": ["MintBase58"]
  }
}
```

In subscription responses, an omitted mint list means that dimension is unfiltered. In requests, an omitted or null list keeps the current filter and an empty list clears it.

## Invite gating (closed mainnet)

During closed mainnet, takers need an invite code to trade.

### RequireInvite (server -> taker)

```json
{ "type": "RequireInvite" }
```

Unit variant, no `data` field. Sent once after `AuthSuccess` if the taker has not redeemed an invite.

### RedeemInvite (taker -> server)

```json
{
  "type": "RedeemInvite",
  "data": {
    "request_id": "uuid",
    "code": "abc123"
  }
}
```

`RedeemInvite` has no signature field. The authenticated session proves wallet ownership.

### InviteRedeemed (server -> taker)

```json
{
  "type": "InviteRedeemed",
  "data": {
    "request_id": "uuid",
    "referral_code": "mycode"
  }
}
```

`referral_code` is the taker's own shareable code.

### ClaimReferralCode (taker -> server)

```json
{
  "type": "ClaimReferralCode",
  "data": {
    "request_id": "uuid",
    "code": "mypreferred"
  }
}
```

Claim a custom referral code (replaces the auto-assigned one).

### ReferralCodeClaimed (server -> taker)

```json
{
  "type": "ReferralCodeClaimed",
  "data": {
    "request_id": "uuid",
    "referral_code": "mypreferred"
  }
}
```

### GetMyReferralInfo (taker -> server)

```json
{ "type": "GetMyReferralInfo", "data": { "request_id": "uuid" } }
```

### MyReferralInfo (server -> taker)

```json
{
  "type": "MyReferralInfo",
  "data": {
    "request_id": "uuid",
    "referral_code": "mycode",
    "status": "active",
    "total_invited": 3,
    "invited_this_period": 1,
    "max_invites_per_period": 5,
    "next_slot_frees_in_seconds": 86400
  }
}
```

### Invite error types

Invite errors use typed `ServerError` variants (delivered as `RequestError` when `request_id` is present):

`InviteRequired`: an unregistered taker attempted a trading action.

`Invite` errors from `RedeemInvite`:

| Value | Meaning |
|-------|---------|
| `invalid_code` | Code does not exist |
| `code_exhausted` | Code has no remaining uses |
| `code_expired` | Code has expired |
| `code_disabled` | Code has been disabled |
| `code_owner_inactive` | Code owner is inactive |
| `code_owner_blacklisted` | Code owner is blacklisted |
| `already_registered` | Taker already registered |
| `internal_error` | Server error |

`Claim` errors from `ClaimReferralCode`:

| Value | Meaning |
|-------|---------|
| `not_registered` | Taker not registered (must redeem invite first) |
| `invalid_format` | Code format invalid |
| `code_taken` | Code already claimed by another user |
| `reserved` | Code is reserved |
| `internal_error` | Server error |

## Token caps

Platform-level open interest and notional caps, e.g. for showing
"X SOL available out of Y SOL" per market or underlying. No authentication required.

### GetTokenCaps (taker -> server)

```json
{ "type": "GetTokenCaps", "data": { "request_id": "uuid" } }
```

### TokenCaps (server -> taker)

```typescript
type TokenCapsData = {
  request_id: string;          // echoed from request
  tokens: TokenCapInfo[];      // OI caps by underlying mint
  markets?: MarketCapInfo[];   // OI caps by market PDA, omitted when empty
  quotes?: QuoteCapInfo[];     // notional caps by quote mint, omitted when empty
};

type TokenCapInfo = {
  underlying_mint: string;     // base58
  symbol: string;              // e.g. "SOL"
  current_oi: number;          // current open interest (underlying atomic units)
  max_oi: number;              // limit in underlying atomic units; 0 = configured zero capacity
  utilization: number;         // current_oi / max_oi (not clamped to 1.0)
};

type MarketCapInfo = {
  market_id: string;           // market PDA base58
  current_oi: number;          // current OI for this market
  max_oi: number;              // authorized limit
  utilization: number;
};

type QuoteCapInfo = {
  quote_mint: string;          // base58
  symbol: string;              // e.g. "USDC"
  current_notional: number;    // exposure plus live reservations (quote atomic units)
  max_notional: number;        // authorized limit (quote atomic units)
  utilization: number;
};
```

Amounts are `u64` JSON numbers: underlying atomic units for OI, quote atomic units for notional.

Only scopes with a configured budget are returned. A missing token or market is uncapped.

`GetTokenCaps.include_markets` is accepted but ignored. Configured market caps are returned when present.

## TokenMarketsInfo

`GetTokenMarketsInfo { request_id, underlying_mint }` works after `Welcome` without authentication. It returns one market-page snapshot:

```json
{
  "type": "TokenMarketsInfo",
  "data": {
    "request_id": "uuid",
    "underlying_symbol": "SOL",
    "underlying_decimals": 9,
    "quote_symbol": "USDC",
    "quote_decimals": 6,
    "size_rule": { "min_size": 100000000, "max_size": 10000000000, "step": 100000000 },
    "reference_price": 150000000000,
    "markets": [{
      "market_pda": "MarketPdaBase58",
      "expiry_ts": 1710600000,
      "is_put": false,
      "indicatives": [{
        "position_type": "covered_call",
        "updated_at": 1710000000,
        "is_stale": false,
        "strikes": [{ "strike": 160000000000, "best_price": 50000000 }]
      }]
    }]
  }
}
```

`reference_price` is the backend-validated underlying/quote spot, scaled by `1e9`. `best_price` is a non-binding indicative premium per underlying unit, scaled by `1e9`, after the quote-mint fee adjustment (unadjusted if the fee config is unavailable). It is an estimate of the on-chain net premium and may be absent. Size-rule quantities are underlying atomic units.

The response does not echo `underlying_mint`; keep it with the request ID. Compute APR from spot and premiums in the same response, and skip it when the indicative is stale or missing. `updated_at` / `is_stale` refer to the maker indicatives, not the oracle spot. There is no oracle publish time, confidence or age.

The backend handles Pyth/Hermes access, so clients need no Pyth key. There is no history and the prices are not binding.

Missing size rules, incomplete metadata or an unavailable oracle price return an uncorrelated `Error` (e.g. `OraclePriceNotReady`), not a `RequestError`. With no active markets for the underlying, the server sends no response at all, so set a request deadline and discard stale responses by request ID.

## Indicative prices

### GetIndicativePrices (taker -> server)

```json
{
  "type": "GetIndicativePrices",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "position_type": "covered_call"
  }
}
```

### IndicativePrices (server -> taker)

```json
{
  "type": "IndicativePrices",
  "data": {
    "request_id": "uuid",
    "market": "MarketPdaBase58",
    "position_type": "covered_call",
    "updated_at": 1710000000,
    "is_stale": false,
    "strikes": [
      { "strike": 450000000000, "best_price": 5000000 },
      { "strike": 460000000000, "best_price": null }
    ]
  }
}
```

## Earn summary

Aggregated earn data per asset: APR ranges, capacity utilization, nearest market.
No authentication required.

### GetEarnSummary (taker -> server)

```json
{ "type": "GetEarnSummary", "data": { "request_id": "uuid" } }
```

### EarnSummary (server -> taker)

```json
{
  "type": "EarnSummary",
  "data": {
    "request_id": "uuid",
    "assets": [
      {
        "underlying_mint": "UnderlyingMintBase58",
        "underlying_symbol": "SOL",
        "quote_mint": "QuoteMintBase58",
        "quote_symbol": "USDC",
        "position_type": "covered_call",
        "min_apr": 5.2,
        "max_apr": 18.7,
        "cap_filled_pct": 0.45,
        "cap_total": 100000000000,
        "cap_used": 45000000000,
        "strikes_count": 3,
        "nearest_market_pda": "MarketPdaBase58",
        "markets_count": 2,
        "nearest_expiry_ts": 1710600000
      }
    ],
    "computed_at": 1710000000
  }
}
```

Field semantics:
- `min_apr` / `max_apr`: annualized percentage rate range across active strikes. `null` if no indicative prices available.
- `cap_filled_pct`: fraction of capacity used, not clamped to 1.0. It may exceed 1.0 after limits are tightened. A zero limit reports saturated utilization 1.0. See [caps](caps.md#monitoring-caps).
- `cap_total` / `cap_used`: underlying atomic units.
- `nearest_market_pda`: market PDA with the nearest expiry.
- `nearest_expiry_ts`: Unix seconds of the nearest market expiry.
- `computed_at`: Unix seconds when the server computed the summary.

## Authentication requirements

### Does not require auth

- `GetMarkets`
- `GetMarketDescriptors`
- `GetExpiries`
- `GetTokens`
- `GetTokenCaps`
- `GetIndicativePrices`
- `GetEarnSummary`
- `GetTokenMarketsInfo`
- `GetSubscriptions`
- `AddMints`, `RemoveMints`, `AddChannels`, `RemoveChannels`
- `ResumeAuth`, `StartAuth`, `AuthChallenge` (these perform auth)

### Requires auth

- `GetPositions`
- `GetMyActiveRfqs`
- `GetOrderStatus`
- `RfqRequest`, `AcceptQuote`, `CancelRfq`, `SubmitSignedSponsoredTx`
- `Subscribe`, `Unsubscribe`
- `RedeemInvite`, `ClaimReferralCode`, `GetMyReferralInfo`

### Requires auth + invite

- `RfqRequest` (server returns `InviteRequired` error if taker has not redeemed an invite)

## Errors

Two error message types: `Error` (connection-level) and `RequestError` (request-correlated).
See [WS common conventions](ws-common.md) "Error format" for the envelope.

Error handling:

1. Handle `RequestError` where you pass `request_id` (e.g. `GetPositions`, `Subscribe`).
2. Handle `Error` for connection-level failures (auth, WS errors, unknown request).
3. For both, switch on `ServerError.type`.
4. If `type == "Generic"`, switch on `data.code`.
5. Keep fallback handling for unknown `Generic` codes.

Common typed `ServerError` variants (PascalCase on the wire):
- `RfqNotFound`, `RfqNotActive`
- `QuoteNotFound`, `QuoteExpired`
- `SignatureTimeout`
- `InvalidPositionType`, `InvalidMarket`
- `OracleNotReady`, `OraclePriceNotReady`, `OraclePriceStale`
- `MarketMetadataIncomplete`, `TokenMetadataIncomplete`
- `Cap` (position, notional, or balance cap exceeded)
- `RateLimit` (data is a plain string reason code)
- `KernelNotAvailable`
- `ServerShuttingDown`
- `Unauthenticated`, `Unauthorized`
- `InviteRequired` (taker not registered; must redeem invite)
- `Invite` (data is `InviteErrorReason` string, e.g. `"invalid_code"`)
- `Claim` (data is `ClaimErrorReason` string, e.g. `"code_taken"`)

Common `Generic` variant `code` values in taker flows:
- `missing_size_rule_for_underlying_mint`: no configured size rule for RFQ market underlying mint
- `invalid_quantity_size_rule`: RFQ `quantity` violates `min/max/step` constraint
- `trading_paused`: backend or on-chain pause blocks new trading actions
- `session_expired`: `ResumeAuth` with invalid/expired/revoked session
- `already_authenticated`: `ResumeAuth` on an already authenticated connection
- `hello_required`, `hello_timeout`, `hello_already_sent`
- `parse_error`, `too_many_parse_errors`, `message_too_large`
- `internal_error`

### RateLimitReason (in typed `RateLimit` error)

| Value | Meaning |
|-------|---------|
| `too_many_active_rfqs_total` | Platform-wide RFQ limit reached |
| `too_many_active_rfqs_per_taker` | Per-taker RFQ limit reached |
| `too_many_sessions_per_user` | Too many concurrent sessions |
