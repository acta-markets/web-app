import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTops, optionPayout, pnlAtPrice, priceDomain, profitAtPrice, projectionPath, projectionWiggle, rangeForExpiry, returnPctAtPrice, scenarioEndpoints, ThesisChart, zoneLabelY } from "./thesis-chart";

const setData = vi.hoisted(() => vi.fn());
/** The price under a pane y; null (the default) is a chart with no scale to read yet. */
const coordinateToPrice = vi.hoisted(() => vi.fn<(y: number) => number | null>(() => null));
const priceToCoordinate = vi.hoisted(() => vi.fn<(price: number) => number | null>(() => null));

vi.mock("lightweight-charts", () => {
  const noop = () => {};
  return {
    createChart: () => ({
      addSeries: () => ({ setData, createPriceLine: () => ({}), removePriceLine: noop, priceToCoordinate, coordinateToPrice }),
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
  coordinateToPrice.mockReset();
  coordinateToPrice.mockImplementation(() => null);
  priceToCoordinate.mockReset();
  priceToCoordinate.mockImplementation(() => null);
});

function mockHistory(points: Array<[number, number]>) {
  // a fresh Response per call: a body can be read only once
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: true, points })));
}

const props = {
  symbol: "SOL",
  spot: 100,
  strike: 95,
  expiryMs: (now + 7 * 86400) * 1000,
  side: "sell" as const,
  right: { title: "Keep 104.50 USDC", premium: "1.10 USDC" },
  wrong: { title: "Buy 1.1 SOL at $95", premium: "1.10 USDC" },
};

