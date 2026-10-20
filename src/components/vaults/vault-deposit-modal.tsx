"use client";

import { flows } from "@acta-markets/ts-sdk/chain";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AppAmountInput } from "@/components/app-ui/app-amount-input";
import { AppButton } from "@/components/app-ui/app-button";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppTabs } from "@/components/app-ui/app-tabs";
import { useToast } from "@/components/app-ui/toast";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { useWalletSidebar } from "@/components/wallet/wallet-sidebar";
import { isNativeVault, type VaultDepositorState } from "@/lib/vaults/depositor";
import { formatSharePrice, formatTokenAmount, solscanUrl } from "@/lib/vaults/format";
import { formatUnits, mainToShares, parseUnits, sharesToMain } from "@/lib/vaults/math";
import {
  LAST_SHARES_COPY,
  REQUEST_EXISTS_COPY,
  depositBlockMessage,
  isLastSharesWithdrawal,
  vaultApr,
  vaultStatus,
  withdrawBlockMessage,
  type VaultModalTab,
} from "@/lib/vaults/presentation";
import type { ResolvedVaultMeta } from "@/lib/vaults/registry";
import { SAMPLE_WALLET, VAULTS_SAMPLE_MODE, peekSampleData } from "@/lib/vaults/sample";
import { describeVaultTxError } from "@/lib/vaults/tx-errors";
import type { Vault } from "@/lib/vaults/types";
import { useVaultDepositor, type VaultDepositorActions } from "./use-vault-depositor";
import { useNowSecs } from "./use-vaults";
import { AprLabel } from "./vault-apr";
import { VaultAssetLogo } from "./vault-asset-logo";
import { VaultPositionPanel, type PositionAction } from "./vault-position-panel";
import { VaultStatusLabel } from "./vault-status-label";

type VaultTxAction = "deposit" | "withdraw" | PositionAction;

type TxState =
  | { kind: "idle" }
  | { kind: "pending"; action: VaultTxAction }
  | { kind: "success"; action: VaultTxAction; signature: string }
  | { kind: "failed"; action: VaultTxAction; tone: "info" | "error"; message: string; signature?: string };

type Cta = { label: string; disabled?: boolean; onClick?: () => void; notice?: string };

/** Native SOL left in the wallet on MAX, for the network fee and the rent of new accounts. */
export const NATIVE_FEE_RESERVE = 10_000_000n;

const TABS = [
  { value: "deposit", label: "Deposit" },
  { value: "withdraw", label: "Withdraw" },
] as const;

function successCopy(action: VaultTxAction, vault: Vault): string {
  switch (action) {
    case "deposit":
      return "Deposit requested";
    case "withdraw":
      return "Withdrawal requested";
    case "cancel_deposit":
      return "Deposit request cancelled";
    case "cancel_withdraw":
      return "Withdrawal request cancelled";
    case "refund_deposit":
      return "Deposit refunded";
    case "process_deposit":
      return vault.safety === "normal" ? "Deposit processed" : "Deposit refunded";
    case "process_withdraw":
      return "Withdrawal processed";
  }
}

function positionCall(actions: VaultDepositorActions, action: PositionAction): () => Promise<string> {
  switch (action) {
    case "cancel_deposit":
      return actions.cancelDeposit;
    case "cancel_withdraw":
      return actions.cancelWithdraw;
    case "refund_deposit":
      return actions.emergencyRefund;
    case "process_deposit":
      return actions.processOwnDeposit;
    case "process_withdraw":
      return actions.processOwnWithdraw;
  }
}

