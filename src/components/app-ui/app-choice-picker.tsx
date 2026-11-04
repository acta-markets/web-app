import * as React from "react";
import { cn } from "@/lib/cn";

type ChoiceValue = string | number;

export type AppChoicePickerOption<T extends ChoiceValue> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
};

/** A keyboard-accessible group of discrete choices such as strikes or expiries. */
export function AppChoicePicker<T extends ChoiceValue>({
  label,
  value,
  onChange,
  options,
  className,
  optionsClassName,
}: {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly AppChoicePickerOption<T>[];
  className?: string;
  optionsClassName?: string;
}) {
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const firstEnabled = options.findIndex((option) => !option.disabled);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : firstEnabled;

  const move = (index: number, direction: -1 | 1 | "first" | "last") => {
    const enabled = options
      .map((option, optionIndex) => option.disabled ? -1 : optionIndex)
      .filter((optionIndex) => optionIndex >= 0);
    if (!enabled.length) return;

    const current = enabled.indexOf(index);
    const next = direction === "first"
      ? enabled[0]
      : direction === "last"
        ? enabled[enabled.length - 1]
        : enabled[(Math.max(0, current) + direction + enabled.length) % enabled.length];
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="mb-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{label}</legend>
      <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", optionsClassName)}>
        {options.map((option, index) => {
          const selected = value === option.value && !option.disabled;
          return (
            <button
              key={option.value}
              ref={(node) => { buttons.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, -1);
                } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  move(index, "first");
                } else if (event.key === "End") {
                  event.preventDefault();
                  move(index, "last");
                }
              }}
              className={cn(
                "min-w-0 border px-3 py-2 text-left font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums backdrop-blur-[4px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "border-accent-primary/30 bg-accent-primary/20 text-content-primary"
                  : "border-bg-border bg-[rgba(18,18,18,0.01)] text-content-primary hover:border-content-primary/15 hover:bg-[rgba(40,40,40,0.24)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
