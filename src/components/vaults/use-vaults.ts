import { useCallback, useEffect, useRef, useState } from "react";
import { ActaHttpError } from "@/lib/vaults/api";
import { publicKey } from "@/lib/state/keys";
import { useResource } from "@/lib/state/use-resource";
import { VAULTS_SAMPLE_MODE } from "@/lib/vaults/sample";
import { loadUnsettledVaultPositions, loadVault, loadVaultCycles, loadVaultExposure, loadVaults } from "@/lib/vaults/source";
import type { Vault, VaultCyclesPage, VaultExposure, VaultPosition } from "@/lib/vaults/types";

const VAULT_REFRESH_MS = 30_000;

export type Loadable<T> = {
  data: T;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
};

/** Sample vaults are made up: they get a key of their own and are never saved to the device. */
const SOURCE = VAULTS_SAMPLE_MODE ? "sample" : "live";
const SAVED = !VAULTS_SAMPLE_MODE;
/** A vault's figures are worth showing for a day; older than that, the page waits for fresh ones. */
const VAULT_SHOW_MS = 24 * 60 * 60 * 1000;

/**
 * A read that caches nothing: its state lives and dies with the component. This is what the
 * money path uses (a depositor's balances and requests, which size a deposit and build its
 * transaction). Reads for display go through `useResource` instead.
 */
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
  return useResource({ key: publicKey("vaults", SOURCE), load: loadVaults, initial: [], persist: SAVED, maxShowMs: VAULT_SHOW_MS });
}

export function useVault(pda: string | null): Loadable<Vault | null> {
  return useResource({
    key: pda ? publicKey("vault", SOURCE, pda) : null,
    load: (signal) => loadVault(pda as string, signal),
    initial: null,
    persist: SAVED,
    maxShowMs: VAULT_SHOW_MS,
  });
}

/**
 * Latest page of a vault's cycles. A server without its database answers
 * `db_disabled`, which is permanent: polling stops and `disabled` is set so the
 * page can hide history instead of showing an error.
 */
export function useVaultCycles(pda: string | null): Loadable<VaultCyclesPage | null> & { disabled: boolean } {
  const [disabledFor, setDisabledFor] = useState<string | null>(null);
  const disabled = pda !== null && disabledFor === pda;
  const state = useResource({
    key: pda && !disabled ? publicKey("vault-cycles", SOURCE, pda) : null,
    load: (signal) => loadVaultCycles(pda as string, signal),
    initial: null,
    persist: SAVED,
    maxShowMs: VAULT_SHOW_MS,
  });
  const { error } = state;
  useEffect(() => {
    if (pda && error instanceof ActaHttpError && error.code === "db_disabled") setDisabledFor(pda);
  }, [error, pda]);
  return { ...state, disabled };
}

/** Open positions at spot. Polled with the vault, only where the vault page shows them. Kept in memory only: the page hides them rather than show old numbers. */
export function useVaultExposure(pda: string): Loadable<VaultExposure | null> {
  return useResource({ key: publicKey("vault-exposure", SOURCE, pda), load: (signal) => loadVaultExposure(pda, signal), initial: null });
}

/** Premium and second strike for the exposure rows. */
export function useUnsettledVaultPositions(pda: string): Loadable<VaultPosition[]> {
  return useResource({ key: publicKey("vault-open-positions", SOURCE, pda), load: (signal) => loadUnsettledVaultPositions(pda, signal), initial: [] });
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
