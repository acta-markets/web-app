import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import type { TakerSide } from "@/lib/spreads";
import { BONE, TICKET_CELL } from "./ticket-styles";

/** Where the price rail's five ticks sit, top to bottom, as on the loaded chart. */
const RAIL_TICKS = ["7%", "27%", "48%", "68%", "88%"];

/**
 * The chart before its data: the chart's own opening frame rather than a grey block. The two
 * outcome zones in their tints, split by the strike line; the dashed "now" boundary down the
 * middle; the range tabs, the time axis and the price rail as quiet bones. Same box as the chart
 * (262px with the time axis; the tint and the rail end at the axis line, 28px up; rail on the
 * right, as wide as the strike knot), so the real one lands on top of it.
 */
export function ChartSkeleton() {
  return (
    <div aria-hidden="true" data-testid="chart-skeleton" className="mt-3 flex h-[262px]">
      <div className="relative min-w-0 flex-1 animate-pulse">
        {/* the outcome zones, as the chart tints them for a view that the price ends above */}
        <div className="absolute inset-x-0 top-0 h-[45%] bg-[rgba(34,197,94,0.07)]" />
        <div className="absolute inset-x-0 bottom-[28px] top-[45%] bg-[rgba(239,68,68,0.06)]" />
        {/* the strike line, and the handle that rides it */}
        <div className="absolute inset-x-0 top-[45%] h-0.5 -translate-y-1/2 bg-[rgba(240,240,240,0.35)]" />
        <div className="absolute left-1/4 top-[45%] h-8 w-28 -translate-x-1/2 -translate-y-1/2 bg-action-primary max-md:w-16" />
        {/* the "now" boundary: history to its left, the projection to its right */}
        <div className="absolute bottom-[28px] left-1/2 top-0 border-l border-dashed border-[rgba(240,240,240,0.35)]" />
        {/* the range tabs and the time axis */}
        <div className="absolute left-1.5 top-[11px] h-[22px] w-[122px] bg-action-primary" />
        <div className="absolute inset-x-0 bottom-[28px] border-t border-bg-border" />
      </div>
      {/* the price rail */}
      <div className="relative h-[234px] w-[150px] shrink-0 border-l border-bg-border max-md:hidden">
        {RAIL_TICKS.map((top) => (
          <div key={top} className={cn(BONE, "absolute right-[11px] h-2.5 w-9")} style={{ top }} />
        ))}
      </div>
    </div>
  );
}

/** The strip's four cells as bones: a label, a main line and a note, the last sized by `note`. */
function SkeletonCell({ className, value, note = "h-3 w-28" }: { className?: string; value: string; note?: string }) {
  return (
    <div className={cn(TICKET_CELL, className)}>
      <div className={cn(BONE, "h-[13px] w-24")} />
      <div className={cn(BONE, "h-[29px]", value)} />
      <div className="min-h-[2.6em] text-xs leading-[1.3]">
        <div className={cn(BONE, note)} />
      </div>
    </div>
  );
}

/**
 * The trade card while the venue's markets load: the same blocks at the same sizes as the loaded
 * card (sentence, chart with its price rail, the Now / In N days strip, the button), so nothing
 * jumps when the data lands. Profit's winning cell holds a table, so its bone is taller. The
 * strip starts closed behind the button (`folded`), and then only the button is drawn.
 */
export function TradeSkeleton({ side, folded = false }: { side: TakerSide; folded?: boolean }) {
  return (
    <AppCard aria-hidden="true" data-testid="trade-skeleton" className="border-0 p-4 max-md:p-3">
      {/* the sentence's two lines, set in one type. On a phone the first wraps to three lines and
          the second to two (a buy) or three (a sell, whose line also says what it earns); on a
          large phone both take two; from a tablet up each is one line, its type growing with the
          card up to 26px, so the block takes each of those heights. */}
      <div className={cn("flex flex-col gap-1.5 min-[480px]:h-[129px] md:h-[52px] lg:h-[66px] xl:h-[77px]", side === "sell" ? "h-[194px]" : "h-[162px]")}>
        <div className={cn(BONE, "min-h-0 w-full max-w-[660px] flex-[3] min-[480px]:flex-1")} />
        <div className={cn(BONE, "min-h-0 w-full max-w-[720px] min-[480px]:flex-1", side === "sell" ? "flex-[3]" : "flex-[2]")} />
      </div>
      <ChartSkeleton />
      {/* the strip: two headings, four cells, in the loaded strip's own grid and order */}
      <div className="mt-4">
        <div className={cn("grid grid-cols-2 gap-x-6 gap-y-1 xl:grid-cols-[1.05fr_0.9fr_1.1fr_1.05fr]", folded && "hidden")}>
          <div className="col-span-2 pt-1 xl:order-1">
            <div className={cn(BONE, "h-[19px] w-10")} />
          </div>
          <SkeletonCell className="xl:order-3" value="h-[31px] w-full" />
          <SkeletonCell className="xl:order-4" value="w-24" />
          <div className="col-span-2 pt-1 max-xl:mt-2 xl:order-2">
            <div className={cn(BONE, "h-[19px] w-24")} />
          </div>
          <SkeletonCell className="xl:order-5" value={side === "sell" ? "w-32 xl:h-[54px]" : "w-32"} note={side === "buy" ? "h-[91px] w-full" : "h-3 w-28"} />
          <SkeletonCell className="xl:order-6" value={side === "sell" ? "w-36 xl:h-[54px]" : "w-36"} />
        </div>
        <div className={cn(BONE, "h-[52px] w-full max-md:h-12", !folded && "mt-3")} />
      </div>
    </AppCard>
  );
}

