"use client";

import { useMemo, useState } from "react";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/vaults/format";
import { DAY_SECS, cumulativeReturnSeries, tvlSeries, windowSeries, type FinishedCycle } from "@/lib/vaults/metrics";
import type { Vault, VaultCycle } from "@/lib/vaults/types";
import { VaultCapacity } from "./vault-metrics";
import { VaultPerformanceChart } from "./vault-performance-chart";

type Series = "return" | "tvl";
type Range = "1m" | "3m" | "all";
const RANGES: ReadonlyArray<{ value: Range; label: string; secs: number | null }> = [
  { value: "1m", label: "1M", secs: 30 * DAY_SECS },
  { value: "3m", label: "3M", secs: 90 * DAY_SECS },
  { value: "all", label: "All", secs: null },
];

export function VaultPerformanceCard({ vault, symbol, cycles, finished, nowSecs, loading, unavailable = false, truncated }: {
  vault: Vault;
  symbol: string;
  cycles: readonly VaultCycle[];
  finished: readonly FinishedCycle[];
  nowSecs: number;
  loading: boolean;
  unavailable?: boolean;
  truncated: boolean;
}) {
  const [series, setSeries] = useState<Series>("return");
  const [range, setRange] = useState<Range>("all");
  const hour = Math.floor(nowSecs / 3_600) * 3_600;
  const returns = useMemo(() => cumulativeReturnSeries(finished), [finished]);
  const tvl = useMemo(() => tvlSeries(cycles, vault.main_decimals), [cycles, vault.main_decimals]);
  const canSwitch = returns.length >= 2 && tvl.length >= 2;
  const selectedSeries = canSwitch ? series : "return";
  const allPoints = selectedSeries === "return" ? returns : tvl;
  // Only offer a range when it removes older history and contains a recorded point.
  const ranges = RANGES.filter((r) => r.secs === null || (
    allPoints.length >= 2 && allPoints[0].t < hour - r.secs && allPoints[allPoints.length - 1].t > hour - r.secs
  ));
  const selectedRange = ranges.find((r) => r.value === range) ?? RANGES[2];
  const since = selectedRange.secs === null ? null : hour - selectedRange.secs;
  const points = useMemo(
    () => selectedSeries === "return" ? cumulativeReturnSeries(finished, { since }) : windowSeries(tvl, since),
    [selectedSeries, finished, tvl, since],
  );
  const empty = unavailable && points.length < 2
    ? "Cycle history is unavailable."
    : finished.length === 0
      ? "Performance appears after the first completed cycle."
      : "Not enough history yet.";
  const worstCycle = vault.performance?.worst_cycle_return_pct ?? null;

  return (
    <section aria-label="Vault performance" className="flex min-w-0 flex-col gap-4 p-5 max-md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">
          {selectedSeries === "return" ? "Cumulative return" : "TVL"}
        </h2>
        {ranges.length > 1 ? (
          <div role="group" aria-label="Range" className="flex items-center gap-3">
            {ranges.map((r) => (
              <button key={r.value} type="button" aria-pressed={selectedRange.value === r.value} onClick={() => setRange(r.value)}
                className={cn("font-mono text-sm font-medium transition-colors", selectedRange.value === r.value ? "text-accent-secondary" : "text-content-secondary hover:text-content-primary")}>
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {canSwitch ? (
        <div className="self-start">
          <AppSegmented value={selectedSeries} onChange={setSeries} options={[{ value: "return", label: "Return" }, { value: "tvl", label: `TVL (${symbol})` }]} />
        </div>
      ) : null}
      <div className="min-w-0">
        {loading ? <div className="h-[280px] animate-pulse bg-action-tertiary" /> : points.length < 2 ? (
          <div className="flex h-[280px] items-center justify-center border-y border-bg-border px-6 text-center font-mono text-sm text-content-secondary">{empty}</div>
        ) : (
          <VaultPerformanceChart key={selectedSeries} points={points} kind={selectedSeries === "return" ? "percent" : "amount"} rangeStart={since} />
        )}
      </div>
      {!loading && !(unavailable && points.length === 0) ? <p className="font-mono text-xs leading-[1.5] text-content-secondary">
        {selectedSeries === "return"
          ? `${finished.length} completed ${finished.length === 1 ? "cycle" : "cycles"}. Compounded return in ${symbol}${since === null ? " for the current capital generation" : " over the selected range"}.`
          : `Booked equity in ${symbol} at cycle boundaries, including deposits and withdrawals.`}
      </p> : null}
      {unavailable && points.length >= 2 ? <p role="status" className="font-mono text-xs text-content-secondary">Couldn&apos;t refresh history. Showing the last loaded cycles.</p> : null}
      {truncated ? <p className="font-mono text-xs text-content-secondary">Showing the latest 200 cycles.</p> : null}
      <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-bg-border pt-4 font-mono text-sm">
        <div>
          <dt className="text-content-secondary">Max drawdown</dt>
          <dd className="mt-1 tabular-nums text-content-primary">{formatPercent(vault.performance?.max_drawdown_pct)}</dd>
        </div>
        <div>
          <dt className="text-content-secondary">Worst cycle</dt>
          <dd className="mt-1 tabular-nums text-content-primary">{formatPercent(worstCycle, { signed: true })}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <VaultCapacity vault={vault} symbol={symbol} />
      </div>
    </section>
  );
}
