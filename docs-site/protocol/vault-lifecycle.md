# Lifecycle and safety modes

Vault phase records the trading and capital cycle. Safety mode controls which operations are permitted within that phase. The deposit window is a separate flag.

## Normal cycle

| Phase | Transition | Conditions |
| --- | --- | --- |
| `idle` | Open the first position → `active` | Unpriced idle capital, intake closed, valid trading permission and policy. The position sets the active expiry. |
| `active` | Reach expiry → `settling` | New risk is closed at the expiry cutoff. Contract operations advance the state using chain time. |
| `active` / `settling` | Close the last position → `processing_capital` | Position and funding obligations must be resolved. Capital begins uncomputed. |
| `processing_capital` | Compute equity | Fresh price accounts and eligible custody/accounting state. The boundary becomes computed. |
| `processing_capital` | Finalize the cycle → `idle` | Equity computed and deposit/withdrawal queues drained. The vault returns to unpriced idle capital. |

`idle` has unpriced, accepting-deposits and priced states. Closing the intake window allows the manager to start trading from unpriced idle capital. A priced idle boundary supports eligible request processing; it does not permit opening a new position.

## Request processing

Deposits enter through normal `idle` intake or `active` before expiry. Withdrawals normally enter in `idle` or `active` before expiry, subject to pricing and safety restrictions. Closing mode has a separate withdrawal path.

The manager usually prices capital and drains the queues. Public fallback uses the configured `capital_fallback_delay_secs`, default 43,200 seconds and maximum 259,200 seconds:

- In `idle`, each request becomes publicly processable at its `created_at + delay`, subject to pricing. `withdraw_only` permits its eligible idle processing immediately.
- In `processing_capital`, public processing becomes eligible at `active_expiry + delay`.
- Public pricing of unpriced idle capital requires an eligible aged withdrawal. A deposit-only queue cannot force an idle equity checkpoint.

Fallback requires settled positions, validated prices and valid recipient accounts.

Normal deposit and withdrawal cancellation closes at `idle` priced capital and at the active expiry cutoff. Emergency and withdrawal-only deposit refunds use their own paths. In `closing`, withdrawals may be requested and cancelled regardless of the ordinary phase/time cutoff.

## Safety modes

| Mode | Behavior |
| --- | --- |
| `normal` | New trading risk and normal capital operations may proceed if their other guards pass. |
| `frozen` | Stops new risk. Constrained settlement and capital work can continue. |
| `emergency_unwind` | Stops regular capital processing, permits eligible deposit refunds and unwinds outstanding obligations. |
| `withdraw_only` | Supports the terminal withdrawal path once unwind conditions are met. New risk is disabled. |
| `closing` | Stops standard activity and follows the conversion, equity and finalization path into withdrawal-only operation. |

`FreezeVault` accepts protocol cold authority or guardian. `UnfreezeVault` and `EmergencyStartUnwind` require cold authority. Vault governance runs `StartVaultShutdown` and `FinalizeVaultShutdown`.

See [Shares, equity and fees](vault-accounting.md) for valuation and final redemption.
