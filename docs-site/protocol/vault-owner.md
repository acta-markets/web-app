# Managing a vault

Vault governance chooses policy, delegates trading and can initiate shutdown. The operator executes the strategy within those permissions. Depositors own shares and sign requests involving their own funds.

Governance can also be the primary operator, but holder quotes still require an active primary-delegate grant even when both roles use the same wallet.

## Create and bootstrap

1. Choose the main and second assets, governance, primary delegate, share mint, fee settings and policy limits. Deposits use the main asset.
2. Have the protocol cold authority execute `CreateVault`.
3. Bootstrap the vault through `BootstrapVault` with the initial main-asset capital and the required token accounts. SOL capital must be wrapped into WSOL; native SOL for fees and rent stays separate.
4. Confirm the transactions and read the vault, share mint, custody and delegate grant from Solana. Check that the backend has projected the same vault before starting a session.

The TypeScript SDK exports `chain.flows.VaultManagerPlanner` to prepare vault instructions:

| Task | Planner methods |
| --- | --- |
| Setup | `create()`, `createVault()`, `bootstrap()` |
| Deposit window and valuation | `setAcceptingDeposits()`, `processEquity()` |
| Capital queues and next cycle | `processDeposits()`, `processWithdrawals()`, `processFinalWithdrawal()`, `finalizeCycle()` |
| Delegate and policy | `governance.rotateDelegate()`, `governance.disableDelegate()`, `governance.proposeUpdate()`, `governance.applyUpdate()` |
| Options and funding | `trading.openPositionAsTaker()`, `trading.openPositionAsMaker()`, `trading.fundMakerPosition()` |
| Normal rebalance | `swaps.spotRebalance()` |

Each operation requires the appropriate signer and accounts. The caller signs and submits the instructions prepared by the planner.

## Permissions

Delegate permissions cover option trading (`OPEN_TAKER`, `SIGN_MAKER_QUOTES`, `FUND_MAKER`), swaps (`REBALANCE`) and capital processing (`PROCESS_CAPITAL`). Strategy capabilities and policy determine which trades the vault permits.

The six permission bits and shared governance/delegate behavior are listed in [Roles and permissions](vault-permissions.md). The delegate's permissions end when its grant expires or is revoked.

## Run the strategy

Authenticate the operator for the vault on `/vault`, reconcile state and wait for trading readiness before submitting RFQs or quotes. See the [vault session and swap flow](vault-integration.md#operator-session).

- Write options using vault collateral on the taker side of an RFQ.
- Buy options by quoting RFQs as a vault maker under the active primary-delegate grant. `is_taker_buy` remains zero.
- Swap assets through a Jupiter rebalance: review the transaction, sign, submit and confirm it.

Trading follows the vault's phase, safety mode and policy. Normal rebalance excludes unpriced idle capital.

## Process capital and begin another cycle

The manager controls the deposit window. After trading, resolve positions and funding obligations, supply valid on-chain prices, compute equity and fees, then process eligible deposit and withdrawal requests. Finalize once the queues are drained.

The [lifecycle](vault-lifecycle.md) describes processing order and eligibility. [Accounting](vault-accounting.md) covers share price, fee dilution and final redemption.

Depositors and public processors can process eligible requests through the fallback rules in the [lifecycle](vault-lifecycle.md#request-processing).

## Observe and recover

Use [Vault HTTP API](../reference/vault-http-api.md) for indexed state and history. Read finalized chain accounts for current permissions, share balances and the outcome of submitted capital transactions.

After an uncertain submission, check its signature and accounts before sending another transaction. See [Transaction recovery](recovery.md) and the [safety-mode table](vault-lifecycle.md#safety-modes).
