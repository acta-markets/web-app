# Acta Taker Wire Examples

Addresses, signatures, IDs and timestamps below are placeholders. Request, session and RFQ IDs are UUIDs. `order_id` is 64-char hex (32 bytes, optional `0x`). Pubkeys and mints are base58. Amounts are `u64`: price and strike are 1e9-scaled, quantity is in underlying atomic units. Timestamps are Unix seconds unless the field name ends in `_ms`.

## Complete Session (happy path)

### 1) Hello (client → server)

```json
{
  "type": "Hello",
  "data": {
    "protocol_version": "1.0.0",
    "features": [],
    "client_name": "my-app",
    "client_version": "0.1.0"
  }
}
```

### 2) Welcome (server → client)

```json
{
  "type": "Welcome",
  "data": {
    "protocol_version": "1.0.0",
    "server_version": "0.1.0",
    "min_supported_version": "1.0.0",
    "enabled_features": [],
    "server_time_unix_ms": 1710000000000,
    "min_quote_validity_seconds": 100,
    "settlement_buffer_seconds": 90
  }
}
```

### 3) StartAuth → AuthRequest → AuthChallenge → AuthSuccess

Taker auth is lazy and can wait until the first action that needs it. Fresh sign starts with your wallet pubkey:

```json
{ "type": "StartAuth", "data": { "pubkey": "TakerWalletPubkeyBase58" } }
```

The taker challenge has a `Wallet:` line. The maker challenge does not:

```json
{
  "type": "AuthRequest",
  "data": {
    "challenge": "Acta RFQ Authentication\n\nSign this message to authenticate your wallet.\n\nWallet: TakerWalletPubkeyBase58\nNonce: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nIssued At: 2024-03-09T12:00:00Z\n"
  }
}
```

