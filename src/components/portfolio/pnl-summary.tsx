"use client";

import * as React from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import { formatSignedUsd, type PnlSummary } from "@/lib/portfolio-pnl";

function tone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function Tile({ label, value, sub, valueClass }: { label: string; value: React.ReactNode; sub: string; valueClass?: string }) {
  return (
    <AppCard className="p-4">
      <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{label}</div>
      <div className={cn("mt-2 truncate font-mono text-2xl font-medium leading-[1.2] tabular-nums", valueClass ?? "text-content-primary")}>{value}</div>
      <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">{sub}</div>
    </AppCard>
  );
}

/**
 * Top-level P&L summary: realised (real, from settled positions) and unrealised (the
 * intrinsic "if you executed now" value of open positions against the underlying mark).
 * A note names exactly how the mark is derived rather than leaving a blank tile unexplained.
 */
export function PnlSummary({ summary, incomplete }: { summary: PnlSummary | null; incomplete?: boolean }) {
  if (!summary) {
    return (
      <AppCard className="p-4 font-mono text-sm text-content-secondary">
        Profit and loss unavailable.
      </AppCard>
    );
  }
  const realisedText = summary.settledCount > 0 ? formatSignedUsd(summary.realized) : "\u2014";
  const winLossText = summary.settledCount > 0 ? `${summary.wins} / ${summary.losses}` : "\u2014";
  const realisedSub = `${summary.settledCount} settled${incomplete ? " (loaded history)" : ""}`;
  const unrealized = summary.hasUnrealizedMark ? summary.unrealized : null;
  const unrealisedText = unrealized != null ? formatSignedUsd(unrealized) : "\u2014";

  return (
    <section aria-label="Profit and loss" className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile
          label="Realised P&L"
          value={realisedText}
          sub={realisedSub}
          valueClass={summary.settledCount > 0 ? tone(summary.realized) : undefined}
        />
        <Tile
          label="Unrealised P&L"
          value={unrealisedText}
          sub={summary.hasUnrealizedMark ? "if executed now" : "no underlying price"}
          valueClass={unrealized != null ? tone(unrealized) : undefined}
        />
        <Tile label="Win / Loss" value={winLossText} sub="settled positions" />
      </div>
      <p className="font-mono text-xs leading-[1.4] text-content-secondary/80">
        Unrealised P&L marks each open position at its intrinsic value against the current
        underlying price — what you&apos;d make &quot;if you executed now&quot;. It carries no time
        value and may use a stale price outside market hours.
      </p>
    </section>
  );
}
