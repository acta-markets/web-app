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
  className,
}: {
  status: VaultStatusView;
  showDetail?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status.tone])} aria-hidden="true" />
      <span className="truncate">
        <span className={status.tone === "warning" ? "text-additional-orange-primary" : "text-content-primary"}>
          {status.label}
        </span>
        {showDetail && status.detail ? <span> · {status.detail}</span> : null}
      </span>
    </span>
  );
}
