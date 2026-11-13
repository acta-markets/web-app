import type { MarketDescriptorInfo } from "@/lib/rfq-client";
import type { SpreadProduct } from "@/lib/spreads";

export type CashSettledProduct = SpreadProduct | "cash_put";

function isPutProduct(product: CashSettledProduct) {
  return product !== "call_spread";
}

/** A product is actionable only when the matching descriptor advertises it and has not expired. */
export function descriptorSupportsCashProduct(
  descriptor: MarketDescriptorInfo,
  product: CashSettledProduct,
  nowMs = Date.now(),
) {
  const expiryTs = Number(descriptor.market_descriptor.expiry_ts);
  return Number.isFinite(expiryTs)
    && expiryTs * 1000 > nowMs
    && descriptor.market_descriptor.is_put === isPutProduct(product)
    && descriptor.products.includes(product);
}
