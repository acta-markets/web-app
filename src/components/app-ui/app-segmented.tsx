import * as React from "react";
import { cn } from "@/lib/cn";

export type AppSegmentedOption<T extends string> = {
  value: T;
  /** Plain text, or a composed face such as a logo plus ticker and count. */
  label: React.ReactNode;
};

export function AppSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
  disabled = false,
  stretch = true,
  ariaLabel = "segmented"
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<AppSegmentedOption<T>>;
  className?: string;
  size?: "sm" | "lg";
  disabled?: boolean;
  /** Equal-width tabs (default) or each tab hugging its own content. */
  stretch?: boolean;
  ariaLabel?: string;
}) {
  const sizing = stretch ? "flex-1" : "shrink-0";
  const btn = size === "lg"
    ? `relative min-w-0 ${sizing} flex items-center justify-center whitespace-nowrap backdrop-blur-[4px] border px-4 py-2.5 text-base font-normal leading-none tracking-tight transition-colors`
    : `relative min-w-0 ${sizing} flex items-center justify-center whitespace-nowrap backdrop-blur-[4px] border px-4 py-2.5 text-sm font-normal leading-none tracking-tight transition-colors`;

  return (
    <div
      className={cn("inline-flex select-none items-center gap-2", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              btn,
              "disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-accent-primary/20 border-accent-primary/30 text-content-primary"
                : "bg-[rgba(18,18,18,0.01)] border-bg-border text-content-secondary hover:text-content-primary"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
