# Governance and Security Model

Acta separates cold governance from hot operations. The cold authority controls protocol configuration and the timelock. The hot wallet runs routine market and oracle operations. The guardian can cancel queued actions and pause.

## Roles

### Cold authority (`ACTA_ADMIN`)

The cold authority is the hardcoded public key `CLSYf1AL9rXYjGbSjvexMRegriqpLR37kmLkcqvAgBnN`. Squads v4 supplies the vault PDA's signature after its configured approvals. Acta verifies the `ACTA_ADMIN` signature. Membership, approval thresholds and Squads execution delays are enforced by Squads.

Cold authority operations:
- initialize the global config
- initialize, update, and close premium configs through the timelock
- register makers through the timelock
- create and update oracle sources through the timelock
- raise or keep the global timelock delay immediately
- lower the global timelock delay only through the timelock
- rotate the hot wallet immediately
- set, rotate, or clear the guardian immediately
- set, rotate, or revoke the settlement attestor through the timelock
- toggle pause immediately
- queue pending actions
- cancel pending actions

The cold authority is separate from the program upgrade authority.

### Hot wallet (`GlobalConfig.hot_authority`)

The online key used by backend services. The cold authority can rotate it without a redeploy.

Hot wallet operations:
- create, finalize, and close markets
- create and close concrete oracle accounts from already-approved oracle sources
- publish post-expiry settlement prices through `UpdateOraclePrice`, or through `UpdateOraclePriceAttested` when an attestor is configured
- co-sign `OpenPosition`
- withdraw collected protocol fees

The hot wallet cannot modify cold configuration, rotate itself, bypass maker quote signatures, or bypass taker transaction signatures.

### Guardian (`GlobalConfig.guardian`)

Optional emergency key, unset by default (the default public key authorizes no one). The cold authority sets, rotates, or clears it with `SetGuardian`.

Guardian operations:
- cancel any queued pending action before execution
- engage the emergency pause (unpause is cold-only)

The guardian cannot queue actions, change configuration, rotate keys or unpause.

### Permissionless exits

Settlement and liquidation are permissionless. Any signer may settle an expired position or liquidate an ITM unfunded position. Pause does not block exits.

## Authority Matrix

| Action | Authority | Timing |
|--------|-----------|--------|
| Program upgrade | Separate program-upgrade authority | Its configured Squads approvals and delay |
| Initialize global config | Cold | Immediate |
| Rotate hot wallet | Cold | Immediate |
| Set / rotate / clear guardian (`SetGuardian`, op 27) | Cold | Immediate |
| Engage emergency pause (`SetPause`, op 28) | Cold or guardian | Immediate |
| Release emergency pause / unpause (`SetPause`, op 28) | Cold | Immediate |
| Queue pending action (`QueuePendingAction`, op 23) | Cold | Immediate queue |
| Execute pending action (`ExecutePendingAction`, op 25) | Any signer | After the cold-approved action's delay |
| Cancel pending action (`CancelPendingAction`, op 24) | Cold or guardian | Before execute |
| Raise / keep timelock delay (`UpdateActionTimelock`, op 26) | Cold | Immediate |
| Lower timelock delay (`UpdateActionTimelock`, op 26) | Cold | Timelocked by current delay |
| Initialize / update / close premium config | Cold | Timelocked |
| Register maker | Cold | Timelocked |
| Create / update oracle source | Cold | Timelocked |
| Create / finalize / close market | Hot wallet | Immediate |
| Create / close concrete oracle | Hot wallet | Immediate |
| Publish settlement price (`UpdateOraclePrice`, op 16) | Hot wallet (only while no attestor is set) or cold | Immediate after expiry |
| Publish attested settlement price (`UpdateOraclePriceAttested`, op 31) | Hot wallet + attestor Ed25519 proof (2-of-2) | After expiry, attestor set |
| Set / rotate settlement attestor (`SetSettlementAttestor`, op 29) | Cold | Timelocked |
| Revoke settlement attestor (`RevokeSettlementAttestor`, op 30) | Cold | Timelocked |
| Withdraw protocol fees | Hot wallet | Immediate |
| Open position | Hot wallet + taker tx signer + maker Ed25519 quote | Immediate |
| Settle position | Permissionless | After market finalization |
| Liquidate position | Permissionless | ITM + unfunded |

