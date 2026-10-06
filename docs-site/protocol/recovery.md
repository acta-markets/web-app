# Transaction recovery

Use the transaction signature and chain accounts to recover the outcome of an interrupted operation.

## A transaction timed out

Check its signature and resulting accounts before submitting another transaction. A timeout can occur after chain acceptance. Capital requests have identifiable request PDAs; read those accounts and balances to distinguish an open request, a processed request and a cancellation.

A backend submission acknowledgment records acceptance for execution. Chain confirmation establishes the result.

## A request is delayed

Check phase, safety mode, expiry, the capital-pricing flag and pending obligations. Valuation requires fresh on-chain Pyth price accounts. Conversion requires an available swap route, and payouts require enough main-asset liquidity.

Public processing follows the [request-processing conditions](vault-lifecycle.md#request-processing), including settlement and price checks. Public pricing in idle requires an eligible aged withdrawal; a pending deposit alone is insufficient.

## History or services are unavailable

Show when the displayed data was last updated. Back off on retryable API failures. Read share balances and request accounts from Solana before submitting an action.

When finalized history is incomplete, the backend can reject new trades until the listener has recovered it. A missing account alone cannot distinguish a closed position from an incomplete projection.

For pending deposits and withdrawals, see [Deposits and withdrawals](../guide/deposits-and-withdrawals.md).
