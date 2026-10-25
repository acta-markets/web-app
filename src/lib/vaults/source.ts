import { rememberReferenceTokens } from "@/lib/tokens";
import { fetchTokens, fetchVault, fetchVaultCycles, fetchVaultDepositorHistory, fetchVaultExposure, fetchVaults } from "./api";
import { loadSampleData, VAULTS_SAMPLE_MODE } from "./sample";
import type { Vault, VaultCyclesPage, VaultDepositorEvent, VaultExposure } from "./types";

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

let referenceTokens: Promise<void> | null = null;

/** Names for vault mints the static token list misses; a failed read only costs the names. */
function loadReferenceTokens(): Promise<void> {
  referenceTokens ??= fetchTokens()
    .then((tokens) => rememberReferenceTokens(tokens.values()))
    .catch(() => {
      referenceTokens = null;
    });
  return referenceTokens;
}

export async function loadVaults(signal?: AbortSignal): Promise<Vault[]> {
  if (!VAULTS_SAMPLE_MODE) {
    const [vaults] = await Promise.all([fetchVaults(signal), loadReferenceTokens()]);
    return vaults;
  }
  return loadSampleData().then((data) => withSampleLatency(data.vaults, signal));
}

export async function loadVault(pda: string, signal?: AbortSignal): Promise<Vault | null> {
  if (!VAULTS_SAMPLE_MODE) {
    const [vault] = await Promise.all([fetchVault(pda, signal), loadReferenceTokens()]);
    return vault;
  }
  return loadSampleData().then((data) => withSampleLatency(data.vaults.find((v) => v.vault_pda === pda) ?? null, signal));
}

/** Newest first, at most VAULT_CYCLES_PAGE_LIMIT cycles. */
export function loadVaultCycles(pda: string, signal?: AbortSignal): Promise<VaultCyclesPage> {
  if (!VAULTS_SAMPLE_MODE) return fetchVaultCycles(pda, { limit: VAULT_CYCLES_PAGE_LIMIT }, signal);
  return loadSampleData().then((data) => withSampleLatency({ cycles: data.cycles[pda] ?? [], next_cursor: null }, signal));
}

export function loadVaultExposure(pda: string, signal?: AbortSignal): Promise<VaultExposure | null> {
  if (!VAULTS_SAMPLE_MODE) return fetchVaultExposure(pda, signal);
  return loadSampleData().then((data) => withSampleLatency(data.exposure[pda] ?? null, signal));
}

const HISTORY_PAGE_LIMIT = 200;

/** A wallet's history in one vault, newest first, down to the page that reaches `since`. Sample mode serves the fixture position's history. */
export async function loadVaultDepositorHistory(
  pda: string,
  wallet: string,
  since: bigint,
  signal?: AbortSignal,
): Promise<VaultDepositorEvent[]> {
  if (VAULTS_SAMPLE_MODE) return loadSampleData().then((data) => withSampleLatency(data.history[pda] ?? [], signal));
  const events: VaultDepositorEvent[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchVaultDepositorHistory(pda, wallet, { limit: HISTORY_PAGE_LIMIT, cursor }, signal);
    events.push(...page.events);
    const oldest = page.events.at(-1);
    cursor = oldest && BigInt(oldest.event_time) <= since ? undefined : page.next_cursor ?? undefined;
  } while (cursor);
  return events;
}
