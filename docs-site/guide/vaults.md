# How vaults work

A vault pools deposits under a manager's strategy. The manager trades the funds. Depositors hold shares in the vault.

## Your shares

Deposits use the vault's main asset. For example, a SOL vault can hold WSOL and USDC while accepting deposits in WSOL, the token form of SOL.

When your deposit is completed, you receive shares. Their value rises or falls with the vault's trading results and fees. A pending deposit has not received shares yet.

If a vault is worth 100 SOL after fees and has 100 shares, each share is worth 1 SOL. A completed 10 SOL deposit receives 10 shares, ignoring rounding. [Share value and fees](returns-and-risks.md) explains how this changes over time.

## The manager's strategy

A vault can sell options, buy options and swap assets, depending on its permissions. The strategy determines which trades it makes and how much capital it commits.

Check the strategy, fees and withdrawal terms before depositing. The manager can make losing trades. The manager's own stake does not insure your deposit.

## Deposits and withdrawals

Deposits and withdrawals are requests. They complete when the vault is ready to calculate the share price and pay out. Funds committed to open trades must settle first.

[Deposits and withdrawals](deposits-and-withdrawals.md) explains what happens to a pending request. [The vault cycle](vault-cycle.md) explains when requests are completed.