describe("thesis chart", () => {
  it("labels the strike and both outcomes, and the expiry auto-picks the week of history", async () => {
    const fetch = mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<ThesisChart {...props} direction="above" />);
    // a 7-day expiry defaults to a week of history, not a day
    expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=1w");
    expect(screen.getByText(/Strike \$95/)).toBeTruthy();
    expect(screen.getByText("Keep 104.50 USDC")).toBeTruthy();
    expect(screen.getByText("Buy 1.1 SOL at $95")).toBeTruthy();
    expect(screen.getByText(/If you are right: Keep 104\.50 USDC\. If you are wrong: Buy 1\.1 SOL at \$95\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("SOL price history. Use the arrow keys to read prices.")).toBeTruthy());
  });

  it("lets the scale buttons override the range without touching the expiry", async () => {
    const fetch = mockHistory([[(now - 86400) * 1000, 98], [(now - 43200) * 1000, 100]]);
    render(<ThesisChart {...props} direction="above" />);
    expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=1w");
    fireEvent.click(screen.getByRole("tab", { name: "3M" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=3m"));
    // the override only changes the window, never the strike date
    expect(screen.getByText(/Strike \$95/)).toBeTruthy();
  });

  it("ends the line at the live price, so a lagging history cannot leave the NOW tag off the line", async () => {
    // the history stops two days ago at 80 while the live price is 100
    mockHistory([[(now - 3 * 86400) * 1000, 82], [(now - 2 * 86400) * 1000, 80]]);
    const { rerender } = render(<ThesisChart {...props} direction="above" />);
    const lastPoint = () => (setData.mock.calls.at(-1)?.[0] as Array<{ time: number; value: number }>).at(-1);
    await waitFor(() => expect(lastPoint()).toEqual({ time: now, value: 100 }));
    // a price tick moves that point's value, never its time
    rerender(<ThesisChart {...props} spot={103} direction="above" />);
    await waitFor(() => expect(lastPoint()).toEqual({ time: now, value: 103 }));
  });

  it("still shows the outcome zones when there is no price history", async () => {
    mockHistory([]);
    render(<ThesisChart {...props} direction="below" />);
    await waitFor(() => expect(screen.getByText("Price history unavailable")).toBeTruthy());
    expect(screen.getByText("Keep 104.50 USDC")).toBeTruthy();
    expect(screen.getByText(/Strike \$95/)).toBeTruthy();
  });

  it("marks the two zones as the ticket marks its outcomes: a check where the user is right, a red cross where they are wrong", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { container, rerender } = render(<ThesisChart {...props} direction="above" />);
    await waitFor(() => expect(container.querySelectorAll("[data-zone-mark]")).toHaveLength(2));
    const chips = () => [...container.querySelectorAll("[data-zone-mark]")].map((mark) => [mark.getAttribute("data-zone-mark"), mark.parentElement!.textContent, mark.getAttribute("class")]);
    // above: the right zone is the upper one, so it comes first (the fixture is in Yield mode)
    let [first, second] = chips();
    expect(first.slice(0, 2)).toEqual(["right", "YIELD ZONE"]);
    expect(first[2]).toContain("text-additional-green-primary-deep");
    expect(second[0]).toBe("wrong");
    expect(second[2]).toContain("text-additional-red-primary");
    // the typed tick is gone: the mark is the icon, on both
    expect(container.textContent).not.toContain("✓");
    // flipped, the cross moves to the upper zone with the words it belongs to
    rerender(<ThesisChart {...props} direction="below" />);
    [first, second] = chips();
    expect(first[0]).toBe("wrong");
    expect(second.slice(0, 2)).toEqual(["right", "YIELD ZONE"]);
  });

  it("names the right zone after the mode: profit in Profit, yield in Yield", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { container, rerender } = render(<ThesisChart {...props} direction="above" side="buy" />);
    const right = () => container.querySelector('[data-zone-mark="right"]')?.parentElement?.textContent;
    await waitFor(() => expect(right()).toBe("PROFIT ZONE"));
    rerender(<ThesisChart {...props} direction="above" side="sell" />);
    expect(right()).toBe("YIELD ZONE");
    expect(container.textContent).not.toContain("PROFIT ZONE");
  });

  it("draws a held position read-only: nothing to flip or drag, no example paths, the expiry in a tag of its own", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { container } = render(<ThesisChart {...props} direction="above" readOnly />);
    await waitFor(() => expect(container.querySelectorAll("[data-zone-mark]")).toHaveLength(2));
    expect(screen.queryByTestId("chart-flip-surface")).toBeNull();
    expect(screen.queryByRole("button", { name: "Flip direction" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(container.textContent).not.toMatch(/flip it/i);
    // the two example paths into the future are the only round-capped strokes on the plot
    expect(container.querySelectorAll('path[stroke-linecap="round"]')).toHaveLength(0);
    // the plot takes no pointer: without the flip surface over it the library would pan it from under the tags
    expect(screen.getByRole("img", { name: /SOL price history/ }).className).toContain("pointer-events-none");
    expect(screen.getByTestId("chart-expiry-tag").textContent).toMatch(/^[A-Z]{3} \d{1,2}$/);
    // the strike is a plain tag that says what it is
    expect(screen.getByText("STRIKE").parentElement!.textContent).toBe("STRIKE $95");
    // the history window can still be changed
    expect(screen.getByRole("tab", { name: "3M" })).toBeTruthy();
  });

  it("names the expiry of a held position even when the price history did not load", async () => {
    mockHistory([]);
    render(<ThesisChart {...props} direction="above" readOnly />);
    // until the series lands the window says it is on its way; Trade's chart never says this
    expect(screen.getByRole("status").textContent).toBe("Loading price history…");
    await waitFor(() => expect(screen.getByText("Price history unavailable")).toBeTruthy());
    expect(screen.getByTestId("chart-expiry-tag")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps Trade's chart as it was: the expiry tag belongs to the read-only one", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<ThesisChart {...props} direction="above" />);
    await waitFor(() => expect(screen.getByTestId("chart-flip-surface")).toBeTruthy());
    expect(screen.queryByText("Loading price history…")).toBeNull();
    expect(screen.queryByTestId("chart-expiry-tag")).toBeNull();
    expect(screen.getByRole("img", { name: /SOL price history/ }).className).not.toContain("pointer-events-none");
  });

  it("takes the zone words it is given, for an outcome its own would misname", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { container } = render(<ThesisChart {...props} direction="above" readOnly zoneWords={{ right: "YIELD ZONE", wrong: "YOU PAY OUT" }} />);
    await waitFor(() => expect(container.querySelector('[data-zone-mark="wrong"]')?.parentElement?.textContent).toBe("YOU PAY OUT"));
    expect(container.textContent).not.toContain("YOU BUY SOL");
  });

  it("flips direction from the (flip) button and a clean chart tap, ignoring drags", async () => {
    const onDirection = vi.fn();
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { rerender } = render(<ThesisChart {...props} direction="above" onDirection={onDirection} />);
    await waitFor(() => expect(screen.getByTestId("chart-flip-surface")).toBeTruthy());

    // the pane is the control: it takes focus and flips on Enter, above → below
    const keyboardSurface = screen.getByRole("button", { name: "Flip direction" });
    fireEvent.keyDown(keyboardSurface, { key: "Enter" });
    expect(onDirection).toHaveBeenLastCalledWith("below");

    // a clean tap (press + release, no movement) flips too, below → above
    rerender(<ThesisChart {...props} direction="below" onDirection={onDirection} />);
    const surface = screen.getByTestId("chart-flip-surface");
    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(surface, { clientX: 40, clientY: 40 });
    expect(onDirection).toHaveBeenLastCalledWith("above");

    // a drag that moves more than a few px never flips
    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40 });
    fireEvent.pointerMove(surface, { clientX: 140, clientY: 140 });
    fireEvent.pointerUp(surface, { clientX: 140, clientY: 140 });
    expect(onDirection).toHaveBeenCalledTimes(2);

    // the right button is the browser's menu, not a flip
    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40, button: 2 });
    fireEvent.pointerUp(surface, { clientX: 40, clientY: 40, button: 2 });
    expect(onDirection).toHaveBeenCalledTimes(2);
  });

  describe("strike handle", () => {
    const strikes = [90, 95, 100, 105].map((strike) => ({ strike, strike1e9: strike * 1e9 }));

    async function renderHandle() {
      const onStrike = vi.fn();
      mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
      render(<ThesisChart {...props} direction="above" strikes={strikes} onStrike={onStrike} />);
      const handle = await screen.findByRole("slider", { name: "Strike" });
      return { handle, onStrike };
    }

    it("steps the strike while the button is held", async () => {
      const { handle, onStrike } = await renderHandle();
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 0, buttons: 1 });
      expect(screen.getByTestId("strike-hand").getAttribute("data-grabbed")).toBe("true");
      // 18 px a step; up is a higher strike
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180, buttons: 1 });
      expect(onStrike).toHaveBeenLastCalledWith(100 * 1e9);
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 180 });
      expect(screen.getByTestId("strike-hand").getAttribute("data-grabbed")).toBe("false");

      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100, buttons: 0 });
      expect(onStrike).toHaveBeenCalledTimes(1);
    });

    it("puts the line where the pointer is: the price under it picks the nearest strike", async () => {
      // a pane where y 130 is $95 and every pixel up is 10 cents
      coordinateToPrice.mockImplementation((y) => 95 + (130 - y) / 10);
      priceToCoordinate.mockImplementation((price) => 130 - (price - 95) * 10);
      const { handle, onStrike } = await renderHandle();
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 130, button: 0, buttons: 1 });
      // 20 px up is $97: still nearest to 95, nothing moves
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 110, buttons: 1 });
      expect(onStrike).not.toHaveBeenCalled();
      // 60 px up is $101: the 100 strike
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 70, buttons: 1 });
      expect(onStrike).toHaveBeenLastCalledWith(100 * 1e9);
      // far below the lowest strike: the lowest, not past it
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 900, buttons: 1 });
      expect(onStrike).toHaveBeenLastCalledWith(90 * 1e9);
      expect(onStrike).toHaveBeenCalledTimes(2);
    });

    it("does not re-fit the chart when another strike on offer is chosen", async () => {
      mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
      const { rerender } = render(<ThesisChart {...props} direction="above" strikes={strikes} strike={95} />);
      await screen.findByRole("slider", { name: "Strike" });
      await waitFor(() => expect(setData.mock.calls.some(([data]) => data.length > 1)).toBe(true));
      setData.mockClear();
      rerender(<ThesisChart {...props} direction="above" strikes={strikes.map((s) => ({ ...s }))} strike={105} />);
      rerender(<ThesisChart {...props} direction="above" strikes={strikes.map((s) => ({ ...s }))} strike={90} />);
      expect(setData).not.toHaveBeenCalled();
    });

    it("lets go when the release never reaches the page", async () => {
      const { handle, onStrike } = await renderHandle();
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 0, buttons: 1 });
      // no pointerup: a browser menu or another window took it. The mouse comes back with
      // the same pointer id and no button held.
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120, buttons: 0 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 60, buttons: 0 });
      expect(onStrike).not.toHaveBeenCalled();
      expect(screen.getByTestId("strike-hand").getAttribute("data-grabbed")).toBe("false");
    });

    it("lets go when the pointer capture is lost", async () => {
      const { handle, onStrike } = await renderHandle();
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 0, buttons: 1 });
      fireEvent.lostPointerCapture(handle, { pointerId: 1 });
      expect(screen.getByTestId("strike-hand").getAttribute("data-grabbed")).toBe("false");
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120, buttons: 1 });
      expect(onStrike).not.toHaveBeenCalled();
    });

    it("is not picked up by the right button", async () => {
      const { handle, onStrike } = await renderHandle();
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 2, buttons: 2 });
      expect(screen.getByTestId("strike-hand").getAttribute("data-grabbed")).toBe("false");
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120, buttons: 2 });
      expect(onStrike).not.toHaveBeenCalled();
    });
  });
});

