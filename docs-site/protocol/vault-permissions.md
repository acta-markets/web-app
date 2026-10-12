# Roles and permissions

A vault has governance, a primary trading delegate, a share mint, policy and custody accounts. Depositors own shares and sign their own capital requests.

## Roles

| Role | Responsibility |
| --- | --- |
| Protocol cold authority | Creates vaults. Freezes, unfreezes and starts emergency unwind. |
| Protocol guardian | Freezes vaults. |
| Vault governance | Sets policy and delegation. Runs vault shutdown. |
| Primary delegate | Trades and processes capital under its active on-chain grant. |
| Depositor | Requests, cancels or processes capital actions on their own shares and escrow. |
| Public processor | Processes requests under the fallback rules. Gets no governance authority. |

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

Opening positions and rebalancing also check strategy capabilities and policy. Under the fallback rules, anyone can process capital. Governance, or a delegate with `SET_DEPOSIT_WINDOW`, can change the deposit window. Phase and safety mode apply to both.

## Shared governance and delegate key

Holder quotes need an active primary-delegate grant with `SIGN_MAKER_QUOTES` that matches the signer, even when the signer is governance. Revoking or expiring the grant stops quotes. Governance keeps its other powers.

Operator auth can return `operator_kind: "governance"` with maker permission. The backend and the contract check authorization again on every execution.

See [Vault API, SDKs and swaps](vault-integration.md) for signing and operator sessions, and [Governance and security](../reference/governance.md) for protocol authorities and timelocks.
