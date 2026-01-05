import * as React from "react";
import { cn } from "@/lib/cn";

export function AppCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 shadow-sm backdrop-blur",
        className
      )}
      {...props}
    />
  );
}
