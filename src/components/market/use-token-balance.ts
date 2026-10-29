"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { address } from "@solana/kit";
import { deriveAta } from "@acta-markets/ts-sdk/chain";
import { getRpcEndpoint } from "@/lib/network";

let _conn: Connection | null = null;
function getConnection() {
  if (!_conn) _conn = new Connection(getRpcEndpoint(), "confirmed");
  return _conn;
}

export function useTokenBalance(walletAddress: string | undefined, mint: string | undefined, wrapsNative: boolean) {
  const [snapshot, setSnapshot] = useState<{ wallet: string; mint: string; wrapsNative: boolean; atoms: bigint } | null>(null);

  useEffect(() => {
    if (!walletAddress || !mint) return;
    let cancelled = false;
    const conn = getConnection();
    const wallet = walletAddress;
    const tokenMint = mint;

    async function fetch() {
      try {
        const owner = new PublicKey(wallet);
        const [accounts, native] = await Promise.all([
          conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(tokenMint) }),
          wrapsNative ? conn.getBalance(owner) : Promise.resolve(0),
        ]);
        let atoms = 0n;
        let frozen = false;
        for (const { pubkey, account } of accounts.value) {
          const ata = await deriveAta({ owner: address(wallet), mint: address(tokenMint), tokenProgram: address(account.owner.toBase58()) });
          if (pubkey.toBase58() !== ata) continue;
          const info = account.data.parsed.info;
          frozen = info.state === "frozen";
          atoms = BigInt(info.tokenAmount.amount);
          break;
        }
        // Match tx-service's canonical-ATA funds check and native wrap reserve.
        if (wrapsNative) atoms = atoms + BigInt(native) - 1_200_000n;
        if (frozen || atoms < 0n) atoms = 0n;
        if (!cancelled) setSnapshot({ wallet, mint: tokenMint, wrapsNative, atoms });
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [walletAddress, mint, wrapsNative]);

  return snapshot && snapshot.wallet === walletAddress && snapshot.mint === mint && snapshot.wrapsNative === wrapsNative ? snapshot.atoms : null;
}

