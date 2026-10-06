# Vault API, SDKs and swaps

Vault integrations combine public HTTP reads, wallet-signed capital transactions and an authenticated operator WebSocket session.

## Public reads

Routes use the `/api/v1` prefix:

| Route | Use |
| --- | --- |
| `GET /vaults` | Discover open vaults and their projected state. |
| `GET /vaults/{pda}` | Vault detail and projected performance. |
| `GET /vaults/{pda}/cycles` | Indexed cycle history. |
| `GET /vaults/{pda}/positions` | Vault position memberships. |
| `GET /vaults/{pda}/depositors/{wallet}` | Open requests and indexed totals for a depositor. |
| `GET /vaults/{pda}/depositors/{wallet}/history` | Depositor history for one vault. |
| `GET /depositors/{wallet}` | Depositor activity across vaults. |
| `GET /depositors/{wallet}/history` | Cross-vault indexed history. |

Closed vaults disappear from list/detail but retain their history routes. Current share balances come from RPC, since shares can transfer between wallets.

Use the returned cursor for pagination. Back off on `429` and retryable `503` responses. `db_disabled` requires database configuration on the server. Fields, pagination and errors are in [Vault HTTP API](../reference/vault-http-api.md).

## Capital transactions

Use a TypeScript SDK build with vault instruction builders and a `/vault` client. It prepares deposit, withdrawal, cancellation, refund and capital-processing instructions. The depositor signs their requests; governance or an eligible delegate signs manager operations. Public processing follows the account and timing conditions in the [lifecycle](vault-lifecycle.md#request-processing).

After submitting a transaction, wait for confirmation and read the affected chain accounts.

Use the SDK's dedicated final-withdrawal builder to redeem all remaining shares.

## Operator session

The `/vault` endpoint authenticates an operator for a specific vault. Authenticate, reconcile the required state and wait for readiness before trading. Use `permissions` to determine the granted actions, including for a shared governance/delegate wallet.

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

Validate the `AuthRequest` challenge under the [signing conventions](../reference/ws-common.md#what-to-sign), sign its original bytes and reply with `AuthChallenge`. `VaultAuthSuccess` returns `vault_pda`, `operator`, `operator_kind` and `permissions`. Before trading, complete the session's state reconciliation and readiness checks.

A vault writing an option uses the taker RFQ flow. A vault buying an option acts as maker and signs holder quotes under its active primary-delegate grant. `is_taker_buy` remains fixed at zero in the RFQ order.

Reconnects require readiness and authorization checks. Permission or projection changes can invalidate an existing session.

## Jupiter swaps

Request a vault swap quote for `main_to_second` or `second_to_main`. The backend constructs the route transaction, the operator wallet signs, and the signed transaction is submitted for durable execution.

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

`amount` is an input-token atomic amount encoded as a decimal string. `slippage_bps` defaults to 50 if omitted. `mode` selects `rebalance`, `recovery` or `closing`, each with its own phase and permission requirements.

`SwapQuoteResult` returns `request_id`, `execution_id`, `mode`, `tx_base64`, `in_amount`, `quoted_out_amount`, `minimum_out_amount` and `valid_until`. Amounts and the deadline are decimal strings. Check the terms and instructions, sign the transaction, then submit:

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

The contract checks the route, pair, mode, permissions, phase, safety mode and price accounts. Normal rebalance excludes unpriced idle capital.

`SwapSubmitResult` returns `request_id` and `execution_id` after durable acceptance for submission. Track execution and chain confirmation for the result.

See [Roles and permissions](vault-permissions.md) and [Transaction recovery](recovery.md).
