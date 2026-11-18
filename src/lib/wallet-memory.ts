import { createLocalStore } from "@/lib/state/local-store";

/**
 * The wallet a visitor last connected with, kept in this browser so the next visit does not
 * start by picking it again. Only the wallet's name and the public address are stored: no
 * key, no signature, nothing that grants access. Reconnecting is still the wallet's call:
 * it is asked silently and answers only if it already trusts this site.
 *
 * Forgotten when the visitor disconnects, in every tab.
 */

export type LastWallet = { name: string; address: string };

function parse(data: unknown): LastWallet | null | undefined {
  if (!data || typeof data !== "object") return undefined;
  const { name, address } = data as Record<string, unknown>;
  if (typeof name !== "string" || !name || typeof address !== "string" || !address) return undefined;
  return { name, address };
}

/** The store itself, for a component that needs to follow it (and other tabs' changes to it). */
export const lastWalletStore = createLocalStore<LastWallet | null>({
  key: "acta_last_wallet",
  version: 1,
  fallback: null,
  parse,
  // written without a version envelope before the shared helper existed
  legacy: (raw) => {
    try {
      return parse(JSON.parse(raw)) ?? undefined;
    } catch {
      return undefined;
    }
  },
});

export function readLastWallet(): LastWallet | null {
  return lastWalletStore.read();
}

export function writeLastWallet(wallet: LastWallet): void {
  lastWalletStore.write({ name: wallet.name, address: wallet.address });
}

export function clearLastWallet(): void {
  lastWalletStore.clear();
}

/** Which of a wallet's accounts to use on return: the one used last time if the wallet still offers it, else its first. */
export function pickAccount<T extends { address: string }>(accounts: readonly T[], remembered: string | null | undefined): T | null {
  return accounts.find((a) => a.address === remembered) ?? accounts[0] ?? null;
}

/** The wallets to choose from, the one used last time first. */
export function lastUsedFirst<T extends { name: string }>(wallets: readonly T[], lastUsed: string | null | undefined): T[] {
  if (!lastUsed) return [...wallets];
  return [...wallets].sort((a, b) => Number(b.name === lastUsed) - Number(a.name === lastUsed));
}
