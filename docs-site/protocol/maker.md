# How the maker works

The maker buys the option. It quotes and signs a premium, then pays it when the seller accepts and the position opens. If the option expires in the money, the maker supplies the settlement asset and receives the seller's collateral.

## Account and signing key

For `/maker`, register a maker account and deposit funds to pay premiums. The account owner and quote-signing key may differ. Authenticate with the registered signing key. Premiums are paid from the maker account.

Use `/maker` for quotes and `/maker/data` for account and order reads. The [Maker quickstart](../quickstart/maker-quickstart.md) includes authentication and subscriptions.

## From RFQ to fill

1. Subscribe to markets and RFQs.
2. On `RfqBroadcast`, validate the market PDA, pair, expiry, quantity and available strikes.
3. Choose the premium and validity window. Build the canonical order, derive `order_id` and sign its hash with the quote key.
4. Submit `Quote` or a batch.
5. Track selected and executing orders until they resolve.
6. Fund in-the-money positions before settlement.

Premium units, the order preimage and signature checks are specified in [Quote flow](../reference/maker-api.md#quote-flow).

## Repricing and disconnects

Use `ReplaceQuote` to reprice atomically. Cancel-then-quote leaves a gap.

With `cancel_on_disconnect` enabled, a disconnect removes that connection's active and retained non-winning quotes. Selected and executing orders remain. Without this feature, resting quotes can still be filled while the client is offline.

After reconnecting, re-read quotes, orders and positions, and call `GetOrderStatus` for pending orders.

## Settlement funding

An unfunded in-the-money position cannot settle normally. A permissionless liquidator pays the taker and takes the collateral instead. Disconnecting does not close positions.

Outcomes are in [Options and settlement](../reference/protocol-flow.md). Recovery reads are in the [Maker API reference](../reference/maker-api.md).

## Build an integration

The [Rust maker SDK](../quickstart/maker-rust-sdk.md) handles sessions and reconnects. For raw WebSocket messages, use the [Maker quickstart](../quickstart/maker-quickstart.md) and [Maker wire examples](../quickstart/maker-wire-examples.md).

A vault buys options as a vault maker: its active primary delegate signs quotes, and premiums come from vault custody instead of a maker premium account. See [Managing a vault](vault-owner.md).
