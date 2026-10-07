# Transaction recovery

## A transaction timed out

A timed-out transaction may still have landed. Check its signature before sending another. For capital requests, read the request PDA to see whether it is open, processed or cancelled.

A backend submission ack means only that the transaction was queued.

## A request is delayed

Check phase, safety mode, expiry, the capital-pricing flag and open positions. Valuation requires fresh on-chain Pyth price accounts. Conversion requires an available swap route, and payouts require enough main-asset liquidity.

Public processing follows the [request-processing conditions](vault-lifecycle.md#request-processing). In idle, public pricing needs a withdrawal request past its delay. A pending deposit alone is not enough.

## The backend is behind

While indexed history is incomplete, new trades are rejected with `history_projection_incomplete`. A position missing from the API has either closed or is not indexed yet. Read the account on-chain.
