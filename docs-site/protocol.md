# Protocol and integrations

Acta matches option sellers and buyers through requests for quotes (RFQs). Trades execute on Solana, where the contract holds collateral and settles positions after expiry.

## Options

The taker sells the option and deposits collateral. Makers quote the premium; the taker chooses which quote to accept. When the position opens, the maker pays the premium. For an in-the-money settlement, the maker supplies the asset exchanged for the taker's collateral.

- [Taker](protocol/taker.md): request quotes and sign the trade.
- [Maker](protocol/maker.md): price quotes, pay premiums and fund settlement.
- [Options and settlement](reference/protocol-flow.md): execution, asset transfers and fees.

## Vaults

Vaults pool deposits and issue shares. They can buy options, sell options and swap assets under their configured permissions. Governance sets policy and appoints a trading delegate. The operator trades and processes deposits and withdrawals.

- [Managing a vault](protocol/vault-owner.md): setup, permissions and operation.
- [Lifecycle](protocol/vault-lifecycle.md): trading phases and request processing.
- [Shares and fees](protocol/vault-accounting.md): valuation and withdrawals.

## APIs

Trading uses WebSocket. HTTP endpoints return indexed market, position and vault data.

- [WebSocket conventions](reference/ws-common.md): messages, units and signing.
- [HTTP API](reference/http-api.md): markets, makers and statistics.
- [Vault HTTP API](reference/vault-http-api.md): vaults, cycles and depositor history.
