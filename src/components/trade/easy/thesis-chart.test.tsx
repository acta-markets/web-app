import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceDomain, ThesisChart } from "./thesis-chart";

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
  it("labels the strike and both outcomes over a week of history", async () => {
    const fetch = mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<ThesisChart {...props} direction="above" />);
    expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=1w");
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

  /** feeds the chosen strike back in like EasyTrade does, so a drag or keypress moves the tag for real */
  function DraggableChart() {
    const [strikeChoice, setStrikeChoice] = useState(95e9);
    return (
      <ThesisChart
        {...props}
        direction="above"
        strike={strikeChoice / 1e9}
        strikeOptions1e9={[90e9, 95e9, 100e9]}
        onStrikeChange={setStrikeChoice}
      />
    );
  }

  it("drags the your-price tag to the nearest listed strike", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<DraggableChart />);
    const tag = await waitFor(() => screen.getByRole("slider", { name: "Your price" }));
    expect(tag.getAttribute("aria-valuenow")).toBe("95000000000");

    // jsdom frames sit at 0,0 with the 640px fallback width, so clientY maps straight to plot y
    fireEvent.pointerDown(tag, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(tag, { clientY: 200 });
    expect(tag.getAttribute("aria-valuenow")).toBe("90000000000");
    expect(screen.getByText("Your price $90")).toBeTruthy();
    fireEvent.pointerMove(tag, { clientY: 20 });
    expect(tag.getAttribute("aria-valuenow")).toBe("100000000000");
    fireEvent.pointerUp(tag, { pointerId: 1 });
    expect(screen.getByText("Your price $100")).toBeTruthy();
  });

  it("steps the your-price tag with the arrow keys", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<DraggableChart />);
    const tag = await waitFor(() => screen.getByRole("slider", { name: "Your price" }));

    fireEvent.keyDown(tag, { key: "ArrowUp" });
    expect(tag.getAttribute("aria-valuenow")).toBe("100000000000");
    fireEvent.keyDown(tag, { key: "ArrowDown" });
    expect(tag.getAttribute("aria-valuenow")).toBe("95000000000");
    fireEvent.keyDown(tag, { key: "ArrowDown" });
    expect(tag.getAttribute("aria-valuenow")).toBe("90000000000");
  });

  it("keeps the axis stable once a far drag widened it", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<DraggableChart />);
    const tag = await waitFor(() => screen.getByRole("slider", { name: "Your price" }));
    const axisTicks = () =>
      screen.getAllByText(/^\$[\d,.]+$/).map((el) => `${el.textContent}@${(el as HTMLElement).style.top}`);

    // drag to the bottom strike and release: the axis widens once to make room for it
    fireEvent.pointerDown(tag, { pointerId: 1, button: 0, clientY: 130 });
    fireEvent.pointerMove(tag, { clientY: 400 });
    fireEvent.pointerUp(tag, { pointerId: 1 });
    expect(screen.getByText("Your price $90")).toBeTruthy();
    const widened = axisTicks();

    // stepping back to a nearer strike must not re-anchor the axis
    fireEvent.keyDown(tag, { key: "ArrowUp" });
    expect(screen.getByText("Your price $95")).toBeTruthy();
    expect(axisTicks()).toEqual(widened);
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
