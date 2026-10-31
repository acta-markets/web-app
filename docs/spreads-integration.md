# Spreads UI development

Install the exact published `@acta-markets/ts-sdk@0.3.0` from the lockfile:

```sh
npm ci
```

No local SDK override is needed. This release requires WS 1.0.0 and ships with
the backend in the mainnet maintenance window; it has no legacy-wire fallback.

## Product and wire boundaries

The contract design `../acta-contract/docs/research/spreads.md` and
`../WIRE-SPREADS.md` are authoritative. The client uses WS `1.0.0`, explicit `onDisconnect` and a nonempty `products` list. Spreads are base protocol and “Make P&L” no longer depends on feature flags. Vaults trade spreads through their operators (backend
and SDK vault routes); the web-app vault exposure table labels vault spread
positions as "Call spread"/"Put spread" (the exposure endpoint reports no
intrinsic for them). Maker and taker may be the same owner.

The cash-put ticket uses `cash_put` on the wire and the SDK's zero-lower-strike
put-spread economics for collateral, fees and preview. It settles in the quote
token without underlying delivery. Both tickets require an unexpired descriptor
that explicitly includes the selected product. Mainnet policy `products=3`
exposes only physical calls and puts: neither cash-settled goal is offered.

The UI sends required `side: "sell"` and tagged `terms` on every request, and
accepts only quotes with the same side and terms:

```ts
{ type: "covered_call", strike }
{ type: "cash_secured_put", strike }
{ type: "cash_put", strike }
{ type: "call_spread", lower_strike, upper_strike }
{ type: "put_spread", lower_strike, upper_strike }
```

Both streaming and snapshot quotes must match the RFQ ID, product, side and
complete pair before display. Missing side/product and mixed physical/spread
terms reject. Put spreads sell K2 and buy K1. Invalid premiums are filtered
before best-quote ranking so they cannot hide executable quotes.

The spread ladder is generated from the reference price, rounded to the
underlying's server `strike_tick` (WS `Tokens`, backed by rfq-server `[prices] ticks`).
`spreadTerms` requires that tick and rejects strikes off it; without a tick the
form stays unavailable. The contract has no spread tick or width cap. It does not use physical indicative premiums or interpret physical
strike alternatives as spread legs. Both strikes require an explicit selection.
The form uses each market's quote mint, symbol, underlying/quote decimals and
size rules, and requires the full ceil(width × qty)
quote collateral in the canonical wallet ATA before requesting a quote. Unknown
balances block the request. There is no native-token wrapping for spreads. Production market admission owns
the intended USDC mint policy; the client does not infer mint identity from a
symbol. Fee snapshots are bound to the selected quote mint.

All execution amounts are integer atoms. Decimal text is parsed without a float
round-trip. The SDK's current numeric JSON API admits safe integers only: larger
values are rejected rather than rounded. Display and graph coordinates alone
use floating point.

Fee configuration is read from the quote mint's on-chain PremiumConfig. The SDK
spread helpers calculate gross/net premium, width-based fees, ceil collateral,
and ceil buyer payoff. A live quote supplies premium; physical indicatives do
not. The preview shows gross collateral, net maximum loss, approximate breakeven
and seller cash P&L. Before a quote it displays the cash payoff before premium.
Network fees are excluded. Fee previews reflect the configuration read and may
change before execution; finalized positions carry the actual net premium.

The existing order hook owns accept/sign/submit/recovery. The SDK verifies the
served transaction against the RFQ ID, chosen product and pair before opening the wallet,
and verifies the wallet's returned transaction. No web-app order hash implementation
or alternate signing path is used.

Portfolio spreads show both strikes, collateral, net premium and finalized
`maker_payoff` / `taker_return`. Null cash receipts remain unknown; zero is a
known payout. Trade P&L is net premium minus buyer payoff, excluding donations and
network fees. Spreads are separate from the existing physical yield aggregates.
Only Open and Settled are valid spread lifecycle labels.

## Validation

```sh
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
git restore tsconfig.tsbuildinfo # only if the build changed the tracked cache
```

`src/lib/fixtures/order-preimage-vectors.json` is an unchanged copy of the shared
SDK fixture `../acta-contract/ts-sdk/fixtures/order-preimage-vectors.json`. All
orders use the `ACTA` domain; the type byte selects the physical (182) or spread
(190) layout. The installed SDK must reproduce every valid vector's bytes and
order ID in `spreads-sdk.test.ts`, including buy-side encodings, and must not
reproduce the two `valid: false` type/layout mismatch vectors.

Unit/component coverage includes integer payoff and fee rounding, lower/upper put
orientation, full-collateral and unknown-balance blocking, product/side/pair quote
separation, capability loss and finalized cash payout presentation. Successful
local gates do not prove a deployed backend or on-chain spread execution.


Position rows are self-contained: use required `underlying_decimals` and
`quote_decimals` and read cash payouts from `settlement.type === "cash"`.
Venue protocol fee fields are required. Hello has no feature flags.
