"use client";

import { useMemo, useState } from "react";
import { AppColumnFilter } from "@/components/app-ui/app-column-filter";
import { useIsNarrow } from "@/components/app-ui/use-is-narrow";
import { cn } from "@/lib/cn";
import { formatCountdown, formatDate } from "@/lib/vaults/format";
import {
  cyclePhaseLabel,
  EXPOSURE_TYPE,
  exposurePnlTotals,
  exposureRows,
  exposureSpots,
  formatPremium,
  mintUnits,
  stagingText,
  type ExposureRow,
} from "@/lib/vaults/presentation";
import type { Vault, VaultCycle, VaultExposure, VaultPosition, VaultPremium, VaultPremiumFlow } from "@/lib/vaults/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-content-secondary">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums text-content-primary">{children}</dd>
    </div>
  );
}

function premiumText(vault: Vault, premium: readonly VaultPremium[], pick: (p: VaultPremium) => VaultPremiumFlow): string | null {
  const parts = premium.flatMap((p) => {
    const flow = pick(p);
    const units = mintUnits(vault, p.quote_mint);
    const empty = BigInt(flow.received) === 0n && (flow.paid === null || BigInt(flow.paid) === 0n);
    return units && !empty ? [formatPremium(flow, units)] : [];
  });
  return parts.length ? parts.join(", ") : null;
}

type CycleStep = { label: string; detail: string };

/** Where the cycle stands, as an index into the steps. After Requests the vault returns to Idle. */
function cycleStage(vault: Vault, nowSecs: number) {
  const expiry = Number(vault.active_expiry_ts);
  if (vault.phase === "processing_capital") return 4;
  if (vault.phase === "settling") return 3;
  if (vault.phase === "idle" || expiry === 0) return 0;
  return expiry > nowSecs ? 1 : 2;
}

function requestsText(vault: Vault) {
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const [deposits, withdrawals] = [Number(vault.pending_deposit_count), Number(vault.pending_withdraw_count)];
  if (deposits + withdrawals === 0) return "None queued";
  return [deposits ? count(deposits, "deposit") : null, withdrawals ? count(withdrawals, "withdrawal") : null]
    .filter(Boolean)
    .join(", ");
}

/** Recorded cycle boundaries, with a countdown only to the vault's active expiry. */
export function VaultCurrentCycle({ vault, cycles = [], nowSecs }: { vault: Vault; cycles?: readonly VaultCycle[]; nowSecs: number }) {
  const expiry = Number(vault.active_expiry_ts);
  const running = vault.phase === "active" && expiry > 0;
  const current = [...cycles]
    .filter((cycle) => expiry > 0 && Number(cycle.expiry_ts) === expiry)
    .sort((a, b) =>
      Number(b.capital_generation === vault.capital_generation) - Number(a.capital_generation === vault.capital_generation)
      || Number(b.started_at) - Number(a.started_at),
    )[0];
  const startedAt = current ? Number(current.started_at) : null;
  const settledAt = current?.finished_at != null ? Number(current.finished_at) : null;
  const previousEnd = Math.max(0, ...cycles.filter((c) => c !== current).map((c) => Number(c.finished_at ?? 0))) || null;
  const premium = vault.premium ?? [];
  const cycle = premiumText(vault, premium, (p) => p.cycle);
  const total = premiumText(vault, premium, (p) => p.generation);
  const since = vault.generation_started_at;
  const staged = stagingText(vault);
  const stage = cycleStage(vault, nowSecs);
  const settling = stage >= 3 && current ? `${current.positions_settled} / ${current.positions_opened} settled` : "Pending";
  const steps: CycleStep[] = [
    { label: "Idle", detail: stage === 0 ? `Deposits ${vault.accepting_deposits ? "open" : "closed"}` : previousEnd !== null ? formatDate(previousEnd, { time: true }) : "First cycle" },
    {
      label: "Trading",
      detail: [startedAt !== null ? formatDate(startedAt, { time: true }) : stage === 0 ? "Not started" : "Not recorded", stage === 1 ? `${vault.open_positions} open` : null]
        .filter(Boolean)
        .join(" · "),
    },
    { label: "Expiry", detail: expiry > 0 ? formatDate(expiry, { time: true }) : "Not set" },
    { label: "Settlement", detail: settledAt !== null ? formatDate(settledAt, { time: true }) : settling },
    { label: "Requests", detail: requestsText(vault) },
  ];

  return (
    <section aria-label="Current cycle" className="border border-t-0 border-bg-border bg-bg-primary p-5 backdrop-blur-[4px] max-md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-space text-lg font-semibold leading-[1.2] tracking-[-0.36px] text-content-primary">
          Current cycle{current ? ` · ${Number(current.cycle_number) + 1}` : ""}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm">
          <span className="text-content-primary">{cyclePhaseLabel(vault)}</span>
          {running ? (
            <span className="tabular-nums text-content-secondary">
              {expiry > nowSecs ? `${formatCountdown(expiry, nowSecs)} left` : "Expiry reached"}
            </span>
          ) : null}
        </div>
      </div>
      <ol aria-label="Cycle stages" className="mt-4 grid grid-cols-1 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={index === stage ? "step" : undefined}
            className="relative border-l border-bg-border pb-4 pl-4 last:pb-0 sm:border-l-0 sm:border-t sm:pb-0 sm:pl-0 sm:pr-4 sm:pt-3"
          >
            <span aria-hidden="true" className={cn(
              "absolute -left-1 top-1 h-2 w-2 border sm:-top-1 sm:left-0",
              index === stage && "border-accent-primary bg-accent-primary",
              index < stage && "border-accent-primary/40 bg-accent-primary/40",
              index > stage && "border-bg-border bg-bg-primary",
            )} />
            <div className={cn("font-mono text-sm", index === stage ? "text-content-primary" : "text-content-secondary")}>{step.label}</div>
            <div className="mt-1 font-mono text-xs tabular-nums text-content-secondary">{step.detail}</div>
          </li>
        ))}
      </ol>
      {cycle || total || staged ? (
        <dl className="mt-3 grid gap-x-6 font-mono text-sm leading-[1.3] tracking-[-0.28px] md:grid-cols-2">
          {cycle ? <Row label="Premium this cycle">{cycle}</Row> : null}
          {total ? <Row label={since ? `Premium since ${formatDate(Number(since))}` : "Premium"}>{total}</Row> : null}
          {staged ? <Row label="Swap in progress">{staged}</Row> : null}
        </dl>
      ) : null}
    </section>
  );
}

