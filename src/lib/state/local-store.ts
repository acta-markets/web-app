import { useSyncExternalStore } from "react";

/**
 * Small things remembered in this browser: who was here, what they chose. One helper so
 * every value is versioned, validated on the way back in, shared between tabs, and safe when
 * storage is missing or refuses (private windows, blocked site data).
 *
 * Large or frequently changing data does not belong here: server data goes through the
 * query cache (`query-client.ts`), which saves to IndexedDB.
 */

export type LocalStore<T> = {
  key: string;
  /** The stored value, or the fallback when there is none or it cannot be used. */
  read: () => T;
  write: (value: T) => void;
  clear: () => void;
  /** Called when the value changes, in this tab or another. */
  subscribe: (listener: () => void) => () => void;
  fallback: T;
};

export type LocalStoreOptions<T> = {
  key: string;
  /** Bump when the shape changes: a value saved under another version is ignored. */
  version: number;
  fallback: T;
  /** Returns the value if `data` is one, otherwise undefined. Never trust what comes back from storage. */
  parse: (data: unknown) => T | undefined;
  /** Reads a value written before this helper existed (no version envelope). */
  legacy?: (raw: string) => T | undefined;
  /** `window.sessionStorage` for things that should not outlive the tab. */
  area?: "local" | "session";
};

function storageArea(area: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return area === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const listeners = new Map<string, Set<() => void>>();
let listeningToTabs = false;

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function listenToOtherTabs() {
  if (listeningToTabs || typeof window === "undefined") return;
  listeningToTabs = true;
  window.addEventListener("storage", (event) => {
    // key is null when another tab cleared everything
    if (event.key === null) listeners.forEach((_set, key) => notify(key));
    else notify(event.key);
  });
}

export function createLocalStore<T>({ key, version, fallback, parse, legacy, area = "local" }: LocalStoreOptions<T>): LocalStore<T> {
  // the parsed value is kept per raw string, so reading twice gives the same object
  let lastRaw: string | null | undefined;
  let lastValue: T = fallback;
  // When storage refuses a write (private windows, blocked site data) the value is held here
  // instead, so the page still works for as long as it is open.
  let unsaved: { value: T } | null = null;

  const decode = (raw: string | null): T => {
    if (raw === null) return fallback;
    try {
      const stored: unknown = JSON.parse(raw);
      if (stored && typeof stored === "object" && !Array.isArray(stored) && "v" in stored && "d" in stored) {
        const { v, d } = stored as { v: unknown; d: unknown };
        return v === version ? (parse(d) ?? fallback) : fallback;
      }
    } catch {
      // not JSON: may still be a value from before the envelope
    }
    return legacy?.(raw) ?? fallback;
  };

  const read = (): T => {
    if (unsaved) return unsaved.value;
    let raw: string | null = null;
    try {
      raw = storageArea(area)?.getItem(key) ?? null;
    } catch {
      raw = null;
    }
    if (raw !== lastRaw) {
      lastRaw = raw;
      lastValue = decode(raw);
    }
    return lastValue;
  };

  const write = (value: T) => {
    const target = storageArea(area);
    try {
      if (!target) throw new Error("no storage");
      target.setItem(key, JSON.stringify({ v: version, d: value }));
      unsaved = null;
    } catch {
      // not remembered past this page, but not lost while it is open
      unsaved = { value };
    }
    notify(key);
  };

  const clear = () => {
    unsaved = null;
    try {
      storageArea(area)?.removeItem(key);
    } catch {
      // nothing to clear
    }
    notify(key);
  };

  const subscribe = (listener: () => void) => {
    listenToOtherTabs();
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(key);
    };
  };

  return { key, read, write, clear, subscribe, fallback };
}

/** A set of stores that differ only by a suffix, such as one per backend and wallet. */
export function createLocalStoreFamily<T>(options: Omit<LocalStoreOptions<T>, "key"> & { prefix: string }): (suffix: string) => LocalStore<T> {
  const stores = new Map<string, LocalStore<T>>();
  return (suffix) => {
    let store = stores.get(suffix);
    if (!store) {
      store = createLocalStore({ ...options, key: `${options.prefix}:${suffix}` });
      stores.set(suffix, store);
    }
    return store;
  };
}

/**
 * The stored value, live. The server and the first client render see the fallback; React
 * then re-renders with the stored value before the browser paints, so nothing flashes.
 */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.read, () => store.fallback);
}
