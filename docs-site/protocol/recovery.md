# Transaction recovery

## A transaction timed out

A timed-out transaction may still have landed. Check its signature before sending another. For capital requests, read the request PDA to see whether it is open, processed or cancelled.

A backend submission ack means only that the transaction was queued.

## A request is delayed

Check phase, safety mode, expiry, the capital-pricing flag, open positions and `staging`. Valuation requires fresh accounts for every brick in the price routes. Conversion requires a registered swap venue and an available path; payouts require enough main-asset liquidity.

Public processing follows the [request-processing conditions](vault-lifecycle.md#request-processing). In idle, public pricing needs a withdrawal request past its delay. A pending deposit alone is not enough.

## An intermediate asset is staged

Read the finalized vault account and resolve the last swap’s status before requesting another quote. An unstage must match the recorded mint, generation and whole staged amount. Do not reuse a signing intent from before the stage.

A rebalance actor can drain into main while the vault is normal. Governance can drain into main after the 300-second staging timeout in any safety mode; pause and price checks still apply. Completing into second requires current rebalance rights, including phase and expiry checks.

For a recovery conversion that needs an intermediate token, `VaultStagingMode.RecoveryStage` starts from second under governance’s recovery rules. The current SDK checked helpers cannot verify a served `RecoveryStage`; see [Checked signing](vault-integration.md#checked-signing). Ordinary recovery conversion cannot run over an existing slot: unstage that slot first. Equity processing, cycle finalization and final redemption wait until the slot closes. Deposit refunds and request cancellations keep their own eligibility rules.

## The backend is behind

While indexed history is incomplete, new trades are rejected with `history_projection_incomplete`. A position missing from the API has either closed or is not indexed yet. Read the account on-chain.
