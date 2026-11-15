"use client";

import * as React from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import { cn } from "@/lib/cn";
import { formatUsdSmart } from "@/lib/markets";
import { formatSignedUsd, type OpenWrittenApr, type PnlSummary, type TradingStats } from "@/lib/portfolio-pnl";

const DASH = "—";
const LABEL = "font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.12em] text-content-tertiary";

function tone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One figure under a headline: a label, the value, and a quiet line saying what it covers. */
export function Cell({
  label,
  hint,
  hintLabel,
  value,
  valueClassName,
  note,
  wrap,
}: {
  label: string;
  /** Explains the figure; opens on hover, focus or tap. */
  hint?: string;
  hintLabel?: string;
  value: string;
  valueClassName?: string;
  /** Plain words, or a control such as a link that opens a breakdown. */
  note: React.ReactNode;
  /** Let a long value break onto a second line instead of cutting it off with an ellipsis. */
  wrap?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* a fixed height, so a label with an (i) and one without put their values on the same line */}
      <div className={cn(LABEL, "flex h-4 items-center gap-1")}>
        {label}
        {hint ? <InfoTooltip label={hintLabel ?? `About ${label}`}>{hint}</InfoTooltip> : null}
      </div>
      <div className={cn(wrap ? "break-words" : "truncate", "font-mono text-xl font-semibold leading-[1.25] tracking-[-0.02em] tabular-nums", valueClassName ?? "text-content-primary")}>
        {value}
      </div>
      <div className="font-mono text-xs leading-[1.3] tracking-[-0.24px] tabular-nums text-content-secondary">{note}</div>
    </div>
  );
}

/**
 * "How am I doing": net P&L as the one headline, then the four figures it is made of or sits
 * beside, each a labelled cell: realised, unrealised, the APR on what was sold, and premium in
 * and out. A figure that cannot be computed is an em dash, never a zero.
 */
export function PerformanceStrip({
  pnl,
  apr,
  trading,
  unavailable,
  incomplete,
}: {
  pnl: PnlSummary | null;
  apr: OpenWrittenApr | null;
  trading: TradingStats | null;
  unavailable: boolean;
  /** More settled history exists than has been loaded, so realised figures are partial. */
  incomplete?: boolean;
}) {
  if (unavailable || !pnl || !apr || !trading) {
    return (
      <AppCard className="p-5 font-mono text-sm text-content-secondary">
        Performance unavailable.
      </AppCard>
    );
  }

  const net = pnl.realized + (pnl.unrealized ?? 0);
  const hasPnl = pnl.settledCount > 0 || pnl.hasUnrealizedMark;
  const hasRealised = pnl.settledCount > 0;
  const openCount = trading.openSells + trading.openBuys;

  return (
    <section aria-label="Performance" className="flex flex-col gap-2">
      <AppCard className="p-5">
        <div className={LABEL}>Net P&L</div>
        <div className={cn("mt-2 font-mono text-[40px] font-medium leading-[1.1] tabular-nums max-md:text-[32px]", hasPnl ? tone(net) : "text-content-primary")}>
          {hasPnl ? formatSignedUsd(net) : DASH}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-bg-border pt-5 md:grid-cols-4">
          <Cell
            label="Realised"
            value={hasRealised ? formatSignedUsd(pnl.realized) : DASH}
            valueClassName={hasRealised ? tone(pnl.realized) : undefined}
            note={hasRealised ? `${pnl.settledCount} closed` : "Nothing closed yet"}
          />
          <Cell
            label="Unrealised"
            hint="What your open positions would be worth if they ended at the current price, after the premium you paid or collected. It leaves out time value."
            value={pnl.unrealized != null ? formatSignedUsd(pnl.unrealized) : DASH}
            valueClassName={pnl.unrealized != null ? tone(pnl.unrealized) : undefined}
            note={openCount > 0 ? `${openCount} open` : "Nothing open"}
          />
          <Cell
            label="APR"
            hint="Annualised premium over collateral on the positions you sold and still hold, weighted by collateral."
            value={apr.aprPct != null ? `${apr.aprPct.toFixed(2)}%` : DASH}
            note={apr.aprPct != null ? `On ${count(apr.writtenCount, "sold position", "sold positions")}` : "No open sold positions"}
          />
          <Cell
            label="Premium"
            value={trading.sellCount > 0 ? formatUsdSmart(trading.collectedUsd) : DASH}
            note={[
              trading.sellCount > 0 ? "collected" : "Nothing sold",
              trading.buyCount > 0 ? `${formatUsdSmart(trading.paidUsd)} paid` : null,
            ].filter(Boolean).join(" · ")}
          />
        </div>
      </AppCard>
      {incomplete ? (
        <p className="font-mono text-xs leading-[1.4] text-content-secondary">
          Realised figures cover the history loaded so far. Open History and use Show more to include the rest.
        </p>
      ) : null}
    </section>
  );
}
