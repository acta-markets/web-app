import * as React from "react";
import { cn } from "@/lib/cn";

export function AppModal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        aria-label="Close modal"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative w-full max-w-2xl rounded-2xl border border-white/10 bg-black/70 p-6 shadow-2xl backdrop-blur",
          "text-white"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-white/50">How it works</div>
            <div className="mt-1 text-xl font-semibold">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}



