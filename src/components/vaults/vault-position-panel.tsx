import { AppButton } from "@/components/app-ui/app-button";
import type { VaultDepositorState } from "@/lib/vaults/depositor";
import { formatCountdown, formatDate, formatTokenAmount } from "@/lib/vaults/format";
import { sharesToMain } from "@/lib/vaults/math";
import {
  cancelBlockMessage,
  depositSelfProcessView,
  withdrawSelfProcessView,
  type SelfProcessView,
} from "@/lib/vaults/presentation";
import { cancelDepositBlock, cancelWithdrawBlock, refundDepositBlock, type VaultActionBlock } from "@/lib/vaults/rules";
import type { Vault } from "@/lib/vaults/types";

export type PositionAction = "cancel_deposit" | "cancel_withdraw" | "refund_deposit" | "process_deposit" | "process_withdraw";

const SMALL_BUTTON = "h-8 pl-3 pr-3 py-1.5 text-sm";

function RequestRow({
  divider,
  title,
  createdAt,
  cancelBlock,
  onCancel,
  extra,
  selfProcess,
  onSelfProcess,
  nowSecs,
  disabled,
}: {
  /** a rule above the row, when something sits above it */
  divider: boolean;
  title: string;
  createdAt: bigint;
  cancelBlock: VaultActionBlock | null;
  onCancel: () => void;
  extra?: { label: string; onClick: () => void } | null;
  selfProcess: SelfProcessView;
  onSelfProcess: () => void;
  nowSecs: number;
  disabled: boolean;
}) {
  const buttons = [
    cancelBlock === null ? { label: "Cancel", onClick: onCancel } : null,
    extra ?? null,
    selfProcess.kind === "available" ? { label: selfProcess.label, onClick: onSelfProcess } : null,
  ].filter((b): b is { label: string; onClick: () => void } => b !== null);

  return (
    <div className={divider ? "mt-3 border-t border-bg-border pt-3" : "mt-2"}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-medium leading-[1.3] text-content-primary">{title}</div>
          <div className="mt-1 font-mono text-xs leading-[1.3] text-content-secondary">
            Requested {formatDate(Number(createdAt), { time: true })}
          </div>
        </div>
        {buttons.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {buttons.map((b) => (
              <AppButton key={b.label} variant="secondary" className={SMALL_BUTTON} disabled={disabled} onClick={b.onClick}>
                {b.label}
              </AppButton>
            ))}
          </div>
        ) : null}
      </div>
      {cancelBlock !== null && buttons.length === 0 ? (
        <p className="mt-2 font-mono text-xs leading-[1.4] text-content-secondary">{cancelBlockMessage(cancelBlock)}</p>
      ) : null}
      {selfProcess.kind === "waiting" ? (
        <p className="mt-2 font-mono text-xs leading-[1.4] text-content-secondary">
          If the manager has not processed it, you can process it yourself in{" "}
          {formatCountdown(selfProcess.availableAt, nowSecs)}.
        </p>
      ) : null}
    </div>
  );
}

/** The wallet's stake in one vault: shares at the last price plus any open requests. */
export function VaultPositionPanel({
  vault,
  symbol,
  state,
  error,
  nowSecs,
  actionsEnabled,
  busy,
  onAction,
  onRetry,
}: {
  vault: Vault;
  symbol: string;
  state: VaultDepositorState | null;
  error: Error | null;
  nowSecs: number;
  actionsEnabled: boolean;
  busy: boolean;
  onAction: (action: PositionAction) => void;
  onRetry: () => void;
}) {
  const decimals = vault.main_decimals;
  const disabled = !actionsEnabled || busy;

  let body: React.ReactNode;
  if (state) {
    const empty = state.shareBalance === 0n && !state.depositRequest && !state.withdrawRequest;
    const value = sharesToMain(state.shareBalance, BigInt(vault.share_price));
    body = empty ? (
      <p className="mt-2 font-mono text-sm text-content-primary">No position yet</p>
    ) : (
      <>
        {state.shareBalance > 0n ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">
                {formatTokenAmount(value, decimals)} {symbol}
              </span>
              <span className="font-mono text-sm tabular-nums text-content-secondary">
                {formatTokenAmount(state.shareBalance, decimals)} shares
              </span>
            </div>
            <p className="mt-1 font-mono text-xs leading-[1.4] text-content-secondary">
              At the last share price. A withdrawal pays the price set when it is processed.
            </p>
          </>
        ) : null}
        {state.depositRequest ? (
          <RequestRow
            divider={state.shareBalance > 0n}
            title={`Pending deposit: ${formatTokenAmount(state.depositRequest.amount, decimals)} ${symbol}`}
            createdAt={state.depositRequest.createdAt}
            cancelBlock={cancelDepositBlock(vault, nowSecs)}
            onCancel={() => onAction("cancel_deposit")}
            extra={refundDepositBlock(vault) === null ? { label: "Refund", onClick: () => onAction("refund_deposit") } : null}
            selfProcess={depositSelfProcessView(vault, state.depositRequest.createdAt, nowSecs)}
            onSelfProcess={() => onAction("process_deposit")}
            nowSecs={nowSecs}
            disabled={disabled}
          />
        ) : null}
        {state.withdrawRequest ? (
          <RequestRow
            divider={state.shareBalance > 0n || state.depositRequest !== null}
            title={`Pending withdrawal: ${formatTokenAmount(state.withdrawRequest.shares, decimals)} shares`}
            createdAt={state.withdrawRequest.createdAt}
            cancelBlock={cancelWithdrawBlock(vault, nowSecs)}
            onCancel={() => onAction("cancel_withdraw")}
            selfProcess={withdrawSelfProcessView(vault, state.withdrawRequest.createdAt, nowSecs)}
            onSelfProcess={() => onAction("process_withdraw")}
            nowSecs={nowSecs}
            disabled={disabled}
          />
        ) : null}
      </>
    );
  } else if (error) {
    body = (
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-mono text-sm text-content-primary">Couldn&apos;t load your position.</p>
        <AppButton variant="secondary" className={SMALL_BUTTON} onClick={onRetry}>
          Retry
        </AppButton>
      </div>
    );
  } else {
    body = (
      <div className="mt-2 flex flex-col gap-2" aria-hidden="true">
        <div className="h-7 w-40 animate-pulse rounded bg-action-primary" />
        <div className="h-4 w-24 animate-pulse rounded bg-action-primary" />
      </div>
    );
  }

  return (
    <section aria-label="Your position" className="border border-bg-border bg-[rgba(40,40,40,0.24)] p-4">
      <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Your position</div>
      {body}
    </section>
  );
}
