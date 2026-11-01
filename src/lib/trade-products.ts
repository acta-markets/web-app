import type { MarketDescriptorInfo } from "@/lib/rfq-client";
import type { SpreadProduct } from "@/lib/spreads";
import { normalizeTokenSymbol } from "@/lib/tokens";

export type CashSettledProduct = SpreadProduct | "cash_put";

export const CASH_SETTLED_PRODUCTS: readonly CashSettledProduct[] = [
  "call_spread",
  "put_spread",
  "cash_put",
];

export type CashSettledMarketRow = {
  asset: string;
  product: CashSettledProduct;
  expiryTs: number;
  marketPda: string;
};

function isPutProduct(product: CashSettledProduct) {
  return product !== "call_spread";
}

/** A product is actionable only when the matching descriptor advertises it and has not expired. */
export function descriptorSupportsCashProduct(
  descriptor: MarketDescriptorInfo,
  product: CashSettledProduct,
  nowMs = Date.now(),
) {
  const expiryTs = Number(descriptor.market.expiry_ts);
  return Number.isFinite(expiryTs)
    && expiryTs * 1000 > nowMs
    && descriptor.market.is_put === isPutProduct(product)
    && descriptor.products.includes(product);
}

/** One nearest-expiry entry per asset and cash-settled product for the Trade page. */
export function cashSettledMarketRows(
  descriptors: readonly MarketDescriptorInfo[],
  nowMs = Date.now(),
): CashSettledMarketRow[] {
  const rows = new Map<string, CashSettledMarketRow>();

  for (const descriptor of descriptors) {
    const asset = normalizeTokenSymbol(descriptor.underlying_symbol);
    if (!asset) continue;
    const expiryTs = Number(descriptor.market.expiry_ts);

    for (const product of CASH_SETTLED_PRODUCTS) {
      if (!descriptorSupportsCashProduct(descriptor, product, nowMs)) continue;
      const key = `${asset}:${product}`;
      const candidate: CashSettledMarketRow = {
        asset,
        product,
        expiryTs,
        marketPda: descriptor.market.market_pda,
      };
      const current = rows.get(key);
      if (!current || candidate.expiryTs < current.expiryTs) rows.set(key, candidate);
    }
  }

  return [...rows.values()].sort((a, b) => a.asset.localeCompare(b.asset)
    || a.product.localeCompare(b.product)
    || a.expiryTs - b.expiryTs);
}
