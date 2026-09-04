import type { CSSProperties, ReactNode } from "react";

export function SectionMarker({
  label,
  color = "#80C9B6",
}: {
  label: string;
  color?: string;
}) {
  return (
    <div
      className="mb-5 inline-flex items-center gap-[10px] font-mono text-[11px] uppercase"
      style={{ color, letterSpacing: "0.12em" }}
    >
      <span className="inline-block h-px w-8" style={{ background: color }} />
      {label}
    </div>
  );
}

type Variant = "primary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3.5 text-base",
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent-primary text-content-primary border border-accent-primary hover:bg-accent-deep transition-colors",
  ghost:
    "bg-transparent text-content-primary border border-bg-border hover:bg-[rgba(240,240,240,0.08)] transition-colors",
  outline:
    "bg-transparent text-content-primary border border-bg-border hover:border-[rgba(240,240,240,0.4)] transition-colors",
};

export function LandingButton({
  variant = "primary",
  size = "md",
  href,
  external,
  children,
  style,
}: {
  variant?: Variant;
  size?: Size;
  href: string;
  external?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const className = `inline-flex items-center justify-center gap-2 font-mono font-medium leading-tight tracking-[-0.02em] ${sizeClass[size]} ${variantClass[variant]}`;
  const common = {
    className,
    style: { borderRadius: 0, ...style },
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...common}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...common}>
      {children}
    </a>
  );
}

export function LandingBar({
  value,
  max,
  color,
  caption,
  height = 8,
}: {
  value: number;
  max: number;
  color: string;
  caption: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div
        className="mb-2 font-mono text-[12px] text-content-secondary"
        style={{ letterSpacing: "-0.02em" }}
      >
        {caption}
      </div>
      <div
        className="w-full"
        style={{ height, background: "rgba(240,240,240,0.06)" }}
      >
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: color, borderRadius: 0 }}
        />
      </div>
    </div>
  );
}

export function ChevronDownIcon({
  size = 16,
  stroke = "#8A8A8A",
}: {
  size?: number;
  stroke?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChevronRightDuoIcon({
  size = 14,
  stroke = "#8A8A8A",
}: {
  size?: number;
  stroke?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 6l6 6-6 6" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
