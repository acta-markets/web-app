"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { TokenLogo } from "@/components/portfolio/token-logo";
import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import { formatUsdSmart } from "@/lib/markets";
import { formatExpiryDay } from "@/lib/trade/format";
import {
  buildDisplayList,
  formatExpiryCountdown,
  type PositionsTableRow,
  type SortDir,
  type SortKey,
} from "@/lib/portfolio-positions";

type SortState = { key: SortKey; dir: SortDir };

type DepositControl = {
  pending: string | null;
  funded: ReadonlySet<string>;
  deposit: (position: { pda: string; market: string }) => void;
};

const SORTABLE: Array<{ key: SortKey; label: string }> = [
  { key: "size", label: "Size" },
  { key: "premium", label: "Premium" },
  { key: "pnl", label: "uPnL" },
  { key: "expiry", label: "Expiry" },
];

function pnlTone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function HeaderSort({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 whitespace-nowrap uppercase transition-colors hover:text-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
    >
      {label}
      <span aria-hidden="true" className="w-2 text-[10px] leading-none text-content-tertiary">
        {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </span>
    </button>
  );
}

function StateBadge({ state, open }: { state: string; open: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        open
          ? "border-accent-primary/40 text-accent-secondary"
          : "border-bg-border text-content-secondary",
      )}
    >
      {state}
    </span>
  );
}

/**
 * What the Fund action does, in the position's own numbers: the deposit amount (USDC to
 * buy at the strike for a call, the underlying units for a put), when it must land, and
 * what happens if it never does. Physical options do not auto-exercise.
 */
function fundTooltipCopy(row: PositionsTableRow): string {
  const isPut = row.productLabel === "Put";
  // A bought put deposits the underlying units (the position size); a call deposits USDC.
  const amount = isPut ? row.sizeText : (row.exerciseText ?? "the required amount");
  const expiry = row.expiryTs != null ? ` before ${formatExpiryDay(row.expiryTs * 1000)}` : "";
  const delivery = ` Funding it delivers at ${row.strikeText}, which turns your uPnL into realised profit or loss.`;
  return `Deposit ${amount}${expiry} to exercise.${delivery} Unfunded options are not exercised and the premium is lost.`;
}

/**
 * Compact trailing deposit action for a bought physical position that can still be
 * exercised. A bought option needs a deposit before expiry to exercise; once funded the
 * state badge takes over, so this only surfaces for an unfunded open buy before expiry.
 */
function BuyDepositButton({ row, nowMs, deposit }: { row: PositionsTableRow; nowMs: number; deposit?: DepositControl }) {
  const buy = row.buy;
  if (!deposit || !buy) return null;
  if (deposit.funded.has(buy.pda)) {
    return <span className="shrink-0 text-[11px] text-content-tertiary">Funded</span>;
  }
  if (row.state === "Open" && row.expiryTs != null && row.expiryTs * 1000 > nowMs) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <button
          type="button"
          disabled={deposit.pending != null}
          onClick={() => void deposit.deposit({ pda: buy.pda, market: buy.market })}
          title={`Fund the exercise: pay ${row.exerciseText ?? "the strike"} before expiry so the option can be exercised.`}
          aria-label={row.exerciseText ? `Fund exercise, ${row.exerciseText}` : undefined}
          className="whitespace-nowrap font-medium text-accent-secondary underline underline-offset-2 decoration-accent-secondary/60 hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deposit.pending === buy.pda ? "Funding…" : "Fund"}
        </button>
        <InfoTooltip label="How funding this position works">
          {fundTooltipCopy(row)}
        </InfoTooltip>
      </span>
    );
  }
  return null;
}

/**
 * A unified, sortable positions table — one row per position across every state. Open
 * positions carry the live unrealised mark; settled ones carry the realised outcome; the
 * default order is "most at risk first" (open by nearest expiry, then closed). Closed and
 * settled rows are visually recessed but stay readable. Numbers right-align on tabular
 * figures with no rounded corners, matching the app's key/value idiom.
 */
