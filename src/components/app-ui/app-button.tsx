import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-0.5 font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-primary text-bg-primary hover:bg-accent-deep disabled:bg-accent-primary/30 disabled:text-content-primary/50",
  secondary:
    "bg-[rgba(40,40,40,0.24)] border border-bg-border text-content-primary hover:bg-action-primary hover:border-content-primary/10 disabled:bg-bg-primary disabled:border-bg-border disabled:text-content-primary/25",
  ghost:
    "bg-transparent text-accent-secondary hover:text-accent-primary disabled:text-content-primary/25"
};

const sizes: Record<Size, string> = {
  sm: "h-10 pl-5 pr-4 py-2.5 text-base",
  md: "h-10 pl-5 pr-4 py-2.5 text-base",
  lg: "pl-7 pr-6 py-3 text-xl"
};

export function AppButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export function AppButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
