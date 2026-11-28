"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Chevron } from "@/components/app-ui/chevron";
import { buildProfitLadder, type ProfitRow } from "@/lib/trade/profit-ladder";
import type { Direction } from "@/lib/trade/thesis";
import { TICKET_LABEL, TICKET_NOTE } from "./ticket-styles";

/** How far the panel's bottom-left corner sits from the pointer: this much right of it and this much above. */
const POINTER_GAP = 10;
/** The panel never comes closer than this to the window's edge. */
const EDGE = 8;
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * One profit table. Each row reads as an outcome, "+5% at $70,441 ... +$2.06", and never wraps.
 * The move is its own column of a fixed six characters, the longest a move gets ("\u221213.1%",
 * "+100%"), so the "at $..." column stays where it is when the moves go from one digit to two.
 * The buyer's own goal is one of the rows, at its own price, in a quiet green.
 */
function ProfitRows({ breakeven, steps, testId }: { breakeven: ProfitRow | null; steps: ProfitRow[]; testId: string }) {
  return (
    <dl data-testid={testId} className={cn(TICKET_NOTE, "grid w-full grid-cols-[6ch_1fr_auto] items-baseline gap-x-2.5 whitespace-nowrap tabular-nums")}>
      {/* breakeven leads, because it is the line where the trade stops losing */}
      {breakeven ? (
        <>
          <Row row={breakeven} />
          <div className="col-span-3 border-t border-bg-border" aria-hidden="true" />
        </>
      ) : null}
      {steps.map((row) => (
        <Row key={`${row.move} ${row.price}`} row={row} profit />
      ))}
    </dl>
  );
}

function Row({ row, profit = false }: { row: ProfitRow; profit?: boolean }) {
  return (
    // The buyer's goal is one of the lines, told apart by a quiet green on its move and price
    // (Tim, 28 Nov 2026: no label, no bright ink, a subtle green): the goal line's own green on
    // the chart, softer than the profit figures beside it.
    <div className={cn("contents", row.goal && "text-accent-secondary")} data-goal={row.goal ? "true" : undefined}>
      <dt>{row.move}</dt>
      <dt>
        <span className="text-content-tertiary">at</span> {row.price}
      </dt>
      <dd className={cn("text-right tabular-nums", profit && "text-additional-green-primary-deep")}>{row.result}</dd>
    </div>
  );
}

/**
 * A bought option's outlook, under "You profit": one link, "Breakdown", and behind it the whole
 * ladder (the breakeven, then what the trade makes further out) in a panel that opens on hover
 * or on a click (a tap pins it open). The cell itself holds no table (Tim, 28 Nov 2026). The
 * panel floats, so nothing below it moves. It appears beside the pointer, up and to the right
 * of it, and stays there while the link is hovered.
 *
 * It takes plain numbers and owns its own open state, so typing a size or opening the panel
 * re-renders this link and nothing else. Until the trade is priced and sized there is no
 * ladder, and `emptyNote` stands in the link's place. The link's slot is as tall as that note
 * (two lines), so one replacing the other never moves the button.
 */
export const ProfitOutlook = memo(function ProfitOutlook({
  asset,
  direction,
  strike,
  spot,
  breakeven,
  premiumUsd,
  units,
  goalPrice = null,
  emptyNote,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  spot: number;
  breakeven: number;
  premiumUsd: number | null;
  units: number | null;
  /** the buyer's goal: its row in the ladder is marked */
  goalPrice?: number | null;
  emptyNote: string;
}) {
  /** Pinned by a click, a tap or the keyboard. */
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  /** Where the pointer was when the panel appeared, in window coordinates; null when it was opened from the keyboard. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const shown = open || hovered;
  const link = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // The panel's bottom-left corner goes ten pixels right of and above the pointer, so it opens
  // where the eye already is and never under the cursor. Opened from the keyboard there is no
  // pointer, and it sits on the link's top-left corner instead. Either way it is kept whole
  // inside the window, so nothing has to scroll to show it.
  useIsomorphicLayoutEffect(() => {
    const el = panel.current;
    const box = link.current?.getBoundingClientRect();
    if (!shown || !el || !box) return;
    const cornerX = pointer ? pointer.x + POINTER_GAP : box.left;
    const cornerY = pointer ? pointer.y - POINTER_GAP : box.top - 4;
    const left = Math.max(EDGE, Math.min(cornerX, document.documentElement.clientWidth - el.offsetWidth - EDGE));
    const top = Math.max(EDGE, cornerY - el.offsetHeight);
    // the panel is positioned from its link, so the window coordinates are taken back to it
    el.style.left = `${left - box.left}px`;
    el.style.top = `${top - box.top}px`;
  }, [shown, pointer]);
  const ladder = useMemo(
    () => buildProfitLadder({ direction, strike, spot, breakeven, premiumUsd, units, goalPrice }),
    [direction, strike, spot, breakeven, premiumUsd, units, goalPrice],
  );
  if (ladder.steps.length === 0) return <span className={TICKET_NOTE}>{emptyNote}</span>;

  return (
    <div className={cn(TICKET_NOTE, "flex items-start")}>
      <div
        ref={link}
        className="relative flex w-fit"
        onMouseEnter={(e) => {
          setPointer({ x: e.clientX, y: e.clientY });
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
          setOpen(false);
        }}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={(e) => {
            // already showing under the pointer: a click only pins it where it is. A keyboard
            // click (detail 0) has no pointer to open beside.
            if (!hovered) setPointer(e.detail === 0 ? null : { x: e.clientX, y: e.clientY });
            setOpen((was) => !was);
          }}
          onBlur={() => setOpen(false)}
          // the page's one quiet link, dressed exactly as "How it works"
          className="inline-flex items-center gap-0.5 font-mono text-[12px] leading-[1.2] tracking-[-0.02em] text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none"
        >
          Breakdown
          <Chevron kind="go" className="h-4 w-4" />
        </button>
        <div
          ref={panel}
          data-testid="ticket-breakdown"
          className={cn(
            // the app's floating surface, as the info tooltip and the sentence's menus. The one
            // panel that opens upward, because the trade button sits right under its link; where
            // exactly is set from the pointer, above
            "absolute left-0 top-0 z-30 w-max min-w-[220px] border border-bg-border bg-bg-primary p-3 shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)]",
            shown ? "block" : "hidden",
          )}
        >
          <p className={cn(TICKET_LABEL, "mb-2 whitespace-nowrap")}>
            If <span className="normal-case">{asset}</span> ends {direction}
          </p>
          <ProfitRows breakeven={ladder.breakeven} steps={ladder.steps} testId="ticket-profit-ladder" />
        </div>
      </div>
    </div>
  );
});
