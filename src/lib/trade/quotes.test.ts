// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { QuoteReceivedMessage } from "@acta-markets/ts-sdk/ws";
import { beatsQuote, bestQuote, isFillable, quotePrice } from "./quotes";

function quote(over: Record<string, unknown>): QuoteReceivedMessage {
  return {
    rfq_id: "rfq",
    terms: { type: "cash_secured_put", strike: "100000000000" },
    side: "sell",
    maker_owner: "maker",
    price: "1000",
    net_price: "900",
    valid_until: 1_000,
    nonce: 1n,
    order_id: "00",
    ...over,
  } as QuoteReceivedMessage;
}

describe("quote ranking", () => {
  it("a seller takes the most it keeps after the fee", () => {
    const high = quote({ price: "1000", net_price: "980" });
    const low = quote({ price: "1100", net_price: "950" });
    expect(beatsQuote(high, low)).toBe(true);
    expect(bestQuote([low, high])).toBe(high);
  });

  it("a buyer takes the lowest gross price, whatever net_price says", () => {
    const cheap = quote({ side: "buy", price: "900", net_price: "999" });
    const dear = quote({ side: "buy", price: "950", net_price: "1" });
    expect(bestQuote([dear, cheap])).toBe(cheap);
  });

  it("a cash-settled product is ranked on its gross price", () => {
    const spread = quote({ terms: { type: "put_spread", lower_strike: "1", upper_strike: "2" }, price: "500", net_price: "1" });
    expect(quotePrice(spread)).toBe(500);
  });

  it("keeps only the quotes the filter lets through, and none is null", () => {
    const a = quote({ maker_owner: "a", net_price: "990" });
    const b = quote({ maker_owner: "b", net_price: "900" });
    expect(bestQuote([a, b], (q) => q.maker_owner === "b")).toBe(b);
    expect(bestQuote([a, b], () => false)).toBeNull();
    expect(bestQuote([])).toBeNull();
  });
});

describe("isFillable", () => {
  it("a quote dies the settlement buffer before its valid_until", () => {
    const q = { valid_until: 1_000 };
    expect(isFillable(q, 949, 50)).toBe(true);
    expect(isFillable(q, 950, 50)).toBe(false);
    expect(isFillable(q, 990, 0)).toBe(true);
  });

  it("leaves the margin a signature needs", () => {
    expect(isFillable({ valid_until: 1_000 }, 940, 50, 5)).toBe(true);
    expect(isFillable({ valid_until: 1_000 }, 946, 50, 5)).toBe(false);
  });
});
