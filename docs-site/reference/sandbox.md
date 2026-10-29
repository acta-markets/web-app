# Endpoints and maker registration

## Endpoints

| Service | Mainnet | Devnet |
| --- | --- | --- |
| Maker quote WebSocket | `wss://beta-api.acta.markets/maker` | `wss://devnet-api.acta.markets/maker` |
| Maker data WebSocket | `wss://beta-api.acta.markets/maker/data` | `wss://devnet-api.acta.markets/maker/data` |
| Taker WebSocket | `wss://beta-api.acta.markets/taker` | `wss://devnet-api.acta.markets/taker` |
| HTTP API | `https://beta-api.acta.markets` | `https://devnet-api.acta.markets` |
| Solana cluster | Mainnet-beta | Devnet |

All WebSocket endpoints use the same [message envelopes and encodings](ws-common.md).

Vault swaps use hops through programs and instruction selectors registered in `SwapVenues`. A devnet mock swap program must be registered like any other venue. Vault pricing uses per-mint `PriceRoute` accounts and their brick accounts; Each Pyth brick sets its maximum price age; `PriceRoute.max_skew_secs` limits the spread of Pyth publish times. Read the target environment's routes and venue registry before building a swap.

## Maker registration

A maker has an owner wallet for on-chain transactions and a key for signing quotes. Both roles can use the same key.

The protocol administrator registers both public keys through the timelocked `RegisterMaker`, which creates the maker PDA. The same `quote_signing` key signs the auth challenge and every quote. The maker owner can rotate it with `UpdateMakerQuoteSigning`.

Before quoting, deposit the quote token into the maker account with `DepositPremium`. The owner signs and supplies a token account for the market's quote mint.

Connect the signing key to `/maker` for quotes and `/maker/data` for participant reads. Authentication is the Ed25519 challenge-response in [Signing conventions](ws-common.md#what-to-sign).

## Program addresses

| Address | Value |
| --- | --- |
| Program ID | `33Ezs5eoa16QyPW8wifnyz2nCyMEcq2crqkVBNjnTE8U` |

| PDA | Seeds |
| --- | --- |
| Maker account | `["maker", maker_owner_pubkey]` |

See also: [Maker quickstart](../quickstart/maker-quickstart.md), [Maker API reference](maker-api.md).
