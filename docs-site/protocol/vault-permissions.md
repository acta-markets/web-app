# Roles and permissions

A vault has governance, a primary trading delegate, a share mint, policy and custody accounts. Depositors own shares and sign their own capital requests.

## Roles

| Role | Responsibility |
| --- | --- |
| Protocol cold authority | Creates vaults. Registers price routes and swap venues through the timelock. Freezes, unfreezes and starts emergency unwind. |
| Protocol guardian | Freezes vaults. |
| Vault governance | Sets policy and delegation. Runs vault shutdown. |
| Primary delegate | Trades and processes capital under its active on-chain grant. |
| Depositor | Requests, cancels or processes capital actions on their own shares and escrow. |
| Public processor | Processes requests under the fallback rules. Gets no governance authority. |

Governance can use the same wallet as the primary delegate.

## Delegate permissions

| Permission | Bit | Operation |
| --- | --- | --- |
| `OPEN_AS_WRITER` | 1 | Write an option from vault collateral, requesting the RFQ as taker. |
| `SIGN_HOLDER_QUOTES` | 2 | Sign holder-side quotes on sell RFQs on behalf of the vault. |
| `FUND_HOLDER` | 4 | Deposit settlement funds for a bought option. |
| `REBALANCE` | 8 | Rebalance vault assets. |
| `PROCESS_CAPITAL` | 16 | Process capital requests. |
| `SET_DEPOSIT_WINDOW` | 32 | Open or close the deposit window. |
| `SIGN_WRITER_QUOTES` | 64 | Sign writer-side quotes on buy RFQs: the signature alone commits vault collateral to a wallet's buy. |

Opening positions and rebalancing also check strategy capabilities and policy. Under the fallback rules, anyone can process capital. Governance, or a delegate with `SET_DEPOSIT_WINDOW`, can change the deposit window. Phase and safety mode apply to both.

## Swap and staging authority

`REBALANCE` does not permit arbitrary external calls. Every hop must use a registered venue and one of its allowed instruction selectors. Governance can propose a timelocked second-leg roll; the contract checks its capital boundary and route compatibility.

A rebalance actor can drain staged tokens into main while safety is `normal`. After 300 seconds, governance can drain the slot into main in any safety mode, subject to the applicable pause and price checks. `RecoveryStage` is governance-only and follows recovery eligibility. Neither public capital processing nor its fallback delay grants swap authority.

## Shared governance and delegate key

Quotes need an active primary-delegate grant with the matching quote bit (`SIGN_HOLDER_QUOTES` on sells, `SIGN_WRITER_QUOTES` on buys) that matches the signer, even when the signer is governance. Revoking or expiring the grant stops quotes. Governance keeps its other powers.

Operator auth can return `operator_kind: "governance"` with maker permission. The backend and the contract check authorization again on every execution.

See [Vault API, SDKs and swaps](vault-integration.md) for signing and operator sessions, and [Governance and security](../reference/governance.md) for protocol authorities and timelocks.
