"use client";

import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { isLastKnown, isTooOld } from "./freshness";
import { getPersister, getQueryClient, PERSIST_MAX_AGE_MS } from "./query-client";

/**
 * One read of server data for display, through the shared cache: every component asking for
 * the same key shares one request and one copy, the copy outlives the page that asked, and a
 * read that opts in is also saved to this device and shown on the next visit until a fresh
 * one arrives.
 *
 * Not for the money path. A read that sizes a deposit or builds a transaction stays on
 * `usePolled` (`src/components/vaults/use-vaults.ts`), which caches nothing.
 */
export type Resource<T> = {
  /** The latest data, or `initial` while there is none. */
  data: T;
  /** Why the last refresh failed; the data shown is then the last that worked. */
  error: Error | null;
  /** Nothing to show yet: no data in memory or on this device, and no answer so far. */
  loading: boolean;
  refresh: () => void;
  /** When the data shown was fetched, in ms; 0 with none. */
  updatedAt: number;
  /** The data came from this device's storage and no read in this session has confirmed it yet. */
  lastKnown: boolean;
  /** The data shown belongs to the previous key while this one loads (`keepPrevious`). */
  placeholder: boolean;
};

export type ResourceOptions<T> = {
  /** Names the read (see `keys.ts`); null turns it off. */
  key: QueryKey | null;
  load: (signal: AbortSignal) => Promise<T>;
  initial: T;
  /** Refresh this often while the tab is visible. 0 for a read that is fetched once. */
  pollMs?: number;
  /** A copy younger than this is used as it is when a page mounts or the tab regains focus. */
  staleMs?: number;
  /** Save to this device and show on the next visit. Display data only, and JSON-shaped. */
  persist?: boolean;
  /** The oldest a saved copy may be and still be shown. */
  maxShowMs?: number;
  /** While a new key loads, keep showing the previous key's data (a longer page of the same list). */
  keepPrevious?: boolean;
};

const OFF: QueryKey = ["off"];
export const DEFAULT_POLL_MS = 30_000;
const DEFAULT_STALE_MS = 10_000;

export function useResource<T>({
  key,
  load,
  initial,
  pollMs = DEFAULT_POLL_MS,
  staleMs = DEFAULT_STALE_MS,
  persist = false,
  maxShowMs = PERSIST_MAX_AGE_MS,
  keepPrevious = false,
}: ResourceOptions<T>): Resource<T> {
  const enabled = key !== null;
  const query = useQuery<T, Error>(
    {
      queryKey: key ?? OFF,
      queryFn: ({ signal }) => load(signal),
      enabled,
      refetchInterval: pollMs > 0 ? pollMs : false,
      staleTime: staleMs,
      // the next poll is the retry; a failure is reported at once, with the last data kept
      retry: false,
      ...(persist ? { persister: getPersister().persisterFn as never } : {}),
      ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
    },
    getQueryClient(),
  );
  const timed = { dataUpdatedAt: query.dataUpdatedAt, isError: query.isError };
  // a saved copy past its age is not shown; the read is then simply still loading
  const expired = enabled && query.data !== undefined && isLastKnown(timed) && isTooOld(timed, maxShowMs);
  const has = enabled && query.data !== undefined && !expired;
  return {
    data: has ? (query.data as T) : initial,
    error: enabled ? query.error : null,
    loading: enabled && !has && !query.isError,
    refresh: () => void query.refetch(),
    updatedAt: has ? query.dataUpdatedAt : 0,
    lastKnown: has && isLastKnown(timed),
    placeholder: has && query.isPlaceholderData,
  };
}
