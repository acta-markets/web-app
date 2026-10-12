# Protocol Flow

Acta is an RFQ options venue on Solana. Positions are fully collateralized against on-chain escrow accounts and settle physically after expiry. There is no margin engine, leverage or early exercise.

## Actors

| Actor | Role | Access |
| --- | --- | --- |
| Taker | Writes the option (covered call or cash-secured put), posts collateral, opens the RFQ. | Any wallet. No registration or KYC. Rate-limited by active RFQ count. |
| Maker | Buys the option, pays premium, may fund the settlement leg. | Permissioned. On-chain `RegisterMaker` is admin-gated and timelocked. Subject to caps. |
| Keeper (hot authority) | Relays fills on-chain, co-signs `OpenPosition`, calls `FinalizeMarket`. | Protocol-operated. |
| Liquidator | Closes ITM positions the maker did not fund and fronts the settlement to the taker. | Permissionless. |
| Oracle / admin | Publishes the scalar settlement price after expiry. | Protocol-operated. Settlement and liquidation that consume it are permissionless. |

The maker is the option buyer and the taker is the writer. The `is_taker_buy` field in the order-id preimage is fixed at `0`. A taker-buys-the-option market type is reserved but not implemented.

Vaults can trade on either side. A writer vault locks its collateral. A holder vault pays premium and signs quotes through its active primary delegate. Vault execution uses the operator transaction signature and the holder's quote signature instead of the hot-authority co-signature. See [Roles and permissions](../protocol/vault-permissions.md).

## What an RFQ does

There is no order book. The taker drives a sealed auction, makers stream signed quotes, and the taker picks the winner.

