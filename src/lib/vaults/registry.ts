import { getTokenSymbolByMint } from "@/lib/tokens";
import { shortAddress } from "./format";
import { VAULTS_SAMPLE_MODE, peekSampleData } from "./sample";
import type { Vault } from "./types";

/**
 * Display metadata the backend does not serve yet: name, curator and
 * category, keyed by vault PDA. Unregistered vaults still render, with
 * fallbacks that never invent anything.
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
   * this part; the headline APR adds it to the vault's premium.
   */
  stakingAprPct?: number;
};

export const VAULT_REGISTRY: Readonly<Record<string, VaultMeta>> = {
  // TODO(tim): confirm the display name. Curator follows LANDING_VAULTS, where Acta
  // runs the SOL vault; governance is 9amKA1ezPyPoYik7N1QCBE4N3d9mm2fQfmFfLNbSSbUf.
  "3irb63eaXBmm3bvUY7hvpFHnXzeaFZSvtsirPMsfctuS": { name: "SOL vault", curator: "Acta", category: "Crypto" },
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
  if (!VAULTS_SAMPLE_MODE) return VAULT_REGISTRY;
  return { ...peekSampleData()?.meta, ...VAULT_REGISTRY };
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
  /** false when the deposit mint is unknown and assetSymbol is a short address */
  assetKnown: boolean;
  registered: boolean;
  description?: string;
  /** 0 unless the registry gives the deposit asset's own staking yield */
  stakingAprPct: number;
};

export function resolveVaultMeta(
  vault: Pick<Vault, "vault_pda" | "main_mint" | "governance">,
  registry: Readonly<Record<string, VaultMeta>> = activeRegistry(),
): ResolvedVaultMeta {
  const meta = registry[vault.vault_pda];
  const knownSymbol = meta?.assetSymbol ?? getTokenSymbolByMint(vault.main_mint);
  return {
    name: meta?.name ?? (knownSymbol ? `${knownSymbol} vault` : `Vault ${shortAddress(vault.vault_pda)}`),
    curator: meta?.curator ?? shortAddress(vault.governance),
    curatorIsAddress: !meta,
    category: meta?.category ?? deriveCategory(knownSymbol),
    assetSymbol: knownSymbol ?? shortAddress(vault.main_mint),
    assetKnown: knownSymbol !== undefined,
    registered: meta !== undefined,
    description: meta?.description,
    stakingAprPct: meta?.stakingAprPct ?? 0,
  };
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
