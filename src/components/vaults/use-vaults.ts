import { useCallback, useEffect, useRef, useState } from "react";
import { VaultApiError } from "@/lib/vaults/api";
import { loadVault, loadVaultCycles, loadVaults } from "@/lib/vaults/source";
import type { Vault, VaultCyclesPage } from "@/lib/vaults/types";

const VAULT_REFRESH_MS = 30_000;

export type Loadable<T> = {
  data: T;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
};

export function usePolled<T>(load: (signal: AbortSignal) => Promise<T>, initial: T, key: string | null): Loadable<T> {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const loadedKey = useRef(key);

  useEffect(() => {
    if (loadedKey.current !== key) {
      loadedKey.current = key;
      setData(initial);
      setError(null);
    }
    if (key === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const run = async () => {
      clearTimeout(timer);
      timer = undefined;
      inFlight = true;
      try {
        const next = await loadRef.current(controller.signal);
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (document.visibilityState === "visible") timer = setTimeout(run, VAULT_REFRESH_MS);
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !inFlight && timer === undefined) void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    setLoading(true);
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}

export function useVaults(): Loadable<Vault[]> {
  return usePolled(loadVaults, [], "vaults");
}

export function useVault(pda: string | null): Loadable<Vault | null> {
  return usePolled((signal) => (pda ? loadVault(pda, signal) : Promise.resolve(null)), null, pda);
}

/**
 * Latest page of a vault's cycles. A server without its database answers
 * `db_disabled`, which is permanent: polling stops and `disabled` is set so the
 * page can hide history instead of showing an error.
 */
export function useVaultCycles(pda: string | null): Loadable<VaultCyclesPage | null> & { disabled: boolean } {
  const [disabledFor, setDisabledFor] = useState<string | null>(null);
  const disabled = pda !== null && disabledFor === pda;
  const state = usePolled(
    (signal) => (pda ? loadVaultCycles(pda, signal) : Promise.resolve(null)),
    null,
    pda && !disabled ? `cycles:${pda}` : null,
  );
  const { error } = state;
  useEffect(() => {
    if (pda && error instanceof VaultApiError && error.code === "db_disabled") setDisabledFor(pda);
  }, [error, pda]);
  return { ...state, disabled };
}

/** Wall-clock seconds, refreshed on an interval, for countdowns and phase checks. */
export function useNowSecs(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
