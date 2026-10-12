import { getTokenSymbolByMint } from "@/lib/tokens";
import { shortAddress } from "./format";
import { SAMPLE_VAULT_META, VAULTS_SAMPLE_MODE } from "./sample";
import type { Vault } from "./types";

/**
 * Display metadata the backend does not serve yet: name, curator and
 * category, keyed by vault PDA. Unregistered vaults still render, with
 * fallbacks that never invent anything.
 */

export type VaultCategory = "Majors" | "Stables" | "Stocks" | "Other";
export const VAULT_CATEGORIES: readonly VaultCategory[] = ["Majors", "Stables", "Stocks", "Other"];
export type CategoryFilter = "all" | VaultCategory;

export type VaultMeta = {
  name: string;
  curator: string;
  /** derived from the deposit asset when omitted */
  category?: VaultCategory;
  /** for deposit mints the token list does not know */
  assetSymbol?: string;
  description?: string;
};

export const VAULT_REGISTRY: Readonly<Record<string, VaultMeta>> = {
  // TODO(tim): confirm the display name. Curator follows LANDING_VAULTS, where Acta
  // runs the SOL vault; governance is 9amKA1ezPyPoYik7N1QCBE4N3d9mm2fQfmFfLNbSSbUf.
  "3irb63eaXBmm3bvUY7hvpFHnXzeaFZSvtsirPMsfctuS": { name: "SOL vault", curator: "Acta", category: "Majors" },
};

const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDS", "USDG", "FDUSD", "DAI", "EURC", "USDE", "USDH"]);
const MAJORS = new Set([
  "SOL",
  "WSOL",
  "JITOSOL",
  "MSOL",
  "BSOL",
  "JUPSOL",
  "INF",
  "BNSOL",
  "BTC",
  "ZBTC",
  "CBBTC",
  "WBTC",
  "TBTC",
  "ETH",
  "WETH",
  "JLP",
]);
// Tokenized equities: xTSLA style or TSLAx style. Case-sensitive, so XRP stays out.
const TOKENIZED_STOCK = /^x[A-Z]{1,5}$|^[A-Z]{1,5}x$/;

export function deriveCategory(symbol: string | undefined): VaultCategory {
  if (!symbol) return "Other";
  const upper = symbol.toUpperCase();
  if (STABLES.has(upper)) return "Stables";
  if (MAJORS.has(upper)) return "Majors";
  if (TOKENIZED_STOCK.test(symbol)) return "Stocks";
  return "Other";
}

function activeRegistry(): Readonly<Record<string, VaultMeta>> {
  return VAULTS_SAMPLE_MODE ? { ...SAMPLE_VAULT_META, ...VAULT_REGISTRY } : VAULT_REGISTRY;
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
