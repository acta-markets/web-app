import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrikeBoxesChart } from "./strike-box-chart";
import type { StrikeOption } from "@/lib/trade/strikes";

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

function option(strike: number, apr: number | null, bestPrice: number | null = apr != null ? 1 : null): StrikeOption {
  return { strike, strike1e9: Math.round(strike * 1e9), apr, bestPrice };
}

const props = {
  symbol: "SOL",
  spot: 100,
  expiryMs: (now + 7 * 86400) * 1000,
  strikeOptions: [
    option(95, 0.5),
    option(90, 1.2),
    option(85, null),
  ],
};

describe("strike boxes chart", () => {
  it("shows one clickable box per strike, labelled with its price and APR", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    render(<StrikeBoxesChart {...props} selected1e9={null} onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "$95 strike, 50% APR" })).toBeTruthy());

    expect((screen.getByRole("button", { name: "$95 strike, 50% APR" }) as unknown as SVGElement).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "$90 strike, 120% APR" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "$85 strike, no price" })).toBeTruthy();
  });

  it("marks the selected strike and reports clicks", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 98 + (i % 5)]));
    const onSelect = vi.fn();
    const { rerender } = render(
      <StrikeBoxesChart {...props} selected1e9={Math.round(90 * 1e9)} onSelect={onSelect} />
    );
    const ninety = await waitFor(() => screen.getByRole("button", { name: "$90 strike, 120% APR" }));
    expect(ninety.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "$95 strike, 50% APR" }));
    expect(onSelect).toHaveBeenCalledWith(Math.round(95 * 1e9));

    rerender(<StrikeBoxesChart {...props} selected1e9={Math.round(95 * 1e9)} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "$95 strike, 50% APR" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "$90 strike, 120% APR" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("selects with the keyboard", async () => {
    mockHistory([]);
    const onSelect = vi.fn();
    render(<StrikeBoxesChart {...props} selected1e9={null} onSelect={onSelect} />);
    const box = await waitFor(() => screen.getByRole("button", { name: "$85 strike, no price" }));
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(Math.round(85 * 1e9));
  });

  it("keeps overlapping strikes readable while anchoring at their price", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 100 + (i % 3) * 0.1]));
    render(
      <StrikeBoxesChart
        {...props}
        strikeOptions={[option(100.5, 0.4), option(100.25, 0.6), option(100.125, 0.9)]}
        selected1e9={null}
        onSelect={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "$100.5 strike, 40% APR" })).toBeTruthy());

    const ys = screen
      .getAllByRole("button")
      .map((g) => Number(g.querySelector("rect.strike-box")?.getAttribute("y")))
      .sort((a, b) => a - b);
    expect(ys).toHaveLength(3);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(Math.round(30 * 0.8));
    }
  });

  it("anchors each level at its proportional price on the y axis", async () => {
    mockHistory(Array.from({ length: 50 }, (_, i) => [(now - 7 * 86400 + i * 12000) * 1000, 100 + (i % 3) * 0.1]));
    render(
      <StrikeBoxesChart
        {...props}
        strikeOptions={[option(102, 0.4), option(95, 0.6)]}
        selected1e9={Math.round(95 * 1e9)}
        onSelect={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "$95 strike, 60% APR" })).toBeTruthy());

    const levels = screen.getAllByRole("button").map((g) => {
      const rect = g.querySelector("rect.strike-box");
      if (!rect) throw new Error("strike box rect missing");
      return {
        label: g.getAttribute("aria-label"),
        x: Number(rect.getAttribute("x")),
        y: Number(rect.getAttribute("y")),
        w: Number(rect.getAttribute("width")),
        stroke: rect.getAttribute("stroke"),
        fill: rect.getAttribute("fill"),
        fillOpacity: rect.getAttribute("fill-opacity"),
      };
    });
    // levels sit on the chart inside the projection zone
    const xNow = 640 - Math.min(640 * 0.45, Math.max(150, 640 * 0.3));
    expect(levels.every((l) => l.x >= xNow && l.x + l.w <= 640)).toBe(true);
    const high = levels.find((l) => l.label?.startsWith("$102"))!;
    const low = levels.find((l) => l.label?.startsWith("$95"))!;
    // proportional, not a uniform list: $7 apart spans most of the 440px plot
    expect(low.y - high.y).toBeGreaterThan(200);
    // calls read green above spot, puts red below — visibly solid tinted buttons
    expect(high.stroke).toBe("var(--additional-green-primary)");
    expect(high.fill).toBe("var(--additional-green-primary)");
    expect(Number(high.fillOpacity)).toBeGreaterThanOrEqual(0.25);
    expect(low.stroke).toBe("var(--additional-red-primary)");
    expect(low.fill).toBe("var(--additional-red-primary)");
    expect(Number(low.fillOpacity)).toBeGreaterThanOrEqual(0.25);
  });

  it("picks the strike nearest the clicked price anywhere on the chart", async () => {
    mockHistory([]);
    const onSelect = vi.fn();
    const { container } = render(
      <StrikeBoxesChart {...props} selected1e9={null} onSelect={onSelect} />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "$85 strike, no price" })).toBeTruthy());

    const svg = container.querySelector("svg")!;
    // strikes 95/90/85 against spot 100: the domain puts $90 near the middle of the plot
    fireEvent.click(svg, { clientX: 320, clientY: 285 });
    expect(onSelect).toHaveBeenCalledWith(Math.round(90 * 1e9));

    fireEvent.click(svg, { clientX: 320, clientY: 60 });
    expect(onSelect).toHaveBeenCalledWith(Math.round(95 * 1e9));
  });
});
