import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export type ButtonLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex items-center justify-center border-[3px] border-black font-bold uppercase transition-all duration-100 select-none active:translate-x-1 active:translate-y-1 active:shadow-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-yuzu-main hover:bg-yuzu-accent hover:text-white shadow-neo",
  secondary: "bg-white hover:bg-black hover:text-white shadow-neo",
  ghost: "bg-transparent hover:bg-black hover:text-white shadow-neo-sm"
};

const sizes: Record<ButtonSize, string> = {
  md: "px-6 py-2",
  lg: "px-8 py-4 text-xl"
};

function getButtonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string
) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button className={getButtonClassName(variant, size, className)} {...props} />
  );
}

export function ButtonLink({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonLinkProps) {
  return <a className={getButtonClassName(variant, size, className)} {...props} />;
}


