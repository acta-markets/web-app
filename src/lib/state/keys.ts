import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { getPersister, getQueryClient, type AppPersister } from "./query-client";

/**
 * How every cached read is named: `[backend, scope, resource, ...params]`.
 *
 * The backend comes first so devnet and mainnet data can never be mistaken for each other.
 * The scope is "public" for data anyone sees, or a wallet's address for data that is that
 * wallet's own. Putting the wallet second lets one call forget everything of one wallet.
 */

export const PUBLIC = "public";

/** The backend this build talks to, as a short stable name: its host. */
export function backendId(url: string = getRfqBackendUrl()): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function publicKey(resource: string, ...params: ReadonlyArray<string | number | boolean | null>): QueryKey {
  return [backendId(), PUBLIC, resource, ...params];
}

export function walletKey(wallet: string, resource: string, ...params: ReadonlyArray<string | number | boolean | null>): QueryKey {
  return [backendId(), wallet, resource, ...params];
}

const walletScope = (wallet: string): QueryKey => [backendId(), wallet];

/** Everything of one wallet, out of memory and off the disk. Called when the wallet disconnects. */
export async function forgetWallet(wallet: string, client: QueryClient = getQueryClient(), persister: AppPersister = getPersister()): Promise<void> {
  if (!wallet || wallet === PUBLIC) return;
  await client.cancelQueries({ queryKey: walletScope(wallet) });
  client.removeQueries({ queryKey: walletScope(wallet) });
  await persister.removeQueries({ queryKey: walletScope(wallet) }).catch(() => undefined);
}

/**
 * Brings a wallet's saved reads back into memory before anything fetches them. Needed
 * because those reads can only be fetched after sign-in, and a saved read is otherwise
 * restored only when its fetch runs.
 */
export async function restoreWallet(wallet: string, client: QueryClient = getQueryClient(), persister: AppPersister = getPersister()): Promise<void> {
  if (!wallet || wallet === PUBLIC) return;
  await persister.restoreQueries(client, { queryKey: walletScope(wallet) }).catch(() => undefined);
}
