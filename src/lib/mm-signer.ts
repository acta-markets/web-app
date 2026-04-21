"use client";

/**
 * Adapter for getting a `TransactionSigner<string>` usable with
 * `@acta-markets/ts-sdk`'s `ActaChainClient` / `buildDepositPremiumIx` /
 * `buildWithdrawPremiumIx` from a connected Wallet Standard wallet.
 *
 * `@solana/react` already provides the heavy lifting:
 *   - `useWallets()` (from `@wallet-standard/react`) returns `UiWallet[]`
 *   - `useWalletAccountTransactionSigner(account, chain)` turns a
 *     `UiWalletAccount` into a `TransactionModifyingSigner<string>`, which
 *     is assignable to the `TransactionSigner<string>` the SDK expects.
 *
 * This module wraps those in conveniences tailored for the MM dashboard:
 *
 *   - `useMmSigner(account, chain)` — thin passthrough to
 *     `useWalletAccountTransactionSigner` so the rest of the codebase has a
 *     single import for the MM flow.
 *   - `mmSignerChain(network)` — returns the Wallet Standard chain string
 *     (`"solana:mainnet"` | `"solana:devnet"`) that matches the Solana network
 *     used elsewhere in the app.
 *
 * Usage in the page:
 *
 * ```tsx
 * const wallets = useWallets();              // from @wallet-standard/react
 * const { selectedAccount } = useSolana();   // our context tells which is chosen
 * const uiAccount = findUiAccount(wallets, selectedAccount?.address);
 * const signer = useMmSigner(uiAccount, mmSignerChain());
 * // → pass `signer` as `makerOwner` into buildDepositPremiumIx
 * ```
 */

import { useWalletAccountTransactionSigner } from "@solana/react";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import type { TransactionModifyingSigner } from "@solana/signers";

type SolanaChain = `solana:${string}`;

export function mmSignerChain(): SolanaChain {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  return network === "mainnet" ? "solana:mainnet" : "solana:devnet";
}

/**
 * Passthrough wrapper. Must be called unconditionally (React hook rules);
 * if there is no connected account, don't render the component that uses it.
 */
export function useMmSigner<TAccount extends UiWalletAccount>(
  account: TAccount,
  chain: SolanaChain = mmSignerChain(),
): TransactionModifyingSigner<TAccount["address"]> {
  return useWalletAccountTransactionSigner(account, chain);
}

/**
 * Locate the `UiWalletAccount` for a given base58 address across all
 * registered `UiWallet`s. Returns `null` if no wallet has that account.
 *
 * Useful because our `useSolana()` context stores the address as a string but
 * not the full `UiWalletAccount` required by `useMmSigner`.
 */
export function findUiAccount(
  wallets: readonly UiWallet[],
  address: string | null | undefined,
): UiWalletAccount | null {
  if (!address) return null;
  for (const w of wallets) {
    for (const acc of w.accounts) {
      if (acc.address === address) return acc;
    }
  }
  return null;
}
