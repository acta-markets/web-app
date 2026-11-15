"use client";

import { useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { cn } from "@/lib/cn";
import { formatUsdSmart } from "@/lib/markets";
import { numberFormat } from "@/lib/number-format";
import { formatPortfolioPremium, portfolioIncomeSeries, portfolioPremiumInLastDays, type WalletPositionSummary } from "@/lib/portfolio-api";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { shortAddress } from "@/lib/vaults/format";
import { PortfolioEarningsChart, type IncomeRange } from "./portfolio-earnings-chart";

// The series is one point per day, so a day-long range would have nothing to draw.
const RANGES: Array<{ value: IncomeRange; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];
const RANGE_DAYS: Record<IncomeRange, number> = { "7d": 7, "30d": 30 };

/**
 * What was collected over the chosen range. Thirty days is the venue's own total; a week is
 * counted from the same daily figures the chart draws.
 */
function premiumInRange(summary: WalletPositionSummary, range: IncomeRange, nowSec: number): string {
  return range === "30d" ? summary.premium_30d : portfolioPremiumInLastDays(summary, RANGE_DAYS[range], nowSec);
}

/** The token's symbol for a quote mint; a shortened address when it is not a known token. */
function quoteSymbol(mint: string): string {
  const network = getNetwork();
  return Object.values(TOKENS).find((t) => t.mint[network] === mint)?.symbol ?? shortAddress(mint);
}

/**
 * Premium collected over time. The header carries two totals, so the number is readable
 * without hovering the line: all time, and the range the chart is showing. The second follows
 * the 7D / 30D switch, as the chart does. `summaries` holds one entry per quote
 * currency; with more than one, a switch picks which to show.
 */
export function IncomeCard({
  summaries,
  quoteMint,
  onQuoteMint,
  state,
  nowSec,
}: {
  /** One summary per quote currency; null until loaded. */
  summaries: WalletPositionSummary[] | null;
  /** The chosen quote mint; falls back to USDC, then to the first summary. */
  quoteMint: string;
  onQuoteMint: (mint: string) => void;
  /** `pending` is still loading; `unavailable` failed to load. */
  state: "ready" | "pending" | "unavailable";
  nowSec: number;
}) {
  const [range, setRange] = useState<IncomeRange>("30d");
  const summary =
    summaries?.find((s) => s.quote_mint === quoteMint) ??
    summaries?.find((s) => s.quote_mint === TOKENS.USDC.mint[getNetwork()]) ??
    summaries?.[0];
  const symbol = summary ? quoteSymbol(summary.quote_mint) : null;
  const series = summary ? portfolioIncomeSeries(summary) : null;
  const formatValue = (value: number) =>
    !summary || symbol === "USDC"
      ? formatUsdSmart(value)
      : `${numberFormat({ maximumFractionDigits: summary.quote_decimals }).format(value)} ${symbol}`;

  return (
    <AppCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Income</div>
          {state === "ready" && summary && symbol ? (
            <p className="mt-1.5 font-mono text-sm leading-[1.3] tracking-[-0.28px] tabular-nums text-content-secondary">
              <span className="text-content-primary">{formatPortfolioPremium(summary.premium_all_time, summary.quote_decimals, symbol)}</span> all time
              {" · "}
              <span className="text-content-primary">{formatPortfolioPremium(premiumInRange(summary, range, nowSec), summary.quote_decimals, symbol)}</span> in the last {RANGE_DAYS[range]} days
            </p>
          ) : state === "pending" ? (
            <div aria-hidden="true" className="mt-1.5 h-[18px] w-56 animate-pulse bg-action-primary" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state === "ready" && summaries && summaries.length > 1 && summary ? (
            <AppSegmented
              value={summary.quote_mint}
              onChange={onQuoteMint}
              ariaLabel="Income currency"
              stretch={false}
              options={summaries.map((s) => ({ value: s.quote_mint, label: quoteSymbol(s.quote_mint) }))}
            />
          ) : null}
          <AppSegmented value={range} onChange={setRange} options={RANGES} ariaLabel="Income range" stretch={false} disabled={state !== "ready" || !series} />
        </div>
      </div>
      <div className={cn("mt-4", state === "ready" && series ? null : "flex h-[280px] items-center justify-center")}>
        {state === "pending" ? (
          <div aria-hidden="true" className="h-full w-full animate-pulse bg-action-primary opacity-50" />
        ) : state === "unavailable" || (summary && !series) ? (
          <p className="font-mono text-sm tracking-[-0.02em] text-content-secondary">Income unavailable</p>
        ) : series ? (
          <PortfolioEarningsChart points={series} now={nowSec} range={range} formatValue={formatValue} />
        ) : (
          <p className="max-w-sm text-center font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
            No premium collected yet. What you earn from the positions you sell adds up here.
          </p>
        )}
      </div>
    </AppCard>
  );
}
