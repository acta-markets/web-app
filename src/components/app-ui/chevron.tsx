import * as React from "react";

/**
 * The one chevron the app draws, cut like the logo: square ends, a sharp corner, no curves.
 * Its count and direction say what a control does, the same way everywhere:
 *
 * - `menu`   one, pointing down: opens a list to choose from
 * - `next`   one, pointing right: opens the row it sits in
 * - `switch` two, pointing apart: flips between two values, or steps a value up and down
 * - `go`     two, pointing right: moves forward (a main action, a link out, the way to expiry)
 * - `unfold` two, pointing down: opens what is folded away beneath the control
 * - `fold`   two, pointing up: folds it away again
 * - `close`  two, one over the other and pointing at each other: together they make the x that
 *              closes a modal or a panel
 *
 * It takes the text colour and is sized by its box, e.g. `h-5 w-5` or an em size.
 */
export type ChevronKind = "menu" | "next" | "switch" | "go" | "unfold" | "fold" | "close";

// All on one 20-unit grid. `go` is the brand mark's own geometry; the others are the same
// corner, drawn larger in the box because they sit alone or in a small pill.
const PATHS: Record<ChevronKind, { d: string[]; width: number }> = {
  menu: { d: ["M5 7.5L10 12.5L15 7.5"], width: 2 },
  next: { d: ["M7.5 5L12.5 10L7.5 15"], width: 2 },
  // set well apart, so the pair reads as two chevrons and not as a diamond
  switch: { d: ["M5.5 7.5L10 3L14.5 7.5", "M5.5 12.5L10 17L14.5 12.5"], width: 2 },
  go: { d: ["M10.834 6.6665L14.1673 9.99984L10.834 13.3332", "M5.83398 6.6665L9.16732 9.99984L5.83398 13.3332"], width: 1.5 },
  // `go` turned a quarter, so it is the same pair, pointing down
  unfold: { d: ["M13.3335 10.834L10 14.1673L6.6668 10.834", "M13.3335 5.834L10 9.1673L6.6668 5.834"], width: 1.5 },
  // and turned the other way
  fold: { d: ["M13.3335 9.166L10 5.8327L6.6668 9.166", "M13.3335 14.166L10 10.8327L6.6668 14.166"], width: 1.5 },
  // the corners stop a hair short of each other, so it is an x you can still see is two chevrons
  close: { d: ["M4.5 2.75L10 8.25L15.5 2.75", "M4.5 17.25L10 11.75L15.5 17.25"], width: 1.75 },
};

export function Chevron({ kind, className, ...props }: { kind: ChevronKind } & Omit<React.SVGProps<SVGSVGElement>, "children">) {
  const { d, width } = PATHS[kind];
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      data-chevron={kind}
      className={className}
      {...props}
    >
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
