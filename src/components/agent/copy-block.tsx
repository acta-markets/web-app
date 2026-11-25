"use client";

import { useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { TYPE_DENSE, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { cn } from "@/lib/cn";

/**
 * Text a person pastes somewhere else: a prompt, a command, a config, a URL. The button copies
 * exactly what is shown. With `action` the copy is the block's one job and gets a full button
 * under the text; without it, a quiet "Copy" in the corner.
 */
export function CopyBlock({
  text,
  label,
  action,
  wrap,
  compact,
  className,
}: {
  text: string;
  label: string;
  /** The button's words, for the block a page is built around: "Copy prompt". */
  action?: string;
  /** Prose wraps; a command or a config scrolls sideways so its lines stay whole. */
  wrap?: boolean;
  /** One row, no heading: a short line among others, such as a thing to ask. */
  compact?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // no clipboard here: the text is on screen to select
    }
  };
  if (compact) {
    return (
      <div className={cn("flex items-start justify-between gap-4 border border-bg-border bg-bg-primary px-4 py-2.5", className)}>
        <span className={cn(TYPE_NOTE, "min-w-0 break-words text-content-primary")}>{text}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className={cn(TYPE_DENSE, "shrink-0 pt-0.5 text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none")}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={cn("border border-bg-border bg-bg-primary", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-bg-border px-4 py-2">
        <span className={cn(TYPE_DENSE, "text-content-secondary")}>{label}</span>
        {action ? null : (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label}`}
            className={cn(TYPE_DENSE, "text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none")}
          >
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        )}
      </div>
      <pre className={cn(TYPE_NOTE, "px-4 py-3 text-content-primary", wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre")}>
        <code>{text}</code>
      </pre>
      {action ? (
        <div className="border-t border-bg-border p-4">
          <AppButton type="button" onClick={copy} className="w-full pl-5 pr-5 sm:w-auto">
            <span aria-live="polite">{copied ? "Copied" : action}</span>
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}
