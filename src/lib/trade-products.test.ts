import { describe, expect, it } from "vitest";
import { descriptorSupportsCashProduct } from "./trade-products";

const now = 1_800_000_000_000;

function descriptor({
  pda,
  isPut,
  expiry = now / 1000 + 86400,
  products,
}: {
  pda: string;
  isPut: boolean;
  expiry?: number;
  products: string[];
}) {
  return {
    products,
    market: { market_pda: pda, is_put: isPut, expiry_ts: expiry },
  } as any;
}

describe("cash-settled product support", () => {
  it("only exposes unexpired products on the matching call or put market", () => {
    const call = descriptor({ pda: "call", isPut: false, products: ["covered_call", "call_spread", "cash_put"] });
    const put = descriptor({ pda: "put", isPut: true, products: ["cash_secured_put", "put_spread", "cash_put", "call_spread"] });
    const expired = descriptor({ pda: "expired", isPut: true, expiry: now / 1000 - 1, products: ["put_spread", "cash_put"] });

    expect(descriptorSupportsCashProduct(call, "call_spread", now)).toBe(true);
    expect(descriptorSupportsCashProduct(call, "cash_put", now)).toBe(false);
    expect(descriptorSupportsCashProduct(put, "put_spread", now)).toBe(true);
    expect(descriptorSupportsCashProduct(put, "call_spread", now)).toBe(false);
    expect(descriptorSupportsCashProduct(expired, "cash_put", now)).toBe(false);
  });
});
