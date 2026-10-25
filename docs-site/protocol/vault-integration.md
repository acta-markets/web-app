# Vault API, SDKs and swaps

A vault integration uses public HTTP reads, wallet-signed capital transactions and an authenticated operator WebSocket session.

## Public reads

Routes use the `/api/v1` prefix:

| Route | Use |
| --- | --- |
| `GET /vaults` | List open vaults and their indexed state. |
| `GET /vaults/{pda}` | Vault detail and performance. |
| `GET /vaults/{pda}/cycles` | Indexed cycle history. |
| `GET /vaults/{pda}/positions` | Vault position memberships. |
| `GET /vaults/{pda}/depositors/{wallet}` | Open requests and indexed totals for a depositor. |
| `GET /vaults/{pda}/depositors/{wallet}/history` | Depositor history for one vault. |
| `GET /depositors/{wallet}` | Depositor activity across vaults. |
| `GET /depositors/{wallet}/history` | Cross-vault indexed history. |

Closed vaults drop out of list and detail but keep their history routes. Shares can move between wallets, so read current share balances over RPC.

Paginate with the returned cursor. Fields and errors are in [Vault HTTP API](../reference/vault-http-api.md).

## Capital transactions

The TypeScript SDK's vault instruction builders and `/vault` client (`ActaWsClient` with role `"vault"`, from `@acta-markets/ts-sdk/ws`; there is no `./vault` subpath) prepare deposit, withdrawal, cancellation, refund and capital-processing instructions. The depositor signs their own requests. Governance or a delegate with the right permission signs manager operations. Public processing follows the timing rules in [Request processing](vault-lifecycle.md#request-processing).

Redeem all remaining shares with the SDK's final-withdrawal builder.

TypeScript 0.2.0 renamed the payout fields. `processDeposits` takes `{ user, refundTo?, sharesTo? }` (was `refundDestination`, `shareDestination`), `processWithdrawals` takes `{ user, sharesBackTo? }`, `processFinalWithdrawal` takes an address or `{ user, sharesBackTo }`, and `liquidateVaultPosition(liquidator, { owner, paidTo }, position)` takes the writer as an address or `{ owner, paidTo? }`. In JavaScript the old field names are silently ignored, so the payout goes to the canonical ATA instead of the destination you meant. Rename them when upgrading.

## Operator session

The `/vault` endpoint authenticates an operator for one vault. After auth, load the current state and wait for readiness before trading. `permissions` is a `u32` bitmask of the granted actions, including for a wallet that is both governance and delegate. The TypeScript client emits `vaultAuthenticated` (not `authenticated`) with the `VaultAuthSuccess` data.

After `Hello` and `Welcome`, send:

```json
{
  "type": "StartVaultAuth",
  "data": {
    "operator": "<operator-wallet-base58>",
    "vault_pda": "<vault-pda-base58>"
  }
}
```

