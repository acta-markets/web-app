"use client";

/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { cn } from "@/lib/cn";
import { getTokenLogoSrc } from "@/lib/token-assets";
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

function AssetLogo({ symbol }: { symbol: string }) {
  const logo = getTokenLogoSrc(symbol);
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className="h-4 w-4 shrink-0 rounded-full border border-[rgba(240,240,240,0.1)] bg-content-primary object-cover"
      />
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgba(240,240,240,0.1)] bg-action-primary font-mono text-[9px] font-medium leading-none text-content-primary">
      {symbol.slice(0, 2)}
    </span>
  );
}

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

function SideBadge({ side }: { side: "buy" | "sell" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        side === "buy"
          ? "border-accent-primary/40 text-accent-secondary"
          : "border-bg-border text-content-secondary",
      )}
    >
      {side === "buy" ? "Buy" : "Sell"}
    </span>
  );
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
    return <span className="shrink-0 text-[11px] text-content-tertiary">Deposited</span>;
  }
  if (row.state === "Open" && row.expiryTs != null && row.expiryTs * 1000 > nowMs) {
    return (
      <button
        type="button"
        disabled={deposit.pending != null}
        onClick={() => void deposit.deposit({ pda: buy.pda, market: buy.market })}
        className="shrink-0 font-medium text-accent-secondary underline underline-offset-2 decoration-accent-secondary/60 hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {deposit.pending === buy.pda ? "Depositing…" : "Deposit"}
      </button>
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
          <col className="w-[10%]" />
          <col className="w-[24%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[18%]" />
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
            <th scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Side
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
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.kind === "header") {
              return (
                <tr key={`h-${item.symbol}`} className="border-b border-bg-border bg-action-secondary/40">
                  <td colSpan={8} className="px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
                    {item.symbol} · {item.count}
                  </td>
                </tr>
              );
            }
            const row = item.row;
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
                    <AssetLogo symbol={row.symbol} />
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
                  <span className="flex items-center gap-1.5">
                    <span className="block min-w-0 truncate">
                      {row.sentenceBody.replace(/\s+by\s+.*$/, "")}
                    </span>
                    <BuyDepositButton row={row} nowMs={nowMs} deposit={deposit} />
                  </span>
                </td>
                <td className={cn("whitespace-nowrap px-2.5 py-2.5 align-middle", recessed && "opacity-60")}>
                  <SideBadge side={row.side} />
                </td>
                <td className={cn("whitespace-nowrap px-2.5 py-2.5 text-right align-middle tabular-nums text-content-secondary", recessed && "opacity-60")}>
                  {row.sizeText}
                </td>
                <td className={cn("whitespace-nowrap px-2.5 py-2.5 text-right align-middle tabular-nums", recessed && "opacity-60")}>
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
                <td className="whitespace-nowrap px-2.5 py-2.5 text-right align-middle tabular-nums">
                  {row.pnlNum == null || !row.isOpen ? (
                    <span
                      className="text-content-secondary"
                      title="Unrealised P&L only exists while a position is open. Realised results are in History."
                    >
                      {"\u2014"}
                    </span>
                  ) : (
                    <span
                      title={
                        row.pnlStale
                          ? "Based on a stale underlying price."
                          : "If you executed now at the current underlying price."
                      }
                    >
                      <span className={pnlTone(row.pnlNum)}>{row.pnlText}</span>
                      {row.pnlStale ? (
                        <span className="ml-1 align-super text-[9px] uppercase tracking-[0.08em] text-content-tertiary">
                          stale
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className={cn("whitespace-nowrap px-2.5 py-2.5 text-right align-middle tabular-nums text-content-secondary", recessed && "opacity-60")}>
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
                    <span className="truncate text-[11.5px] text-content-primary" title={row.productLabel === "Secured put" ? "Cash-secured put" : row.productLabel}>{row.productLabel}</span>
                    <span className="sr-only">, {row.state}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
