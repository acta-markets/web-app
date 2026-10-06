# Returns, fees and risks

The vault's return reflects changes in asset value and the results of its option trades and swaps.

## What your shares are worth

Your shares represent your portion of the vault. If the vault holds 100 SOL after fees and has 100 shares, each share is worth 1 SOL. If its value grows to 110 SOL and the share count stays the same, each share is worth 1.1 SOL. Your 10 shares are then worth 11 SOL.

If the vault's value falls to 90 SOL, those same 10 shares are worth 9 SOL.

The page shows the last calculated share price. Your payout uses the price at which your withdrawal is processed.

## Returns and fees

Recorded returns reflect completed cycles and include vault fees. An annualized return requires at least 30 days of recorded history.

A vault can charge management and performance fees. These fees give the manager additional shares, reducing your percentage of the vault without changing your share count. Check the vault's fee settings before depositing. Transaction fees and account rent are separate.

The calculation is covered in [Shares, equity and fees](../protocol/vault-accounting.md).

## Risk

Selling calls gives up gains above the strike. Selling puts can leave the vault buying an asset above its market value. Bought options can expire worthless.
