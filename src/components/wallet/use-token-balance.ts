"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getToken, getTokenMint } from "@/lib/tokens";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

let _conn: Connection | null = null;
function getConnection() {
  if (!_conn) _conn = new Connection(RPC_ENDPOINT, "confirmed");
  return _conn;
}

/** Wallet balance of one token in UI units, polled every 30s; null when unknown. */
export function useTokenBalance(walletAddress: string | undefined, tokenSymbol: string) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!walletAddress) { setBalance(null); return; }

    let cancelled = false;
    const conn = getConnection();
    const token = getToken(tokenSymbol);
    const mint = getTokenMint(tokenSymbol);
    const decimals = token?.decimals ?? 9;

    async function fetch() {
      try {
        const owner = new PublicKey(walletAddress!);
        if (tokenSymbol.toUpperCase() === "SOL" || tokenSymbol.toUpperCase() === "WSOL") {
          const lamports = await conn.getBalance(owner);
          if (!cancelled) setBalance(lamports / 10 ** decimals);
          return;
        }
        if (!mint) { if (!cancelled) setBalance(null); return; }
        const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) });
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
  }, [walletAddress, tokenSymbol]);

  return balance;
}
