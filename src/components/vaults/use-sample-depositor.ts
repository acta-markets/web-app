import { useCallback, useState } from "react";
import type { VaultDepositorState } from "@/lib/vaults/depositor";
import { mainToShares, sharesToMain } from "@/lib/vaults/math";
import { peekSampleData } from "@/lib/vaults/sample";
import type { Vault } from "@/lib/vaults/types";
import type { VaultDepositorActions } from "./use-vault-depositor";

/**
 * Sample mode only: the depositor flow without a chain. Each action waits as
 * long as a wallet prompt and a confirmation would, then changes the fixture
 * position, so the whole deposit and withdraw flow can be clicked through (and
 * recorded). Positions live until the page reloads.
 */

const SIGN_AND_CONFIRM_MS = 1_800;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const positions = new Map<string, VaultDepositorState>();

function fakeSignature(): string {
  return Array.from({ length: 88 }, () => BASE58[Math.floor(Math.random() * BASE58.length)]).join("");
}

function nowSecs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function useSampleDepositor(vault: Vault): {
  data: VaultDepositorState | null;
  actions: VaultDepositorActions;
} {
  const pda = vault.vault_pda;
  const [data, setData] = useState<VaultDepositorState | null>(
    () => positions.get(pda) ?? peekSampleData()?.depositors[pda] ?? null,
  );

  const act = useCallback(
    (change: (state: VaultDepositorState) => VaultDepositorState) =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          const current = positions.get(pda) ?? peekSampleData()?.depositors[pda];
          if (current) {
            const next = change(current);
            positions.set(pda, next);
            setData(next);
          }
          resolve(fakeSignature());
        }, SIGN_AND_CONFIRM_MS);
      }),
    [pda],
  );

  const price = BigInt(vault.share_price);
  const refundDeposit = (s: VaultDepositorState): VaultDepositorState => ({
    ...s,
    mainTokenBalance: s.mainTokenBalance + (s.depositRequest?.amount ?? 0n),
    depositRequest: null,
  });

  const actions: VaultDepositorActions = {
    // no request step in the demo: the deposit becomes shares at the current share price
    requestDeposit: (amount) =>
      act((s) => ({
        ...s,
        mainTokenBalance: s.mainTokenBalance - amount,
        shareBalance: s.shareBalance + mainToShares(amount, price),
      })),
    cancelDeposit: () => act(refundDeposit),
    emergencyRefund: () => act(refundDeposit),
    requestWithdraw: (shares) => act((s) => ({ ...s, withdrawRequest: { shares, createdAt: nowSecs() } })),
    cancelWithdraw: () => act((s) => ({ ...s, withdrawRequest: null })),
    processOwnDeposit: () =>
      act((s) => ({
        ...s,
        shareBalance: s.shareBalance + mainToShares(s.depositRequest?.amount ?? 0n, price),
        depositRequest: null,
      })),
    processOwnWithdraw: () =>
      act((s) => {
        const shares = s.withdrawRequest?.shares ?? 0n;
        return {
          ...s,
          shareBalance: s.shareBalance - shares,
          mainTokenBalance: s.mainTokenBalance + sharesToMain(shares, price),
          withdrawRequest: null,
        };
      }),
  };

  return { data, actions };
}