const FILTER_ALL = "all";
const ALL_OPTION = { value: FILTER_ALL, label: "All" };
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "strike", label: "Strike" },
  { key: "size", label: "Size" },
  { key: "distance", label: "Distance" },
  { key: "pnl", label: "P&L at spot" },
];

type SortKey = keyof ExposureRow["sort"];
type Sort = { key: SortKey; ascending: boolean };

function compareRows({ key, ascending }: Sort) {
  return (a: ExposureRow, b: ExposureRow) => {
    const [left, right] = [a.sort[key], b.sort[key]];
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return ascending ? left - right : right - left;
  };
}

function SortHeader({ column, sort, onSort, align, children }: {
  column: (typeof COLUMNS)[number];
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: "right";
  children?: React.ReactNode;
}) {
  const active = sort.key === column.key;
  return (
    <th
      aria-sort={active ? (sort.ascending ? "ascending" : "descending") : "none"}
      className={cn("pb-2 font-normal", align === "right" && "text-right")}
    >
      <button type="button" onClick={() => onSort(column.key)} className="hover:text-content-primary">
        {column.label}{active ? (sort.ascending ? " ↑" : " ↓") : ""}
      </button>
      {children}
    </th>
  );
}

/** Current price from the same response as the position rows. */
export function VaultSpot({ exposure }: { exposure: VaultExposure }) {
  return (
    <p className="font-mono text-sm tabular-nums text-content-secondary">
      {exposureSpots(exposure).map((spot) => (
        <span key={spot.symbol}>{spot.symbol} <span className="text-content-primary">{spot.price}</span></span>
      ))}
    </p>
  );
}

/** How many positions show before "Show all": the page scrolls, never a box inside it. */
const FIRST_ROWS = 10;
/** One colour for money going the wrong way, here and in the portfolio: a loss at spot, and a leg in the money against the vault. */
const LOSS = "text-additional-red-primary";

/**
 * Open legs at spot. A table from 768px; below that, where six columns do not fit, each
 * position is two lines and the columns' sort and filters sit in a bar above the list. A long
 * list shows its first ten, then all of them on request, and is never cut by a fixed height.
 */
