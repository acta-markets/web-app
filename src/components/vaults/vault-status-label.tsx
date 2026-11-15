import { cn } from "@/lib/cn";
import type { VaultStatusTone, VaultStatusView } from "@/lib/vaults/presentation";

const DOT: Record<VaultStatusTone, string> = {
  open: "bg-accent-primary",
  neutral: "bg-content-secondary",
  warning: "bg-additional-orange-primary",
};

export function VaultStatusLabel({
  status,
  showDetail = true,
  wrap = false,
  className,
}: {
  status: VaultStatusView;
  showDetail?: boolean;
  /** Let the detail run onto a second line where there is room for one, instead of cutting it off. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary",
        wrap ? "items-baseline" : "items-center",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", wrap && "relative -top-px", DOT[status.tone])} aria-hidden="true" />
      <span className={wrap ? undefined : "truncate"}>
        <span className={status.tone === "warning" ? "text-additional-orange-primary" : "text-content-primary"}>
          {status.label}
        </span>
        {showDetail && status.detail ? <span> · {status.detail}</span> : null}
      </span>
    </span>
  );
}
