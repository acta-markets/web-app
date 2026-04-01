import * as React from "react";
import { cn } from "@/lib/cn";

export function AppModal({
  open,
  onClose,
  title,
  showHowItWorks = true,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  showHowItWorks?: boolean;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-bg-primary/80 backdrop-blur-sm"
        aria-label="Close modal"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative w-full max-w-2xl border border-bg-border bg-bg-primary p-6 shadow-2xl",
          "text-content-primary"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {showHowItWorks ? (
              <div className="text-xs font-medium text-content-tertiary">How it works</div>
            ) : null}
            <div className="mt-1 text-xl font-medium">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-content-secondary hover:bg-action-primary hover:text-content-primary"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
