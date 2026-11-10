"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

/** Wrapped-SOL mint: the native-SOL path is keyed off this mint, not the symbol. */
const NATIVE_MINT = "So11111111111111111111111111111111111111112";

let _conn: Connection | null = null;
function getConnection() {
  if (!_conn) _conn = new Connection(RPC_ENDPOINT, "confirmed");
  return _conn;
}

/**
 * Wallet balance of one token in UI units, polled every 30s; null when unknown.
 *
 * `mint` is the authoritative mint the market actually uses (the server's
 * underlying/quote mint), never a symbol looked up in the static token list — the
 * list's devnet mints are wrong for some assets (e.g. HYPE, JITOSOL). `decimals`
 * only feeds the native-SOL path; SPL balances read their decimals straight off the
 * token account, so they stay correct even when the mint differs from the list.
 */
export function useTokenBalance(
  walletAddress: string | undefined,
  mint: string | undefined,
  decimals: number,
): number | null {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!walletAddress || !mint) { setBalance(null); return; }

    let cancelled = false;
    const conn = getConnection();
    const isNative = mint === NATIVE_MINT;

    async function fetch() {
      try {
        const owner = new PublicKey(walletAddress!);
        if (isNative) {
          const lamports = await conn.getBalance(owner);
          if (!cancelled) setBalance(lamports / 10 ** decimals);
          return;
        }
        const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint!) });
        let total = 0;
        for (const { account } of accounts.value) {
          total += Number(account.data.parsed.info.tokenAmount.uiAmountString);
        }
        if (!cancelled) setBalance(total);
      } catch {
        if (!cancelled) setBalance(null);
      }
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [walletAddress, mint, decimals]);

  return balance;
}
