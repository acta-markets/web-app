import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border-2 border-bg-border bg-bg-tertiary px-4 py-2 font-bold text-content-primary shadow-neo-sm",
        className
      )}
      {...props}
    />
  );
}
