# Buying options

You can also buy a call or a put. You pay a premium now and get the right, not the obligation, to trade at your price at expiry. The most you can lose is the premium. Market makers quote the price when you ask; the premium, max loss and break-even are shown before you accept.

## Buy a call: the right to buy

SOL is $160. You buy the right to buy 1 SOL at $170 in a week and pay $3.

- SOL ends at $185: deposit 170 USDC before expiry and you get 1 SOL. Your gain is $185 − $170 − $3 = $12.
- SOL ends at $165: do not deposit. You lose the $3 premium.

## Buy a put: the right to sell

SOL is $160. You buy the right to sell 1 SOL at $150 in a week and pay $3.

- SOL ends at $135: deposit 1 SOL before expiry and you get 150 USDC. Your gain is $150 − $135 − $3 = $12.
- SOL ends at $155: do not deposit. You lose the $3 premium.

## Deposit before expiry

To use a bought call or put, deposit before the expiry time: USDC for a call, the asset for a put. The deposit is a separate transaction that you sign and pay the network fee for. A deposit after expiry is rejected.

If you have not deposited by expiry, the option is not exercised, even when it is in the money. You lose the premium and the seller keeps everything. If you deposited and the option ends out of the money, your deposit comes back.

Your portfolio shows a Deposit button until expiry, then the state: Deposited, Will exercise, Deposit returns, Not exercised or Settling.

## Buy spreads and cash puts

Call spreads, put spreads and cash puts can also be bought. They need no deposit and pay in USDC at expiry: the more the price moves past your strike, the more you get, up to the spread width. The most you can lose is the premium. See [Cash-settled spreads and puts](cash-settled-options.md).

## No quote

If no market maker can sell the option right now, you see "No makers are quoting this right now." Try another strike, expiry or size later.
