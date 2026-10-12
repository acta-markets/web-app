# Protocol and integrations

Acta is a request-for-quote (RFQ) options venue on Solana. Takers request quotes, makers compete on price, and the winning quote executes as one on-chain transaction. The contract holds collateral and settles each position after expiry.

## Options

The taker writes the option and posts collateral: the underlying for a call, the quote asset for a put. The maker buys it and pays the premium when the position opens. If the option ends in the money, the maker delivers the asset the taker is owed. If the maker does not, a permissionless liquidator can.

- [Taker](protocol/taker.md): request quotes and sign the trade.
- [Maker](protocol/maker.md): quote, pay premiums and fund settlement.
- [Options and settlement](reference/protocol-flow.md): execution, transfers and fees.

## Vaults

A vault pools deposits into shares and trades on the same venue: it can write options as a taker, buy them as a maker, and swap between its two assets. Vault governance sets policy and appoints a trading delegate, who runs the strategy and processes deposits and withdrawals.

- [Managing a vault](protocol/vault-owner.md): setup, permissions and operation.
- [Lifecycle](protocol/vault-lifecycle.md): phases and request processing.
- [Shares and fees](protocol/vault-accounting.md): valuation and withdrawals.

## APIs

Trading runs over WebSocket. HTTP returns indexed market, position and vault data.

- [WebSocket conventions](reference/ws-common.md): messages, units and signing.
- [HTTP API](reference/http-api.md): markets, makers and statistics.
- [Vault HTTP API](reference/vault-http-api.md): vaults, cycles and depositor history.
