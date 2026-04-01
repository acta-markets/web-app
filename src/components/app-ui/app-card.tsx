import * as React from "react";
import { cn } from "@/lib/cn";

export function AppCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border border-bg-border bg-bg-primary backdrop-blur-[4px]",
        className
      )}
      {...props}
    />
  );
}
