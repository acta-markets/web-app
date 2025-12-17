import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border-2 border-black px-4 py-2 font-bold shadow-neo-sm",
        className
      )}
      {...props}
    />
  );
}


