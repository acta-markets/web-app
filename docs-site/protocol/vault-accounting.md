# Shares, equity and fees

Vault accounting is calculated by the contract at capital boundaries. Backend values are projections of that accounting.

## Supply and ownership

The live SPL share-mint supply is the on-chain supply. The vault also stores a boundary supply cache in `total_shares`. Transfers can change who owns shares without producing a vault deposit or withdrawal event; query the wallet's token accounts for current ownership.

An external share burn can make live supply lower than `total_shares`. Use the SPL mint for current supply and the vault's stored values for its last accounting checkpoint.

Manager stake is held separately from depositor shares. The stake checkpoint and the configured minimum constrain stake removal.

## NAV and equity checkpoint

NAV (net asset value) is the accounted equity in main-asset units. At an eligible boundary, the contract values main custody plus second custody converted into main-asset units using validated on-chain Pyth prices. The checkpoint requires open positions and funding obligations to be resolved.

Pyth price-update accounts are supplied to the instruction. The contract checks their oracle sources, feed IDs, freshness and price-quality limits.

Equity is expressed in main-token atomic units. Share price and the high-water mark use a fixed scale of `1_000_000_000` and a `u128` representation. Use decimal strings or `BigInt` to preserve precision in JavaScript.

Share price updates at eligible accounting checkpoints: after cycle settlement or during eligible idle request processing.

## Fees

Management and performance fees mint shares into manager stake. Existing holders are diluted; custody is not reduced by a direct fee transfer at that step.

Management fees depend on the configured rate and elapsed accounting time. Performance fees apply only above the post-management high-water mark. The high-water mark does not decrease when the vault loses value.

Read share prices and fees from contract events, which include the contract's rounding and dilution.

## Deposits and withdrawals

Processed deposits move main tokens from request escrow into custody and mint shares. Ordinary withdrawals burn escrowed shares and pay main tokens. Rejected deposits and unusable recipient accounts can result in refunds or returned shares; expose these outcomes separately from completed deposits and payouts.

Final redemption requires exactly one withdrawal for all remaining live shares. The normal path also requires no pending deposits; `withdraw_only` permits pending deposits. Use the dedicated final-withdrawal instruction, which burns the supply and transfers both main and second custody balances.

See [Request processing](vault-lifecycle.md#request-processing) and [Transaction recovery](recovery.md).