The `AuthRequest` challenge is the taker challenge with `Wallet:` set to the operator, followed by `\nVault: <vault_pda>` with no trailing newline (see [signing conventions](../reference/ws-common.md#what-to-sign)). Check it with `assertVaultAuthChallenge(challenge, operator, vault)` (TypeScript) or `validate_vault_auth_challenge(challenge, operator, vault)` (Rust); `validateAuthChallenge` rejects it. Then sign its original bytes and reply with `AuthChallenge`. `VaultAuthSuccess` returns `vault_pda`, `operator`, `operator_kind` (`governance` or `delegate`) and `permissions`.

A vault writing an option uses the taker RFQ flow. A vault buying an option acts as maker and signs holder quotes under its active primary-delegate grant. `is_taker_buy` is fixed at zero in the RFQ order.

A permission change can close an open session. Reconnect and authenticate again.

The session is subscribed to the `vaults` channel by default and receives `VaultProjectionAdvanced` for its own vault only: the vault row changed, reload `/api/v1/vaults/{pda}`. To follow the set of vaults, subscribe your `/maker` quote session or a taker session to `vaults` (`/maker/data` cannot subscribe). It receives `VaultProjectionAdvanced` for every vault and [`VaultCatalogChanged`](../reference/ws-common.md#vaultcatalogchanged) when a vault is created, re-delegated or closed; `/vault` sessions never get `VaultCatalogChanged`. `VaultCatalogChanged` is critical on `/maker` and `/taker`: on a full session queue it is dropped and the connection closed, so a loss shows up as a disconnect. It is not replayed, so also re-list vaults after every (re)connect.

### Funding bought options

An option the vault bought (as maker) is not funded at open. To exercise it in the money, the vault must fund it with `FUND_MAKER` (or governance): strike × quantity in the quote asset for a call, or the quantity in the underlying for a put, paid from the matching leg. The vault then receives the collateral at settlement. Builders: TypeScript `planner.trading.fundMakerPosition(position)`, Rust `VaultManager::fund_maker_position` (feature `chain`).

**Fund before expiry.** Once the market is finalized, anyone can liquidate an unfunded in-the-money position: the liquidator pays the writer and takes the collateral, and the vault loses the intrinsic value. Funding is still accepted after finalization until a settlement or liquidation lands, but then you are racing liquidators. Keep enough of the funding asset for every holder position you may need to exercise. The same applies to any maker that bought an option.

## Swaps

Request a vault swap quote for `main_to_second` or `second_to_main`. The backend builds a transaction with 1–4 swap hops. Each hop calls a registered program through the `SwapVenues` registry, and its instruction must match an allowed selector. Mainnet venues include Jupiter v6 and Exponent; devnet uses a registered mock router. The operator signs the transaction and the backend sends it.

```json
{
  "type": "SwapQuote",
  "data": {
    "request_id": "<uuid>",
    "vault_pda": "<vault-pda-base58>",
    "mode": "rebalance",
    "direction": "main_to_second",
    "amount": "10000000",
    "slippage_bps": 50
  }
}
```

`amount` is an input-token atomic amount as a decimal string. `slippage_bps` defaults to 50. `mode` is `rebalance`, `recovery` or `closing`, and each mode has its own phase and permission requirements. `rebalance` takes either direction in `active` before expiry while the vault has at least one open position, and only `second_to_main` in `processing_capital` before equity. `recovery` and `closing` are conversions back to the main asset and require `second_to_main`.

```json
{
  "type": "SwapQuoteResult",
  "data": {
    "request_id": "<uuid>",
    "execution_id": "<64 hex>",
    "mode": "rebalance",
    "tx_base64": "<base64 v0 VersionedTransaction>",
    "last_valid_block_height": 312456789,
    "in_amount": "10000000",
    "quoted_out_amount": "60128",
    "minimum_out_amount": "59827",
    "valid_until": "1710000060"
  }
}
```

Amounts and `valid_until` (Unix seconds) are decimal strings. `last_valid_block_height` is a number: the block height the transaction's blockhash is valid through. The transaction carries its price section. An optional `staging` field is `"stage"` or `"unstage"` for one half of a two-transaction swap; it is absent for a single transaction. `execution_id` names the swap in every later message. A failed quote is a `RequestError` with a code from the [WS error catalog](../reference/ws-common.md#ws-error-codes).

Review the terms and instructions, sign the transaction, then submit:

```json
{
  "type": "SwapSubmit",
  "data": {
    "request_id": "<new-uuid>",
    "execution_id": "<64 hex>",
    "signed_tx_base64": "<wallet-signed-transaction>"
  }
}
```

The contract checks the route, pair, mode, permissions, phase, safety mode and price accounts. Normal rebalance cannot touch unpriced idle capital.

```json
{ "type": "SwapSubmitResult", "data": { "request_id": "<new-uuid>", "execution_id": "<64 hex>" } }
```

`SwapSubmitResult` means the swap is durably queued, not executed. A failed `SwapSubmit` carries [`delivery`](../reference/ws-common.md#requesterror-request-correlated-errors) for that request: `not_forwarded` means it was rejected before queueing, `unknown` means it may have been queued. Treat a swap as not executed only if every `SwapSubmit` you sent for it returned `not_forwarded`.

Resolve `unknown`, a lost `SwapSubmitResult` or a restart with `GetSwapStatus` (TypeScript `getVaultSwapStatus({ execution_id })`, Rust `swap_status(execution_id)`):

```json
{ "type": "GetSwapStatus", "data": { "request_id": "<uuid>", "execution_id": "<64 hex>" } }
```

```json
{
  "type": "SwapStatus",
  "data": {
    "request_id": "<uuid>",
    "execution_id": "<64 hex>",
    "state": { "type": "finalized", "signature": "<tx-signature-base58>", "slot": 312456801 }
  }
}
```

`state.type` is `pending`, `finalized` (with `signature` and numeric `slot`), `failed`, `expired` or `unknown`. `unknown` means the server has no resolved handoff of this swap for this vault: none exists, or a failed handoff may still be retried or already be executing. It is not proof that nothing executed.

Every session of the vault also gets `SwapSettled` when the swap reaches a terminal state:

```json
{
  "type": "SwapSettled",
  "data": {
    "vault_pda": "<vault-pda-base58>",
    "execution_id": "<64 hex>",
    "state": { "type": "failed" }
  }
}
```

A push missed during a reconnect is not replayed, so poll `GetSwapStatus` after reconnecting.

In Rust, submit with `swap_submit_in_epoch(payload, epoch, gate)`: `epoch` is the connection epoch `wait_until_ready()` returned, and the swap is sent only on that connection and only if `gate` admits it (`Ungated` admits every send). There is no `swap_submit`.

## Two-stage swaps

A path that cannot fit in one transaction can use `VaultStagingSwap`:

1. `stage` moves a leg's tokens into a vault-owned account of an intermediate mint and records the staging slot.
2. `unstage` names the whole recorded amount, returns tokens to a vault leg and clears the slot. The route may leave permitted dust in the intermediate account.

Each half has its own `execution_id`, minimum output and terminal status. After the stage is finalized, request a new quote with a new `request_id`. While a slot is open, `in_amount` is the staged amount. Re-read the vault before checking and signing the next transaction.

A new stage uses `stagedGeneration + 1`; an unstage uses the open slot's generation, mint and exact amount. A stage cannot top up an open slot. HTTP exposes the slot as `staging` and keeps `staged_generation` after it closes.

Equity processing, cycle finalization and final redemption wait until the slot is empty. Deposit refunds and request cancellations keep their own eligibility rules. See [Lifecycle and safety modes](vault-lifecycle.md#staged-assets) and [Transaction recovery](recovery.md#an-intermediate-asset-is-staged).

## Checked signing

Do not sign a served transaction blind. The SDKs rebuild the expected instructions from the intent and compare fee payer, signers, compute budget, account flags and instruction data. Swap verification also checks the price section, hop chain and staging slot. Hop accounts cannot introduce signers or the payer, make pinned read-only accounts writable, or use the share mint or share account.

A swap's minimum output must meet your own floor (`min_output_floor` in Rust, `minOutputFloor` in TypeScript). This floor does not apply to the first `stage`, whose output is an intermediate asset. Each half still has its own minimum output and contract price-drift check.

| | Rust (`acta-maker-sdk` 0.5.4, feature `vault`) | TypeScript (`@acta-markets/ts-sdk` 0.2.4) |
| --- | --- | --- |
| Position open | `VaultOperatorClient::verify_and_sign_sponsored_tx` | `verifyAndSignSponsoredTx` from `/ws` |
| Swap | `VaultOperatorClient::verify_and_sign_swap` | `verifyAndSignSwap` from `/ws` |
| Verify only | `chain::vault::verify_vault_open` / `verify_vault_swap` | `flows.verifyVaultOpen` / `flows.verifyVaultSwap` |
| Price routes | `PriceRoute::from_account` at `VaultAddresses::{main,second}_price_route` | `fetchVaultPriceRoutes` from `/chain` |

Rust takes `VaultSwapIntent { vault, request, quote, price_routes: PairPriceRoutes { main, second, staging, shards }, min_output_floor, account }`. `account` is the decoded `VaultAccount` before the request; verification checks its second leg and staging slot.

TypeScript takes `{ vault: planner, request, quote, priceRoutes, minOutputFloor, staging }`. Build `priceRoutes` as `{ ...(await fetchVaultPriceRoutes(rpc, planner)), staging: acceptedStagingRoutes, shards }`. The separate `staging: VaultStagingSlot` comes from the decoded vault's `stagedMint`, `stagedAmount` and `stagedGeneration`.

In both SDKs, the routes' `staging` list names the intermediate mints you accept; an empty list refuses staged swaps. `shards` lists accepted Pyth push-oracle shards. `request` is the original `SwapQuoteData`, including `request_id` and `vault_pda`. Neither intent takes a router field.

The current checked helpers do not accept a served `RecoveryStage`: they rebuild a `"stage"` quote as ordinary `Stage`, while the backend emits the distinct recovery mode. The contract and TypeScript manual planner support recovery staging. Rust 0.5.4 has no manual builder for this mode either.

## Building swaps

TypeScript `VaultSwapPlan` takes `priceSection`, `amountIn`, `minimumOut`, `validUntil` and `hops`. Each hop names its `program`, `source`, `destination`, `accounts` and `data`. Call `swaps.spotRebalance`, `recoveryConvertToMain` or `closingConvertToMain` for the relevant mode; use `stagingSwap` for a staging half.

Rust uses `VaultManager::swap` with `VaultSwapPlan { price_section, amount_in, minimum_out, valid_until, hops }`. `amountIn` / `amount_in` caps input spending; minimum output and price drift use the actual spend and gain. The plan allows 1–4 hops, up to 64 CPI accounts per hop, 128 account slots across the path and 1,024 bytes of hop data. A Jupiter route is one hop. Later hops can use `amountOffset` in TypeScript (`amount_offset` in Rust) to derive their input from tokens received earlier in the same swap.

The registry pins both venue programs and allowed instruction selectors. SDK presets include `JUPITER_V6_VENUE`, `EXPONENT_GENERIC_SY_VENUE`, `EXPONENT_CLMM_VENUE`, `EXPONENT_CORE_VENUE` and `DEVNET_SWAP_ROUTER_VENUE`.

A staging plan uses a different `priceSection`: the vault leg’s route and brick accounts, then the intermediate mint’s route and brick accounts. `RecoveryStage` starts from second and also takes `mainPriceSection`, containing the main route and its brick accounts. Do not use the ordinary main/second pair section for a staging half.

## Price routes and freshness

Each mint has a `PriceRoute` at `["price_route", mint]`. Its ordered pricing steps, called bricks, combine a Pyth feed with any configured rates, maturity discount, clamp or growth cap. For example, a liquid staking token can use its pool's exchange rate multiplied by SOL/USD. A term token's route can include a maturity discount; this is a policy valuation, not a market swap quote.

Equity and swap instructions read the route accounts and their brick accounts. For equity and ordinary swaps, the price section contains the main route and its accounts, then the second route and its accounts. Build this pair section with TypeScript `resolveVaultPriceSection(rpc, planner, pythShard)` or Rust `VaultManager::price_section(main, second, shard)`.

The contract checks freshness from the route configuration:

- Pyth updates must be fully verified, match the brick's feed, be no older than its configured maximum age and no more than five seconds in the future. Confidence cannot exceed 5% of price.
- Pyth publish times within a route must fit its `max_skew_secs`. Across priced legs, the tighter route skew applies.
- Account-ratio bricks validate their pinned account and program. Any configured epoch, slot or timestamp freshness limit applies to the rate.
- Growth-cap bricks reject an anchor older than their configured maximum age.

Use `priceSection` for valuation, manager top-ups and priced governance or shutdown steps. Shutdown and emergency withdraw-only finalization need prices only when second-asset custody is nonzero. If a price is stale, refresh the required brick accounts before retrying; a recent route registration is not a fresh price.

## Devnet differences

Devnet swaps use the mock router registered with `DEVNET_SWAP_ROUTER_VENUE`. Checked intents need no router override. Read the deployed price routes for their age and skew limits; those limits are route settings, not a single program-wide Pyth timeout.

See [Roles and permissions](vault-permissions.md) and [Transaction recovery](recovery.md).
