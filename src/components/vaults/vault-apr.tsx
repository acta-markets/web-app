import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/vaults/format";
import type { AprView } from "@/lib/vaults/presentation";

/** The parts an APR adds up to, and where they come from. */
export function AprBreakdown({ apr }: { apr: AprView }) {
  return (
    <div className="flex flex-col gap-2">
      {apr.sources.length > 0 ? (
        <dl className="flex flex-col gap-1">
          {apr.sources.map((source) => (
            <div key={source.label} className="flex justify-between gap-6">
              <dt className="text-content-secondary">{source.label}</dt>
              <dd className="tabular-nums">{formatPercent(source.pct)}</dd>
            </div>
          ))}
          {apr.sources.length > 1 && !apr.muted ? (
            <div className="flex justify-between gap-6 border-t border-bg-border pt-1 font-medium">
              <dt>APR</dt>
              <dd className="tabular-nums">{apr.value}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className="text-content-secondary">{apr.note}</p>
    </div>
  );
}

/** "APR" with an (i) that breaks the figure down. */
export function AprLabel({ apr, className }: { apr: AprView; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      APR
      <InfoTooltip label="What makes up this APR">
        <AprBreakdown apr={apr} />
      </InfoTooltip>
    </span>
  );
}
