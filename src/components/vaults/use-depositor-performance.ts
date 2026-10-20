import { useEffect, useMemo, useState } from "react";
import { depositorPerformance, type DepositorPerformance } from "@acta-markets/ts-sdk/http";
import { loadVaultDepositorHistory } from "@/lib/vaults/source";
import type { Vault, VaultDepositorEvent } from "@/lib/vaults/types";

/**
 * FIFO lots of the current generation for `shares` (wallet balance plus escrowed
 * withdrawal shares). History reloads when the shares or the generation change.
 */
export function useDepositorPerformance(
  vault: Pick<Vault, "vault_pda" | "share_price" | "generation_started_at">,
  wallet: string | null,
  shares: bigint,
): DepositorPerformance | null {
  const generationStart = vault.generation_started_at;
  const key = wallet && generationStart !== null && shares > 0n ? `${vault.vault_pda}:${wallet}:${generationStart}:${shares}` : null;
  const [history, setHistory] = useState<{ key: string; events: VaultDepositorEvent[] } | null>(null);

  useEffect(() => {
    if (key === null || wallet === null || generationStart === null) return;
    const controller = new AbortController();
    loadVaultDepositorHistory(vault.vault_pda, wallet, BigInt(generationStart), controller.signal).then(
      (events) => setHistory({ key, events }),
      () => undefined,
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    if (history === null || history.key !== key || generationStart === null) return null;
    return depositorPerformance({ history: history.events, shares, sharePrice: vault.share_price, generationStart });
  }, [history, key, shares, vault.share_price, generationStart]);
}
