# How Earn works

Pick a price at which you want to sell or buy, and an expiry date. You receive a premium when the position opens. The finalized price at expiry determines whether your assets are exchanged at the strike or returned. You keep the premium either way. The examples below use premiums after protocol fees.

## Calls: sell higher

SOL is $160. You want to sell at $170. You lock 1 SOL for a week and get $3 now.

- SOL ends at $180: your SOL is sold for $170. You have $170 + $3.
- SOL ends at $150: you get your 1 SOL back. You have 1 SOL + $3.

## Puts: buy lower

SOL is $160. You want to buy at $150. You lock 150 USDC for a week and get $3 now.

- SOL ends at $140: you buy 1 SOL for $150. You have 1 SOL + $3.
- SOL ends at $170: you get your 150 USDC back. You have 150 USDC + $3.

## Good to know

- The yield is paid by market makers, who compete to offer you the best rate.
- Your funds are isolated: each trade has its own account in the contract, not shared with anyone else, and stays locked until settlement after expiry.
- APR shows the yield as a yearly rate.

Payout and fee rules for integrators: [Options and settlement](../reference/protocol-flow.md).

## Buying options

You can also buy calls and puts for a premium. See [Buying options](buying-options.md).

## Cash-settled trades

Calls and puts above can sell your SOL or leave you holding it. Call spreads, put spreads and cash puts only pay in USDC. See [Cash-settled spreads and puts](cash-settled-options.md).
