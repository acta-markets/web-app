# Shares, equity and fees

The contract calculates vault accounting at capital boundaries. Backend values are copies of those results.

## Supply and ownership

The SPL share mint holds the live supply. The vault also caches the supply at the last boundary in `total_shares`. Shares can move between wallets without a vault deposit or withdrawal event, so read the wallet's token accounts for current ownership.

An external share burn can push live supply below `total_shares`. Read the SPL mint for current supply and the vault fields for the last accounting checkpoint.

Manager stake is held apart from depositor shares. The manager cannot remove stake below the stake checkpoint and the configured minimum.

## NAV and equity checkpoint

NAV (net asset value) is the accounted equity in main-asset units. At a boundary the contract adds main custody to second custody, converted with the legs’ registered price routes. All positions must be closed, funding settled and staged assets returned to a leg first.

The instruction takes a `priceSection`: each route followed by the accounts its pricing bricks read. The contract checks their identity, freshness and price-quality limits. A route can combine a Pyth price with an asset rate or maturity discount. See [Price routes and freshness](vault-integration.md#price-routes-and-freshness).

An open `staging` slot is an intermediate token balance, not a new equity checkpoint. The last booked equity and share price do not value it afresh. A term token’s route valuation is also not a promise of the amount a swap will receive.

Equity is in main-token atomic units. Share price and the high-water mark are `u128` values at a fixed scale of `1_000_000_000`. In JavaScript, keep them as decimal strings or `BigInt`.

Share price updates after cycle settlement and when idle requests are processed.

## Fees

Management and performance fees mint shares into manager stake. Existing holders are diluted. No tokens leave custody to pay the fee.

The management fee depends on the configured rate and the time since the last accounting. The performance fee applies only above the post-management high-water mark. The high-water mark does not fall when the vault loses value.

Contract events carry share prices and fees after rounding and dilution. Read them from there.

## Deposits and withdrawals

A processed deposit moves main tokens from request escrow into custody and mints shares. An ordinary withdrawal burns the escrowed shares and pays main tokens. A rejected deposit or an unusable recipient account ends in a refund or returned shares. Show these to users separately from completed deposits and payouts.

Final redemption takes exactly one withdrawal covering all remaining live shares. The normal path also requires an empty deposit queue. Under `withdraw_only`, pending deposits are allowed. The final-withdrawal instruction burns the supply and transfers both the main and second custody balances.

See [Request processing](vault-lifecycle.md#request-processing) and [Transaction recovery](recovery.md).
