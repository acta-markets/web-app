"use client";

import { useCallback, useEffect, useState } from "react";
import { address } from "@solana/kit";

import { useSolana } from "@/components/solana/solana-wallet-provider";

/**
 * Read the connected wallet's balance for a given mint.
 *
 * - Returns `atomic` as a `bigint` (token atomic units) and the mint's
 *   `decimals` so callers can format with `mm-format.atomicToHuman`.
 * - For the SOL native mint (`So11…11111`) we call `getBalance` on the owner
 *   and report lamports with `decimals = 9`.
 * - For SPL mints we sum across all token accounts owned by the wallet for
 *   that mint (almost always one, but wallets occasionally have duplicates).
 * - `refresh()` force-refetches on demand (useful after a deposit tx confirms).
 *
 * No polling inside the hook — refresh on events (post-tx, on reconnect, etc.).
 */
export interface UseWalletBalanceResult {
  atomic: bigint | null;
  decimals: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_DECIMALS = 9;

// Token account amounts come back as decimal strings in `jsonParsed` encoding;
// `decimals` is a number. This type mirrors the bits we consume.
type ParsedTokenAccount = {
  account: {
    data: {
      parsed: {
        info: {
          tokenAmount: {
            amount: string;
            decimals: number;
          };
        };
      };
    };
  };
};

export function useWalletBalance(mint: string | null | undefined): UseWalletBalanceResult {
  const { rpc, selectedAccount } = useSolana();
  const owner = selectedAccount?.address ?? null;

  const [atomic, setAtomic] = useState<bigint | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!owner || !mint) {
      setAtomic(null);
      setDecimals(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (mint === NATIVE_SOL_MINT) {
          const res = await rpc.getBalance(address(owner)).send();
          if (cancelled) return;
          setAtomic(BigInt(res.value));
          setDecimals(SOL_DECIMALS);
          return;
        }

        const res = await rpc
          .getTokenAccountsByOwner(
            address(owner),
            { mint: address(mint) },
            { encoding: "jsonParsed" },
          )
          .send();
        if (cancelled) return;

        let total = 0n;
        let dec: number | null = null;
        for (const acc of res.value as unknown as ParsedTokenAccount[]) {
          const amount = acc.account.data.parsed.info.tokenAmount;
          total += BigInt(amount.amount);
          dec = amount.decimals;
        }
        setAtomic(total);
        setDecimals(dec);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setAtomic(null);
        setDecimals(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rpc, owner, mint, tick]);

  return { atomic, decimals, loading, error, refresh };
}
