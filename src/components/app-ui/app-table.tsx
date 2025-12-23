import * as React from "react";
import { cn } from "@/lib/cn";

export function AppTable({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-black/10 bg-white/80 dark:border-white/10 dark:bg-black/40",
        className
      )}
    >
      <table className="min-w-full text-sm" {...props} />
    </div>
  );
}

export function AppTh({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50",
        className
      )}
      {...props}
    />
  );
}

export function AppTd({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-3 text-sm text-black/80 dark:text-white/70",
        className
      )}
      {...props}
    />
  );
}


