"use client";

import { skipToken, useQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { restoreWallet } from "./keys";
import { getPersister, getQueryClient, readSaved } from "./query-client";
import { restoring } from "./restore-once";

/**
 * For data the app is handed rather than fetches on demand: what arrives over the trading
 * socket after sign-in (a wallet's positions, its history, its referral status). `remember`
 * puts the latest copy in the shared cache and on the device; `useRemembered` reads it back,
 * live, including on the next visit before the wallet has signed in again.
 *
 * What comes back is last-known and for display only. Whoever shows it says so, and offers
 * no action built on it.
 */

const OFF: QueryKey = ["off"];

/** Keeps the latest copy, in memory and on this device. */
export function remember<T>(key: QueryKey, data: T): void {
  const client = getQueryClient();
  client.setQueryData(key, data);
  void getPersister().persistQueryByKey(key, client).catch(() => undefined);
}

/** The copy in memory right now, or undefined. Does not look on the device. */
export function recall<T>(key: QueryKey): T | undefined {
  return getQueryClient().getQueryData<T>(key);
}

/**
 * Brings one saved copy from the device into memory, once per page load. It can be called
 * before anything is drawn (a page does so for what its first screen needs), so the copy is
 * already in memory when the page first renders. A copy that arrived live in the meantime is
 * never replaced by the saved one.
 */
export function restoreRemembered(key: QueryKey): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const name = JSON.stringify(key);
  let pending = restoring.get(name);
  if (!pending) {
    pending = readSaved(key)
      .then((saved) => {
        const client = getQueryClient();
        if (saved && client.getQueryData(key) === undefined) client.setQueryData(key, saved.data, { updatedAt: saved.updatedAt });
      })
      .catch(() => undefined);
    restoring.set(name, pending);
  }
  return pending;
}

const noChange = () => () => undefined;
/** False on the server and while the server's page is being taken over, true from then on. */
function useTakenOver(): boolean {
  return useSyncExternalStore(noChange, () => true, () => false);
}

/**
 * The remembered copy, followed live: a new `remember` or a restore from the device re-renders.
 *
 * A wallet's data is brought back from the device in one go (`useRestoreWallet`). A public
 * copy asks for its own restore here with `restore`, once per page load.
 *
 * The first render in the browser repeats what the server sent, which knows nothing saved, so
 * the copy is held back for that one render even when it is already in memory.
 */
export function useRemembered<T>(key: QueryKey | null, { restore = false }: { restore?: boolean } = {}): { data: T | undefined; updatedAt: number } {
  const query = useQuery<T>({ queryKey: key ?? OFF, queryFn: skipToken, staleTime: Infinity }, getQueryClient());
  const takenOver = useTakenOver();
  const name = key && restore ? JSON.stringify(key) : null;
  useEffect(() => {
    if (name) void restoreRemembered(key as QueryKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return key === null || !takenOver ? { data: undefined, updatedAt: 0 } : { data: query.data, updatedAt: query.dataUpdatedAt };
}

/**
 * Brings a wallet's saved data into memory as soon as the app knows which wallet it is,
 * which on a return visit is before the wallet has reconnected or signed in.
 */
export function useRestoreWallet(wallet: string | null): void {
  useEffect(() => {
    if (wallet) void restoreWallet(wallet);
  }, [wallet]);
}
