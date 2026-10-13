import { fetchVault, fetchVaultCycles, fetchVaults } from "./api";
import { loadSampleData, VAULTS_SAMPLE_MODE } from "./sample";
import type { Vault, VaultCyclesPage } from "./types";

/**
 * The only place fixture and live data split. Hooks read through here; `api.ts`
 * stays a plain HTTP client. In fixture mode everything comes from
 * sample-data.json.
 */

export const VAULT_CYCLES_PAGE_LIMIT = 200;
const SAMPLE_LATENCY_MS = 250;

function withSampleLatency<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), SAMPLE_LATENCY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export function loadVaults(signal?: AbortSignal): Promise<Vault[]> {
  if (!VAULTS_SAMPLE_MODE) return fetchVaults(signal);
  return loadSampleData().then((data) => withSampleLatency(data.vaults, signal));
}

export function loadVault(pda: string, signal?: AbortSignal): Promise<Vault | null> {
  if (!VAULTS_SAMPLE_MODE) return fetchVault(pda, signal);
  return loadSampleData().then((data) => withSampleLatency(data.vaults.find((v) => v.vault_pda === pda) ?? null, signal));
}

/** Newest first, at most VAULT_CYCLES_PAGE_LIMIT cycles. */
export function loadVaultCycles(pda: string, signal?: AbortSignal): Promise<VaultCyclesPage> {
  if (!VAULTS_SAMPLE_MODE) return fetchVaultCycles(pda, { limit: VAULT_CYCLES_PAGE_LIMIT }, signal);
  return loadSampleData().then((data) => withSampleLatency({ cycles: data.cycles[pda] ?? [], next_cursor: null }, signal));
}

/**
 * USD prices for deposit assets, keyed by upper-case symbol. Assets without a
 * price are left out. Live prices come from the app's own price route.
 */
export async function loadUsdPrices(symbols: readonly string[], signal?: AbortSignal): Promise<Record<string, number>> {
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  if (VAULTS_SAMPLE_MODE) {
    const { pricesUsd } = await loadSampleData();
    return Object.fromEntries(Object.entries(pricesUsd).filter(([symbol]) => wanted.has(symbol)));
  }
  const res = await fetch(`/api/market/price?symbols=${encodeURIComponent([...wanted].join(","))}`, { signal });
  if (!res.ok) throw new Error(`Price request failed (${res.status})`);
  const body = (await res.json()) as { prices?: Record<string, number> };
  return body.prices ?? {};
}
