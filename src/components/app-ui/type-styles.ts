// The app's small type: one set for Trade, Earn and Portfolio, so a label on one page is a
// label on the next. Sizes sit on the handoff scale (12/14/16/20/24) and every piece of mono
// text carries the same -0.02em tracking. Colour is left to the place that uses them.

/** What a figure is: "You deposit", "Net P&L", a table's column head. */
export const TYPE_LABEL = "font-mono text-[14px] font-medium leading-[1.2] tracking-[-0.02em]";
/** The quiet line under a figure, and any small running text. */
export const TYPE_NOTE = "font-mono text-[14px] font-normal leading-[1.45] tracking-[-0.02em]";
/** A figure. */
export const TYPE_VALUE = "font-mono text-2xl font-semibold leading-[1.2] tracking-[-0.02em]";
/** Dense annotation only: chart axes, a table row's second line, small badges. */
export const TYPE_DENSE = "font-mono text-[12px] leading-[1.3] tracking-[-0.02em]";
/** Clickable text: regular weight and grey, brighter on hover. It always ends in the `go` chevron. */
export const TYPE_LINK =
  "inline-flex items-center gap-0.5 font-mono font-normal tracking-[-0.02em] text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none";