export function VaultExposureCard({ exposure, positions = [] }: { exposure: VaultExposure; positions?: readonly VaultPosition[] }) {
  const [type, setType] = useState<string>(FILTER_ALL);
  const [side, setSide] = useState<string>(FILTER_ALL);
  const [moneyness, setMoneyness] = useState<string>(FILTER_ALL);
  const [sort, setSort] = useState<Sort>({ key: "distance", ascending: true });
  const [showAll, setShowAll] = useState(false);
  const narrow = useIsNarrow();

  const rows = useMemo(() => exposureRows(exposure, positions), [exposure, positions]);
  const types = [...new Set(Object.values(EXPOSURE_TYPE))].filter((value) => rows.some((row) => row.type === value));
  const visible = rows
    .filter((row) => type === FILTER_ALL || row.type === type)
    .filter((row) => side === FILTER_ALL || row.role === side)
    .filter((row) => moneyness === FILTER_ALL || row.itm === (moneyness === "ITM"))
    .sort(compareRows(sort));
  // the total is for every position that matches, shown or not
  const totals = exposurePnlTotals(visible);
  const shown = showAll ? visible : visible.slice(0, FIRST_ROWS);
  const onSort = (key: SortKey) => setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }));

  const typeFilter = <AppColumnFilter label="type" value={type} allValue={FILTER_ALL} onChange={setType} options={[ALL_OPTION, ...types.map((value) => ({ value, label: value }))]} />;
  const sideFilter = <AppColumnFilter label="side" value={side} allValue={FILTER_ALL} onChange={setSide} options={[ALL_OPTION, { value: "Sold", label: "Sold" }, { value: "Bought", label: "Bought" }]} />;
  const moneynessFilter = <AppColumnFilter label="moneyness" value={moneyness} allValue={FILTER_ALL} onChange={setMoneyness} options={[ALL_OPTION, { value: "ITM", label: "ITM" }, { value: "OTM", label: "OTM" }]} />;
  const pnlTone = (row: ExposureRow) => (row.pnlAtoms !== null && row.pnlAtoms < 0n ? LOSS : undefined);

  return (
    <div>
      {narrow ? (
        <div className="font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-bg-border pb-3 text-content-secondary">
            <span>Type{typeFilter}</span>
            <span>Side{sideFilter}</span>
            <span>ITM / OTM{moneynessFilter}</span>
          </div>
          <div role="group" aria-label="Sort positions" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-bg-border py-3 text-content-secondary">
            <span className="text-[12px] font-medium text-content-tertiary">Sort</span>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <button key={column.key} type="button" aria-pressed={active} onClick={() => onSort(column.key)} className={active ? "text-content-primary" : "hover:text-content-primary"}>
                  {column.label}{active ? (sort.ascending ? " ↑" : " ↓") : ""}
                </button>
              );
            })}
          </div>
          <ul className="divide-y divide-bg-border text-content-primary">
            {shown.map((row) => (
              <li key={row.position} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{row.type} <span className="text-content-secondary">· {row.role}</span></span>
                  <span className={cn("shrink-0 tabular-nums", row.itm && LOSS)}>{row.distance}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="tabular-nums text-content-secondary">{row.strike} · {row.size}</span>
                  <span className={cn("shrink-0 tabular-nums", pnlTone(row))}>{row.pnl}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <table className="w-full font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          <thead className="text-left text-content-secondary">
            <tr>
              <th className="pb-2 font-normal">Type{typeFilter}</th>
              <th className="pb-2 font-normal">Side{sideFilter}</th>
              <SortHeader column={COLUMNS[0]} sort={sort} onSort={onSort} />
              <SortHeader column={COLUMNS[1]} sort={sort} onSort={onSort} />
              <SortHeader column={COLUMNS[2]} sort={sort} onSort={onSort} align="right">{moneynessFilter}</SortHeader>
              <SortHeader column={COLUMNS[3]} sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border text-content-primary">
            {shown.map((row) => (
              <tr key={row.position}>
                <td className="py-2">{row.type}</td>
                <td className="py-2">{row.role}</td>
                <td className="py-2 tabular-nums">{row.strike}</td>
                <td className="py-2 tabular-nums">{row.size}</td>
                <td className={cn("py-2 text-right tabular-nums", row.itm && LOSS)}>{row.distance}</td>
                <td className={cn("py-2 text-right tabular-nums", pnlTone(row))}>{row.pnl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {visible.length === 0 ? <p className="py-3 font-mono text-sm text-content-secondary">No positions match.</p> : null}
      {visible.length > FIRST_ROWS ? (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((was) => !was)}
          className="mt-3 font-mono text-sm font-medium text-accent-secondary transition-colors hover:text-accent-primary"
        >
          {showAll ? "Show fewer" : `Show all ${visible.length} positions`}
        </button>
      ) : null}
      {totals.length ? (
        <dl className="mt-3 border-t border-bg-border font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          <Row label="Net P&L at spot">
            {totals.map((t) => (
              <div key={t.quoteMint}>{t.value}</div>
            ))}
          </Row>
        </dl>
      ) : null}
      <p className="mt-1 font-mono text-xs leading-[1.5] text-content-secondary">
        If every position expired at the current price: premium plus payoff. Bought positions exclude the protocol fee.
      </p>
    </div>
  );
}
