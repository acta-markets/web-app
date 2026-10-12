import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function AppModal({
  open,
  onClose,
  title,
  showHowItWorks = true,
  dismissible = true,
  className,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[rgba(18,18,18,0.8)] backdrop-blur-sm"
        aria-label="Close modal"
        disabled={!dismissible}
        onClick={onClose}
      />

      <div
        className={cn(
          "relative w-full max-w-2xl border border-bg-border bg-bg-primary p-6 shadow-2xl",
          "text-content-primary",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {showHowItWorks ? (
              <div className="text-xs font-medium text-content-tertiary">How it works</div>
            ) : null}
            <div className="mt-1 font-mono text-xl font-medium">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            className="px-3 py-2 font-mono text-sm font-medium text-content-secondary hover:bg-action-primary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
