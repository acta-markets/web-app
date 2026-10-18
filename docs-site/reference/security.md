# Security

Acta separates cold governance from hot operations, with an independent guardian for emergencies. Every authority check is a signer check: an action is allowed when the transaction signer equals the expected key.

| Role | Key | Controls | Form |
|------|-----|----------|------|
| Cold authority | `ACTA_ADMIN`, compiled into the program | Protocol config, timelock, hot and guardian rotation, pause release, settlement price correction | Squads 3-of-4 multisig vault |
| Hot wallet | `GlobalConfig.hot_authority` | Markets, oracle accounts, settlement prices, `OpenPosition` co-sign, fee withdrawal | Backend online key, rotatable by cold |
| Guardian | `GlobalConfig.guardian` | Cancel queued actions, engage pause | Optional single emergency key |
| Settlement attestor | `GlobalConfig.settlement_attestor` | Second signature on hot settlement prices | Optional Ed25519 key, set by cold through the timelock |

The full permission matrix, timelock and pause mechanics are in [Governance](governance.md).

## What each key can do if it leaks

**One cold member key.** Nothing. Every cold action needs 3 of the 4 Squads members. Rotate the member in Squads.

**Hot wallet.** It can create and close markets and oracle accounts, withdraw collected protocol fees and co-sign positions. It cannot open a position on its own, because `OpenPosition` also needs the taker's transaction signature and the maker's Ed25519 quote signature. It cannot change cold configuration, rotate itself or upgrade the program.

Without an attestor, the hot wallet publishes settlement prices alone, so a leaked hot key can publish a wrong price after expiry. With an attestor configured, a hot publication needs the attestor's signature too, and the leaked hot key alone cannot set a price.

Cold rotates the hot wallet immediately with `UpdateGlobalHotAuthority`. Every hot-gated instruction reads the live `hot_authority`, so the old key loses all access at once, including on oracles created before the rotation.

**Guardian.** It can only grief: cancel queued actions and re-engage the pause. It cannot unpause, queue or execute actions, rotate keys or move funds. Cold rotates or clears it with `SetGuardian`.

**Maker quote key.** A maker's `quote_signing` key signs orders for that maker only. A leaked key lets an attacker sign quotes the maker pays for, but each fill still needs the hot co-sign and a taker.

## Opening a position

`OpenPosition` needs three independent signatures:

- the hot wallet co-signs the transaction;
- the taker signs the transaction as collateral or premium authority;
- the maker signs `order_id` with its `quote_signing` key in an Ed25519 instruction placed immediately before `OpenPosition`.

`order_id` is the hash of a preimage that binds the domain tag, chain id, program id, side, position type, market, strike, quantity, gross price, `valid_until`, maker, taker and nonce. The maker's signature commits to the exact terms and cannot be replayed onto other ones. The position account is the PDA `["position", order_id]`, so the same order cannot be filled twice.

`OpenPosition` is rejected while the protocol is paused.

## Settlement prices

Instruments build up in order, and each step is gated by the one before it:

1. **Oracle source** (cold, timelocked). The per-mint registry of approved price feeds, one slot per oracle type (manual, Pyth, Switchboard).
2. **Oracle account** (hot). One per mint and expiry. It can only use a feed approved in the matching source slot, and it starts unpriced.
3. **Market** (hot). Pairs an underlying and a quote oracle with the same expiry.
4. **Position.** Trades against a market.

The settlement price is written once, only after expiry, and must be non-zero and within bounds. A second publication fails with `OracleAlreadyUpdated`.

### Settlement attestor

Cold can set an optional attestor key with `SetSettlementAttestor` and remove it with `RevokeSettlementAttestor`, both through the timelock. While an attestor is set, settlement is 2-of-2:

- the hot wallet publishes with `UpdateOraclePriceAttested`;
- the instruction right before it is an Ed25519 verification of the attestor's signature over the domain tag, a 32-byte replay domain, program id, global config, oracle, price, expiry, `issued_at`, `valid_until` and calculation version;
- the attestation must be issued after expiry, be valid at execution, and live at most 300 seconds;
- a direct hot `UpdateOraclePrice` fails with `SettlementAttestationRequired`.

Cold can still publish directly, because a Squads CPI cannot produce the Ed25519 precompile instruction. Revoking the attestor restores direct hot publication.

### Price correction

Cold can overwrite a published price with `CorrectOraclePrice`. It is a direct cold call with no timelock, and it emits `OraclePriceCorrected` with the old and new price. `FinalizeMarket` snapshots the price into the market, so a correction only affects markets that are not finalized yet. Two markets on the same oracle can therefore settle at different prices if one finalized before the correction. After a correction, hot and attested publication for that oracle fail with `OracleAlreadyUpdated`; only cold can change the price again.

## Exits

`SettlePosition` and `LiquidatePosition` are permissionless. Any signer may settle an expired position or liquidate an in-the-money unfunded one. The pause blocks new positions, not exits.

## Program upgrade

The program upgrade authority is a separate Squads vault, not the cold authority. It has its own approvals and execution delay. An upgrade can replace any logic, including the timelock and guardian, so the on-chain timelock and guardian veto do not apply to it; its Squads approvals and delay are its control.

## Vaults

Vault governance, delegates and their limits are covered in [Roles and permissions](../protocol/vault-permissions.md). Vault managers are a restricted, trusted set: a manager signs swaps alone, and the program bounds each trade by the configured drift limits rather than by a second signature.

## Incident response

| Incident | Response |
|----------|----------|
| Hot wallet leaked | Cold rotates it with `UpdateGlobalHotAuthority`; the old key loses access everywhere |
| One cold member leaked | Rotate the member in Squads; one key cannot act |
| Wrong settlement price published | Cold corrects it with `CorrectOraclePrice` before the affected markets are finalized |
| Malicious action queued | Guardian or cold cancels it with `CancelPendingAction` before `execute_at` |
| Active attack | Guardian or cold engages the pause; exits stay open |
| Guardian leaked | Cold rotates or clears it with `SetGuardian` |

## Limitations

- One global timelock delay; there are no per-action delays.
- The program stores neither the Squads vault address nor its threshold; they live in Squads' own state.
- `CorrectOraclePrice` is not behind the on-chain timelock. Program upgrades are gated by the upgrade vault's own Squads delay, not by it.
