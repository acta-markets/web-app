# How Earn works

Pick a price at which you want to sell or buy, and a date. You get paid yield right away. On the date, if the market reached your price, the trade happens at your price. If not, you get your funds back. The yield stays with you either way.

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
- Your funds are isolated: each trade has its own account in the contract, not shared with anyone else, and stays locked until the date.
- APR shows the yield as a yearly rate.

Payout and fee rules for integrators: [Options and settlement](../reference/protocol-flow.md).