Validate the [canonical challenge](../reference/ws-common.md#what-to-sign), including the wallet. Sign its original UTF-8 bytes, base58-encode the 64-byte signature, and echo it back:

```json
{
  "type": "AuthChallenge",
  "data": {
    "challenge": "Acta RFQ Authentication\n\nSign this message to authenticate your wallet.\n\nWallet: TakerWalletPubkeyBase58\nNonce: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nIssued At: 2024-03-09T12:00:00Z\n",
    "signature": "3q7uQqYc3...base58sig",
    "pubkey": "TakerWalletPubkeyBase58"
  }
}
```

The signature is verified against `pubkey`. On success:

```json
{
  "type": "AuthSuccess",
  "data": {
    "session_id": "6d1f0c2a-9b7e-4a35-8c41-2e5f7a9b0d13",
    "expires_at": 1710086400
  }
}
```

For takers, `expires_at` is a number. Store `session_id` and `expires_at` for `ResumeAuth`.

### 4) Snapshot (server → client)

Sent after `AuthSuccess`. `markets` lists active markets in the compact `MarketInfo` shape; full descriptors come from step 5:

```json
{
  "type": "Snapshot",
  "data": {
    "markets": [
      {
        "pda": "MarketPdaBase58",
        "underlying": "So11111111111111111111111111111111111111112",
        "quote": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "expiry_ts": 1710600000,
        "is_put": false,
        "status": "active"
      }
    ]
  }
}
```

### 5) GetMarketDescriptors → MarketDescriptors

Full descriptors carry `size_rule`, decimals and oracle PDAs, needed to validate `quantity` and render prices.

```json
{ "type": "GetMarketDescriptors", "data": { "request_id": "2c7e4a91-5d3b-4f60-9a8e-1b4c6d2f7e05" } }
```

```json
{
  "type": "MarketDescriptors",
  "data": {
    "request_id": "2c7e4a91-5d3b-4f60-9a8e-1b4c6d2f7e05",
    "markets": [
      {
        "market": {
          "chain_id": 0,
          "program_id": "33Ezs5eoa16QyPW8wifnyz2nCyMEcq2crqkVBNjnTE8U",
          "market_pda": "MarketPdaBase58",
          "underlying_mint": "So11111111111111111111111111111111111111112",
          "quote_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "expiry_ts": 1710600000,
          "is_put": false,
          "collateral_mint": "So11111111111111111111111111111111111111112",
          "settlement_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        },
        "underlying_oracle_pda": "UnderlyingOraclePdaBase58",
        "quote_oracle_pda": "QuoteOraclePdaBase58",
        "underlying_decimals": 9,
        "quote_decimals": 6,
        "size_rule": { "min_size": 1000000000, "max_size": 100000000000, "step": 1000000000 },
        "underlying_symbol": "SOL",
        "quote_symbol": "USDC"
      }
    ]
  }
}
```

### 6) Subscribe → SubscribeAck

`request_id` is required. Takers subscribe to `chain_events` (position settled or liquidated) and optionally `trades`, `stats` and `markets`. `rfqs` is a maker channel. A taker's own RFQ, quote and order events arrive directly on the session.

```json
{
  "type": "Subscribe",
  "data": {
    "request_id": "4e9a2b17-8c6d-4f31-a5e0-7d3b1c9f2a64",
    "channels": ["chain_events", "trades"],
    "underlying_mints": [],
    "quote_mints": []
  }
}
```

```json
{
  "type": "SubscribeAck",
  "data": { "request_id": "4e9a2b17-8c6d-4f31-a5e0-7d3b1c9f2a64", "subscribed": ["chain_events", "trades"] }
}
```

### 7) RfqRequest → RfqCreated

`quantity` is underlying atomic units (also for cash-secured puts). Here: 5 SOL, covered call, strike 136.0.

```json
{
  "type": "RfqRequest",
  "data": {
    "request_id": "7a4c4b3e-2f1d-4c55-9a51-4f0d0e2b6a42",
    "market": "MarketPdaBase58",
    "position_type": "covered_call",
    "strike": 136000000000,
    "quantity": 5000000000,
    "timeout_seconds": 30
  }
}
```

```json
{ "type": "CommandAccepted", "data": { "request_id": "7a4c4b3e-2f1d-4c55-9a51-4f0d0e2b6a42" } }
```

```json
{
  "type": "RfqCreated",
  "data": {
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "rfq_version": 1,
    "request_id": "7a4c4b3e-2f1d-4c55-9a51-4f0d0e2b6a42",
    "expires_at": 1710000030,
    "created_at": 1710000000,
    "order_options": [{ "strike": 136000000000 }]
  }
}
```

`RfqCreated` can arrive before or after `CommandAccepted`.

### 8) QuoteReceived, streamed 0..N (server → client)

Each quote is firm and hash-bound via `order_id`. Two makers respond:

```json
{
  "type": "QuoteReceived",
  "data": {
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "strike": 136000000000,
    "maker": "MakerAOwnerPubkeyBase58",
    "price": 50000000,
    "net_price": 49750000,
    "valid_until": 1710000330,
    "nonce": 42,
    "order_id": "0x1111111111111111111111111111111111111111111111111111111111111111"
  }
}
```

```json
{
  "type": "QuoteReceived",
  "data": {
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "strike": 136000000000,
    "maker": "MakerBOwnerPubkeyBase58",
    "price": 51000000,
    "net_price": 50745000,
    "valid_until": 1710000335,
    "nonce": 7,
    "order_id": "0x2222222222222222222222222222222222222222222222222222222222222222"
  }
}
```

You pick the winner by `order_id` (here maker B, the higher premium). `net_price` is for display. Accept with `price` and `order_id`.

### 9) AcceptQuote → CommandAccepted → SponsoredTxToSign

```json
{
  "type": "AcceptQuote",
  "data": {
    "request_id": "0c9e1d52-6c0b-4f7e-b1a9-7d8f3c2e5a10",
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "maker": "MakerBOwnerPubkeyBase58",
    "order_id": "0x2222222222222222222222222222222222222222222222222222222222222222"
  }
}
```

```json
{ "type": "CommandAccepted", "data": { "request_id": "0c9e1d52-6c0b-4f7e-b1a9-7d8f3c2e5a10" } }
```

```json
{
  "type": "SponsoredTxToSign",
  "data": {
    "order_id": "0x2222...2222",
    "tx_base64": "AQABAg... (base64 v0 VersionedTransaction) ...",
    "last_valid_block_height": 312456789,
    "signature_deadline": 1710000030
  }
}
```

A receipt and its lifecycle push (`SponsoredTxToSign` here, `OrderAccepted` in step 10) can arrive in either order. `last_valid_block_height` is the block height the transaction's blockhash is valid through. Sign `tx_base64` and return it before `signature_deadline`. For an ordinary maker quote the taker fills signature slot 1 and slot 0 is the keeper fee payer. For a vault maker quote the taker is the fee payer and fills slot 0. Byte layout: [Sponsored transaction: raw signing](taker-quickstart.md#sponsored-transaction-raw-signing).

### 10) SubmitSignedSponsoredTx → CommandAccepted → OrderAccepted → OrderSubmitted → OrderConfirmed

```json
{
  "type": "SubmitSignedSponsoredTx",
  "data": {
    "request_id": "5f2b8a61-3d4e-4b7c-8e9f-1a2b3c4d5e6f",
    "order_id": "0x2222...2222",
    "tx_base64": "AQABAg... (same tx, taker slot now filled) ..."
  }
}
```

```json
{ "type": "CommandAccepted", "data": { "request_id": "5f2b8a61-3d4e-4b7c-8e9f-1a2b3c4d5e6f" } }
```

```json
{ "type": "OrderAccepted", "data": { "order_id": "0x2222...2222", "order_version": 1 } }
```

```json
{
  "type": "OrderSubmitted",
  "data": {
    "order_id": "0x2222...2222",
    "tx_signature": "5eyk...base58sig",
    "order_version": 2
  }
}
```

```json
{
  "type": "OrderConfirmed",
  "data": {
    "order_id": "0x2222...2222",
    "position_pda": "PositionPdaBase58",
    "order_version": 4
  }
}
```

`tx_signature` arrives on `OrderSubmitted` (not repeated on `OrderConfirmed`).

### 11) RfqClosed (server → client)

Terminal RFQ event. On a fill it follows `OrderConfirmed`. Drop per-RFQ state here.

```json
{
  "type": "RfqClosed",
  "data": {
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "rfq_version": 2,
    "reason": "filled",
    "winner": {
      "maker": "MakerBOwnerPubkeyBase58",
      "price": 51000000,
      "tx_signature": "5eyk...base58sig"
    },
    "closed_at": 1710000012
  }
}
```

## Additional scenarios

### Session resume (skip the wallet signature)

```json
{ "type": "ResumeAuth", "data": { "session_id": "6d1f0c2a-9b7e-4a35-8c41-2e5f7a9b0d13" } }
```

Valid session: `AuthSuccess` as in step 3, without signing. Invalid or expired: `AuthError`:

```json
{ "type": "AuthError", "data": { "reason": "session_expired" } }
```

### Cancel an RFQ

```json
{ "type": "CancelRfq", "data": { "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e", "request_id": "b3d5f7a9-1c2e-4f40-8b6d-9e0a2c4e6f81" } }
```

```json
{
  "type": "RfqClosed",
  "data": { "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e", "rfq_version": 2, "reason": "taker_cancelled", "closed_at": 1710000020 }
}
```

### Blockhash expiry → reopen

The keeper retries retryable submission failures within five attempts. If the outcome is still uncertain, the order stays `Enqueued`. Check it with `GetOrderStatus`. A reported blockhash failure:

```json
{
  "type": "OrderFailed",
  "data": { "order_id": "0x2222...2222", "reason": "blockhash_expired", "order_version": 3 }
}
```

Only a locally proven-unforwarded failure may reopen an eligible RFQ with `reason: "tx_failed"`:

```json
{
  "type": "RfqAvailableAgain",
  "data": {
    "rfq_id": "8f3e7e6a-4f5c-4b7c-9f1d-1f2a3b4c5d6e",
    "rfq_version": 3,
    "reason": "tx_failed",
    "available_again_at": 1710000015
  }
}
```

The winning quote is discarded. Pick from the remaining quotes and do not replay the old `order_id`. `RfqAvailableAgain.reason` is an enum: `signature_timeout`, `tx_failed`, `tx_build_failed`. `OrderFailed.reason` is a free-form diagnostic string. Display it; do not match exact values or use it to authorize re-acceptance.

`order_version`: accepted `1`, submitted `2`, failed/expired `3`, confirmed `4`.
A late on-chain confirmation replaces a local failure. A failure does not replace a confirmation.

### RFQ expired with no fill

```json
{
  "type": "RfqClosed",
  "data": { "rfq_id": "9a4f8f7b-5a6d-4c8d-8a2e-2a3b4c5d6e7f", "rfq_version": 1, "reason": "expired", "closed_at": 1710000060 }
}
```

### Invite gating (closed mainnet only)

After `AuthSuccess`, an unregistered taker receives (unit variant, no `data`):

```json
{ "type": "RequireInvite" }
```

Redeem before trading:

```json
{ "type": "RedeemInvite", "data": { "request_id": "c8e2a4f6-3b5d-4a71-9c0e-5f7a9b1d3e26", "code": "abc123" } }
```

```json
{
  "type": "InviteRedeemed",
  "data": { "request_id": "c8e2a4f6-3b5d-4a71-9c0e-5f7a9b1d3e26", "referral_code": "my-code" }
}
```

An `RfqRequest` before redemption fails with `InviteRequired` in a `RequestError` carrying its `request_id`. Devnet needs no invite.

### Size-rule violation (RequestError)

`quantity` must satisfy `min_size <= quantity <= max_size` and `(quantity - min_size) % step == 0`:

```json
{
  "type": "RequestError",
  "data": {
    "request_id": "1e3a5c7e-9b0d-4f26-8a4c-6e8a0c2e4f93",
    "error": { "type": "Generic", "data": { "code": "invalid_quantity_size_rule", "message": "quantity violates min/max/step" } }
  }
}
```

### Recovery after reconnect

Subscriptions and in-flight state are not replayed. Re-auth, resubscribe, then query. Pending signatures and `OrderStatus` states are covered in [Delivery and recovery](../reference/taker-api.md#delivery-and-recovery).

```json
{ "type": "GetMyActiveRfqs", "data": { "request_id": "d2f4a6c8-7e9b-4b13-8d5f-0a2c4e6a8b37" } }
{ "type": "GetOrderStatus",  "data": { "request_id": "e5a7c9e1-2b4d-4c68-9f1a-3c5e7a9b1d48", "order_id": "0x2222...2222" } }
{ "type": "GetPositions",    "data": { "request_id": "f1b3d5e7-9a2c-4d84-8e6a-4b6c8d0e2f59" } }
```

```json
{
  "type": "Positions",
  "data": {
    "request_id": "f1b3d5e7-9a2c-4d84-8e6a-4b6c8d0e2f59",
    "positions": [
      {
        "pda": "PositionPdaBase58",
        "market": "MarketPdaBase58",
        "underlying_mint": "So11111111111111111111111111111111111111112",
        "quote_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "position_type": "covered_call",
        "status": "open",
        "strike": 136000000000,
        "quantity": 5000000000,
        "price": 51000000,
        "total_premium": 253725,
        "created_at": 1710000012,
        "expiry_ts": 1710600000
      }
    ]
  }
}
```

## Related

- [Taker API reference](../reference/taker-api.md): messages and error variants
- [Taker quickstart](taker-quickstart.md): walkthrough and raw sponsored-tx signing
- [WebSocket conventions](../reference/ws-common.md): units, envelopes, timeouts
