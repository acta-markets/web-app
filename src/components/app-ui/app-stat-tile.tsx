import * as React from "react";
import { cn } from "@/lib/cn";
import { AppCard } from "./app-card";

/** Metric tile (Figma "Info Box"), styled like the Portfolio tiles. */
export function AppStatTile({
  label,
  value,
  sub,
  loading,
  className
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <AppCard className={cn("min-w-0 p-4", className)}>
      <div className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{label}</div>
      {loading ? (
        <div className="mt-2 h-[29px] w-24 animate-pulse rounded bg-action-primary" />
      ) : (
        <div className="mt-2 truncate font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary max-md:text-xl">
          {value}
        </div>
      )}
      {sub != null && !loading ? (
        <div className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">
          {sub}
        </div>
      ) : null}
    </AppCard>
  );
}
