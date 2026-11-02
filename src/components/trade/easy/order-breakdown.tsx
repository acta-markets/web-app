import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { AppCard } from "@/components/app-ui/app-card";
import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import type { OutcomeCopy } from "@/lib/trade/thesis";

export type BreakdownRow = {
  label: string;
  value: React.ReactNode;
  /** explanation behind an (i) next to the label */
  info?: string;
};

function Outcome({ kind, copy }: { kind: "right" | "wrong"; copy: OutcomeCopy }) {
  const Icon = kind === "right" ? CheckCircle2 : XCircle;
  return (
    <div className="flex flex-1 flex-col gap-2 border border-bg-border p-4 max-md:p-3">
      <div className="flex items-center gap-2 font-mono text-sm font-medium leading-[1.2] text-content-primary">
        <Icon
          aria-hidden="true"
          className={kind === "right" ? "h-4 w-4 shrink-0 text-additional-green-primary-deep" : "h-4 w-4 shrink-0 text-additional-red-primary"}
        />
        <span>{kind === "right" ? "You're right" : "You're wrong"}</span>
      </div>
      <div className="font-mono text-sm leading-[1.35] text-content-secondary">{copy.when}</div>
      <div className="font-mono text-sm leading-[1.35] text-content-primary">{copy.result}</div>
      <div className="font-mono text-sm leading-[1.35] text-content-secondary">{copy.note}</div>
    </div>
  );
}

/** The order spelled out: what is sold, at what price and date, and both ways it can end. */
export function OrderBreakdown({
  rows,
  outcomes,
}: {
  rows: ReadonlyArray<BreakdownRow>;
  outcomes: { right: OutcomeCopy; wrong: OutcomeCopy } | null;
}) {
  return (
    <AppCard className="p-4 max-md:p-3">
      <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
        Order details
      </h2>
      <dl className="mt-3 divide-y divide-bg-border border-y border-bg-border font-mono text-sm leading-[1.2] tracking-[-0.28px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="flex items-center gap-1.5 text-content-secondary">
              {row.label}
              {row.info ? <InfoTooltip label={`About ${row.label.toLowerCase()}`}>{row.info}</InfoTooltip> : null}
            </dt>
            <dd className="min-w-0 text-right text-content-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
      {outcomes ? (
        <div className="mt-4 flex gap-2 max-md:flex-col">
          <Outcome kind="right" copy={outcomes.right} />
          <Outcome kind="wrong" copy={outcomes.wrong} />
        </div>
      ) : null}
    </AppCard>
  );
}
