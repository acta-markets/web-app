# How vaults work

A vault is a pool of deposits that a manager trades on Acta. You deposit one asset, get shares, and the share price moves with the strategy's results.

## Shares

Each vault has a main asset that it accepts and pays out, for example WSOL (the token form of SOL) in a SOL vault. The vault can also hold a second asset, such as USDC, that it receives from trades.

If a vault holds 100 SOL after fees and has 100 shares, one share is worth 1 SOL, and a 10 SOL deposit gets 10 shares. If the vault grows to 110 SOL, those 10 shares are worth 11 SOL. [Returns, fees and risks](returns-and-risks.md) has the details.

## The strategy

A vault can sell options, buy options and swap between its two assets, depending on what it is allowed to do. The manager decides what to trade and how much to commit. Read the strategy, fees and withdrawal terms before you deposit. The manager can lose money, and the manager's own stake does not cover your losses.

## The cycle

1. The manager trades options. The money in those trades is locked until expiry.
2. After expiry the trades settle. The vault gets its money back or receives the other asset at the strike price.
3. The vault values its assets, takes fees and sets a new share price.
4. Pending deposits get shares at that price and pending withdrawals are paid out. The next cycle can start.

Deposits and withdrawals are processed at step 4, not when you submit them. See [Deposits and withdrawals](deposits-and-withdrawals.md).
