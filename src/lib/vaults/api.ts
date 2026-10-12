import { VaultHttpClient } from "@acta-markets/ts-sdk/http";
import type { VaultPageQuery, VaultPositionsQuery } from "@acta-markets/ts-sdk/http";
import { getRfqBackendUrl } from "@/lib/rfq-client";

export { VaultApiError } from "@acta-markets/ts-sdk/http";
export type { VaultPageQuery, VaultPositionsQuery } from "@acta-markets/ts-sdk/http";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const ws = new URL(getRfqBackendUrl());
  const protocol = ws.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${ws.host}`;
}

const client = () => new VaultHttpClient({ baseUrl: getApiBaseUrl() });

export const fetchVaults = (signal?: AbortSignal) => client().vaults(signal);
export const fetchVault = (pda: string, signal?: AbortSignal) => client().vault(pda, signal);
export const fetchVaultPositions = (pda: string, query?: VaultPositionsQuery, signal?: AbortSignal) =>
  client().vaultPositions(pda, query, signal);
export const fetchVaultCycles = (pda: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().vaultCycles(pda, query, signal);
export const fetchVaultDepositor = (pda: string, wallet: string, signal?: AbortSignal) =>
  client().vaultDepositor(pda, wallet, signal);
export const fetchVaultDepositorHistory = (pda: string, wallet: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().vaultDepositorHistory(pda, wallet, query, signal);
export const fetchDepositorPortfolio = (wallet: string, signal?: AbortSignal) =>
  client().depositorPortfolio(wallet, signal);
export const fetchDepositorHistory = (wallet: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().depositorHistory(wallet, query, signal);
export const fetchVaultDepositRequests = (pda: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().vaultDepositRequests(pda, query, signal);
export const fetchVaultWithdrawRequests = (pda: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().vaultWithdrawRequests(pda, query, signal);
