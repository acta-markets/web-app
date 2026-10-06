# Deposits and withdrawals

Deposits and withdrawals are requested first and completed later. They use the share price calculated when the vault processes them.

## Deposit

Deposit the vault's main asset while it accepts deposits. Your funds remain pending until the deposit completes and you receive shares. They do not yet give you a share of the strategy's results.

A 10 SOL deposit receives 10 shares at a price of 1 SOL per share, or 8 shares at 1.25 SOL per share. These examples ignore rounding.

## Withdraw

Request a withdrawal using your vault shares. Once it completes, those shares are exchanged for the vault's main asset.

For example, 10 shares at a withdrawal price of 1.1 SOL pay 11 SOL, ignoring rounding. The last recorded share price can differ from the price used for your withdrawal.

A withdrawal redeeming all remaining shares can return both assets held by the vault.

## Waiting and cancellation

A request waits while the vault finishes trades and calculates its share price. Expiry marks the end of trading, not a guaranteed withdrawal time.

Cancellation is restricted during valuation and after the cycle's expiry. A completed deposit cannot be cancelled; you leave by requesting a withdrawal. Cancelling a pending withdrawal returns your shares and cannot reverse a completed payout.

[The vault cycle](vault-cycle.md) explains the timing. Exact cancellation and refund rules are in [Request processing](../protocol/vault-lifecycle.md#request-processing).
