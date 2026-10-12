# Returns, fees and risks

## Returns

A vault's return comes from option premiums, option payouts, swaps and the price of the assets it holds. The app shows the share price from the last completed cycle. Your withdrawal uses the price calculated when it is processed.

Annualized return appears once a vault has 30 days of history.

## Fees

A vault can charge a management fee and a performance fee. Both are paid by minting new shares to the manager, so your share count stays the same while your slice of the vault shrinks. The performance fee applies only above the vault's previous high. Solana network fees and account rent are separate. The exact math is in [Shares, equity and fees](../protocol/vault-accounting.md).

## Risks

- Selling calls caps your upside: gains above the strike go to the buyer.
- Selling puts can leave the vault buying an asset for more than it is worth.
- Bought options can expire worthless.
- The manager can make bad trades. You carry the losses.
