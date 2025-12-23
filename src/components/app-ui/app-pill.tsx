import * as React from "react";
import { cn } from "@/lib/cn";

export function AppPill({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-black/10 bg-yuzu-main/20 px-2.5 py-1 text-xs font-semibold text-black/80 dark:border-white/10 dark:bg-yuzu-main/15 dark:text-white/80",
        className
      )}
      {...props}
    />
  );
}


