import * as React from "react";
import { cn } from "@/lib/cn";

export type AppSegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function AppSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm"
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<AppSegmentedOption<T>>;
  className?: string;
  size?: "sm" | "lg";
}) {
  const btn = size === "lg"
    ? "relative min-w-0 flex flex-1 items-center justify-center whitespace-nowrap backdrop-blur-[4px] border px-4 py-2.5 text-base font-normal leading-none tracking-tight transition-colors"
    : "relative min-w-0 flex flex-1 items-center justify-center whitespace-nowrap backdrop-blur-[4px] border px-4 py-2.5 text-sm font-normal leading-none tracking-tight transition-colors";

  return (
    <div
      className={cn("inline-flex select-none items-center gap-2", className)}
      role="tablist"
      aria-label="segmented"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              btn,
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
