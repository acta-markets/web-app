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
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const count = Math.max(1, options.length);

  const wrap = size === "lg"
    ? "relative inline-flex select-none items-center rounded-full border border-white/10 bg-white/5 p-1.5"
    : "relative inline-flex select-none items-center rounded-full border border-white/10 bg-white/5 p-1";

  const btn = size === "lg"
    ? "relative z-10 min-w-0 flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold leading-none transition-colors"
    : "relative z-10 min-w-0 flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold leading-none transition-colors sm:px-3.5 sm:py-2 sm:text-xs";

  return (
    <div
      className={cn(
        wrap,
        className
      )}
      style={
        {
          ["--seg-index" as any]: idx,
          ["--seg-count" as any]: count
        } as React.CSSProperties
      }
      role="tablist"
      aria-label="segmented"
    >
      <div className="pointer-events-none absolute inset-1">
        <div
          className="h-full rounded-full bg-accent-primary transition-transform duration-200 ease-out"
          style={{
            width: "calc(100% / var(--seg-count))",
            transform: "translateX(calc(100% * var(--seg-index)))"
          }}
        />
      </div>

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
              active ? "text-bg-primary" : "text-content-secondary hover:text-content-primary"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
