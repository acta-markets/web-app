"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { buildProfitLadder, type ProfitRow } from "@/lib/trade/profit-ladder";
import type { Direction } from "@/lib/trade/thesis";
import { TICKET_LABEL, TICKET_NOTE } from "./ticket-styles";

/** How many steps the cell itself shows; the rest are behind "More prices". */
const SHOWN_STEPS = 3;

/**
 * One profit table. Each row reads as an outcome, "+5% at $70,441 ... +$2.06", and never wraps.
 * The move is its own column of a fixed six characters, the longest a move gets ("\u221213.1%",
 * "+100%"), so the "at $..." column stays where it is when the moves go from one digit to two.
 */
function ProfitRows({ breakeven, steps, testId }: { breakeven: ProfitRow | null; steps: ProfitRow[]; testId: string }) {
  return (
    <dl data-testid={testId} className={cn(TICKET_NOTE, "grid w-full grid-cols-[5ch_1fr_auto] items-baseline gap-x-2.5 whitespace-nowrap tabular-nums")}>
      {/* breakeven leads, because it is the line where the trade stops losing */}
      {breakeven ? (
        <>
          <Row row={breakeven} />
          <div className="col-span-3 border-t border-bg-border" aria-hidden="true" />
        </>
      ) : null}
      {steps.map((row) => (
        <Row key={row.move} row={row} profit />
      ))}
    </dl>
  );
}

function Row({ row, profit = false }: { row: ProfitRow; profit?: boolean }) {
  return (
    <div className="contents">
      <dt>{row.move}</dt>
      <dt>
        <span className="text-content-tertiary">at</span> {row.price}
      </dt>
      <dd className={cn("text-right tabular-nums", profit && "text-additional-green-primary-deep")}>{row.result}</dd>
    </div>
  );
}

/**
 * A bought option's outlook, under "You profit": the breakeven and the first three profit points,
 * with the rest of the ladder in a panel that opens on hover or on a click (a tap pins it open).
 * The panel floats above the strip instead of growing the cell, so nothing below it moves.
 *
 * It takes plain numbers and owns its own open state, so typing a size or opening the panel
 * re-renders this table and nothing else. Until the trade is priced and sized there is no table,
 * and `emptyNote` stands in its place.
 */
export const ProfitOutlook = memo(function ProfitOutlook({
  asset,
  direction,
  strike,
  spot,
  breakeven,
  premiumUsd,
  units,
  emptyNote,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  spot: number;
  breakeven: number;
  premiumUsd: number | null;
  units: number | null;
  emptyNote: string;
}) {
  const [open, setOpen] = useState(false);
  // The panel opens under its link, so on a short window it can land below the fold: when it
  // is opened by a click or a tap, the page moves just enough to show all of it.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const ladder = useMemo(
    () => buildProfitLadder({ direction, strike, spot, breakeven, premiumUsd, units }),
    [direction, strike, spot, breakeven, premiumUsd, units],
  );
  if (ladder.steps.length === 0) return <span className={TICKET_NOTE}>{emptyNote}</span>;

  return (
    <>
      <ProfitRows breakeven={ladder.breakeven} steps={ladder.steps.slice(0, SHOWN_STEPS)} testId="ticket-profit-points" />
      {ladder.steps.length > SHOWN_STEPS ? (
        <div className="group relative flex w-fit" onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            onBlur={() => setOpen(false)}
            // the app's quiet action link, as HALF and MAX
            className="font-mono text-xs font-medium leading-[1.2] tracking-[-0.28px] text-accent-secondary transition-all hover:-translate-y-0.5 hover:text-accent-primary focus-visible:-translate-y-0.5 focus-visible:text-accent-primary focus-visible:outline-none"
          >
            More prices
          </button>
          <div
            ref={panel}
            data-testid="ticket-more-prices"
            className={cn(
              // the app's floating surface, as the info tooltip and the sentence's menus; like
              // them it opens under its trigger, never above (STYLE.md, "Menus and hover panels open downward")
              "absolute left-0 top-full z-30 mt-1 w-max min-w-[220px] border border-bg-border bg-bg-primary p-3 shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)] group-hover:block",
              open ? "block" : "hidden",
            )}
          >
            <p className={cn(TICKET_LABEL, "mb-2 whitespace-nowrap")}>
              If <span className="normal-case">{asset}</span> ends {direction}
            </p>
            <ProfitRows breakeven={ladder.breakeven} steps={ladder.steps} testId="ticket-profit-ladder" />
          </div>
        </div>
      ) : null}
    </>
  );
});
