import * as React from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center border-4 border-bg-border bg-bg-tertiary shadow-neo-sm",
        className
      )}
      role="tablist"
      aria-label="segmented"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-5 py-3 text-sm font-black uppercase tracking-wide transition-colors",
              "border-r-4 border-bg-border last:border-r-0",
              active ? "bg-action-primary text-accent-primary" : "bg-bg-tertiary text-content-primary hover:bg-action-secondary"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
