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

Solana accounts are the source of truth. HTTP data lags them by listener indexing time. After your own transaction confirms, read the affected accounts directly.

Live RFQs, quotes and capacity reservations exist only in the RFQ server. If indexed history falls behind, new trades are rejected with `history_projection_incomplete` until the listener catches up.

## Prices

Option settlement uses prices published to Acta oracle accounts after expiry. In attested mode, publication also requires the configured attestor's signature. Vault equity and swaps use on-chain Pyth price-update accounts.

See [Transaction recovery](recovery.md) and [Public HTTP API](../reference/http-api.md).
