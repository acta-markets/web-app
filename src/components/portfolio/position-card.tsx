"use client";

import * as React from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import { formatSignedUsd } from "@/lib/portfolio-pnl";

/** One open position as a card, in the trade surface's key/value idiom (see vault-card). */
export type PositionCardData = {
  id: string;
  long: boolean;
  type: "call" | "put";
  /** e.g. "SOL 150 call", "SOL 100/120 put spread" */
  headline: string;
  /** display-only strike, e.g. "150" or "100 / 120" */
  strike: string;
  expiryTs: number | null;
  /** e.g. "2 SOL" */
  size: string;
  /** e.g. "$12.34" or "$12.34 paid" */
  premiumLabel: string;
  /** e.g. "12.34%" or "—" */
  aprLabel: string;
  /** Unrealised P&L when the position carries an underlying mark; null when unavailable. */
  pnl: { valueUsd: number; stale: boolean } | null;
};

/** Direction eyebrow text: "Long call", "Short put spread", … */
export function directionLabel(long: boolean, type: "call" | "put"): string {
  return `${long ? "Long" : "Short"} ${type}`;
}

function tone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function Stat({ k, v, muted = false }: { k: string; v: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-content-secondary">{k}</dt>
      <dd className={cn("text-right tabular-nums", muted ? "text-content-secondary" : "text-content-primary")}>{v}</dd>
    </div>
  );
}

/**
 * An open position card. P&L is the unrealised "if you executed now" value from the
 * underlying mark; it shows an em dash when the backend has no underlying price for the
 * position. `action` is an optional slot for a buy's deposit control, rendered by the caller.
 */
export function PositionCard({ data, action }: { data: PositionCardData; action?: React.ReactNode }) {
  return (
    <AppCard className="flex h-full flex-col p-4">
      <header className="flex flex-col gap-1">
        <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-content-secondary">
          {directionLabel(data.long, data.type)}
        </div>
        <h3 className="truncate font-space text-xl font-semibold leading-[1.2] tracking-[-0.4px] text-content-primary" title={data.headline}>
          {data.headline}
        </h3>
      </header>

      <dl className="mt-3 divide-y divide-bg-border font-mono text-sm leading-[1.2] tracking-[-0.28px]">
        <Stat k="Strike" v={data.strike} />
        <Stat k="Expiry" v={data.expiryTs != null ? formatExpiry(data.expiryTs) : "\u2014"} />
        <Stat k="Size" v={data.size} />
        <Stat k="Premium" v={data.premiumLabel} />
        <Stat k="APR" v={data.aprLabel} />
        <Stat
          k="P&L"
          v={data.pnl == null
            ? <span title="No underlying price for this position.">{"\u2014"}</span>
            : (
              <span title={data.pnl.stale ? "Based on a stale underlying price." : "If you executed now at the current underlying price."}>
                <span className={tone(data.pnl.valueUsd)}>{formatSignedUsd(data.pnl.valueUsd)}</span>
                {data.pnl.stale ? <span className="text-content-tertiary"> · stale</span> : null}
              </span>
            )}
        />
      </dl>

      {action ? <div className="mt-3">{action}</div> : null}
    </AppCard>
  );
}

function formatExpiry(ts: number): string {
  const d = new Date(ts * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
