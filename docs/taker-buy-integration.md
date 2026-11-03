# Taker buy in the web app

Retail can buy options as well as sell them. This note maps the frontend side of it for anyone merging or extending it. Branch `feat/taker-buy`, ts-sdk `0.4.1`.

## Product rules

- Physical buy: `covered_call` (buy a call) and `cash_secured_put` (buy a put). The buyer pays the gross premium in USDC. To exercise, the buyer deposits strictly before `expiry_ts`: USDC (strike x quantity) for a call, the asset for a put. No deposit means the collateral returns to the writer, also in the money; the position settles as `not_exercised`.
- Cash-settled buy: `call_spread`, `put_spread`, `cash_put`. No deposit; the holder receives `holder_payoff` at expiry. There is no naked cash call.
- On chain the buyer is the position `holder`, the maker the `writer`. Vault makers never write buys.
- Best buy quote is the lowest gross price. `net_price` plays no part for a buyer.
- If no maker can receive the RFQ, the server closes it at once with `reason: "no_eligible_makers"`.

## Flow and where it lives

| Step | What happens | Code |
|---|---|---|
| Side toggle | Buy/Sell in Easy trade; copy, max loss, break-even, deposit text | `src/components/trade/easy/easy-trade.tsx`, `thesis-sentence.tsx`, `src/lib/trade/thesis.ts` |
| RFQ | `createRfq({ ..., side })` over the taker WS; default `sell` | `src/components/rfq/rfq-provider.tsx`, `use-quote-request.ts` |
| Quotes | `beatsQuote`: lowest `price` wins for buy, highest net for sell; `quoteMatchesProduct(quote, terms, side)` drops quotes of the wrong side | `rfq-provider.tsx`, `src/lib/spreads.ts` |
| No makers | `RfqClosed` with `no_eligible_makers` raises `RfqNoMakersError`, shown as `RFQ_NO_MAKERS` | `src/lib/rfq-collateral.ts` |
| Accept and sign | Modal shows "Premium you pay", break-even, the ITM warning and the deposit reminder; spreads show the cash settlement note. Signing goes through `verifyAndSignTakerFill`, which checks side, terms and amounts | `src/components/market/rfq-flow-modal.tsx` |
| Deposit | Wallet-paid, not sponsored. Reads live position and market accounts, then `flows.buildDepositFundsIxs` | `src/lib/trade/buy-deposit.ts`, `src/components/portfolio/use-buy-deposit.ts` |
| Portfolio | `position.side === "buy"` marks a bought position. `buyStatus` derives Deposit / Deposited / Will exercise / Deposit returns / Not exercised / Expired / Settling; `terminal_pending` shows as Settling; premium counts as spent | `src/lib/trade/buy-position.ts`, `src/components/portfolio/portfolio-client.tsx`, `spread-positions.tsx` |

Copy strings live next to their logic: `BUY_ITM_WARNING`, `BUY_DEPOSIT_REMINDER`, `SPREAD_SETTLEMENT_NOTE`, `BUY_PRODUCT_NAME` in `src/lib/trade/thesis.ts` and `src/lib/spreads.ts`; `BUY_STATUS_LABEL` in `buy-position.ts`.

## Backend contract

- WS: taker sends `side` in `CreateRfq`; makers opt in through the `taker_buy_rfqs` channel, so a buy RFQ reaches only makers subscribed to it with enough Maker PDA custody.
- The served open transaction carries the side byte (`OpenPosition` 75 bytes, `OpenSpread` 83). The old program rejects it.
- Portfolio reads come from the HTTP positions API (`src/lib/portfolio-api.ts`). `PositionState` adds `terminal_pending { slot, outcome }`; `PositionSettlement` adds `not_exercised`; cash fields are `holder_payoff` and `writer_return`.
- The deposit is the one transaction the app builds itself. Until the listener reports `funded`, `useBuyDeposit` keeps a local `funded` set so the button does not come back.

## Adding to it

- New buy product: extend `BUY_PRODUCT_NAME`, `quoteMatchesProduct` and the `thesis.ts` outcome rows; the RFQ path needs no change.
- New close reason: ts-sdk `RFQ_CLOSED_REASONS` is a closed union, so bump the SDK first, then handle the reason in `rfq-provider.tsx`.
- New portfolio state: add it to `BuyStatus` and `BUY_STATUS_LABEL`; `buyStatus` is the only place that derives it.

## Tests

`rfq-provider.test.tsx` (side, lowest price, no makers), `rfq-flow-modal.test.tsx` (buy rows, warning), `easy-trade.test.tsx` (toggle, spreads buy), `portfolio-client.test.tsx` and `spread-positions.test.tsx` (buy states), `buy-position.test.ts`, `buy-deposit.test.ts`, `thesis.test.ts`.

Not yet covered by a browser run on devnet with a real wallet: buy, deposit before expiry, settle, portfolio states.

User docs: `docs-site/guide/buying-options.md`. Integrator docs: `docs-site/quickstart/web-client-ts-sdk.md#buying-options`.
