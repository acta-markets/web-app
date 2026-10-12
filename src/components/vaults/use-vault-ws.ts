import { useCallback, useEffect, useRef, useState } from "react";
import { flows, resolveVaultPriceUpdates } from "@acta-markets/ts-sdk/chain";
import { ActaWsClient, type ActaWsClientEvents, type SwapQuoteData } from "@acta-markets/ts-sdk/ws";
import { fetchAddressesForLookupTables } from "@solana/kit";
import { VersionedTransaction } from "@solana/web3.js";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { createWalletAuthProvider, getRfqBackendUrl } from "@/lib/rfq-client";
import type { VaultManager } from "@/lib/vaults/operator";

type VaultAuth = Parameters<ActaWsClientEvents["vaultAuthenticated"]>[0];
export type VaultSwapQuote = Parameters<ActaWsClientEvents["swapQuoteResult"]>[0];
export type VaultSwapQuoteRequest = Omit<SwapQuoteData, "request_id" | "vault_pda">;

const SWAP_TIMEOUT_MS = 30_000;
const SWAP_COMPUTE_BOUNDS: flows.ComputeBudgetBounds = { maxUnitLimit: 600_000, maxUnitPriceMicroLamports: 10_000 };

export type UseVaultWs = {
  client: ActaWsClient | null;
  auth: VaultAuth | null;
  error: Error | null;
  /** Rebalance through the backend Jupiter relay: quote, wallet-sign, submit. */
  swap: (request: VaultSwapQuoteRequest, manager: VaultManager, minOutputFloor: bigint) => Promise<VaultSwapQuote>;
};

/**
 * `/vault` operator session. Connecting asks the wallet to sign the auth
 * challenge, so it only runs while `enabled`.
 */
export function useVaultWs(vaultPda: string | null, enabled: boolean, onProjection: () => void): UseVaultWs {
  const { rpc, selectedAccount, signMessage, signTransaction } = useSolana();
  const owner = selectedAccount?.address ?? null;
  const [client, setClient] = useState<ActaWsClient | null>(null);
  const [auth, setAuth] = useState<VaultAuth | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const onProjectionRef = useRef(onProjection);
  onProjectionRef.current = onProjection;
  const signMessageRef = useRef(signMessage);
  signMessageRef.current = signMessage;

  useEffect(() => {
    setAuth(null);
    setError(null);
    if (!enabled || !vaultPda || !owner) {
      setClient(null);
      return;
    }
    const next = new ActaWsClient({ url: getRfqBackendUrl(), role: "vault", vaultPda, autoReconnect: true });
    next.on("vaultAuthenticated", (data) => setAuth(data));
    next.on("vaultProjectionAdvanced", () => onProjectionRef.current());
    next.on("disconnected", () => setAuth(null));
    next.on("error", (err) => setError(new Error(err.type)));
    next.connectAndAuthenticate(
      createWalletAuthProvider({ address: owner, signMessage: (message) => signMessageRef.current(message) }),
    );
    setClient(next);
    return () => next.disconnect();
  }, [enabled, vaultPda, owner]);

  const swap = useCallback(
    async (request: VaultSwapQuoteRequest, manager: VaultManager, minOutputFloor: bigint) => {
      if (!client || !auth) throw new Error("Vault session is not authenticated");
      const quoteRequest = { ...request, request_id: crypto.randomUUID(), vault_pda: auth.vault_pda };
      const quote = await client.request(
        "SwapQuoteResult",
        { type: "SwapQuote", data: quoteRequest },
        { timeoutMs: SWAP_TIMEOUT_MS },
      );
      const prices = await resolveVaultPriceUpdates(rpc, manager);
      const tables = await fetchAddressesForLookupTables(flows.servedLookupTableKeys(quote.tx_base64), rpc);
      await flows.verifyVaultSwap(
        { vault: manager, request: quoteRequest, quote, ...prices, minOutputFloor },
        tables,
        SWAP_COMPUTE_BOUNDS,
      );
      const signed = await signTransaction(VersionedTransaction.deserialize(base64ToBytes(quote.tx_base64)));
      await client.request(
        "SwapSubmitResult",
        {
          type: "SwapSubmit",
          data: {
            request_id: crypto.randomUUID(),
            execution_id: quote.execution_id,
            signed_tx_base64: bytesToBase64(signed.serialize()),
          },
        },
        { timeoutMs: SWAP_TIMEOUT_MS },
      );
      return quote;
    },
    [client, auth, rpc, signTransaction],
  );

  return { client, auth, error, swap };
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
