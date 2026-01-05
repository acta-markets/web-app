import * as React from "react";
import { cn } from "@/lib/cn";

export function AppPill({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-accent-primary/20 px-2.5 py-1 text-xs font-semibold text-content-primary",
        className
      )}
      {...props}
    />
  );
}
