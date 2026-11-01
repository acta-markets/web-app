import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeClient } from "./trade-client";

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  getEarnSummary: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => mocks.context }));

function descriptor({ pda, isPut, products, expiry = 1_900_000_000 }: {
  pda: string;
  isPut: boolean;
  products: string[];
  expiry?: number;
}) {
  return {
    underlying_symbol: "SOL",
    products,
    market: { market_pda: pda, is_put: isPut, expiry_ts: expiry },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context = {
    earnSummary: [],
    marketDescriptors: [],
    connectionState: "connected",
    getEarnSummary: mocks.getEarnSummary,
  };
});

afterEach(cleanup);

describe("Trade cash-settled discovery", () => {
  it("surfaces only supported call/put products with direct market links", () => {
    mocks.context.marketDescriptors = [
      descriptor({ pda: "call", isPut: false, products: ["covered_call", "call_spread", "cash_put"] }),
      descriptor({ pda: "put", isPut: true, products: ["cash_secured_put", "put_spread", "cash_put", "call_spread"] }),
      descriptor({ pda: "old", isPut: true, expiry: 1, products: ["put_spread", "cash_put"] }),
    ];

    render(<TradeClient />);
    expect(screen.getByRole("heading", { name: "Cash-settled" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /SOL Sell Call Spread/ }).getAttribute("href")).toBe("/market/SOL?product=call_spread&market=call");
    expect(screen.getByRole("link", { name: /SOL Sell Put Spread/ }).getAttribute("href")).toBe("/market/SOL?product=put_spread&market=put");
    expect(screen.getByRole("link", { name: /SOL Cash Put/ }).getAttribute("href")).toBe("/market/SOL?product=cash_put&market=put");
    expect(mocks.getEarnSummary).toHaveBeenCalledOnce();
  });

  it("does not render cash-settled entry points for physical-only descriptors", () => {
    mocks.context.marketDescriptors = [
      descriptor({ pda: "call", isPut: false, products: ["covered_call"] }),
      descriptor({ pda: "put", isPut: true, products: ["cash_secured_put"] }),
    ];

    render(<TradeClient />);
    expect(screen.queryByRole("heading", { name: "Cash-settled" })).toBeNull();
  });
});
