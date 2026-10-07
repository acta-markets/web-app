# How the taker works

The taker sells an option. For a call, the taker deposits the underlying asset. For a put, the taker deposits the funds needed to buy that asset at the strike. The premium, minus fees, is paid when the position opens.

## Before requesting a quote

Connect to `/taker`. Markets can be read before authentication. Trading needs a wallet signature and, while invites are enabled, a redeemed invite code.

Read the market descriptor for the market PDA, expiry, asset pair, decimals and size rules. RFQ quantity is measured in underlying atomic units for both calls and puts. For a SOL put, request the quantity in SOL atoms, not the USDC deposit amount.

## From request to position

1. Send `RfqRequest` with the market, quantity and requested strike or strike options.
2. Receive quotes.
3. Send `AcceptQuote` for the selected `order_id` and maker.
4. Receive `SponsoredTxToSign`. Verify the transaction against the accepted order, then sign the taker's slot.
5. Send `SubmitSignedSponsoredTx` before the signing deadline.
6. Track `OrderAccepted`, `OrderSubmitted` and `OrderConfirmed`. `OrderConfirmed` reports the opened position.

The full quantity fills or nothing does. Expired quotes are rejected.

## After a timeout or reconnect

A timed-out or failed transaction may still have landed. Resume or re-authenticate, then call `GetOrderStatus` for the accepted `order_id` before accepting another quote.

## At expiry

After expiry and oracle finalization, the taker receives the original collateral or exchanges it at the strike, depending on the settlement price. For an in-the-money settlement, the maker supplies the asset paid to the taker.

See [Options and settlement](../reference/protocol-flow.md) for funded, unfunded and liquidation outcomes.

## Build an integration

Start with the [Taker quickstart](../quickstart/taker-quickstart.md). The [TypeScript client SDK](../quickstart/web-client-ts-sdk.md) has signing helpers, and [Taker wire examples](../quickstart/taker-wire-examples.md) show a complete exchange. Message fields are in the [Taker API reference](../reference/taker-api.md).

Vaults write options from vault custody under operator authorization. See [Managing a vault](vault-owner.md).
