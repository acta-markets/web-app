"use client";

import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import { cn } from "@/lib/cn";

/**
 * Narrows the open positions to the bought options worth exercising: in the money at the
 * current price and not yet expired. A switch, not a menu, because there is one thing to
 * turn on. It sits beside the asset filter and works with it: an asset chosen there and this
 * switch on leave that asset's options worth exercising.
 *
 * Shown only while at least one position qualifies, with how many.
 */
export function ExerciseFilter({ count, active, onChange }: { count: number; active: boolean; onChange: (active: boolean) => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(!active)}
        // the app's chip, as the asset filter beside it; on, it takes the accent tint a selected tab has
        className={cn(
          "flex h-10 items-center gap-2 whitespace-nowrap border px-4 py-2.5 font-mono text-sm leading-none tracking-[-0.02em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary max-md:h-8 max-md:px-3",
          active ? "border-accent-primary/30 bg-accent-primary/20 text-content-primary" : "border-bg-border text-content-secondary hover:text-content-primary",
        )}
      >
        <span className={active ? undefined : "text-content-primary"}>Worth exercising</span>
        <span className="tabular-nums">{count}</span>
      </button>
      <InfoTooltip label="What worth exercising means">
        Bought options that are in the money at the current price and have not expired. Fund one before it expires to exercise it; a funded one is already set.
      </InfoTooltip>
    </span>
  );
}
