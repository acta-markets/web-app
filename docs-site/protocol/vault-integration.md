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

The TypeScript SDK build with vault instruction builders and a `/vault` client prepares deposit, withdrawal, cancellation, refund and capital-processing instructions. The depositor signs their own requests. Governance or a delegate with the right permission signs manager operations. Public processing follows the timing rules in [Request processing](vault-lifecycle.md#request-processing).

Redeem all remaining shares with the SDK's final-withdrawal builder.

## Operator session

The `/vault` endpoint authenticates an operator for one vault. After auth, load the current state and wait for readiness before trading. `permissions` lists the granted actions, including for a wallet that is both governance and delegate.

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

Check the `AuthRequest` challenge against the [signing conventions](../reference/ws-common.md#what-to-sign), sign its original bytes and reply with `AuthChallenge`. `VaultAuthSuccess` returns `vault_pda`, `operator`, `operator_kind` and `permissions`.

A vault writing an option uses the taker RFQ flow. A vault buying an option acts as maker and signs holder quotes under its active primary-delegate grant. `is_taker_buy` is fixed at zero in the RFQ order.

A permission change can close an open session. Reconnect and authenticate again.

## Jupiter swaps

Request a vault swap quote for `main_to_second` or `second_to_main`. The backend builds the route transaction, the operator wallet signs it, and the backend sends it.

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

`amount` is an input-token atomic amount as a decimal string. `slippage_bps` defaults to 50. `mode` is `rebalance`, `recovery` or `closing`, and each mode has its own phase and permission requirements.

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

See [Roles and permissions](vault-permissions.md) and [Transaction recovery](recovery.md).
