import * as React from "react";
import { cn } from "@/lib/cn";

export function AppCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/10 bg-white/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-white/10 dark:bg-black/40 dark:supports-[backdrop-filter]:bg-black/30",
        className
      )}
      {...props}
    />
  );
}


