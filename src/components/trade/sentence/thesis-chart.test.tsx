import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceDomain, ThesisChart } from "./thesis-chart";

vi.mock("lightweight-charts", () => {
  const noop = () => {};
  return {
    createChart: () => ({
      addSeries: () => ({ setData: noop, createPriceLine: () => ({}), removePriceLine: noop, priceToCoordinate: () => null }),
      remove: noop,
      applyOptions: noop,
      timeScale: () => ({ fitContent: noop, setVisibleRange: noop, setVisibleLogicalRange: noop, getVisibleLogicalRange: () => null, timeToCoordinate: () => null }),
    }),
    AreaSeries: class {},
    ColorType: { Solid: "solid" },
    LineStyle: { Dashed: 0 },
  };
});

const now = 1_800_000_000;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockHistory(points: Array<[number, number]>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, points })));
}

const props = {
  symbol: "SOL",
  spot: 100,
  strike: 95,
  expiryMs: (now + 7 * 86400) * 1000,
  right: { title: "Keep 104.50 USDC", premium: "1.10 USDC" },
  wrong: { title: "Buy 1.1 SOL at $95", premium: "1.10 USDC" },
};

describe("thesis chart", () => {
  it("labels the strike and both outcomes over a day of history", async () => {
    const fetch = mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<ThesisChart {...props} direction="above" />);
    expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=1d");
    expect(screen.getByText("Your price $95")).toBeTruthy();
    expect(screen.getByText("Keep 104.50 USDC")).toBeTruthy();
    expect(screen.getByText("Buy 1.1 SOL at $95")).toBeTruthy();
    expect(screen.getByText(/If you are right: Keep 104\.50 USDC\. If you are wrong: Buy 1\.1 SOL at \$95\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("SOL price history. Use the arrow keys to read prices.")).toBeTruthy());
  });

  it("still shows the outcome zones when there is no price history", async () => {
    mockHistory([]);
    render(<ThesisChart {...props} direction="below" />);
    await waitFor(() => expect(screen.getByText("Price history unavailable")).toBeTruthy());
    expect(screen.getByText("Keep 104.50 USDC")).toBeTruthy();
    expect(screen.getByText("Your price $95")).toBeTruthy();
  });
});

describe("price domain", () => {
  it("covers every value with padding", () => {
    const [lo, hi] = priceDomain([90, 110], null);
    expect(lo).toBeLessThan(90);
    expect(hi).toBeGreaterThan(110);
  });

  it("keeps a far strike off the edges so both zones have room", () => {
    for (const strike of [60, 95, 140]) {
      const [lo, hi] = priceDomain([98, 102], strike);
      const position = (strike - lo) / (hi - lo);
      expect(position).toBeGreaterThanOrEqual(0.379);
      expect(position).toBeLessThanOrEqual(0.621);
    }
  });

  it("never goes below zero", () => {
    expect(priceDomain([0.00002, 0.00003], 0.000001)[0]).toBeGreaterThanOrEqual(0);
  });
});