## Timelock

Acta uses one global delay for timelocked actions: `GlobalConfig.timelock_secs`, from `0` to 604,800 seconds (7 days). Its initial value is `0`. At `0`, a queued action can execute immediately. It still needs cold authorization and must match its commitment.

The timelock uses a generic store-and-replay model. Queue stores a commitment to the exact wrapped instruction. Execute replays the same wrapped instruction after `execute_at`.

Cold authorizes the action when queueing it. Once its delay has elapsed, any signer can execute that exact action. The executor pays transaction costs and funds accounts created during execution. Closing the pending-action account returns its rent to the original proposer.

Supported premium mints are configured through premium config PDAs. `InitializeConfig` creates a premium config, `UpdateConfig` updates it, and `CloseConfig` closes that premium config.

Timelockable wrapped opcodes:

| Opcode | Instruction |
|--------|-------------|
| 0 | `InitializeConfig` |
| 1 | `UpdateConfig` |
| 2 | `RegisterMaker` |
| 17 | `CreateOracleSource` |
| 18 | `UpdateOracleSource` |
| 20 | `CloseConfig` |
| 29 | `SetSettlementAttestor` |
| 30 | `RevokeSettlementAttestor` |
| 26 | `UpdateActionTimelock` |

In production, direct calls to these operations fail with `DirectCallDisabled`. They go through queue -> execute. The exception is `UpdateActionTimelock` raising or keeping the delay, which is immediate. Lowering it is queued under the current delay.

### Wire Shape

`QueuePendingAction` data is `[23, wrapped_opcode, ...wrapped_args]` and accounts are `[admin, pending_action_pda, system_program, global_config_pda, ...wrapped_accounts]`.

`ExecutePendingAction` data is `[25, wrapped_opcode, ...wrapped_args]` and accounts are `[executor, pending_action_pda, proposed_by, ...wrapped_accounts]`.

The commitment binds:

```
sha256(
  "acta:pend.v2"
  || wrapped_opcode
  || ordered wrapped account keys
  || full wrapped instruction data
)
```

`QueuePendingAction` and `ExecutePendingAction` Codama builders expose only the wrapped `opcode`. Generic timelock payloads require SDK flow helpers or the full wire layout above.

## Emergency Pause

`SetPause` sets the `PAUSED` bit in `GlobalConfig.flags`. Cold authority or guardian can pause immediately. Only cold authority can unpause.

While paused, `OpenPosition` fails with `ProtocolPaused`. Settlement, liquidation, and other exit paths remain available.

## Settlement Attestation

`GlobalConfig.settlement_attestor` names an optional Ed25519 second signer for hot settlement publication. When unset, the hot wallet uses `UpdateOraclePrice`.

When configured through `SetSettlementAttestor`, the hot wallet uses `UpdateOraclePriceAttested`. An Ed25519 verification instruction for the attestor's domain-separated signature immediately precedes the update in the same transaction. Direct hot publication returns `SettlementAttestationRequired` (1090).

The cold authority retains direct publication because Squads CPI cannot produce the required Ed25519 precompile instruction. `RevokeSettlementAttestor` clears the key and restores direct hot publication. The 32-byte replay domain is retained.

## Squads Integration

Squads handles approvals and member rotation and stores the approval threshold and its own delay in the multisig account. Acta checks only the cold vault signature. The Acta timelock is separate and applies to queued protocol actions.

## Program Upgrade

Program upgrades use a separate Squads vault and its configured approvals and execution delay. The program's upgrade authority authorizes deployment of the program buffer. `GlobalConfig.timelock_secs` applies to Acta's queued instructions, not to program upgrades.
