# Lifecycle and safety modes

A vault has a phase, a safety mode and a deposit-window flag. The phase tracks the trading and capital cycle. The safety mode blocks operations: `frozen` stops new risk, `closing` stops standard activity, and so on. The deposit window opens and closes intake.

## Normal cycle

| Phase | Transition | Conditions |
| --- | --- | --- |
| `idle` | Open the first position → `active` | Idle capital is unpriced, intake is closed, and the delegate holds trading permission under the policy. The position sets the active expiry. |
| `active` | Reach expiry → `settling` | New risk closes at the expiry cutoff. The contract reads chain time. |
| `active` / `settling` | Close the last position → `processing_capital` | All positions are closed and funding is settled. Capital starts uncomputed. |
| `processing_capital` | Compute equity | Requires fresh price accounts. The boundary becomes computed. |
| `processing_capital` | Finalize the cycle → `idle` | Equity is computed and the deposit and withdrawal queues are empty. Idle capital becomes unpriced again. |

`idle` capital is unpriced, accepting deposits, or priced. When the manager closes the deposit window, it can start trading from unpriced idle capital. Priced idle capital lets the manager process requests but not open a position.

## Request processing

Deposits enter during `idle` intake or during `active` before expiry. Withdrawals enter in `idle` or in `active` before expiry. `closing` has its own withdrawal path.

The manager normally prices capital and drains the queues. If it does not, anyone can process requests after `capital_fallback_delay_secs` (default 43,200 seconds, maximum 259,200 seconds):

- In `idle`, a request becomes publicly processable at `created_at + delay`, once capital is priced. Under `withdraw_only`, idle requests are processable immediately.
- In `processing_capital`, public processing opens at `active_expiry + delay`.
- A public processor can price unpriced idle capital only to process an aged withdrawal. A queue holding only deposits cannot force an idle equity checkpoint.

Public processing requires settled positions, validated prices and valid recipient accounts.

Deposit and withdrawal cancellation closes once idle capital is priced and at the active expiry cutoff. Deposit refunds under `emergency_unwind` and `withdraw_only` have their own instructions. In `closing`, withdrawals can be requested and cancelled at any phase and time.

## Safety modes

| Mode | Behavior |
| --- | --- |
| `normal` | Trading and capital operations run under the phase rules. |
| `frozen` | No new positions. Settlement and capital processing continue. |
| `emergency_unwind` | Regular capital processing stops. Deposits can be refunded and open positions and funding are unwound. |
| `withdraw_only` | Holders withdraw after the unwind completes. No new positions. |
| `closing` | Standard activity stops. The vault converts assets, computes equity and finalizes, then moves to withdrawal-only operation. |

`FreezeVault` accepts the protocol cold authority or the guardian. `UnfreezeVault` and `EmergencyStartUnwind` require the cold authority. Vault governance runs `StartVaultShutdown` and `FinalizeVaultShutdown`.

See [Shares, equity and fees](vault-accounting.md) for valuation and final redemption.
