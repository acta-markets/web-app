// Shared class names for the trade strip under the chart, its loading skeleton and the profit table.

/** One ticket cell: an eyebrow, one big value, one quiet note. All four cells share these. */
export const TICKET_CELL = "col-span-2 flex min-w-0 flex-col gap-2 py-3 md:col-span-1";
/** The two time headings over the strip: "Now" and "By Nov 20, in 6 days". Set in the sentence's own face, since they finish it. */
export const TICKET_WHEN = "col-span-2 pt-1 font-space text-base font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary";
/** The one size for every cell's main line: the amount, the premium and both outcomes. */
export const TICKET_VALUE = "font-mono text-xl font-semibold leading-[1.25] tracking-[-0.02em]";
export const TICKET_LABEL = "font-mono text-[11px] font-medium uppercase leading-[1.2] tracking-[0.12em] text-content-tertiary";
/** Two lines tall whatever it holds, so a message appearing or wrapping never moves the row or the button. */
export const TICKET_NOTE = "min-h-[2.6em] font-mono text-xs leading-[1.3] tracking-[-0.24px] text-content-secondary";

/** One block of a loading skeleton. */
export const BONE = "animate-pulse bg-action-primary";
