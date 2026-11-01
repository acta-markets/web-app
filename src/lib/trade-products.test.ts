import { describe, expect, it } from "vitest";
import { cashSettledMarketRows, descriptorSupportsCashProduct } from "./trade-products";

const now = 1_800_000_000_000;

function descriptor({
  symbol = "SOL",
  pda,
  isPut,
  expiry = now / 1000 + 86400,
  products,
}: {
  symbol?: string;
  pda: string;
  isPut: boolean;
  expiry?: number;
  products: string[];
}) {
  return {
    underlying_symbol: symbol,
    products,
    market: { market_pda: pda, is_put: isPut, expiry_ts: expiry },
  } as any;
}

describe("cash-settled trade discovery", () => {
  it("only exposes unexpired products on the matching call or put market", () => {
    const call = descriptor({ pda: "call", isPut: false, products: ["covered_call", "call_spread", "cash_put"] });
    const put = descriptor({ pda: "put", isPut: true, products: ["cash_secured_put", "put_spread", "cash_put", "call_spread"] });
    const expired = descriptor({ pda: "expired", isPut: true, expiry: now / 1000 - 1, products: ["put_spread", "cash_put"] });

    expect(descriptorSupportsCashProduct(call, "call_spread", now)).toBe(true);
    expect(descriptorSupportsCashProduct(call, "cash_put", now)).toBe(false);
    expect(descriptorSupportsCashProduct(put, "put_spread", now)).toBe(true);
    expect(descriptorSupportsCashProduct(put, "call_spread", now)).toBe(false);
    expect(descriptorSupportsCashProduct(expired, "cash_put", now)).toBe(false);

    expect(cashSettledMarketRows([call, put, expired], now)).toEqual([
      { asset: "SOL", product: "call_spread", expiryTs: now / 1000 + 86400, marketPda: "call" },
      { asset: "SOL", product: "cash_put", expiryTs: now / 1000 + 86400, marketPda: "put" },
      { asset: "SOL", product: "put_spread", expiryTs: now / 1000 + 86400, marketPda: "put" },
    ]);
  });

  it("uses the nearest expiry for each asset/product entry", () => {
    const near = descriptor({ pda: "near", isPut: false, expiry: now / 1000 + 3600, products: ["call_spread"] });
    const later = descriptor({ pda: "later", isPut: false, expiry: now / 1000 + 86400, products: ["call_spread"] });

    expect(cashSettledMarketRows([later, near], now)).toEqual([
      { asset: "SOL", product: "call_spread", expiryTs: now / 1000 + 3600, marketPda: "near" },
    ]);
  });
});