export function PositionsTable({
  rows,
  nowMs,
  grouped,
  deposit,
}: {
  rows: PositionsTableRow[];
  nowMs: number;
  grouped: boolean;
  deposit?: DepositControl;
}) {
  const [sort, setSort] = React.useState<SortState>({ key: "risk", dir: "asc" });
  /** Symbols whose group is folded shut; everything starts open so nothing hides by default. */
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  const toggleGroup = (symbol: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const items = React.useMemo(
    () => buildDisplayList(rows, sort.key, sort.dir, grouped),
    [rows, sort, grouped],
  );

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  if (rows.length === 0) {
    return (
      <div className="border border-bg-border p-8 text-center">
        <p className="font-space text-lg font-medium text-content-primary">No positions yet</p>
        <p className="mx-auto mt-2 max-w-md font-mono text-sm leading-[1.5] text-content-secondary">
          Positions appear here after an RFQ fills. Request a quote on the trade page — once it
          executes, it lands in your portfolio with its live P&L.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-bg-border bg-bg-primary">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[24%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[17%]" />
          <col className="w-[9%]" />
        </colgroup>
        <caption className="sr-only">
          Your positions, sorted by risk: open positions by nearest expiry first, then settled.
        </caption>
        <thead>
          <tr className="border-b border-bg-border">
            <th scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Asset
            </th>
            <th scope="col" className="px-2.5 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Position
            </th>
            {SORTABLE.map(({ key, label }) => (
              <th
                key={key}
                scope="col"
                aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary"
              >
                <span className="inline-flex justify-end">
                  <HeaderSort
                    label={label}
                    active={sort.key === key}
                    dir={sort.dir}
                    onSort={() => toggleSort(key)}
                  />
                </span>
              </th>
            ))}
            <th scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Type
            </th>
            <th scope="col" className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.kind === "header") {
              const open = !collapsed.has(item.symbol);
              return (
                <tr key={`h-${item.symbol}`} className="border-b border-bg-border bg-action-secondary/40">
                  <td colSpan={8} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.symbol)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-content-tertiary transition-colors hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-primary"
                    >
                      <span
                        aria-hidden="true"
                        className={cn("inline-block w-2 text-[9px] transition-transform", open ? "rotate-90" : "rotate-0")}
                      >
                        {"\u25b6"}
                      </span>
                      <TokenLogo symbol={item.symbol} className="mr-1.5 h-3.5 w-3.5" />
                      {item.symbol} · {item.count}
                    </button>
                  </td>
                </tr>
              );
            }
            const row = item.row;
            if (grouped && collapsed.has(row.symbol)) return null;
            const recessed = !row.isOpen && row.state !== "Settling";
            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-bg-border transition-colors last:border-b-0 hover:bg-action-secondary/40",
                  recessed && "bg-action-secondary/20",
                )}
              >
                <th
                  scope="row"
                  className={cn("whitespace-nowrap px-2.5 py-2.5 text-left align-middle", recessed && "opacity-60")}
                >
                  <span className="flex items-center gap-2 font-medium text-content-primary">
                    <TokenLogo symbol={row.symbol} />
                    <span>{row.symbol}</span>
                  </span>
                </th>
                <td
                  className={cn(
                    "overflow-hidden px-2.5 py-2.5 text-left align-middle font-mono text-[12.5px] text-content-secondary",
                    recessed && "opacity-60",
                  )}
                  title={row.sentence}
                >
                  <span className="block truncate">{row.sentenceBody.replace(/\s+by\s+.*$/, "")}</span>
                </td>
                <td className={cn("whitespace-nowrap py-2.5 pl-3 pr-2.5 text-right align-middle tabular-nums text-content-secondary", recessed && "opacity-60")}>
                  {row.sizeText}
                </td>
                <td className={cn("whitespace-nowrap py-2.5 pl-3 pr-2.5 text-right align-middle tabular-nums", recessed && "opacity-60")}>
                  {row.premiumNum == null ? (
                    <span className="text-content-secondary">{"\u2014"}</span>
                  ) : (
                    <span
                      className="text-content-primary"
                      title={row.premiumLabel ? `${formatUsdSmart(row.premiumNum)} ${row.premiumLabel}` : undefined}
                    >
                      {formatUsdSmart(row.premiumNum)}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-2.5 text-right align-middle tabular-nums">
                  {row.pnlNum == null || !row.isOpen ? (
                    <span
                      className="text-content-secondary"
                      title="Unrealised P&L only exists while a position is open. Realised results are in History."
                    >
                      {"\u2014"}
                    </span>
                  ) : (
                    <span
                      title={`Mark ${row.markText ?? "unavailable"} · same spot the trade page labels NOW · valued at intrinsic, so no time value`}
                    >
                      <span className={pnlTone(row.pnlNum)}>{row.pnlText}</span>

                    </span>
                  )}
                </td>
                <td className={cn("whitespace-nowrap py-2.5 pl-3 pr-2.5 text-right align-middle tabular-nums text-content-secondary", recessed && "opacity-60")}>
                  {row.expiryTs == null ? (
                    "\u2014"
                  ) : row.isOpen ? (
                    formatExpiryCountdown(row.expiryTs, nowMs)
                  ) : (
                    formatExpiryDay(row.expiryTs * 1000)
                  )}
                </td>
                <td className={cn("whitespace-nowrap px-2.5 py-2.5 align-middle", recessed && "opacity-60")}>
                  <span className="flex items-center gap-1.5" title={row.state}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        row.state === "Open" && "bg-accent-primary",
                        row.state === "Funded" && "bg-accent-primary/60",
                        row.state === "Settling" && "bg-content-secondary",
                        row.state === "Liquidated" && "bg-additional-red-primary",
                        !row.isOpen && row.state !== "Settling" && row.state !== "Liquidated" && "bg-content-tertiary",
                      )}
                    />
                    <span className="truncate text-[11px] text-content-primary" title={row.productLabel === "Secured put" ? "Cash-secured put" : row.productLabel}>{row.productLabel}</span>
                    <span className="sr-only">, {row.state}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5 text-right align-middle">
                  <BuyDepositButton row={row} nowMs={nowMs} deposit={deposit} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
