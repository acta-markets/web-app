import { cn } from "@/lib/cn";

/** Plain text tabs for a tab bar that sits on the top rule of its panel. */
export function AppTextTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-6 overflow-x-auto", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 py-3 font-mono text-sm leading-[1.2] tracking-[-0.28px] transition-colors",
              active
                ? "border-accent-primary text-content-primary"
                : "border-transparent text-content-secondary hover:text-content-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
