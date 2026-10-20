"use client";

import { useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { cn } from "@/lib/cn";
import {
  DAY_SECS,
  cumulativeReturnSeries,
  tvlSeries,
  windowSeries,
  type FinishedCycle,
} from "@/lib/vaults/metrics";
import type { Vault, VaultCycle } from "@/lib/vaults/types";
import { VaultPerformanceChart } from "./vault-performance-chart";

type Series = "return" | "tvl";
type Range = "1m" | "3m" | "all";

const RANGES: ReadonlyArray<{ value: Range; label: string; secs: number | null }> = [
  { value: "1m", label: "1M", secs: 30 * DAY_SECS },
  { value: "3m", label: "3M", secs: 90 * DAY_SECS },
  { value: "all", label: "All", secs: null },
];

export function VaultPerformanceCard({
  vault,
  symbol,
  cycles,
  finished,
  nowSecs,
  loading,
  truncated,
}: {
  vault: Vault;
  symbol: string;
  cycles: readonly VaultCycle[];
  finished: readonly FinishedCycle[];
  nowSecs: number;
  loading: boolean;
  truncated: boolean;
}) {
  const [series, setSeries] = useState<Series>("return");
  const [range, setRange] = useState<Range>("all");
  // hour resolution so the series does not rebuild on every clock tick
  const hour = Math.floor(nowSecs / 3_600) * 3_600;
  const rangeSecs = RANGES.find((r) => r.value === range)?.secs ?? null;
  const since = rangeSecs === null ? null : hour - rangeSecs;

  const points = useMemo(
    () =>
      series === "return"
        ? cumulativeReturnSeries(finished, { since })
        : windowSeries(tvlSeries(cycles, vault.main_decimals), since),
    [series, finished, cycles, vault.main_decimals, since],
  );

  let empty: string | null = null;
  if (points.length < 2) {
    if (series === "return" && finished.length === 0) empty = "Performance appears after the first completed cycle.";
    else if (range !== "all") empty = "No completed cycles in this range.";
    else empty = "Not enough history yet.";
  }

  return (
    <AppCard className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">
          Performance
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <AppSegmented
            value={series}
            onChange={setSeries}
            options={[
              { value: "return", label: "Return" },
              { value: "tvl", label: `TVL (${symbol})` },
            ]}
          />
          <div role="group" aria-label="Range" className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "inline-flex h-6 items-center border px-2.5 py-0.5 font-mono text-xs font-medium tracking-tight text-content-primary transition-colors",
                  range === r.value
                    ? "border-accent-primary/30 bg-accent-primary/20 backdrop-blur-[4px]"
                    : "border-[rgba(240,240,240,0.1)] hover:border-[rgba(240,240,240,0.25)]",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="h-[280px] animate-pulse bg-[rgba(40,40,40,0.24)]" />
        ) : empty ? (
          <div className="flex h-[280px] items-center justify-center border border-dashed border-bg-border px-6 text-center font-mono text-sm text-content-secondary">
            {empty}
          </div>
        ) : (
          <VaultPerformanceChart
            key={series}
            points={points}
            kind={series === "return" ? "percent" : "amount"}
            rangeStart={since}
          />
        )}
      </div>

      {truncated ? (
        <p className="mt-3 font-mono text-xs leading-[1.5] text-content-secondary">Showing the latest 200 cycles.</p>
      ) : null}
    </AppCard>
  );
}
