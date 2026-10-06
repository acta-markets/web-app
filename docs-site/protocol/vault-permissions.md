# Roles and permissions

A vault has governance, a primary trading delegate, a share mint, policy and custody accounts. Depositors own shares and sign their own capital requests.

## Roles

| Role | Responsibility |
| --- | --- |
| Protocol cold authority | Creates vaults and controls freeze, unfreeze and emergency unwind. |
| Protocol guardian | Can freeze vaults. |
| Vault governance | Controls policy, delegation and the vault shutdown path. |
| Primary delegate | Trades and manages capital under its active on-chain grant. |
| Depositor | Requests, cancels or processes eligible capital actions involving their shares and escrow. |
| Public processor | Uses eligible fallback processing without receiving governance authority. |

Governance can use the same wallet as the primary delegate.

## Delegate permissions

| Permission | Bit | Operation |
| --- | --- | --- |
| `OPEN_TAKER` | 1 | Write an option from vault collateral. |
| `SIGN_MAKER_QUOTES` | 2 | Sign holder-side quotes on behalf of the vault. |
| `FUND_MAKER` | 4 | Deposit settlement funds for a bought option. |
| `REBALANCE` | 8 | Rebalance vault assets. |
| `PROCESS_CAPITAL` | 16 | Process capital requests. |
| `SET_DEPOSIT_WINDOW` | 32 | Open or close the deposit window. |

The permission mask grants delegated operations. Opening positions and rebalancing also check strategy capabilities and policy. Capital processing can become public under fallback conditions. Changing the deposit window requires governance or a delegate with `SET_DEPOSIT_WINDOW`. Both follow their phase and safety rules.

## Shared governance and delegate key

Holder quotes require an active matching primary-delegate grant with `SIGN_MAKER_QUOTES`, including when the signer is governance. Revoking or expiring that grant stops quotes while preserving governance authority for its other operations.

The operator authentication response can return `operator_kind: "governance"` with maker permission enabled. Clients use the granted permissions together with session readiness. Backend and contract check authorization again on execution.

See [Vault API, SDKs and swaps](vault-integration.md) for signing and operator sessions, and [Governance and security](../reference/governance.md) for protocol-level authorities and timelocks.