function maxOf(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Allocation management for one vault: the wallet's position and open requests,
 * plus deposit and withdraw requests. Mount it only while open; it polls the
 * wallet's on-chain state for as long as it is mounted.
 */
export function VaultDepositModal({
  vault,
  meta,
  initialTab = "deposit",
  onClose,
  onTransaction,
}: {
  vault: Vault;
  meta: ResolvedVaultMeta;
  initialTab?: VaultModalTab;
  onClose: () => void;
  onTransaction?: () => void;
}) {
  const { selectedAccount } = useSolana();
  const { openSidebar } = useWalletSidebar();
  const { referralStatus, openReferralGate } = useRfqContext();
  const { show } = useToast();
  const nowSecs = useNowSecs(5_000);

  // sample vaults have no accounts on chain: read fixtures and never build a transaction
  const live = useVaultDepositor(VAULTS_SAMPLE_MODE ? null : vault);
  const position: VaultDepositorState | null = VAULTS_SAMPLE_MODE
    ? peekSampleData()?.depositors[vault.vault_pda] ?? null
    : live.data;
  const actions = VAULTS_SAMPLE_MODE ? null : live.actions;

  const [tab, setTab] = useState<VaultModalTab>(initialTab);
  const [input, setInput] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });

  const walletAddress = selectedAccount?.address ?? null;
  const connected = VAULTS_SAMPLE_MODE || walletAddress !== null;
  const symbol = meta.assetSymbol;
  const decimals = vault.main_decimals;
  const sharePrice = BigInt(vault.share_price);
  const native = isNativeVault(vault);
  const apr = vaultApr(vault.performance, meta.stakingAprPct);
  const status = vaultStatus(vault, nowSecs);
  const pending = tx.kind === "pending";

  const capacity = vault.capacity.remaining === null ? null : BigInt(vault.capacity.remaining);
  // native vaults wrap SOL on deposit, so plain SOL counts, less what fees and rent need
  const walletAvailable = useMemo(() => {
    if (!position) return 0n;
    return native
      ? maxOf(0n, (position.nativeLamports ?? 0n) + position.mainTokenBalance - NATIVE_FEE_RESERVE)
      : position.mainTokenBalance;
  }, [position, native]);
  const depositMax = capacity === null || walletAvailable < capacity ? walletAvailable : capacity;

  const amount = input === "" ? null : parseUnits(input, decimals);
  const estimatedShares = amount !== null ? mainToShares(amount, sharePrice) : null;
  const estimatedPayout = amount !== null ? sharesToMain(amount, sharePrice) : null;

  const run = useCallback(
    async (action: VaultTxAction, exec: () => Promise<string>) => {
      setTx({ kind: "pending", action });
      try {
        const signature = await exec();
        setTx({ kind: "success", action, signature });
        show(successCopy(action, vault), "success");
        if (action === "deposit" || action === "withdraw") setInput("");
        onTransaction?.();
      } catch (err) {
        console.error("[vaults] transaction failed", err);
        const view = describeVaultTxError(err);
        setTx({ kind: "failed", action, ...view });
        if (view.tone === "error") show(view.message, "error");
      }
    },
    [onTransaction, show, vault],
  );

  const changeInput = (next: string) => {
    setInput(next);
    if (tx.kind === "failed") setTx({ kind: "idle" });
  };

  const changeTab = (next: VaultModalTab) => {
    setTab(next);
    setInput("");
    if (tx.kind !== "pending") setTx({ kind: "idle" });
  };

  const fill = (value: bigint) => changeInput(value > 0n ? formatUnits(value, decimals) : "");

  // The vault's own state goes first: connecting a wallet or redeeming an invite
  // cannot open a vault that is closed to the request. Fixture vaults have no
  // wallet and no actions, so they run the same checks and stop at a disabled button.
  const depositCta = (): Cta => {
    const block = flows.requestDepositBlock(vault, nowSecs);
    if (block) return { label: "Request deposit", disabled: true, notice: depositBlockMessage(block, vault) };
    if (!VAULTS_SAMPLE_MODE) {
      if (!walletAddress) return { label: "Connect wallet", onClick: openSidebar };
      if (referralStatus === "required") return { label: "Redeem invite to deposit", onClick: openReferralGate };
    }
    if (pending) return { label: "Submitting…", disabled: true };
    if (!position) return { label: "Loading…", disabled: true };
    if (position.depositRequest) return { label: "Request deposit", disabled: true, notice: REQUEST_EXISTS_COPY.deposit };
    if (amount === null || amount === 0n) return { label: "Enter an amount", disabled: true };
    if (estimatedShares === 0n) return { label: "Amount is too small", disabled: true };
    if (amount > walletAvailable) return { label: `Not enough ${symbol}`, disabled: true };
    if (capacity !== null && amount > capacity) return { label: "Above remaining capacity", disabled: true };
    if (!actions) return { label: "Request deposit", disabled: true };
    return { label: "Request deposit", onClick: () => void run("deposit", () => actions.requestDeposit(amount)) };
  };

  const withdrawCta = (): Cta => {
    const block = flows.requestWithdrawBlock(vault, nowSecs);
    if (block) return { label: "Request withdrawal", disabled: true, notice: withdrawBlockMessage(block, vault) };
    if (!VAULTS_SAMPLE_MODE && !walletAddress) return { label: "Connect wallet", onClick: openSidebar };
    if (pending) return { label: "Submitting…", disabled: true };
    if (!position) return { label: "Loading…", disabled: true };
    if (position.withdrawRequest) return { label: "Request withdrawal", disabled: true, notice: REQUEST_EXISTS_COPY.withdraw };
    if (position.shareBalance === 0n) return { label: "No shares to withdraw", disabled: true };
    if (amount === null || amount === 0n) return { label: "Enter an amount", disabled: true };
    if (amount > position.shareBalance) return { label: "Not enough shares", disabled: true };
    if (isLastSharesWithdrawal(vault, amount)) return { label: "Request withdrawal", disabled: true, notice: LAST_SHARES_COPY };
    if (!actions) return { label: "Request withdrawal", disabled: true };
    return { label: "Request withdrawal", onClick: () => void run("withdraw", () => actions.requestWithdraw(amount)) };
  };

  const cta = tab === "deposit" ? depositCta() : withdrawCta();
  const requested = tx.kind === "success" && (tx.action === "deposit" || tx.action === "withdraw") ? tx : null;

  return (
    <AppModal
      open
      onClose={onClose}
      title={meta.name}
      showHowItWorks={false}
      dismissible={!pending}
      className="max-h-[calc(100dvh-2rem)] max-w-[480px] overflow-y-auto max-md:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <VaultAssetLogo symbol={symbol} size={32} />
          <div className="min-w-0">
            <AprLabel apr={apr} className="font-mono text-sm leading-[1.2] text-content-secondary" />
            <div
              className={`font-mono text-base font-medium leading-[1.3] tabular-nums ${apr.muted ? "text-content-secondary" : "text-content-primary"}`}
            >
              {apr.value}
            </div>
          </div>
        </div>
        <VaultStatusLabel status={status} showDetail={false} />
      </div>

      {connected ? (
        <VaultPositionPanel
          vault={vault}
          symbol={symbol}
          state={position}
          wallet={VAULTS_SAMPLE_MODE ? SAMPLE_WALLET : walletAddress}
          error={VAULTS_SAMPLE_MODE ? null : live.error}
          nowSecs={nowSecs}
          actionsEnabled={actions !== null}
          busy={pending}
          onAction={(action) => {
            if (actions) void run(action, positionCall(actions, action));
          }}
          onRetry={live.refresh}
        />
      ) : null}

      {requested ? (
        <div className="flex flex-col gap-4">
          <div className="border border-bg-border bg-[rgba(40,40,40,0.24)] p-4">
            <div className="font-mono text-base font-medium text-content-primary">{successCopy(requested.action, vault)}</div>
            <p className="mt-2 font-mono text-sm leading-[1.5] text-content-secondary">
              {requested.action === "deposit"
                ? "Pending until the cycle ends. It earns nothing until then and converts to shares at that cycle's price."
                : `Pending until the cycle ends, then paid out in ${symbol} at that cycle's price.`}
            </p>
            <a
              href={solscanUrl("tx", requested.signature)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-block font-mono text-sm text-accent-secondary hover:text-accent-primary"
            >
              View on Solscan ↗
            </a>
          </div>
          <AppButton className="w-full" onClick={onClose}>
            Done
          </AppButton>
        </div>
      ) : (
        <>
          <AppTabs value={tab} onChange={changeTab} options={TABS} ariaLabel="Allocation" />

          {tab === "deposit" ? (
            <AppAmountInput
              id="vault-deposit-amount"
              label="Deposit"
              hint={estimatedShares !== null && estimatedShares > 0n ? `≈ ${formatTokenAmount(estimatedShares, decimals)} shares` : null}
              symbol={symbol}
              logo={<VaultAssetLogo symbol={symbol} size={24} />}
              value={input}
              onChange={changeInput}
              maxDecimals={decimals}
              balance={
                position
                  ? `${formatTokenAmount(native ? (position.nativeLamports ?? 0n) + position.mainTokenBalance : position.mainTokenBalance, decimals)} ${symbol}`
                  : connected
                    ? "…"
                    : null
              }
              onHalf={position ? () => fill(depositMax / 2n) : undefined}
              onMax={position ? () => fill(depositMax) : undefined}
              disabled={pending}
              invalid={tx.kind === "failed" && tx.tone === "error" && tx.action === "deposit"}
            />
          ) : (
            <AppAmountInput
              id="vault-withdraw-amount"
              label="Withdraw shares"
              hint={estimatedPayout !== null && estimatedPayout > 0n ? `≈ ${formatTokenAmount(estimatedPayout, decimals)} ${symbol}` : null}
              symbol="Shares"
              logo={<VaultAssetLogo symbol={symbol} size={24} />}
              value={input}
              onChange={changeInput}
              maxDecimals={decimals}
              balance={position ? `${formatTokenAmount(position.shareBalance, decimals)} shares` : connected ? "…" : null}
              onHalf={position ? () => fill(position.shareBalance / 2n) : undefined}
              onMax={position ? () => fill(position.shareBalance) : undefined}
              disabled={pending}
              invalid={tx.kind === "failed" && tx.tone === "error" && tx.action === "withdraw"}
            />
          )}

          <dl className="space-y-1.5 font-mono text-sm leading-[1.3] tracking-[-0.28px]">
            <div className="flex justify-between gap-3">
              <dt className="text-content-secondary">Last share price</dt>
              <dd className="tabular-nums text-content-primary">
                {formatSharePrice(vault.share_price)} {symbol}
              </dd>
            </div>
            {tab === "deposit" && capacity !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-content-secondary">Capacity left</dt>
                <dd className="tabular-nums text-content-primary">
                  {formatTokenAmount(capacity, decimals)} {symbol}
                </dd>
              </div>
            ) : null}
            {tab === "deposit" && native ? (
              <div className="flex justify-between gap-3">
                <dt className="text-content-secondary">Kept for fees</dt>
                <dd className="tabular-nums text-content-primary">{formatTokenAmount(NATIVE_FEE_RESERVE, decimals)} SOL</dd>
              </div>
            ) : null}
            {tab === "withdraw" && native ? (
              <div className="flex justify-between gap-3">
                <dt className="text-content-secondary">Paid out as</dt>
                <dd className="text-content-primary">WSOL, the token form of SOL</dd>
              </div>
            ) : null}
          </dl>

          {cta.notice ? (
            <p className="border border-bg-border bg-[rgba(40,40,40,0.24)] p-3 font-mono text-sm leading-[1.45] text-content-primary">
              {cta.notice}
            </p>
          ) : null}

          {tx.kind === "failed" ? (
            <p
              role={tx.tone === "error" ? "alert" : "status"}
              className={`font-mono text-sm leading-[1.45] ${tx.tone === "error" ? "text-error" : "text-content-secondary"}`}
            >
              {tx.message}
              {tx.signature ? (
                <>
                  {" "}
                  <a
                    href={solscanUrl("tx", tx.signature)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent-secondary hover:text-accent-primary"
                  >
                    View on Solscan ↗
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          {tx.kind === "success" ? (
            <p role="status" className="font-mono text-sm leading-[1.45] text-accent-secondary">
              {successCopy(tx.action, vault)}.
            </p>
          ) : null}

          <p className="font-mono text-xs leading-[1.5] text-content-secondary">
            Requests complete at the end of the cycle, at the share price calculated then. The manager can make bad trades
            and you carry the losses.{" "}
            <Link href="/docs/guide/returns-and-risks" className="text-accent-secondary hover:text-accent-primary">
              Returns, fees and risks
            </Link>
          </p>

          {pending ? (
            <p className="font-mono text-xs leading-[1.4] text-content-secondary">Approve the request in your wallet.</p>
          ) : null}

          <AppButton size="lg" className="w-full" disabled={cta.disabled} onClick={cta.onClick}>
            {cta.label}
          </AppButton>
        </>
      )}
    </AppModal>
  );
}
