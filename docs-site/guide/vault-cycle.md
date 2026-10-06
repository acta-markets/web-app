# The vault cycle

A cycle starts when the manager opens option positions. The funds committed to those positions stay in the vault until settlement. A withdrawal requested during this time waits for the positions to settle.

After the options expire, the positions are settled. Depending on the trades and the settlement price, the vault may receive back its collateral or exchange it for the other asset.

Once settlement is complete, the vault calculates the value of its assets and the share price, accounting for fees. Pending deposits receive shares at this price, and pending withdrawals exchange shares for the vault's main asset. The manager can then start the next cycle.
