import { useCallback, useEffect, useRef, useState } from "react";
import { flows } from "@acta-markets/ts-sdk/chain";
import { withdrawSelfProcessView } from "@/lib/vaults/presentation";
import type { Instruction } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";
import { useSolana } from "@/components/solana/solana-wallet-provider";
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
import { usePolled, type Loadable } from "./use-vaults";

// Kept apart from use-vaults.ts so read-only pages do not bundle the transaction stack.

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
  const binding = useRef({ owner, rpc, vaultKey });
  binding.current = { owner, rpc, vaultKey };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
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
          assertBinding: () => {
            const current = binding.current;
            if (!mounted.current || current.owner !== owner || current.rpc !== rpc || current.vaultKey !== vaultKey) {
              throw new Error("Wallet or vault connection changed. Please try again.");
            }
          },
          feePayer: owner,
          instructions,
          signTransaction: (tx: VersionedTransaction) => signTransaction(tx),
        });
      } finally {
        setPending(false);
        refresh();
      }
    },
    [owner, rpc, vaultKey, signTransaction, refresh],
  );

  const current = state.data;
  const unwrap = native && current !== null && current.mainTokenBalance === 0n;
  const actions: VaultDepositorActions | null = depositor && vault && owner && depositor.user.address === owner && depositor.vault === vault.vault_pda
    ? {
        requestDeposit: async (amount) => {
          const wrapped = current?.mainTokenBalance ?? 0n;
          const wrapLamports = native && amount > wrapped ? amount - wrapped : 0n;
          return send(await buildRequestDepositInstructions(depositor, amount, wrapLamports));
        },
        cancelDeposit: () => send(buildCancelDepositInstructions(depositor, unwrap)),
        emergencyRefund: () => send(buildEmergencyRefundInstructions(depositor, unwrap)),
        requestWithdraw: (shares) => {
          if (flows.requestWithdrawBlock(vault, Math.floor(Date.now() / 1000))) throw new Error("Withdrawals are not available right now");
          return send(buildRequestWithdrawInstructions(depositor, shares));
        },
        cancelWithdraw: () => send(buildCancelWithdrawInstructions(depositor)),
        processOwnDeposit: async () =>
          send(await buildSelfProcessDepositInstructions(await createVaultManager(vault, owner), unwrap)),
        processOwnWithdraw: async () => {
          const request = current?.withdrawRequest;
          if (!request || withdrawSelfProcessView(vault, request.createdAt, Math.floor(Date.now() / 1000)).kind !== "available") {
            throw new Error("Withdrawal processing is not available yet");
          }
          return send(await buildSelfProcessWithdrawInstructions(rpc, await createVaultManager(vault, owner), vault));
        },
      }
    : null;

  return { ...state, error: depositorError ?? state.error, actions, pending };
}
