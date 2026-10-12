import { fetchVault, fetchVaultCycles, fetchVaults } from "./api";
import { sampleData, VAULTS_SAMPLE_MODE } from "./sample";
import type { Vault, VaultCyclesPage } from "./types";

/**
 * The only place sample and live data split. Hooks read through here; `api.ts`
 * stays a plain HTTP client.
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
  return VAULTS_SAMPLE_MODE ? withSampleLatency(sampleData().vaults, signal) : fetchVaults(signal);
}

export function loadVault(pda: string, signal?: AbortSignal): Promise<Vault | null> {
  if (!VAULTS_SAMPLE_MODE) return fetchVault(pda, signal);
  return withSampleLatency(sampleData().vaults.find((v) => v.vault_pda === pda) ?? null, signal);
}

/** Newest first, at most VAULT_CYCLES_PAGE_LIMIT cycles. */
export function loadVaultCycles(pda: string, signal?: AbortSignal): Promise<VaultCyclesPage> {
  if (!VAULTS_SAMPLE_MODE) return fetchVaultCycles(pda, { limit: VAULT_CYCLES_PAGE_LIMIT }, signal);
  return withSampleLatency({ cycles: sampleData().cycles[pda] ?? [], next_cursor: null }, signal);
}
