# Getting started

On Acta you choose a price at which you want to buy or sell an asset, and earn yield while you wait. Market makers pay you that yield up front. On the chosen date, if the market has reached your price, the trade happens at your price; if not, you get your funds back. The yield is yours either way.

There are three ways to use it:

- **Earn.** Pick an asset, the price you want to buy or sell at, and a date. A market maker pays you yield right away. [How Earn works](guide/options.md).
- **Deposit into a vault.** A manager trades pooled funds on Acta; you hold shares. [How vaults work](guide/vaults.md).
- **Make markets.** Market makers connect over WebSocket and quote the yield on incoming requests. [How the maker works](protocol/maker.md).

## Your first trade

1. Open **Earn** and choose a side:
   - **Calls**: sell higher. You lock SOL. If SOL ends above your price, it is sold at your price.
   - **Puts**: buy lower. You lock USDC. If SOL ends below your price, your USDC buys SOL at your price.
2. Pick the asset and a price. Each price comes with its date.
3. Enter the amount and click **Deposit**. The app gets a live quote from market makers and shows the yield.
4. Click **Sign & submit transaction**. The yield lands in your wallet when the transaction confirms.

On the date you get back either your funds or the other asset at your price. You keep the yield in both cases. Keep a little SOL for transaction fees.

APIs, SDKs and contract rules are in [Protocol & integrations](protocol.md).
