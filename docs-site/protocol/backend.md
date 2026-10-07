# Backend services and data

Solana accounts record positions, balances and vault state. The backend matches quotes, prepares transactions and indexes chain activity for the APIs.

## Services

| Service | Function |
| --- | --- |
| Contract | Holds funds, checks signatures and permissions, settles positions and calculates vault equity. |
| RFQ server | Authenticates wallets, handles RFQs and quotes, reserves capacity and serves the APIs. |
| Listener | Reads finalized chain history and updates markets, positions, vaults and cycles in PostgreSQL. |
| Keeper | Submits and tracks transactions, finalizes markets and settles positions. |
| tx-service | Builds execution and swap transactions for wallet signing. |
| Oracle setter and settlement attestor | Calculate expiry prices and sign their publication to Acta oracle accounts. |

## Reading state

HTTP endpoints return vaults, cycles, positions and request history. Read vault accounts, share balances and request PDAs directly from finalized Solana state after a wallet transaction.

HTTP data updates after the listener indexes a transaction. After confirmation, read the affected chain accounts and refresh the HTTP data.

The RFQ server keeps live RFQs, quotes and capacity reservations in memory. Confirmed positions and vault state are read from Solana accounts.

## Readiness and recovery

Trading requires authentication and up-to-date projections. When indexed history is incomplete, operations that use that history wait for the listener to recover it.

The listener records a position's final outcome from its chain history. The keeper selects work from PostgreSQL and checks live accounts before execution.

## Prices

Option settlement uses prices published to Acta oracle accounts after expiry. In attested mode, publication also requires the configured attestor's signature. Vault equity and swaps use on-chain Pyth price-update accounts.

See [Transaction recovery](recovery.md) and [Public HTTP API](../reference/http-api.md).
