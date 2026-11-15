"use client";

import { AppInlineSelect, type AppInlineSelectOption } from "@/components/app-ui/app-inline-select";
import { TokenLogo } from "./token-logo";

const ALL = "all";

/**
 * Narrows the open positions to one asset. One control whatever the number of assets: it
 * names the choice and its count, and the rest are in a menu that opens under it and scrolls.
 * A row of chips, one per asset, needed a sideways scroll once a wallet held more than a few.
 *
 * It is the trade page's asset selector (`AppInlineSelect`): a styled, keyboard-driven menu
 * from 768px and the platform's own picker on phones.
 */
export function AssetFilter({
  counts,
  total,
  value,
  onChange,
}: {
  /** Each asset with how many open positions it has, in the order to list them. */
  counts: ReadonlyArray<readonly [symbol: string, count: number]>;
  /** How many open positions there are in all. */
  total: number;
  /** The chosen asset; null shows every asset. */
  value: string | null;
  onChange: (symbol: string | null) => void;
}) {
  const options: AppInlineSelectOption[] = [
    { value: ALL, label: "All assets", detail: String(total) },
    ...counts.map(([symbol, count]) => ({
      value: symbol,
      label: symbol,
      detail: String(count),
      icon: <TokenLogo symbol={symbol} />,
    })),
  ];
  const shown = value != null ? counts.find(([symbol]) => symbol === value) : undefined;
  return (
    <AppInlineSelect
      label="Filter positions by asset"
      value={shown ? shown[0] : ALL}
      options={options}
      onChange={(next) => onChange(next === ALL ? null : next)}
      // the app's chip, as Earn's sort control; the glyph is sized here because a chip's text is small
      className="h-10 gap-2 border-bg-border px-4 py-2.5 font-mono text-sm leading-none tracking-[-0.02em] text-content-secondary hover:text-content-primary max-md:h-8 max-md:px-3 [&>svg]:h-4 [&>svg]:w-4"
    >
      <span className="inline-flex items-center gap-2">
        {shown ? <TokenLogo symbol={shown[0]} /> : null}
        <span className="text-content-primary">{shown ? shown[0] : "All assets"}</span>
        <span className="tabular-nums">{shown ? shown[1] : total}</span>
      </span>
    </AppInlineSelect>
  );
}
