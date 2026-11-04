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
- Asset valuations use configured price feeds and rates. A term token’s valuation can differ from its sale price.
- A swap split across two transactions leaves an intermediate asset in the vault until the second transaction completes. Prices can change during that wait, and withdrawals can be delayed.

## Buying risks

A bought option can expire worthless and you lose the premium. A bought call or put in the money pays only if you deposit before expiry; without a deposit it is not exercised and the premium is lost. See [Buying options](buying-options.md).

## Cash-settled trade risks

Call spreads, put spreads and cash puts lock USDC until expiry, and you cannot close them early. The premium can be much smaller than what you pay out. A cash put can lose most of its lock if the price falls far enough, and you do not get SOL in return. See [Cash-settled spreads and puts](cash-settled-options.md).
