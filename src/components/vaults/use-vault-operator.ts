import { useCallback, useEffect, useState } from "react";
import { flows } from "@acta-markets/ts-sdk/chain";
import type { Instruction } from "@solana/kit";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { fetchVaultDepositRequests, fetchVaultWithdrawRequests } from "@/lib/vaults/api";
import {
  buildCapitalStepTransactions,
  createVaultManager,
  fetchVaultOperatorRole,
  type VaultManager,
  type VaultOperatorRole,
} from "@/lib/vaults/operator";
import { sendWalletTransactions } from "@/lib/vaults/transaction";
import type { Vault, VaultDepositRequestsPage, VaultWithdrawRequestsPage } from "@/lib/vaults/types";
import { usePolled, type Loadable } from "./use-vaults";

export const DEFAULT_WINDOW_POLICY: flows.WindowPolicy = {
  reopen: true,
  depositWindowMs: 10 * 60_000,
  tradingWindowMs: 10 * 60_000,
};

export type UseVaultOperator = {
  manager: VaultManager | null;
  role: VaultOperatorRole | null;
  nextStep: flows.CapitalStep | null;
  depositRequests: Loadable<VaultDepositRequestsPage | null>;
  withdrawRequests: Loadable<VaultWithdrawRequestsPage | null>;
  /** Builds and sends a capital step; returns one signature per transaction. */
  runStep: (step: flows.CapitalStep) => Promise<string[]>;
  /** Sends planner instructions (governance, delegate rotation) in one transaction. */
  send: (instructions: Instruction[]) => Promise<string>;
  pending: boolean;
  error: Error | null;
};

export function useVaultOperator(
  vault: Vault | null,
  onChanged: () => void,
  policy: flows.WindowPolicy = DEFAULT_WINDOW_POLICY,
): UseVaultOperator {
  const { rpc, selectedAccount, signAllTransactions } = useSolana();
  const owner = selectedAccount?.address ?? null;
  const [manager, setManager] = useState<VaultManager | null>(null);
  const [role, setRole] = useState<VaultOperatorRole | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);

  const vaultKey = vault ? `${vault.vault_pda}:${vault.governance}:${vault.primary_delegate}` : null;
  useEffect(() => {
    setManager(null);
    setRole(null);
    setError(null);
    if (!vault || !owner) return;
    let cancelled = false;
    (async () => {
      const next = await createVaultManager(vault, owner);
      const nextRole = await fetchVaultOperatorRole(rpc, next, vault, Math.floor(Date.now() / 1000));
      if (cancelled) return;
      setManager(next);
      setRole(nextRole);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey, owner, rpc]);

  const operatorKey = role && vault ? vault.vault_pda : null;
  const depositRequests = usePolled(
    (signal) => (vault ? fetchVaultDepositRequests(vault.vault_pda, { limit: 100 }, signal) : Promise.resolve(null)),
    null,
    operatorKey && `deposits:${operatorKey}`,
  );
  const withdrawRequests = usePolled(
    (signal) => (vault ? fetchVaultWithdrawRequests(vault.vault_pda, { limit: 100 }, signal) : Promise.resolve(null)),
    null,
    operatorKey && `withdrawals:${operatorKey}`,
  );

  const clock =
    vault?.deposit_window_set_ts != null
      ? flows.windowClock(vault.accepting_deposits, Number(vault.deposit_window_set_ts) * 1000, Date.now())
      : { openForMs: null, closedForMs: null };
  const nextStep = vault && role ? flows.nextCapitalStep(vault, clock, policy) : null;

  const refreshDeposits = depositRequests.refresh;
  const refreshWithdrawals = withdrawRequests.refresh;
  const sendAll = useCallback(
    async (transactions: Instruction[][]) => {
      if (!owner) throw new Error("No wallet connected");
      setPending(true);
      try {
        return await sendWalletTransactions({
          rpc,
          feePayer: owner,
          transactions,
          signAllTransactions,
        });
      } finally {
        setPending(false);
        onChanged();
        refreshDeposits();
        refreshWithdrawals();
      }
    },
    [owner, rpc, signAllTransactions, onChanged, refreshDeposits, refreshWithdrawals],
  );

  const runStep = useCallback(
    async (step: flows.CapitalStep) => {
      if (!manager || !vault) throw new Error("Vault operator is not ready");
      return sendAll(await buildCapitalStepTransactions(step, { rpc, manager, vault }));
    },
    [manager, vault, rpc, sendAll],
  );

  const send = useCallback(
    async (instructions: Instruction[]) => (await sendAll([instructions]))[0],
    [sendAll],
  );

  return { manager, role, nextStep, depositRequests, withdrawRequests, runStep, send, pending, error };
}
