import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cumulativeReturnSeries, finishedCycles } from "@/lib/vaults/metrics";
import { makeVault, parseSampleData } from "@/lib/vaults/sample";
import sampleFile from "@/lib/vaults/sample-data.json";
import { VaultPerformanceCard } from "./vault-performance-card";

const chart = vi.hoisted(() => vi.fn());
vi.mock("./vault-performance-chart", () => ({ VaultPerformanceChart: (props: unknown) => { chart(props); return null; } }));
afterEach(() => { cleanup(); chart.mockClear(); });

describe("VaultPerformanceCard", () => {
  it("plots only the supplied two cycles and hides ranges that add no history", async () => {
    const sample = parseSampleData(sampleFile, sampleFile.anchor);
    const cycles = Object.values(sample.cycles).flat().filter((c) => c.finished_at !== null).slice(0, 2);
    const finished = finishedCycles(cycles);
    const nowSecs = Math.max(...finished.map((c) => c.finishedAt));
    render(<VaultPerformanceCard vault={makeVault()} symbol="SOL" cycles={cycles} finished={finished} nowSecs={nowSecs} loading={false} truncated={false} />);
    expect(chart.mock.lastCall?.[0].points).toEqual(cumulativeReturnSeries(finished));
    expect(chart.mock.lastCall?.[0].points).toHaveLength(3);
    expect(screen.queryByRole("group", { name: "Range" })).toBeNull();
    expect(screen.getByText(/2 completed cycles/)).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "TVL (SOL)" }));
    expect(chart.mock.lastCall?.[0].kind).toBe("amount");
  });

  it("does not draw a chart or offer TVL before there is history", () => {
    render(<VaultPerformanceCard vault={makeVault()} symbol="SOL" cycles={[]} finished={[]} nowSecs={sampleFile.anchor} loading={false} truncated={false} />);
    expect(chart).not.toHaveBeenCalled();
    expect(screen.getByText("Performance appears after the first completed cycle.")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "TVL (SOL)" })).toBeNull();
  });
});
