"use client";

import { useMemo, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { NONE, formatDate, formatPercent, formatSharePrice, formatTokenAmount } from "@/lib/vaults/format";
import type { VaultCycle } from "@/lib/vaults/types";

const FIRST_PAGE = 10;
const PAGE = 20;

export function VaultCyclesTable({
  cycles,
  decimals,
  symbol,
}: {
  cycles: readonly VaultCycle[];
  decimals: number;
  symbol: string;
}) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const rows = useMemo(() => [...cycles].sort((a, b) => Number(b.started_at) - Number(a.started_at)), [cycles]);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="cycle-history-heading" className="flex flex-col gap-4">
      <h2
        id="cycle-history-heading"
        className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary"
      >
        Cycle history
      </h2>
      <AppTable>
        <thead className="border-b border-bg-border bg-bg-primary">
          <tr>
            <AppTh>Cycle</AppTh>
            <AppTh>Started</AppTh>
            <AppTh>Ended</AppTh>
            <AppTh className="text-right">Return</AppTh>
            <AppTh className="text-right">Share price</AppTh>
            <AppTh className="text-right">Equity</AppTh>
            <AppTh className="text-right">Positions</AppTh>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((cycle) => {
            // a running cycle can already carry end values; they are not final
            const running = cycle.finished_at == null;
            return (
              <tr key={`${cycle.cycle_number}:${cycle.started_at}`} className="border-b border-bg-border bg-bg-primary last:border-b-0">
                {/* cycle numbers start at 0 on chain; people count from 1 */}
                <AppTd className="tabular-nums">{Number(cycle.cycle_number) + 1}</AppTd>
                <AppTd>{formatDate(Number(cycle.started_at))}</AppTd>
                <AppTd>{running ? <span className="text-content-secondary">Running</span> : formatDate(Number(cycle.finished_at))}</AppTd>
                <AppTd className="text-right tabular-nums">
                  {running ? NONE : formatPercent(cycle.return_pct, { signed: true })}
                </AppTd>
                <AppTd className="text-right tabular-nums">
                  {running || cycle.share_price_end == null ? NONE : formatSharePrice(cycle.share_price_end)}
                </AppTd>
                <AppTd className="text-right tabular-nums">
                  {running || cycle.equity_end == null
                    ? NONE
                    : `${formatTokenAmount(BigInt(cycle.equity_end), decimals, { compact: true })} ${symbol}`}
                </AppTd>
                <AppTd className="text-right tabular-nums">{cycle.positions_opened}</AppTd>
              </tr>
            );
          })}
        </tbody>
      </AppTable>
      {rows.length > limit ? (
        <AppButton variant="ghost" className="self-start pl-0" onClick={() => setLimit((n) => n + PAGE)}>
          Show more
        </AppButton>
      ) : null}
    </section>
  );
}
