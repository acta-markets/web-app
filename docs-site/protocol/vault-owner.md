# Managing a vault

Vault governance sets policy, delegates trading and can start shutdown. The operator runs the strategy within the delegated permissions. Depositors own shares and sign requests that move their own funds.

Governance can also act as the primary operator. Holder quotes still need an active primary-delegate grant when both roles use the same wallet.

## Create and bootstrap

1. Choose the main and second assets, governance, primary delegate, share mint, fee settings and policy limits. Deposits use the main asset.
2. The protocol cold authority executes `CreateVault`.
3. Run `BootstrapVault` with the initial main-asset capital and the token accounts. Wrap SOL capital into WSOL. Native SOL for fees and rent stays separate.
4. Confirm the transactions and read the vault, share mint, custody and delegate grant from Solana. Before starting a session, check that the backend shows the same vault.

The TypeScript SDK exports `chain.flows.VaultManagerPlanner` to build vault instructions. The caller signs and submits them.

| Task | Planner methods |
| --- | --- |
| Setup | `create()`, `createVault()`, `bootstrap()` |
| Deposit window and valuation | `setAcceptingDeposits()`, `processEquity()` |
| Capital queues and next cycle | `processDeposits()`, `processWithdrawals()`, `processFinalWithdrawal()`, `finalizeCycle()` |
| Delegate and policy | `governance.rotateDelegate()`, `governance.disableDelegate()`, `governance.proposeUpdate()`, `governance.applyUpdate()` |
| Options and funding | `trading.openPositionAsTaker()`, `trading.openPositionAsMaker()`, `trading.fundMakerPosition()` |
| Normal rebalance | `swaps.spotRebalance()` |

## Permissions

Delegate permissions cover option trading (`OPEN_TAKER`, `SIGN_MAKER_QUOTES`, `FUND_MAKER`), swaps (`REBALANCE`) and capital processing (`PROCESS_CAPITAL`). Strategy capabilities and policy limit which trades the vault can open.

[Roles and permissions](vault-permissions.md) lists all six permission bits and the shared governance/delegate case. The delegate loses its permissions when its grant expires or is revoked.

## Run the strategy

Authenticate the operator for the vault on `/vault`, load the current state and wait for trading readiness before sending RFQs or quotes. See [Operator session](vault-integration.md#operator-session).

- To write options, use vault collateral on the taker side of an RFQ.
- To buy options, quote RFQs as a vault maker under the active primary-delegate grant. `is_taker_buy` stays zero.
- To swap assets, run a Jupiter rebalance: review the transaction, sign, submit and confirm it.

Phase, safety mode and policy all gate trading. Normal rebalance cannot touch unpriced idle capital.

## Process capital and begin another cycle

The manager opens and closes the deposit window. After trading, close positions and settle funding, supply on-chain prices, compute equity and fees, then process deposit and withdrawal requests. Finalize once the queues are empty.

If the manager stalls, depositors and public processors can process requests under the fallback rules in [Request processing](vault-lifecycle.md#request-processing). [Accounting](vault-accounting.md) covers share price, fee dilution and final redemption.

## Observe and recover

The [Vault HTTP API](../reference/vault-http-api.md) serves indexed state and history. For current permissions, share balances and the result of a capital transaction, read finalized chain accounts.

See [Transaction recovery](recovery.md) and [Safety modes](vault-lifecycle.md#safety-modes).
