import * as React from "react";
import { cn } from "@/lib/cn";

export type AppTabOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

/** Underlined full-width tabs (Figma "Deposit Tabs"), as on the market page. */
export function AppTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<AppTabOption<T>>;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex w-full", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center p-3 font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "border-b-2 border-accent-primary bg-accent-primary/20 text-accent-secondary"
                : "border-b border-bg-border bg-transparent text-content-primary hover:text-accent-secondary"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
