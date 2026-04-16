import * as React from "react";
import { cn } from "@/lib/cn";

export function AppPill({
  active,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border h-6 px-2.5 py-0.5 text-xs font-medium tracking-tight text-content-primary",
        active
          ? "bg-accent-primary/20 border-accent-primary/30 backdrop-blur-[4px]"
          : "border-[rgba(240,240,240,0.1)] hover:border-[rgba(240,240,240,0.25)]",
        className
      )}
      {...props}
    />
  );
}
