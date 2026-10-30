import { getTokenSymbolByMint, tokenDisplayName } from "@/lib/tokens";
import { shortAddress } from "./format";
import { VAULTS_SAMPLE_MODE, peekSampleData } from "./sample";
import type { Vault } from "./types";

/**
 * Display metadata: the backend's operator-curated `metadata`, then sample-mode
 * fixtures keyed by vault PDA, then fallbacks that never invent anything.
 */

export type VaultCategory = "Crypto" | "Stocks" | "Stables";
export const VAULT_CATEGORIES: readonly VaultCategory[] = ["Crypto", "Stocks", "Stables"];
export type CategoryFilter = "all" | VaultCategory;

export type VaultMeta = {
  name: string;
  curator: string;
  /** derived from the deposit asset when omitted */
  category?: VaultCategory;
  /** for deposit mints the token list does not know */
  assetSymbol?: string;
  description?: string;
  /**
   * Yearly staking yield of the deposit asset itself (jitoSOL and other LSTs), in
   * percent. The vault's share price is denominated in the asset, so it misses
   * this part; the headline APY adds it to the vault's premium.
   */
  stakingAprPct?: number;
};

const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDS", "USDG", "FDUSD", "DAI", "EURC", "USDE", "USDH"]);
// Tokenized equities: NVDAx style (xStocks) or xNVDA style. Case-sensitive, so XRP stays out.
const TOKENIZED_STOCK = /^[A-Z]{1,5}x$|^x[A-Z]{1,5}$/;
// tokenized equities whose tickers follow no pattern
const STOCKS = new Set(["SPCX"]);

/** Stablecoins and tokenized stocks are recognised by symbol; every other asset is crypto. */
export function deriveCategory(symbol: string | undefined): VaultCategory {
  if (symbol && STABLES.has(symbol.toUpperCase())) return "Stables";
  if (symbol && (TOKENIZED_STOCK.test(symbol) || STOCKS.has(symbol.toUpperCase()))) return "Stocks";
  return "Crypto";
}

// Fixture names come from sample-data.json, which source.ts loads before any vault renders.
function activeRegistry(): Readonly<Record<string, VaultMeta>> {
  return (VAULTS_SAMPLE_MODE && peekSampleData()?.meta) || {};
}

export function getRegisteredVaultMeta(pda: string): VaultMeta | undefined {
  return activeRegistry()[pda];
}

export type ResolvedVaultMeta = {
  name: string;
  curator: string;
  /** true when the curator is the governance address, not a registered name */
  curatorIsAddress: boolean;
  category: VaultCategory;
  assetSymbol: string;
  /** false when the deposit mint is unknown and assetSymbol is a labelled mint address */
  assetKnown: boolean;
  registered: boolean;
  strategy?: string;
  description?: string;
  website?: string;
  twitter?: string;
  logoUrl?: string;
  /** 0 unless the registry gives the deposit asset's own staking yield */
  stakingAprPct: number;
};

export function resolveVaultMeta(
  vault: Pick<Vault, "vault_pda" | "main_mint" | "governance" | "metadata"> & Partial<Pick<Vault, "second_mint">>,
  registry: Readonly<Record<string, VaultMeta>> = activeRegistry(),
): ResolvedVaultMeta {
  const meta = registry[vault.vault_pda];
  const served = vault.metadata;
  const curator = served?.curator ?? meta?.curator;
  const knownSymbol = meta?.assetSymbol ?? getTokenSymbolByMint(vault.main_mint);
  const legs = [knownSymbol ?? tokenDisplayName(vault.main_mint)];
  if (vault.second_mint && vault.second_mint !== vault.main_mint) legs.push(tokenDisplayName(vault.second_mint));
  return {
    name: served?.name ?? meta?.name ?? `${legs.join(" / ")} vault · ${shortAddress(vault.vault_pda)}`,
    curator: curator ?? shortAddress(vault.governance),
    curatorIsAddress: curator === undefined,
    category: meta?.category ?? deriveCategory(knownSymbol),
    assetSymbol: knownSymbol ?? tokenDisplayName(vault.main_mint),
    assetKnown: knownSymbol !== undefined,
    registered: served !== undefined || meta !== undefined,
    strategy: served?.strategy,
    description: served?.description ?? meta?.description,
    website: httpsUrl(served?.website),
    twitter: served?.twitter && X_HANDLE.test(served.twitter) ? served.twitter : undefined,
    logoUrl: httpsUrl(served?.logo_url),
    stakingAprPct: meta?.stakingAprPct ?? 0,
  };
}

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

function httpsUrl(value: string | undefined): string | undefined {
  return value && /^https:\/\/\S+$/.test(value) ? value : undefined;
}

export function categorySlug(category: VaultCategory): string {
  return category.toLowerCase();
}

export function parseCategoryParam(value: string | string[] | undefined): CategoryFilter {
  const raw = (Array.isArray(value) ? value[0] : value)?.toLowerCase();
  return VAULT_CATEGORIES.find((c) => categorySlug(c) === raw) ?? "all";
}

export function categoryHref(filter: CategoryFilter): string {
  return filter === "all" ? "/earn" : `/earn?category=${categorySlug(filter)}`;
}
