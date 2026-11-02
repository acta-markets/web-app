# Cash-settled spreads and puts

You sell one of these, lock the most it can ever pay out in USDC, and get a premium up front. At expiry the maker takes its payoff from the lock and you get the rest back. You never buy or receive SOL.

The examples use 1 SOL, round prices and the premium after fees. They leave out Solana network fees and account rent. Real amounts are rounded by the contract.

| Product | You lock | You get now | At expiry | Maximum loss after the net premium |
| --- | --- | --- | --- | --- |
| Call spread `K1/K2` | `(K2 - K1) × quantity` | Net premium | Maker gets the cash value of the move above `K1`, capped at `K2 - K1` | lock − net premium |
| Put spread `K1/K2` | `(K2 - K1) × quantity` | Net premium | Maker gets the cash value of the move below `K2`, capped at `K2 - K1` | lock − net premium |
| Cash put `K` | `K × quantity` | Net premium | Maker gets the cash value of the move below `K` | lock − net premium |

## Call spread

You pick two strikes and lose only on the move between them. For a 160/180 call spread on 1 SOL, you lock 20 USDC and get 4 USDC.

- SOL ends at 190: the maker takes all 20 USDC. You are down 16 USDC, the most you can lose here.
- SOL ends at 150: you get the 20 USDC back and keep the 4 USDC.

## Put spread

The same idea in the other direction. The payout grows as the price falls and stops at the lower strike. For a 140/160 put spread on 1 SOL, you lock 20 USDC and get 4 USDC.

- SOL ends at 130: the maker takes all 20 USDC. You are down 16 USDC, the most you can lose here.
- SOL ends at 170: you get the 20 USDC back and keep the 4 USDC.

## Cash put

One strike, and a much bigger lock: the payout can grow all the way down to zero. On chain it is a put spread from 0 to the strike. For a 160 cash put on 1 SOL, you lock 160 USDC and get 6 USDC.

- SOL ends at 120: the maker takes 40 USDC, 120 USDC comes back, and you keep the 6 USDC.
- SOL ends at 0: the maker takes all 160 USDC. You are down 154 USDC, the most you can lose here.

## How these differ from Earn

An Earn call can sell your SOL at the strike, and an Earn put can buy you SOL at the strike. Here SOL never moves. Everything is paid in USDC.

## Risks

- Your USDC stays locked until the market expires and is finalized. You cannot close early.
- The premium is usually much smaller than the lock, so one bad expiry can cost many premiums.
- The payout uses the market's finalized oracle price. A different price on another venue changes nothing.
- USDC can lose value, and contract or oracle failures can cause losses or delays.
- Not every market offers every product, and limits differ by market.

For the exact fee, rounding and settlement rules, see [Options and settlement](../reference/protocol-flow.md).
