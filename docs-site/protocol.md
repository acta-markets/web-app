# Protocol and integrations

Acta is a request-for-quote (RFQ) options venue on Solana. Takers request quotes, makers compete on price, and the winning quote executes as one on-chain transaction. The contract holds collateral and settles each position after expiry.

## Options

The taker writes the product and the maker pays the premium at open.

Covered calls lock the underlying and cash-secured puts lock the quote asset. In the money, the two sides swap assets at the strike. If the maker does not fund that swap, a permissionless liquidator can.

Call spreads, put spreads and cash puts lock their maximum payout in the quote asset. After finalization the maker takes its payoff from that escrow and the taker gets the rest. There is nothing to fund and nothing to liquidate.

- [Taker](protocol/taker.md): request quotes and sign the trade.
- [Maker](protocol/maker.md): quote, pay premiums and fund physical settlement.
- [Cash-settled spreads and puts](guide/cash-settled-options.md): user examples and risks.
- [Options and settlement](reference/protocol-flow.md): execution, transfers and fees.

## Vaults

A vault pools deposits into shares and trades on the same venue: it can write options as a taker, buy them as a maker, and swap between its two assets. Vault governance sets policy and appoints a trading delegate, who runs the strategy and processes deposits and withdrawals.

- [Managing a vault](protocol/vault-owner.md): setup, permissions and operation.
- [Lifecycle](protocol/vault-lifecycle.md): phases and request processing.
- [Shares and fees](protocol/vault-accounting.md): valuation and withdrawals.

## APIs

Trading runs over WebSocket. HTTP returns indexed market, position and vault data.

- [WebSocket conventions](reference/ws-common.md): messages, units and signing.
- [HTTP API](reference/http-api.md): venue limits, tokens, markets, makers and statistics.
- [Vault HTTP API](reference/http-api.md#vaults): vaults, cycles and depositor history.
