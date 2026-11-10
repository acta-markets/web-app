import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { optionPayout, pnlAtPrice, priceDomain, profitAtPrice, projectionPath, projectionWiggle, rangeForExpiry, returnPctAtPrice, scenarioEndpoints, ThesisChart } from "./thesis-chart";

vi.mock("lightweight-charts", () => {
  const noop = () => {};
  return {
    createChart: () => ({
      addSeries: () => ({ setData: noop, createPriceLine: () => ({}), removePriceLine: noop, priceToCoordinate: () => null, coordinateToPrice: () => null }),
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

  it("still shows the outcome zones when there is no price history", async () => {
    mockHistory([]);
    render(<ThesisChart {...props} direction="below" />);
    await waitFor(() => expect(screen.getByText("Price history unavailable")).toBeTruthy());
    expect(screen.getByText("Keep 104.50 USDC")).toBeTruthy();
    expect(screen.getByText(/Strike \$95/)).toBeTruthy();
  });

  it("flips direction from the (flip) button and a clean chart tap, ignoring drags", async () => {
    const onDirection = vi.fn();
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const { rerender } = render(<ThesisChart {...props} direction="above" onDirection={onDirection} />);
    await waitFor(() => expect(screen.getByTestId("chart-flip-surface")).toBeTruthy());

    // the "(flip)" button is keyboard-accessible and flips above → below
    fireEvent.click(screen.getByRole("button", { name: "Flip direction" }));
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
