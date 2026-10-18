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

The `AuthRequest` challenge is the taker challenge with `Wallet:` set to the operator, followed by `\nVault: <vault_pda>` with no trailing newline (see [signing conventions](../reference/ws-common.md#what-to-sign)). Check it with `assertVaultAuthChallenge(challenge, operator, vault)` (TypeScript) or `validate_vault_auth_challenge(challenge, operator, vault)` (Rust); `validateAuthChallenge` rejects it. Then sign its original bytes and reply with `AuthChallenge`. `VaultAuthSuccess` returns `vault_pda`, `operator`, `operator_kind` and `permissions`.

A vault writing an option uses the taker RFQ flow. A vault buying an option acts as maker and signs holder quotes under its active primary-delegate grant. `is_taker_buy` is fixed at zero in the RFQ order.

A permission change can close an open session. Reconnect and authenticate again.

The session is subscribed to the `vaults` channel by default and receives `VaultProjectionAdvanced` for its own vault only: the vault row changed, reload `/api/v1/vaults/{pda}`. To follow the set of vaults, subscribe your `/maker` quote session or a taker session to `vaults` (`/maker/data` cannot subscribe). It receives `VaultProjectionAdvanced` for every vault and [`VaultCatalogChanged`](../reference/ws-common.md#vaultcatalogchanged) when a vault is created, re-delegated or closed; `/vault` sessions never get `VaultCatalogChanged`. `VaultCatalogChanged` is best-effort (never replayed; on a full session queue it is dropped and the connection closed), so also re-list vaults after every (re)connect.

### Funding bought options

An option the vault bought (as maker) is not funded at open. To exercise it in the money, the vault must fund it with `FUND_MAKER` (or governance): strike × quantity in the quote asset for a call, or the quantity in the underlying for a put, paid from the matching leg. The vault then receives the collateral at settlement. Builders: TypeScript `planner.trading.fundMakerPosition(position)`, Rust `VaultManager::fund_maker_position` (feature `chain`).

**Fund before expiry.** Once the market is finalized, anyone can liquidate an unfunded in-the-money position: the liquidator pays the writer and takes the collateral, and the vault loses the intrinsic value. Funding is still accepted after finalization until a settlement or liquidation lands, but then you are racing liquidators. Keep enough of the funding asset for every holder position you may need to exercise. The same applies to any maker that bought an option.

## Swaps

Request a vault swap quote for `main_to_second` or `second_to_main`. The backend builds a transaction with one route through the swap router the program build pins (Jupiter v6 on mainnet, a mock router on devnet), the operator wallet signs it, and the backend sends it.

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

`SwapQuoteResult` returns `request_id`, `execution_id`, `mode`, `tx_base64`, `in_amount`, `quoted_out_amount`, `minimum_out_amount` and `valid_until`. Amounts and the deadline are decimal strings. Review the terms and instructions, sign the transaction, then submit:

```json
{
  "type": "SwapSubmit",
  "data": {
    "request_id": "<new-uuid>",
    "execution_id": "<execution-id-from-quote>",
    "signed_tx_base64": "<wallet-signed-transaction>"
  }
}
```

The contract checks the route, pair, mode, permissions, phase, safety mode and price accounts. Normal rebalance cannot touch unpriced idle capital.

`SwapSubmitResult` returns `request_id` and `execution_id` when the backend accepts the transaction. The swap is done when it confirms on-chain.

## Checked signing

Do not sign a served transaction blind. The SDKs' checked helpers rebuild the expected instructions from what you agreed to and sign only on an exact match. They compare fee payer, signers, compute budget within your bounds, every account with its flags, instruction data, ATA creates, the maker's Ed25519 quote check and the order ID. Router accounts are allowed only in the swap's route tail: at most 64, no signers, no payer, no read-only vault account made writable.

The swap intent names the router, which must be the one the target program build pins. A swap whose `minimum_out_amount` is below your output floor (`min_output_floor` in Rust, `minOutputFloor` in TypeScript) is rejected even if it fits the quote's slippage. Compute the floor from your own oracle price, not from the server's quote.

| | Rust (`acta-maker-sdk` 0.5.1, feature `vault`) | TypeScript (`@acta-markets/ts-sdk` 0.2.1) |
| --- | --- | --- |
| Position open | `VaultOperatorClient::verify_and_sign_sponsored_tx` | `verifyAndSignSponsoredTx` from `/ws` |
| Swap | `VaultOperatorClient::verify_and_sign_swap` | `verifyAndSignSwap` from `/ws` |
| Verify only | `chain::vault::verify_vault_open` / `verify_vault_swap` | `flows.verifyVaultOpen` / `flows.verifyVaultSwap` |
| Swap router | `chain::vault::JUPITER_V6_PROGRAM_ID` / `DEVNET_SWAP_ROUTER_ID` | `JUPITER_V6_PROGRAM` / `DEVNET_SWAP_ROUTER` from `/chain` |

In Rust, `VaultSwapIntent { vault, request, quote, main_price_update, second_price_update, min_output_floor, router }` requires `router`. In TypeScript, `router` defaults to `JUPITER_V6_PROGRAM`, so set `DEVNET_SWAP_ROUTER` on devnet. The swap intent's `request` is the `SwapQuoteData` you sent, including its `request_id` and `vault_pda`. `resolveVaultPriceUpdates(rpc, planner)` from `@acta-markets/ts-sdk/chain` returns the two price-update accounts.

## Pyth freshness

Vault equity processing, shutdown finalization, emergency withdraw-only finalization, manager top-ups and every swap read both legs' Pyth `PriceUpdateV2` accounts. Shutdown finalization and emergency withdraw-only finalization skip the Pyth reads when the vault holds none of the second asset. Each account read must:

- carry the feed ID of the vault's oracle source and be fully verified;
- be at most 60 s old on the mainnet program (900 s on the devnet build) and at most 5 s in the future;
- have publish times within 10 s of each other (900 s on the devnet build);
- have confidence at most 5% of price.

Pyth's sponsored mainnet feeds update about once a minute, so a sponsored account can be just over 60 s old. If a step fails on staleness, retry after the next update or post your own verified update for the same feed.

## Devnet differences

The devnet program build differs from mainnet in two places:

- Swaps go through a pool-backed mock router (`BtHXpaAvhaKYk9pR4vNpuMZLTR8XeXnZ4iTy2Q1NzuCz`), not Jupiter, which has no devnet deployment. Pass `DEVNET_SWAP_ROUTER` (TypeScript) or `DEVNET_SWAP_ROUTER_ID` (Rust) as the swap intent's router. With the Jupiter default, verification rejects the served transaction.
- Pyth tolerances are wider because devnet feeds publish less often and on independent cadences: up to 900 s staleness and 900 s between the two legs' publish times.

See [Roles and permissions](vault-permissions.md) and [Transaction recovery](recovery.md).