describe("range for expiry", () => {
  const nowMs = now * 1000;
  const day = 86400_000;

  it("maps near expiries to a day or week, month-out to a month, further out to three months", () => {
    expect(rangeForExpiry(nowMs + 0.5 * day, nowMs)).toBe("1d");
    expect(rangeForExpiry(nowMs + 2 * day, nowMs)).toBe("1w");
    expect(rangeForExpiry(nowMs + 7 * day, nowMs)).toBe("1w");
    expect(rangeForExpiry(nowMs + 30 * day, nowMs)).toBe("1m");
    expect(rangeForExpiry(nowMs + 60 * day, nowMs)).toBe("3m");
    expect(rangeForExpiry(nowMs + 90 * day, nowMs)).toBe("3m");
  });

  it("never widens beyond the available buckets", () => {
    expect(rangeForExpiry(nowMs + 400 * day, nowMs)).toBe("3m");
    expect(rangeForExpiry(nowMs, nowMs)).toBe("1d");
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

  it("covers every strike on offer, the lowest and highest off the edges", () => {
    const cases: Array<[number[], number[]]> = [
      [[98, 102], [80, 85, 90, 95]], // all below the history
      [[98, 102], [105, 110, 120]], // all above it
      [[98, 102], [60, 100, 140]], // both sides
      [[50, 150], [99, 100, 101]], // well inside it
    ];
    for (const [values, strikes] of cases) {
      const [lo, hi] = priceDomain(values, strikes);
      const at = (p: number) => (p - lo) / (hi - lo);
      expect(at(Math.min(...strikes))).toBeGreaterThanOrEqual(0.219);
      expect(at(Math.max(...strikes))).toBeLessThanOrEqual(0.781);
      // and the history is still on the pane
      expect(lo).toBeLessThanOrEqual(Math.min(...values));
      expect(hi).toBeGreaterThanOrEqual(Math.max(...values));
    }
  });

  it("is the same whichever of the offered strikes is chosen", () => {
    const offered = [80, 85, 90, 95];
    const whole = priceDomain([98, 102], offered);
    for (const chosen of offered) {
      expect(priceDomain([98, 102], [Math.min(chosen, ...offered), Math.max(chosen, ...offered)])).toEqual(whole);
    }
  });

  it("never goes below zero", () => {
    expect(priceDomain([0.00002, 0.00003], 0.000001)[0]).toBeGreaterThanOrEqual(0);
  });
});

describe("projection wiggle", () => {
  const H = 280;

  it("ramps gently from 1D and stays calm on the longer ranges", () => {
    // 1D is the calm reference; 1W/1M/3M ramp only gently just above it, never the √-explosion.
    expect(projectionWiggle("1d", H)).toBeCloseTo(30, 0);
    expect(projectionWiggle("1w", H)).toBeCloseTo(36, 0);
    expect(projectionWiggle("1m", H)).toBeCloseTo(42, 0);
    expect(projectionWiggle("3m", H)).toBeCloseTo(50, 0);
    // still strictly monotonic: a longer horizon never shrinks the wander
    expect(projectionWiggle("1d", H)).toBeLessThan(projectionWiggle("1w", H));
    expect(projectionWiggle("1w", H)).toBeLessThan(projectionWiggle("1m", H));
    expect(projectionWiggle("1m", H)).toBeLessThan(projectionWiggle("3m", H));
  });

  it("caps the wander to the pane so paths stay on the chart", () => {
    expect(projectionWiggle("3m", H)).toBeLessThanOrEqual(H * 0.6);
    // a short pane actually engages the cap
    expect(projectionWiggle("3m", 50)).toBeLessThanOrEqual(50 * 0.6);
  });
});

describe("scenario endpoints", () => {
  it("is deterministic for a given seed", () => {
    expect(scenarioEndpoints(7, 280, 130, 120, "above")).toEqual(scenarioEndpoints(7, 280, 130, 120, "above"));
  });

  it("varies run to run (different seeds give different scenarios)", () => {
    expect(scenarioEndpoints(1, 280, 130, 120, "above")).not.toEqual(scenarioEndpoints(2, 280, 130, 120, "above"));
  });

  it("places one endpoint on each side of the strike, off the strike, inside the padded pane", () => {
    for (const direction of ["above", "below"] as const) {
      const [profit, loss] = scenarioEndpoints(12345, 280, 130, 120, direction);
      for (const y of [profit, loss]) {
        expect(y).toBeGreaterThanOrEqual(6);
        expect(y).toBeLessThanOrEqual(274);
      }
      if (direction === "above") {
        expect(profit).toBeLessThan(130);
        expect(loss).toBeGreaterThan(130);
      } else {
        expect(profit).toBeGreaterThan(130);
        expect(loss).toBeLessThan(130);
      }
    }
  });

  it("ends the two paths far apart with a wide vertical gap", () => {
    for (const direction of ["above", "below"] as const) {
      for (const seed of [1, 2, 3, 11, 42, 12345, 999]) {
        const [profit, loss] = scenarioEndpoints(seed, 280, 130, 120, direction);
        // the two futures must read as clearly divergent at a glance — never near each other
        expect(Math.abs(profit - loss)).toBeGreaterThanOrEqual(96);
      }
    }
  });
});

describe("profit at price", () => {
  it("prices a long call as payout minus premium above the strike", () => {
    expect(profitAtPrice("buy", "above", 95, 1, 1.1, 100)).toBeCloseTo(3.9); // (100−95)×1 − 1.1
    expect(profitAtPrice("buy", "above", 95, 2, 1.1, 100)).toBeCloseTo(8.9); // (100−95)×2 − 1.1
    expect(profitAtPrice("buy", "above", 95, 1, 1.1, 95)).toBeCloseTo(-1.1); // at the strike: lose the premium
  });

  it("prices a long put as payout minus premium below the strike", () => {
    expect(profitAtPrice("buy", "below", 105, 1, 1, 100)).toBeCloseTo(4); // (105−100)×1 − 1
    expect(profitAtPrice("buy", "below", 105, 1, 1, 105)).toBeCloseTo(-1); // at the strike: lose the premium
  });

  it("keeps a sold option's profit flat at the premium, however deep in the money it settles", () => {
    expect(profitAtPrice("sell", "above", 95, 1, 1.1, 100)).toBeCloseTo(1.1);
    expect(profitAtPrice("sell", "above", 95, 1, 1.1, 200)).toBeCloseTo(1.1);
    expect(profitAtPrice("sell", "below", 105, 1, 0.5, 90)).toBeCloseTo(0.5);
  });

  it("computes a long option's gross payout as intrinsic value only", () => {
    expect(optionPayout("above", 95, 1, 100)).toBeCloseTo(5);
    expect(optionPayout("above", 95, 1, 90)).toBeCloseTo(0); // out of the money → zero
    expect(optionPayout("below", 105, 2, 100)).toBeCloseTo(10);
    expect(optionPayout("below", 105, 2, 110)).toBeCloseTo(0);
  });
});

describe("pnl at price", () => {
  it("scales a long option's net PnL with size", () => {
    expect(pnlAtPrice("buy", "above", 95, 1, 1.1, 100)).toBeCloseTo(3.9); // (100−95)×1 − 1.1
    expect(pnlAtPrice("buy", "above", 95, 2, 1.1, 100)).toBeCloseTo(8.9); // (100−95)×2 − 1.1
    expect(pnlAtPrice("buy", "above", 95, 1, 1.1, 90)).toBeCloseTo(-1.1); // OTM: lose the premium
  });

  it("prices a long put below the strike", () => {
    expect(pnlAtPrice("buy", "below", 105, 1, 1, 100)).toBeCloseTo(4); // (105−100)×1 − 1
  });

  it("nets a sold option's assignment loss against the kept premium", () => {
    expect(pnlAtPrice("sell", "above", 95, 1, 1.1, 100)).toBeCloseTo(1.1); // OTM: keep premium
    expect(pnlAtPrice("sell", "above", 95, 1, 1.1, 90)).toBeCloseTo(-3.9); // assigned: 1.1 − (95−90)
    expect(pnlAtPrice("sell", "below", 105, 2, 1, 110)).toBeCloseTo(-9); // assigned: 1 − (110−105)×2
  });
});

describe("return % at price", () => {
  it("expresses a long option's PnL as a share of the premium paid", () => {
    expect(returnPctAtPrice("buy", "above", 95, 1, 1, 100)).toBeCloseTo(400); // (100−95)−1 = 4 → +400%
    expect(returnPctAtPrice("buy", "above", 95, 1, 1, 96)).toBeCloseTo(0); // break-even
    expect(returnPctAtPrice("buy", "above", 95, 1, 1, 90)).toBeCloseTo(-100); // lose the premium
  });

  it("expresses a sold option's PnL as a share of the premium collected", () => {
    expect(returnPctAtPrice("sell", "above", 95, 1, 1, 100)).toBeCloseTo(100); // keep the premium
    expect(returnPctAtPrice("sell", "above", 95, 1, 1, 90)).toBeCloseTo(-400); // assigned 4× the premium
  });

  it("is zero when the premium is zero or unknown", () => {
    expect(returnPctAtPrice("buy", "above", 95, 1, 0, 100)).toBe(0);
  });
});

describe("projection path containment", () => {
  const H = 280;
  const W = 420;
  const PAD = 6;

  /** Pull every (x, y) — knots and Catmull-Rom control points — out of a path `d` string. */
  function coords(d: string): Array<[number, number]> {
    const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
    return pairs;
  }

  it("keeps every point of every path (start, wander, end) within [0, paneHeight]", () => {
    const endYs = [6, 60, 130, 200, 274];
    for (const range of ["1d", "1w", "1m", "3m"] as const) {
      const wiggle = projectionWiggle(range, H);
      for (const seed of [1, 2, 3, 11, 42]) {
        for (const endY of endYs) {
          const d = projectionPath(120, 130, W - PAD, endY, seed, 40, wiggle, { minX: 0, maxX: W, minY: 0, maxY: H });
          const pts = coords(d);
          expect(pts.length).toBeGreaterThan(1);
          for (const [x, y] of pts) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(W);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(H);
          }
        }
      }
    }
  });

  it("clamps the whole curve inside the padded box and ends short of the right edge", () => {
    const wiggle = projectionWiggle("3m", H);
    for (const seed of [1, 7, 99]) {
      for (const endY of [6, 80, 140, 200, 274]) {
        const d = projectionPath(120, 260, W - PAD, endY, seed, 40, wiggle, { minX: 0, maxX: W - PAD, minY: PAD, maxY: H - PAD });
        const pts = coords(d);
        for (const [x, y] of pts) {
          expect(y).toBeGreaterThanOrEqual(PAD);
          expect(y).toBeLessThanOrEqual(H - PAD);
          expect(x).toBeLessThanOrEqual(W - PAD);
        }
        // the path's final knot is its endpoint, and it must stop short of the pane edge
        expect(pts[pts.length - 1][0]).toBeCloseTo(W - PAD, 1);
      }
    }
  });
});

describe("the strike and goal tags at the pane's right edge", () => {
  const pane = { top: 36, bottom: 240 };

  it("leaves each tag on its own line when the lines are a tag apart or more", () => {
    expect(handleTops({ strikeY: 150, goalY: 100, goalAbove: true, ...pane })).toEqual({ strike: 150, goal: 100, grab: 10 });
    // with no goal the strike rides its line alone
    expect(handleTops({ strikeY: 150, goalY: null, goalAbove: true, ...pane })).toEqual({ strike: 150, goal: null, grab: 10 });
  });

  it("steps the two apart by half the shortfall each when the lines are closer than a tag is tall", () => {
    const up = handleTops({ strikeY: 150, goalY: 140, goalAbove: true, ...pane });
    expect(up).toEqual({ strike: 160, goal: 130, grab: 1 });
    // the other belief: the goal is the lower of the two
    const down = handleTops({ strikeY: 140, goalY: 150, goalAbove: false, ...pane });
    expect(down).toEqual({ strike: 130, goal: 160, grab: 1 });
  });

  it("keeps the goal on its side of the strike when both lines fall on one pixel", () => {
    expect(handleTops({ strikeY: 150, goalY: 150, goalAbove: true, ...pane })).toMatchObject({ strike: 165, goal: 135 });
    expect(handleTops({ strikeY: 150, goalY: 150, goalAbove: false, ...pane })).toMatchObject({ strike: 135, goal: 165 });
  });

  it("moves the pair back inside together at the pane's top and bottom", () => {
    expect(handleTops({ strikeY: 40, goalY: 10, goalAbove: true, ...pane })).toMatchObject({ goal: 36, strike: 66 });
    expect(handleTops({ strikeY: 260, goalY: 250, goalAbove: true, ...pane })).toMatchObject({ goal: 210, strike: 240 });
  });

  it("gives a tag only the grab room that does not reach into its neighbour", () => {
    expect(handleTops({ strikeY: 150, goalY: 116, goalAbove: true, ...pane }).grab).toBe(3);
    expect(handleTops({ strikeY: 150, goalY: 90, goalAbove: true, ...pane }).grab).toBe(10);
  });
});

describe("a zone label's place in the pane's centre column", () => {
  // the upper label: home 42, its zone runs from the top of the pane down to the strike line
  const upper = { home: 42, min: 14, max: 110 };

  it("stays home whatever else moves, while the live price is elsewhere", () => {
    expect(zoneLabelY({ ...upper, taken: null })).toBe(42);
    // the NOW tag and the price's dot from 130 to 165: nowhere near
    expect(zoneLabelY({ ...upper, taken: [130, 165] })).toBe(42);
    // just clear: the label's edge is 6px above the NOW tag
    expect(zoneLabelY({ ...upper, taken: [60, 95] })).toBe(42);
  });

  it("steps to the nearer clear place in its zone when the live price is on its home", () => {
    // above the price is nearer, and there is room
    expect(zoneLabelY({ ...upper, taken: [40, 75] })).toBe(22);
    // too high for a label above it: below, between the dot and the strike line
    expect(zoneLabelY({ ...upper, taken: [20, 55] })).toBe(73);
  });

  it("steps up into the tab row, in line with the tabs, where the pane has that row free", () => {
    expect(zoneLabelY({ ...upper, min: 16, row: 16, taken: [40, 75] })).toBe(16);
    // the NOW tag reaches into the row: below the price instead
    expect(zoneLabelY({ ...upper, min: 16, row: 16, taken: [24, 59] })).toBe(77);
  });

  it("closes up against the live price where the zone has no room for the usual space", () => {
    // 6px above the NOW tag would put it at 33, over the tabs: 2px above is 37
    expect(zoneLabelY({ home: 42, min: 36, max: 96, taken: [51, 86] })).toBe(37);
  });

  it("is not shown when no place in its zone is clear of the live price", () => {
    expect(zoneLabelY({ home: 42, min: 42, max: 60, taken: [30, 65] })).toBeNull();
    // the lower label, held above the flip hint: the price sits low in a thin zone
    expect(zoneLabelY({ home: 210, min: 171, max: 210, taken: [165, 200] })).toBeNull();
  });

  it("is pulled inside its zone when the strike line leaves its home outside", () => {
    expect(zoneLabelY({ home: 42, min: 14, max: 30, taken: null })).toBe(30);
    expect(zoneLabelY({ home: 212, min: 230, max: 240, taken: null })).toBe(230);
  });
});
