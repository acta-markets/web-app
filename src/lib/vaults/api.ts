import { ActaHttpClient } from "@acta-markets/ts-sdk/http";
import type { VaultPageQuery, VaultPositionsQuery } from "@acta-markets/ts-sdk/http";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { cycleView, depositRequestView, depositorView, exposureView, positionView, vaultView, withdrawRequestView } from "./view";

export { ActaHttpError } from "@acta-markets/ts-sdk/http";
export type { VaultPageQuery, VaultPositionsQuery } from "@acta-markets/ts-sdk/http";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const ws = new URL(getRfqBackendUrl());
  const protocol = ws.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${ws.host}`;
}

let httpClient: ActaHttpClient | null = null;
const client = () => (httpClient ??= new ActaHttpClient({ baseUrl: getApiBaseUrl() }));

export const fetchVaults = async (signal?: AbortSignal) => (await client().vaults(signal)).map(vaultView);
export const fetchTokens = (signal?: AbortSignal) => client().tokens(signal);
export const fetchVault = async (pda: string, signal?: AbortSignal) => {
  const vault = await client().vault(pda, signal);
  return vault && vaultView(vault);
};
export const fetchVaultExposure = async (pda: string, signal?: AbortSignal) => exposureView(await client().vaultExposure(pda, signal));
export const fetchUnsettledVaultPositions = async (pda: string, signal?: AbortSignal) =>
  (await client().unsettledVaultPositions(pda, signal)).map(positionView);
export const fetchVaultPositions = async (pda: string, query?: VaultPositionsQuery, signal?: AbortSignal) => {
  const page = await client().vaultPositions(pda, query, signal);
  return { ...page, positions: page.positions.map(positionView) };
};
export const fetchVaultCycles = async (pda: string, query?: VaultPageQuery, signal?: AbortSignal) => {
  const page = await client().vaultCycles(pda, query, signal);
  return { ...page, cycles: page.cycles.map(cycleView) };
};
export const fetchVaultDepositor = async (pda: string, wallet: string, signal?: AbortSignal) =>
  depositorView(await client().vaultDepositor(pda, wallet, signal));
export const fetchVaultDepositorHistory = (pda: string, wallet: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().vaultDepositorHistory(pda, wallet, query, signal);
export const fetchDepositorPortfolio = async (wallet: string, signal?: AbortSignal) => {
  const portfolio = await client().depositorPortfolio(wallet, signal);
  return { ...portfolio, vaults: portfolio.vaults.map(depositorView) };
};
export const fetchDepositorHistory = (wallet: string, query?: VaultPageQuery, signal?: AbortSignal) =>
  client().depositorHistory(wallet, query, signal);
export const fetchVaultDepositRequests = async (pda: string, query?: VaultPageQuery, signal?: AbortSignal) => {
  const page = await client().vaultDepositRequests(pda, query, signal);
  return { ...page, requests: page.requests.map(depositRequestView) };
};
export const fetchVaultWithdrawRequests = async (pda: string, query?: VaultPageQuery, signal?: AbortSignal) => {
  const page = await client().vaultWithdrawRequests(pda, query, signal);
  return { ...page, requests: page.requests.map(withdrawRequestView) };
};
