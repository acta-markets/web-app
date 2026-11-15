"use client";

import { AppSegmented } from "@/components/app-ui/app-segmented";
import { InfoTooltip } from "@/components/app-ui/info-tooltip";

type Scope = "all" | "worth";

/**
 * What the open positions show and what the fund button funds: all of them, or only the
 * bought options worth exercising, which are in the money at the current price and not yet
 * expired. Two choices side by side, each with how many it leaves, so it reads as a filter
 * and not as a mode. It works with the asset filter in the table's header: an asset chosen
 * there and "Worth exercising" here leave that asset's options worth exercising.
 *
 * The card it sits in always opens with these two choices, whatever asset is picked, so its
 * header never changes shape. When nothing qualifies, "Worth exercising" stays in place with
 * a zero and cannot be chosen.
 */
export function ExerciseFilter({
  total,
  count,
  active,
  onChange,
}: {
  /** How many open positions "All" shows. */
  total: number;
  /** How many of them are worth exercising. */
  count: number;
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  const tally = (n: number) => <span className="ml-1.5 tabular-nums text-content-tertiary">{n}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <AppSegmented<Scope>
        value={active ? "worth" : "all"}
        onChange={(scope) => onChange(scope === "worth")}
        ariaLabel="Which positions to show and fund"
        stretch={false}
        options={[
          { value: "all", label: <>All{tally(total)}</> },
          { value: "worth", label: <>Worth exercising{tally(count)}</>, disabled: count === 0 },
        ]}
      />
      <InfoTooltip label="What worth exercising means">
        Bought options that are in the money at the current price and have not expired. Fund one before it expires to exercise it; a funded one is already set.
      </InfoTooltip>
    </span>
  );
}
