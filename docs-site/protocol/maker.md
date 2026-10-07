# How the maker works

The maker buys the option. It quotes and signs a premium, then pays it when the seller accepts and the position opens. If the option expires in the money, the maker supplies the settlement asset and receives the seller's collateral.

## Account and signing key

For `/maker`, register a maker account and deposit funds to pay premiums. The account owner and quote-signing key may differ. Authenticate with the registered signing key; premiums are paid from the maker account.

Use `/maker` for quotes and `/maker/data` for account and order reads. The [Maker quickstart](../quickstart/maker-quickstart.md) includes authentication and subscriptions.

## From RFQ to fill

1. Subscribe to the markets and RFQs you intend to quote.
2. On `RfqBroadcast`, validate the market PDA, pair, expiry, quantity and available strikes.
3. Choose the premium and validity window. Build the canonical order, derive `order_id` and sign its hash with the quote key.
4. Submit `Quote` or a batch. A quote acknowledgment confirms acceptance by the server. Execution is tracked separately.
5. Track selection and execution. Keep selected and executing orders until their outcome is known.
6. Fund positions that need an asset exchange at expiry.

Premium units, the order preimage and signature checks are specified in [Quote flow](../reference/maker-api.md#quote-flow).

## Repricing and disconnects

`ReplaceQuote` replaces a quote atomically. Cancelling and then submitting a new quote leaves a gap between the two operations.

With `cancel_on_disconnect` enabled, a disconnect removes that connection's active and retained non-winning quotes. Selected and executing orders remain. Without this feature, resting quotes can still be filled while the client is offline.

After recovery, reconcile live quotes, orders and positions. Use `GetOrderStatus` for orders with an unresolved outcome.

## Settlement funding

The maker deposits settlement funds into the position. If an in-the-money position remains unfunded, a permissionless liquidator can provide the required asset and receive the corresponding collateral. Disconnecting leaves existing positions open.

See [Options and settlement](../reference/protocol-flow.md) for the complete outcomes and [Maker API reference](../reference/maker-api.md) for recovery reads.

## Build an integration

The [Rust maker SDK](../quickstart/maker-rust-sdk.md) handles sessions and reconnects. For raw WebSocket messages, use the [Maker quickstart](../quickstart/maker-quickstart.md) and [wire examples](../quickstart/maker-wire-examples.md).

A vault buying options signs as a vault maker under its active primary-delegate grant. It uses vault custody rather than the ordinary maker premium account. See [Managing a vault](vault-owner.md).
