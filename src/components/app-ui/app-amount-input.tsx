import * as React from "react";
import { cn } from "@/lib/cn";

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-content-primary" aria-hidden="true">
      <path
        d="M6.75 10h6.5M15 5H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="10" r="0.75" fill="currentColor" />
    </svg>
  );
}

function PresetButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="inline-flex h-6 items-center border border-[rgba(240,240,240,0.1)] px-2.5 py-0.5 text-xs font-medium tracking-tight text-content-primary transition-colors hover:border-[rgba(240,240,240,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Token amount field (Figma "Swap Input"), the same markup as the market page's
 * deposit input. Accepts digits with at most `maxDecimals` fraction digits.
 */
export function AppAmountInput({
  id,
  label,
  hint,
  symbol,
  logo,
  value,
  onChange,
  maxDecimals,
  placeholder = "0",
  balance,
  onHalf,
  onMax,
  disabled,
  invalid
}: {
  id: string;
  label: string;
  /** right side of the label row, e.g. an estimate */
  hint?: React.ReactNode;
  symbol: string;
  logo: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxDecimals: number;
  placeholder?: string;
  balance?: React.ReactNode;
  onHalf?: () => void;
  onMax?: () => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pattern = React.useMemo(
    () => (maxDecimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${maxDecimals}})?$`) : /^\d*$/),
    [maxDecimals]
  );

  return (
    <div
      className={cn(
        "flex cursor-text flex-col gap-2 overflow-clip border bg-action-primary p-4 transition-colors",
        invalid
          ? "border-error"
          : "border-[rgba(240,240,240,0.1)] hover:border-[rgba(240,240,240,0.15)] focus-within:border-[rgba(240,240,240,0.15)]"
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between gap-3 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
        <label htmlFor={id}>{label}</label>
        {hint != null ? <span className="min-w-0 truncate text-right tabular-nums">{hint}</span> : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {logo}
          <span className="font-mono text-2xl font-medium leading-[1.2] text-content-primary">{symbol}</span>
        </div>
        <input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const next = e.target.value.replace(",", ".");
            if (pattern.test(next)) onChange(next);
          }}
          className="min-w-0 flex-1 bg-transparent text-right font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary outline-none placeholder:text-content-secondary disabled:cursor-not-allowed"
        />
      </div>

      {balance != null || onHalf || onMax ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-primary">
            <WalletIcon />
            <span className="truncate tabular-nums">{balance}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onHalf ? (
              <PresetButton onClick={onHalf} disabled={disabled}>
                HALF
              </PresetButton>
            ) : null}
            {onMax ? (
              <PresetButton onClick={onMax} disabled={disabled}>
                MAX
              </PresetButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