- The taker sends `RfqRequest` (market, position type, strike, quantity). The backend broadcasts it to makers.
- Makers reply with signed `Quote`s. Each quote is a `(strike, price, valid_until)` against the fixed request. Makers cannot quote partial size or change the side.
- The taker picks the winner with `AcceptQuote { maker, order_id }`. The server's best-price signals (`QuoteBestStatus` / `QuoteOutbid`) are advisory. They do not select the winner.
- Winner-take-all: one quote fills the full RFQ quantity. Every live quote reserves full capacity against caps (open interest, notional, position count) for its validity window. The reservation is released on cancel, expiry or rejection and becomes position exposure on fill. See [Capacity limits](caps.md#how-quotes-consume-capacity).
- One quote per `(maker, strike)`: a maker's new quote on the same strike replaces the prior one. A maker may quote several distinct strikes.
- Advisory ranking for `QuoteBestStatus` / `best_price`: higher premium, then earlier `received_at`, then smaller `order_id`.

Indicative pricing: makers may receive `IndicativePricesRequest` and reply with non-binding prices per strike. Takers see them before opening an RFQ.

## Trade lifecycle

```
market traded
  -> RFQ active            (taker requests quotes)
  -> quotes streaming      (makers submit signed quotes)
  -> quote accepted        (taker picks order_id; sponsored tx built)
  -> position open         (atomic risk transfer on-chain)
  -> position funded?       optional (maker deposits settlement leg)
  -> market finalized      (oracle settlement price written after expiry)
  -> settled OTM / settled ITM funded / liquidated ITM unfunded
```

### 1. Market

A market carries underlying mint, quote mint, expiry timestamp, put/call side and oracle setup. Strikes belong to orders and positions, not to the market. The backend stops trading a market at the configured pre-expiry cutoff, or when it is disabled or finalized. Settlement and liquidation require oracle finalization after expiry.

### 2. RFQ

The taker sends `RfqRequest` with market, position type, strike, and quantity. `quantity` is in underlying atomic units. Before broadcasting, the backend checks: market is active, taker can trade, trading is not paused, size and tick rules pass, caps do not block. A maker blocked by caps may receive `RfqSkipped` instead of `RfqBroadcast`.

### 3. Quote

Makers receive `RfqBroadcast`, choose a premium, build a 32-byte `order_id`, sign it, and send `Quote`. The quoted `price` is gross premium per 1 underlying unit, scaled by `1e9`. The `order_id` commits to market, position type, strike, quantity, gross price, validity, maker, taker, and nonce. Backend checks: order-id and maker signature match, quote still valid, maker registered, maker has enough deposited quote balance for the premium, maker and platform caps pass.

### 4. Accept and open

The taker sends `AcceptQuote { maker, order_id }`. The backend returns a sponsored transaction. The taker signs it and returns it with `SubmitSignedSponsoredTx`. Ordinary `OpenPosition` requires the taker's signature, the maker's Ed25519 signature over `order_id`, and the keeper co-signature. Vault paths use the operator and holder signatures described above. The transaction atomically opens the position and transfers the premium. See [Custody and settlement funding](#custody-and-settlement-funding).

## Timing and deadlines

Server defaults, generated from `rfq-server-config`. All are configurable.

<!-- generated:rfq-timing-defaults -->
| Parameter | Default | Meaning |
| --- | --- | --- |
| RFQ window | taker-chosen | `expires_at = created_at + request.timeout`. The auction deadline. |
| `settlement_buffer` | 90 s | The trailing window reserved for settlement confirmation. A quote's effective trading cutoff is `valid_until - settlement_buffer`; quotes whose `valid_until` is closer than `settlement_buffer + quote_refresh_lead` are rejected. |
| `quote_refresh_lead` | 10 s | At `effective_expiry - quote_refresh_lead` the server fires `QuoteRefreshRequested` and freezes the quote (unacceptable until re-quoted). |
| `signature_timeout` | 30 s | Max time the taker has to sign the sponsored tx after `AcceptQuote`. The signature deadline is the minimum of `now + signature_timeout`, the quote's effective expiry, and the RFQ's `expires_at`. |
| `submitted_watchdog_timeout` | 120 s | The watchdog logs a stalled keeper or listener. The RFQ stays Enqueued until the trade confirms on-chain or the server knows the transaction was never sent. |
| `closed_rfq_ttl` | 300 s | How long a closed RFQ is retained before purge. |
| `max_quotes_per_rfq` | 50 | Cap on quotes per RFQ across all makers. |
| `max_rfqs_per_taker / max_active_rfqs` | 50 / 1000 | Concurrency limits (`0` disables the corresponding limit). |
<!-- /generated:rfq-timing-defaults -->

`rfq.expires_at` is the auction deadline. `quote.valid_until` is the on-chain order validity. They are distinct clocks.

On a signature timeout or tx-build failure, the locked (winning) quote is discarded and only the still-valid losing quotes are restored. The RFQ reverts to active if it has not yet expired.

## Economics

### Units

`PRICE_SCALE = 1_000_000_000`.

| Field | Meaning |
| --- | --- |
| `price` | Gross premium per 1 underlying unit, 1e9 scale |
| `strike` | Quote per 1 underlying unit, 1e9 scale |
| `quantity` | Underlying atomic units |
| `total_premium` | Net premium paid to taker, quote atomic units |

Quote-side atomic amount:

```
scaled_quote_amount(x, quantity) =
  floor(x * quantity * 10^quote_decimals / (PRICE_SCALE * 10^underlying_decimals))
```

Used for both `scaled_quote_amount(price, quantity)` = gross premium and `scaled_quote_amount(strike, quantity)` = notional / put collateral / call settlement amount.

### Cash flow at open

On a successful `OpenPosition`:

1. Maker PDA pays net premium to the taker in the quote token.
2. Maker PDA pays the protocol fee to the protocol fee account.
3. Taker collateral moves into the position escrow.
4. Position status becomes `open`.

### Collateral

| Position type | Taker collateral (locked at open) | Maker settlement asset (if ITM) |
| --- | --- | --- |
| Covered call | `quantity` underlying atomic units | `scaled_quote_amount(strike, quantity)` quote atomic units |
| Cash-secured put | `scaled_quote_amount(strike, quantity)` quote atomic units | `quantity` underlying atomic units |

The maker settlement leg is not locked at open. The maker pays premium at open and may deposit the settlement asset later with `DepositFundsToPosition` (status `open` → `funded`). The maker also needs a deposited program quote balance (via `DepositPremium`) for the premium debit. Idle balance is retrieved with `WithdrawPremium`.

### Fees

The maker signs the gross price. The contract nets fees during open:

```
gross_premium = scaled_quote_amount(price, quantity)

price_after_premium_fee_bps =
  price - floor(price * protocol_fee_bps_premium / 10_000)
premium_fee =
  gross_premium - scaled_quote_amount(price_after_premium_fee_bps, quantity)

notional_quote = scaled_quote_amount(strike, quantity)
volume_fee = floor(notional_quote * protocol_fee_bps_volume / 10_000)

fee_total   = min(premium_fee, volume_fee)
net_premium = gross_premium - fee_total
```

The taker receives `net_premium`. `Position.total_premium` stores the same net value. `protocol_fee_bps_premium` and `protocol_fee_bps_volume` are on-chain config set by governance (each ≤ 10000 bps). `net_price` in WS payloads is a display estimate. For accounting, use the formula above or on-chain `total_premium`.

## Settlement and payoff

Settlement is physical: it moves tokens at the strike. After expiry the hot authority publishes scalar prices to the Acta oracle accounts (configured via `OracleSource`) and calls `FinalizeMarket`:

```
settlement_price = floor(underlying_price * PRICE_SCALE / quote_price)
```

Price publication has two modes, selected by `GlobalConfig.settlement_attestor`:

- **Direct** (no attestor configured): `UpdateOraclePrice` writes the backend-published scalar.
- **Attested** (attestor configured): the hot authority submits `UpdateOraclePriceAttested`, immediately preceded in the same transaction by the attestor's Ed25519 signature over a domain-separated message binding program, config, oracle, price, expiry and a short validity window. The program verifies the binding. The published price is computed off-chain from Pyth Benchmarks history under a fixed canonical TWAP policy.

Neither mode verifies a Pyth price-update account on-chain. Settlement trusts the Acta oracle and, in attested mode, the attestor signature.

At-the-money counts as OTM.

| Position type | OTM | ITM |
| --- | --- | --- |
| Covered call | `settlement_price <= strike` | `settlement_price > strike` |
| Cash-secured put | `settlement_price >= strike` | `settlement_price < strike` |

Outcomes by status and moneyness:

| Status | Moneyness | Token movement |
| --- | --- | --- |
| `open` | OTM | Taker gets collateral back. |
| `funded` | OTM | Taker gets collateral back; maker gets settlement deposit back. |
| `funded` | ITM | Taker collateral goes to maker; maker settlement deposit goes to taker (a swap at the strike). |
| `open` | ITM | Normal settlement fails. The position must be liquidated. |

Who holds and receives what:

| | Covered call | Cash-secured put |
| --- | --- | --- |
| Taker posts (collateral) | Underlying | Quote |
| Taker receives (premium) | Quote (net) | Quote (net) |
| Maker pays (premium) | Quote | Quote |
| Maker funds (settlement, if ITM) | Quote | Underlying |
| ITM: taker receives | Quote (maker's settlement) | Underlying (maker's settlement) |
| ITM: maker receives | Taker's underlying collateral | Taker's quote collateral |
| OTM: each side keeps | Taker keeps collateral; maker keeps settlement deposit | Same |

## Custody and settlement funding

Taker collateral and maker settlement funds sit in separate escrow accounts owned by the position PDA. The maker's premium balance sits in the maker PDA. Each position names one taker and one maker.

An ITM position without a `DepositFundsToPosition` deposit fails normal settlement and stays `open`. After expiry and market finalization, anyone can liquidate it: the liquidator supplies the settlement asset, the taker is paid, the liquidator receives the taker's collateral and the position closes as `liquidated`. The maker loses the premium already paid. No further debt is recorded.

Platform caps limit token open interest, quote notional and market open interest. Maker caps limit open positions, notional exposure and premium commitments. See [Capacity limits](caps.md).

## State machine and events

Terminal states:

- RFQ: expired, cancelled, or filled.
- Position: settled or liquidated.

Lifecycle events:

| Event | When |
| --- | --- |
| `QuoteFilled` / `OrderConfirmed` | Position opened on-chain; carries `position_pda` and `tx_signature`. |
| `RfqClosed` | Auction closed; on a fill, `winner = { maker, price, tx_signature }`. |
| `ChainEvent(position_opened)` | Position opened, via chain events. |
| `MarketFinalized` | Market expired, oracle settlement price set. |
| `ChainEvent(position_settled)` | Assets distributed. |
| `ChainEvent(position_liquidated)` | Unfunded ITM position liquidated. |

`RegisterMaker`, `DepositPremium`, `WithdrawPremium` and `DepositFundsToPosition` are Solana instructions, not WebSocket messages. Build and submit them in transactions signed by the required authorities.

## Related docs

- [Maker API](maker-api.md) / [Taker API](taker-api.md): full WS message catalogues
- [WS common conventions](ws-common.md): encodings, units, time hierarchy, collateral formulas
- [Capacity limits](caps.md): cap layers and monitoring
- [Governance and security](governance.md): authority split, permissionless settlement/liquidation
- [Endpoints and maker registration](sandbox.md)
