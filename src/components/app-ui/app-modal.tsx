import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Chevron } from "./chevron";

export function AppModal({
  open,
  onClose,
  title,
  titleFace = "mono",
  showHowItWorks = true,
  dismissible = true,
  className,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** the title in the mono face by default; "heading" sets a name in the heading face, as the card and the page do */
  titleFace?: "mono" | "heading";
  showHowItWorks?: boolean;
  /** false while something must finish first, e.g. a wallet signature: Esc, backdrop and Close do nothing */
  dismissible?: boolean;
  /** merged into the panel, e.g. to narrow it */
  className?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open || !dismissible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, dismissible]);

  // portal target only exists in the browser
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  // Portalled to <body>: rendered in place, a modal inside <main> (a z-[1] stacking
  // context) sat under the z-50 header. z-[90] keeps it above the page and below
  // the wallet sidebar (100/101), the invite gate (100) and toasts (200), which a
  // modal can open on top of itself.
  return createPortal(
    <div
      className="app-type fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[rgba(18,18,18,0.8)]"
        aria-label="Close modal"
        disabled={!dismissible}
        onClick={onClose}
      />

      <div
        className={cn(
          // never taller than the screen: a long modal scrolls inside itself instead of being cut off top and bottom
          // the handoff's one shadow for a floating element: 0 1px 2px at 6%; no blur behind it
          "relative max-h-full w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[var(--radius)] border border-bg-border bg-bg-primary p-6 shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
          "text-content-primary",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {showHowItWorks ? (
              <div className="text-xs font-medium text-content-tertiary">How it works</div>
            ) : null}
            <div className={cn("mt-1", titleFace === "heading" ? "font-space text-xl font-semibold tracking-[-0.02em]" : "font-mono text-xl font-medium")}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close"
            className="-mr-2 -mt-1 p-2 text-content-secondary transition-colors hover:bg-action-primary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content-secondary"
          >
            <Chevron kind="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
