import * as React from "react";
import { cn } from "@/lib/cn";

export function AppTable({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-white/10 bg-white/5",
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
        "whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-content-secondary",
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
        "whitespace-nowrap px-5 py-3.5 text-[15px] text-content-primary",
        className
      )}
      {...props}
    />
  );
}
