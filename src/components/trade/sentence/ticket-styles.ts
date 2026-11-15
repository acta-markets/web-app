// Shared class names for the trade strip under the chart, its loading skeleton and the profit table.
import { TYPE_LABEL, TYPE_NOTE, TYPE_VALUE } from "@/components/app-ui/type-styles";

/** One ticket cell: an eyebrow, one big value, one quiet note. All four cells share these. */
export const TICKET_CELL = "col-span-2 flex min-w-0 flex-col gap-2 py-3 md:col-span-1";
/** The two time headings over the strip: "Now" and "By Nov 20, in 6 days". Set in the sentence's own face, since they finish it. */
export const TICKET_WHEN = "col-span-2 pt-1 font-space text-base font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary";
/** The one size for every cell's main line: the amount, the premium and both outcomes. */
export const TICKET_VALUE = TYPE_VALUE;
/** Labels and notes are one size and one tracking (the handoff's mono-sm): weight and colour tell them apart. */
export const TICKET_LABEL = `${TYPE_LABEL} text-content-tertiary`;
/** Two lines tall whatever it holds, so a message appearing or wrapping never moves the row or the button. */
export const TICKET_NOTE = `min-h-[2.6em] ${TYPE_NOTE} text-content-secondary`;

/** One block of a loading skeleton. */
export const BONE = "animate-pulse bg-action-primary";
