"use client";

import * as React from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import { formatUsdSmart } from "@/lib/markets";
import { formatSignedUsd, type OpenWrittenApr, type PnlSummary, type TradingStats } from "@/lib/portfolio-pnl";

function tone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{children}</div>;
}

/**
 * The top-of-page performance strip: one headline (net P&L) with the realised/unrealised
 * split as supporting values, the weighted written APR, and the buy/sell trading stats.
 * It replaces the old tiles grid and P&L summary in a single, non-card "how am I doing"
 * block. No mark means no unrealised figure and no APR — shown as an em dash, never zero.
 */
export function PerformanceStrip({
  pnl,
  apr,
  trading,
  unavailable,
  hasPositions,
  incomplete,
}: {
  pnl: PnlSummary | null;
  apr: OpenWrittenApr | null;
  trading: TradingStats | null;
  unavailable: boolean;
  hasPositions: boolean;
  incomplete?: boolean;
}) {
  if (unavailable) {
    return (
      <AppCard className="p-5 font-mono text-sm text-content-secondary">
        Performance unavailable.
      </AppCard>
    );
  }

  if (!hasPositions || !pnl || !apr || !trading) {
    return (
      <AppCard className="p-5">
        <p className="font-space text-lg font-medium text-content-primary">No positions yet</p>
        <p className="mt-1 font-mono text-sm leading-[1.5] text-content-secondary">
          Your performance appears here once you trade — net P&L, the APR you&apos;re earning on
          written positions, and your buy/sell split.
        </p>
      </AppCard>
    );
  }

  const net = pnl.realized + (pnl.unrealized ?? 0);
  const hasPnl = pnl.settledCount > 0 || pnl.hasUnrealizedMark;
  const netText = hasPnl ? formatSignedUsd(net) : "\u2014";
  const realisedText = pnl.settledCount > 0 ? formatSignedUsd(pnl.realized) : "\u2014";
  const unrealisedText = pnl.unrealized != null ? formatSignedUsd(pnl.unrealized) : "\u2014";

  const aprText = apr.aprPct != null ? `${apr.aprPct.toFixed(2)}%` : "\u2014";
  const aprSub = apr.aprPct != null
    ? `Annualised premium over collateral · ${apr.writtenCount} written`
    : "No open written positions";

  const collectedText = trading.sellCount > 0 ? formatUsdSmart(trading.collectedUsd) : "\u2014";
  const paidText = trading.buyCount > 0 ? formatUsdSmart(trading.paidUsd) : "\u2014";

  return (
    <section aria-label="Performance" className="flex flex-col gap-2">
      <AppCard className="p-5">
        <div className="flex flex-col gap-5">
          <div>
            <Label>Net P&L</Label>
            <div className={cn("mt-1 font-mono text-[40px] font-medium leading-[1.1] tabular-nums", hasPnl ? tone(net) : "text-content-primary")}>
              {netText}
            </div>
            <div className="mt-1 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
              Realised <span className={pnl.settledCount > 0 ? tone(pnl.realized) : undefined}>{realisedText}</span>
              {" · "}
              Unrealised{" "}
              <span
                title="If you executed now at the current underlying price (intrinsic value, no time value)."
                className={pnl.unrealized != null ? tone(pnl.unrealized) : undefined}
              >
                {unrealisedText}
              </span>
            </div>
          </div>

          <div className="h-px bg-bg-border" />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>APR</Label>
              <div className="mt-1 font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary">{aprText}</div>
              <div className="mt-1 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{aprSub}</div>
            </div>
            <div>
              <Label>Buy / sell</Label>
              <div className="mt-1 flex flex-col gap-0.5 font-mono text-sm leading-[1.4] tracking-[-0.28px] tabular-nums text-content-primary">
                <div>Sells <span>{collectedText}</span> collected</div>
                <div>Buys <span>{paidText}</span> paid</div>
                <div>{trading.openSells} sell · {trading.openBuys} buy open</div>
              </div>
            </div>
          </div>
        </div>
      </AppCard>
      {incomplete ? (
        <p className="font-mono text-xs leading-[1.4] text-content-secondary/80">
          Showing loaded history — earlier settled positions may not be included.
        </p>
      ) : null}
    </section>
  );
}
