# Deposits and withdrawals

You submit a request. The vault completes it at the end of the cycle, at the share price it calculates then.

## Deposit

Deposit the vault's main asset while the vault accepts deposits. Until the request completes, your funds are held aside and earn nothing. Then you get shares: 10 SOL buys 10 shares at 1 SOL per share, or 8 shares at 1.25.

## Withdraw

Request a withdrawal for some or all of your shares. When it completes you are paid in the main asset: 10 shares at 1.1 SOL pay 11 SOL. You get the price calculated at processing, which can differ from the last price shown.

If you are the last holder and redeem every remaining share, you receive whatever the vault holds, which can include the second asset.

## Waiting and cancelling

A request waits until the vault's trades have settled and the share price is calculated. Expiry is when trading ends, not when you are paid.

You can cancel a pending request until the cycle reaches expiry or the vault starts pricing. Cancelling a withdrawal returns your shares. A completed deposit cannot be cancelled. Withdraw instead.

If the manager does not process requests, anyone can process them after a delay, 12 hours by default. The exact rules are in [Request processing](../protocol/vault-lifecycle.md#request-processing).
