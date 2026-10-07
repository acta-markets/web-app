# How the taker works

The taker sells an option. For a call, the taker deposits the underlying asset. For a put, the taker deposits the funds needed to buy that asset at the strike. The premium, minus fees, is paid when the position opens.

## Before requesting a quote

Connect a Solana wallet to `/taker`. Markets can be queried before authentication. Trading requires wallet authentication and access approval where enabled.

Read the market descriptor for the market PDA, expiry, asset pair, decimals and size rules. RFQ quantity is measured in underlying atomic units for both calls and puts. For a SOL put, request the quantity in SOL atoms, not the USDC deposit amount.

## From request to position

1. Send `RfqRequest` with the market, quantity and requested strike or strike options.
2. Receive quotes. Check their terms and expiry before selecting one.
3. Send `AcceptQuote` for the selected `order_id` and maker.
4. Receive `SponsoredTxToSign`. Verify the transaction against the accepted order, then sign the taker's slot.
5. Send `SubmitSignedSponsoredTx` before the signing deadline.
6. Track `OrderAccepted`, `OrderSubmitted` and `OrderConfirmed`. `OrderConfirmed` reports the opened position.

The full requested quantity executes together; partial fills are not supported. Expired quotes are rejected. Recover the order state after a failed transaction before selecting another quote.

## After a timeout or reconnect

Authenticate again or resume the session, then read the RFQ and order state. Use `GetOrderStatus` for submission and confirmation status. Keep the accepted `order_id` until its outcome is known.

## At expiry

After expiry and oracle finalization, the taker receives the original collateral or exchanges it at the strike, depending on the settlement price. For an in-the-money settlement, the maker supplies the asset paid to the taker.

See [Options and settlement](../reference/protocol-flow.md) for funded, unfunded and liquidation outcomes.

## Build an integration

Use the [Taker quickstart](../quickstart/taker-quickstart.md) for the session flow, the [TypeScript client SDK](../quickstart/web-client-ts-sdk.md) for client and signing helpers, and the [Taker API reference](../reference/taker-api.md) for message fields. [Wire examples](../quickstart/taker-wire-examples.md) show a complete exchange.

A vault writing options uses vault custody and operator authorization. Start with [Managing a vault](vault-owner.md) for that path.
