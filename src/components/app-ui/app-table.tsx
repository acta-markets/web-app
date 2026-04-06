import * as React from "react";
import { cn } from "@/lib/cn";

export function AppTable({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto border border-bg-border backdrop-blur-[4px] overflow-clip",
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
        "whitespace-nowrap px-5 py-3 text-left text-sm font-medium tracking-tight text-content-secondary",
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
        "whitespace-nowrap px-5 py-5 text-sm font-medium text-content-primary",
        className
      )}
      {...props}
    />
  );
}
