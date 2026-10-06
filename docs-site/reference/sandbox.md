# Endpoints and maker registration

## Endpoints

| Service | Mainnet | Devnet |
| --- | --- | --- |
| Maker quote WebSocket | `wss://beta-api.acta.markets/maker` | `wss://devnet-api.acta.markets/maker` |
| Maker data WebSocket | `wss://beta-api.acta.markets/maker/data` | `wss://devnet-api.acta.markets/maker/data` |
| Taker WebSocket | `wss://beta-api.acta.markets/taker` | `wss://devnet-api.acta.markets/taker` |
| HTTP API | `https://beta-api.acta.markets` | `https://devnet-api.acta.markets` |
| Solana cluster | Mainnet-beta | Devnet |

Both endpoints use the same [message envelopes and encodings](ws-common.md).

## Maker registration

A maker has an owner wallet for on-chain transactions and a key for signing quotes. Both roles can use the same key.

The protocol administrator registers the owner and quote-signing public keys through `RegisterMaker`, which creates the maker PDA.

Before quoting, deposit the quote token into the maker account through `DepositPremium`. The owner signs the transaction and supplies a token account for the quote mint. Markets specify their underlying and quote mints.

Connect the signing key to `/maker` for quotes and `/maker/data` for participant reads. Authentication uses the Ed25519 challenge-response described in [Signing conventions](ws-common.md#what-to-sign).

## Program addresses

| Address | Value |
| --- | --- |
| Program ID | `33Ezs5eoa16QyPW8wifnyz2nCyMEcq2crqkVBNjnTE8U` |

| PDA | Seeds |
| --- | --- |
| Maker account | `["maker", maker_owner_pubkey]` |

See [Maker quickstart](../quickstart/maker-quickstart.md) for the connection flow and [Maker API reference](maker-api.md) for message fields.
