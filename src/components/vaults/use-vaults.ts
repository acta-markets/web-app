import { useCallback, useEffect, useRef, useState } from "react";
import type { Instruction } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { fetchVault, fetchVaults } from "@/lib/vaults/api";
import {
  buildCancelDepositInstructions,
  buildCancelWithdrawInstructions,
  buildEmergencyRefundInstructions,
  buildRequestDepositInstructions,
  buildRequestWithdrawInstructions,
  buildSelfProcessDepositInstructions,
  buildSelfProcessWithdrawInstructions,
  createVaultDepositor,
  fetchVaultDepositorState,
  isNativeVault,
  type VaultDepositor,
  type VaultDepositorState,
} from "@/lib/vaults/depositor";
import { createVaultManager } from "@/lib/vaults/operator";
import { sendWalletTransaction } from "@/lib/vaults/transaction";
import type { Vault } from "@/lib/vaults/types";

const VAULT_REFRESH_MS = 30_000;

export type Loadable<T> = {
  data: T;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
};

export function usePolled<T>(load: (signal: AbortSignal) => Promise<T>, initial: T, key: string | null): Loadable<T> {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const loadedKey = useRef(key);

  useEffect(() => {
    if (loadedKey.current !== key) {
      loadedKey.current = key;
      setData(initial);
      setError(null);
    }
    if (key === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const run = async () => {
      clearTimeout(timer);
      timer = undefined;
      inFlight = true;
      try {
        const next = await loadRef.current(controller.signal);
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (document.visibilityState === "visible") timer = setTimeout(run, VAULT_REFRESH_MS);
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !inFlight && timer === undefined) void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    setLoading(true);
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}

export function useVaults(): Loadable<Vault[]> {
  return usePolled(fetchVaults, [], "vaults");
}

export function useVault(pda: string | null): Loadable<Vault | null> {
  return usePolled((signal) => (pda ? fetchVault(pda, signal) : Promise.resolve(null)), null, pda);
}

export type VaultDepositorActions = {
  requestDeposit: (amount: bigint) => Promise<string>;
  cancelDeposit: () => Promise<string>;
  emergencyRefund: () => Promise<string>;
  requestWithdraw: (shares: bigint) => Promise<string>;
  cancelWithdraw: () => Promise<string>;
  processOwnDeposit: () => Promise<string>;
  processOwnWithdraw: () => Promise<string>;
};

export type UseVaultDepositor = Loadable<VaultDepositorState | null> & {
  actions: VaultDepositorActions | null;
  pending: boolean;
};

export function useVaultDepositor(vault: Vault | null): UseVaultDepositor {
  const { rpc, selectedAccount, signTransaction } = useSolana();
  const owner = selectedAccount?.address ?? null;
  const [depositor, setDepositor] = useState<VaultDepositor | null>(null);
  const [depositorError, setDepositorError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);

  const vaultKey = vault ? `${vault.vault_pda}:${vault.share_mint}` : null;
  useEffect(() => {
    setDepositor(null);
    setDepositorError(null);
    if (!vault || !owner) return;
    let cancelled = false;
    createVaultDepositor(vault, owner).then(
      (next) => {
        if (!cancelled) setDepositor(next);
      },
      (err: unknown) => {
        if (!cancelled) setDepositorError(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey, owner]);

  const native = vault ? isNativeVault(vault) : false;
  const state = usePolled(
    () => (depositor ? fetchVaultDepositorState(rpc, depositor, native) : Promise.resolve(null)),
    null,
    depositor && owner ? `${vaultKey}:${owner}` : null,
  );
  const { refresh } = state;

  const send = useCallback(
    async (instructions: Instruction[]) => {
      if (!owner) throw new Error("No wallet connected");
      setPending(true);
      try {
        return await sendWalletTransaction({
          rpc,
          feePayer: owner,
          instructions,
          signTransaction: (tx: VersionedTransaction) => signTransaction(tx),
        });
      } finally {
        setPending(false);
        refresh();
      }
    },
    [owner, rpc, signTransaction, refresh],
  );

  const current = state.data;
  const unwrap = native && current !== null && current.mainTokenBalance === 0n;
  const actions: VaultDepositorActions | null = depositor && vault && owner
    ? {
        requestDeposit: async (amount) => {
          const wrapped = current?.mainTokenBalance ?? 0n;
          const wrapLamports = native && amount > wrapped ? amount - wrapped : 0n;
          return send(await buildRequestDepositInstructions(depositor, amount, wrapLamports));
        },
        cancelDeposit: () => send(buildCancelDepositInstructions(depositor, unwrap)),
        emergencyRefund: () => send(buildEmergencyRefundInstructions(depositor, unwrap)),
        requestWithdraw: (shares) => send(buildRequestWithdrawInstructions(depositor, shares)),
        cancelWithdraw: () => send(buildCancelWithdrawInstructions(depositor)),
        processOwnDeposit: async () =>
          send(await buildSelfProcessDepositInstructions(await createVaultManager(vault, owner), unwrap)),
        processOwnWithdraw: async () =>
          send(await buildSelfProcessWithdrawInstructions(rpc, await createVaultManager(vault, owner), vault)),
      }
    : null;

  return { ...state, error: depositorError ?? state.error, actions, pending };
}
