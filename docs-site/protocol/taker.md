# How the taker works

The taker sells the product and locks collateral: the underlying for a covered call, the cash to buy at the strike for a cash-secured put, the maximum payoff in the quote asset for a spread or cash put. The premium, minus fees, is paid when the position opens.

## Cash-settled terms

These products are sell-only. Check the descriptor first: the product must be enabled and the strikes must match its tick. Quantity is still in underlying atomic units.

A spread sends an exact pair, `lower_strike < upper_strike`, both positive. Collateral is the width times quantity, rounded up in quote atoms. A `cash_put` sends one positive strike and executes as a put spread from zero. Collateral is strike times quantity, rounded up.

## Before requesting a quote

Connect to `/taker`. Markets can be read before authentication. Trading needs a wallet signature and, while invites are enabled, a redeemed invite code.

Read the market descriptor for the market PDA, expiry, asset pair, decimals and size rules. RFQ quantity is measured in underlying atomic units for every product. For a SOL put or cash product, request the quantity in SOL atoms, not the USDC deposit amount.

## From request to position

1. Send `RfqRequest` with the market, quantity and requested terms. Spreads and cash puts use the exact selected terms; physical products can use strike options.
2. Receive quotes.
3. Send `AcceptQuote` for the selected `order_id` and maker.
4. Receive `SponsoredTxToSign`. Verify the transaction against the accepted order, then sign the taker's slot.
5. Send `SubmitSignedSponsoredTx` before the signing deadline.
6. Track `OrderAccepted`, `OrderSubmitted` and `OrderConfirmed`. `OrderConfirmed` reports the opened position.

The full quantity fills or nothing does. Expired quotes are rejected.

## After a timeout or reconnect

A timed-out or failed transaction may still have landed. Resume or re-authenticate, then call `GetOrderStatus` for the accepted `order_id` before accepting another quote.

## At expiry

After expiry and oracle finalization, a covered call or cash-secured put returns the collateral or exchanges it at the strike, with the maker supplying the settlement asset. A spread or cash put splits the escrow: the maker gets the capped payoff and the taker gets the rest.

See [Options and settlement](../reference/protocol-flow.md) for funded, unfunded and liquidation outcomes.

## Build an integration

Start with the [Taker quickstart](../quickstart/taker-quickstart.md). The [TypeScript client SDK](../quickstart/web-client-ts-sdk.md) has signing helpers, and [Taker wire examples](../quickstart/taker-wire-examples.md) show a complete exchange. Message fields are in the [Taker API reference](../reference/taker-api.md).

Vaults write options from vault custody under operator authorization. See [Managing a vault](vault-owner.md).
