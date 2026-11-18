import { hashKey, QueryClient, type QueryKey } from "@tanstack/react-query";
import { experimental_createQueryPersister, type AsyncStorage, type PersistedQuery } from "@tanstack/query-persist-client-core";
import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";

/**
 * The app's server data: one cache in memory, shared by every page, with the reads that opt
 * in also saved to IndexedDB one query at a time. A returning visitor is shown what was last
 * known at once, and it is refreshed behind that.
 *
 * Two things are deliberate. Saving is opt-in per read (`persist` on a resource), so nothing
 * on the money path (a quote, a signing payload) can be written by accident. And what is
 * read back is for display only: `isLive` in `freshness.ts` is what an action must pass.
 */

/** Bump when the shape of any saved read changes: everything saved under another value is dropped. */
export const DATA_VERSION = "1";
/** The longest anything saved is kept. A resource may show its last-known value for less. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Every saved read's entry is named `acta-<the query's hash>`. */
const STORAGE_PREFIX = "acta";
/** How long an unused read stays in memory, so coming back to a page finds it there. */
const MEMORY_MS = 30 * 60 * 1000;

/**
 * IndexedDB as the persister's storage. Entries are stored as objects, not strings: the
 * browser's structured clone does the work, with no JSON pass over large reads. Every call
 * is guarded, because storage can be missing or refuse (private windows, blocked site data),
 * and then the app must behave as if nothing was saved.
 */
export function indexedDbStorage(): AsyncStorage<PersistedQuery> | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  let store: UseStore;
  try {
    store = createStore("acta-state", "queries");
  } catch {
    return undefined;
  }
  return {
    getItem: (key) => get<PersistedQuery>(key, store).catch(() => undefined),
    setItem: (key, value) => set(key, value, store).catch(() => undefined),
    removeItem: (key) => del(key, store).catch(() => undefined),
    entries: () => entries<string, PersistedQuery>(store).catch(() => []),
  };
}

export function createAppPersister(storage: AsyncStorage<PersistedQuery> | undefined) {
  return experimental_createQueryPersister<PersistedQuery>({
    storage,
    buster: DATA_VERSION,
    maxAge: PERSIST_MAX_AGE_MS,
    prefix: STORAGE_PREFIX,
    serialize: (query) => query,
    deserialize: (stored) => stored,
  });
}

export type AppPersister = ReturnType<typeof createAppPersister>;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: MEMORY_MS,
        // a hidden tab asks for nothing; coming back to it does
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserClient: QueryClient | null = null;
let browserPersister: AppPersister | null = null;
let browserStorage: AsyncStorage<PersistedQuery> | undefined | null = null;

function getStorage(): AsyncStorage<PersistedQuery> | undefined {
  if (typeof window === "undefined") return undefined;
  if (browserStorage === null) browserStorage = indexedDbStorage();
  return browserStorage;
}

/**
 * One saved read, straight from the device by its key: a single lookup, however much else is
 * stored. (The persister's own `restoreQueries` reads every entry to find one.) Undefined
 * when there is none, or it is from another data version, or past its age.
 */
export async function readSaved<T>(key: QueryKey, nowMs: number = Date.now()): Promise<{ data: T; updatedAt: number } | undefined> {
  const stored = await getStorage()?.getItem(`${STORAGE_PREFIX}-${hashKey(key)}`);
  const at = stored?.state?.dataUpdatedAt;
  if (!stored || stored.buster !== DATA_VERSION || !at || nowMs - at > PERSIST_MAX_AGE_MS) return undefined;
  if (stored.state.data === undefined) return undefined;
  return { data: stored.state.data as T, updatedAt: at };
}

/** One client per browser tab, kept at module level so it outlives any layout that mounts it. A server render gets its own each time. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return createAppQueryClient();
  return (browserClient ??= createAppQueryClient());
}

export function getPersister(): AppPersister {
  if (typeof window === "undefined") return createAppPersister(undefined);
  if (!browserPersister) {
    browserPersister = createAppPersister(getStorage());
    // expired, outdated and unreadable entries go once per load, when the tab is idle
    const sweep = () => void browserPersister?.persisterGc().catch(() => undefined);
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(sweep);
    else window.setTimeout(sweep, 2_000);
  }
  return browserPersister;
}
