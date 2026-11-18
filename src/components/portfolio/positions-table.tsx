"use client";

import { TYPE_LABEL } from "@/components/app-ui/type-styles";
import { useViewPref } from "@/lib/state/view-prefs";
import * as React from "react";
import { Share2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AppButtonLink } from "@/components/app-ui/app-button";
import { InfoTooltip } from "@/components/app-ui/info-tooltip";
import { useIsNarrow } from "@/components/app-ui/use-is-narrow";
import { TokenLogo } from "@/components/portfolio/token-logo";
import { ShareCardModal } from "@/components/share/share-card";
import { formatUsdSmart } from "@/lib/markets";
import { IS_MAINNET } from "@/lib/network";
import { shareLink } from "@/lib/share/actions";
import { hasShareablePosition, positionShareCard, type ShareCard } from "@/lib/share/card";
import { formatExpiryDay } from "@/lib/trade/format";
import {
  DEFAULT_SORT,
  buildDisplayList,
  canFundRow,
  canWithdrawRow,
  formatExpiryCountdown,
  isRowFunded,
  nextSort,
  type PositionsTableRow,
  type SortKey,
  type SortState,
} from "@/lib/portfolio-positions";

/** `open` is what is live now, valued at the current price; `history` is what closed and how. */
export type PositionsVariant = "open" | "history";

export type DepositControl = {
  /** Positions whose deposit is being signed or confirmed; empty when idle. */
  pending: ReadonlySet<string>;
  funded: ReadonlySet<string>;
  deposit: (position: { pda: string; market: string }) => void;
  /** Takes a funded option's deposit back; without it a funded option only says so. */
  withdraw?: (position: { pda: string; market: string }) => void;
};

type ColumnId = "position" | "now" | "size" | "premium" | "pnl" | "expiry" | "outcome" | "action";

type Column = {
  id: ColumnId;
  label: string;
  /** A CSS width; the position column has none and takes whatever the others leave. */
  width?: string;
  /** Width classes, for a column whose width depends on the screen. */
  widthClassName?: string;
  align: "left" | "right";
  sort?: SortKey;
  /** A column whose header is only announced, not drawn. */
  hiddenLabel?: boolean;
};

// The page shell leaves the table 708px between 1024 and 1279px wide screens, so these widths
// are set for that case: the product type sits under the claim instead of taking a column.
const COLUMNS: Record<PositionsVariant, Column[]> = {
  open: [
    { id: "position", label: "Position", align: "left" },
    { id: "now", label: "Now", width: "11%", align: "right" },
    { id: "size", label: "Size", width: "12%", align: "right", sort: "size" },
    { id: "premium", label: "Premium", width: "10%", align: "right", sort: "premium" },
    { id: "pnl", label: "uPnL", width: "12%", align: "right", sort: "pnl" },
    { id: "expiry", label: "Expiry", width: "10%", align: "right", sort: "expiry" },
    // One button of one width and its (i). Under 1280px the table is 708px and every pixel here
    // comes out of the claim beside it; from 1280px there is room for a button with air in it.
    { id: "action", label: "Action", widthClassName: "w-[98px] xl:w-[132px]", align: "right", hiddenLabel: true },
  ],
  history: [
    { id: "position", label: "Position", align: "left" },
    { id: "size", label: "Size", width: "12%", align: "right", sort: "size" },
    { id: "premium", label: "Premium", width: "11%", align: "right", sort: "premium" },
    { id: "expiry", label: "Closed", width: "10%", align: "right", sort: "expiry" },
    { id: "pnl", label: "Result", width: "13%", align: "right", sort: "pnl" },
    { id: "outcome", label: "Outcome", width: "18%", align: "left" },
  ],
};

const LABEL = `${TYPE_LABEL} text-content-tertiary`;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary";
const DASH = "—";

// One layout is rendered, not both hidden by CSS: a second copy of every row would double
// what assistive tech reads. Below `md` the table cannot fit, so rows stack.
function pnlTone(n: number): string {
  if (n > 0) return "text-additional-green-primary";
  if (n < 0) return "text-additional-red-primary";
  return "text-content-primary";
}

function dotTone(row: PositionsTableRow): string {
  if (row.state === "Liquidated") return "bg-additional-red-primary";
  if (row.state === "Open") return "bg-accent-primary";
  if (row.state === "Funded") return "bg-accent-primary/60";
  return "bg-content-secondary";
}

/** The claim without its date, which has a column of its own: "ends below $150". */
function claimOf(row: PositionsTableRow): string {
  return row.sentenceBody.replace(/\s+by\s+.*$/, "");
}

/** Past its expiry but not yet closed on chain: the countdown is over, settlement is not. */
function isSettling(row: PositionsTableRow, nowMs: number): boolean {
  return row.state === "Settling" || (row.expiryTs != null && row.expiryTs * 1000 <= nowMs);
}

function whenText(row: PositionsTableRow, nowMs: number, variant: PositionsVariant): string {
  if (row.expiryTs == null) return DASH;
  if (variant === "history") return formatExpiryDay(row.expiryTs * 1000);
  return isSettling(row, nowMs) ? "Settling" : formatExpiryCountdown(row.expiryTs, nowMs);
}

/** A bought put is funded with the underlying (its size); a bought call with USDC at the strike. */
function fundAmount(row: PositionsTableRow): string | null {
  return row.productLabel === "Put" ? row.sizeText : row.exerciseText;
}

/**
 * What the Fund action does, in the position's own numbers: the deposit amount, when it must
 * land, and what happens if it never does. Physical options do not auto-exercise.
 */
function fundTooltipCopy(row: PositionsTableRow): string {
  const amount = fundAmount(row) ?? "the required amount";
  const expiry = row.expiryTs != null ? ` before ${formatExpiryDay(row.expiryTs * 1000)}` : "";
  const delivery = ` Funding it delivers at ${row.strikeText}, which turns your uPnL into realised profit or loss.`;
  return `Fund it with ${amount}${expiry} to exercise.${delivery} Unfunded options are not exercised and the premium is lost.`;
}

/** What taking the deposit back does: the amount, until when, and what the option is after. */
function withdrawTooltipCopy(row: PositionsTableRow): string {
  const amount = fundAmount(row) ?? "the deposit";
  const expiry = row.expiryTs != null ? ` any time before ${formatExpiryDay(row.expiryTs * 1000)}` : "";
  return `Take ${amount} back${expiry}. The option is then unfunded again: it is not exercised and the premium is lost, unless you fund it again before expiry.`;
}

/**
 * The deposit a bought physical option needs before expiry to be exercised. Missing it loses
 * the premium, so it is drawn as a button, never as a text link. Once funded, the deposit can
 * be taken back until expiry: a quieter button, since it undoes the funding. A funded option
 * with nothing to take back says "Funded" here in the table, where the row has no other place.
 */
function isFunded(row: PositionsTableRow, deposit?: DepositControl): boolean {
  return isRowFunded(row, deposit?.funded);
}

function canFund(row: PositionsTableRow, nowMs: number, deposit?: DepositControl): boolean {
  return !!deposit && canFundRow(row, nowMs, deposit.funded);
}

/** A funded option whose deposit can be taken back from here: the row then shows Withdraw. */
function canWithdraw(row: PositionsTableRow, nowMs: number, deposit?: DepositControl): boolean {
  return !!deposit?.withdraw && row.buy != null && canWithdrawRow(row, nowMs, deposit.funded);
}

/**
 * A row's button in the table. Its width is set by the longest label it ever shows (eight
 * letters: "Withdraw", "Funding…", "Sending…"), not by the one it shows now, so a row that
 * starts funding does not widen its column and push the table about.
 */
const ROW_BUTTON = "h-7 w-[calc(8ch+12px)] px-0 xl:h-8 xl:w-[calc(8ch+26px)] xl:text-[14px]";
const ROW_ACTION = "inline-flex shrink-0 gap-1 xl:gap-2";

/**
 * A row with nothing to press says its state in the button's own box: the same width, height
 * and type, with the room of the info icon kept beside it. Every word in the column then sits
 * on one axis, whether it is a button or not.
 */
function RowStatus({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn("items-center whitespace-nowrap", ROW_ACTION)}>
      <span className={cn("inline-flex items-center justify-center font-mono text-xs text-content-tertiary", ROW_BUTTON)}>{children}</span>
      <span aria-hidden="true" className="w-4 shrink-0" />
    </span>
  );
}

function FundAction({
  row,
  nowMs,
  deposit,
  wide,
}: {
  row: PositionsTableRow;
  nowMs: number;
  deposit?: DepositControl;
  /** Room to name the amount on the button itself (the stacked phone layout). */
  wide: boolean;
}) {
  const buy = row.buy;
  const amount = fundAmount(row);
  if (isFunded(row, deposit)) {
    const withdraw = deposit?.withdraw;
    if (!deposit || !withdraw || !buy || !canWithdraw(row, nowMs, deposit)) {
      // Nothing to press, but the table row has no other place that says so. The stacked
      // layout says it on its own line.
      return wide ? null : <RowStatus>Funded</RowStatus>;
    }
    const sending = deposit.pending.has(buy.pda);
    return (
      <span className={cn("items-center whitespace-nowrap", wide ? "flex w-full gap-2" : ROW_ACTION)}>
        <button
          type="button"
          disabled={deposit.pending.size > 0}
          onClick={() => void withdraw({ pda: buy.pda, market: buy.market })}
          aria-label={amount ? `Withdraw deposit, ${amount}` : "Withdraw deposit"}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap border border-bg-border font-mono text-xs font-medium text-content-secondary transition-colors hover:border-content-tertiary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40",
            FOCUS,
            wide ? "h-10 flex-1 px-2.5 text-sm" : ROW_BUTTON,
          )}
        >
          {/* the narrow column holds eight letters: "Withdrawing…" is for the stacked layout */}
          {sending ? (wide ? "Withdrawing…" : "Sending…") : wide && amount ? `Withdraw ${amount}` : "Withdraw"}
        </button>
        <InfoTooltip label="How withdrawing this deposit works">{withdrawTooltipCopy(row)}</InfoTooltip>
      </span>
    );
  }
  if (!deposit || !buy || !canFund(row, nowMs, deposit)) return null;
  return (
    <span className={cn("items-center whitespace-nowrap", wide ? "flex w-full gap-2" : ROW_ACTION)}>
      <button
        type="button"
        disabled={deposit.pending.size > 0}
        onClick={() => void deposit.deposit({ pda: buy.pda, market: buy.market })}
        aria-label={amount ? `Fund exercise, ${amount}` : undefined}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap border border-accent-primary/50 px-2.5 font-mono text-xs font-medium text-accent-secondary transition-colors hover:border-accent-primary hover:bg-accent-primary/20 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40",
          FOCUS,
          wide ? "h-10 flex-1 text-sm" : ROW_BUTTON,
        )}
      >
        {deposit.pending.has(buy.pda) ? "Funding…" : wide && amount ? `Fund ${amount}` : "Fund"}
      </button>
      <InfoTooltip label="How funding this position works">{fundTooltipCopy(row)}</InfoTooltip>
    </span>
  );
}

/** The longest uPnL figure that still leaves room for the share icon in the column under 1280px: "+$154.40". */
const ICON_FITS_UNDER = 8;

/**
 * A position's uPnL as the button that opens its share card: the figure, with the share icon
 * to its left so figures stay right-aligned down the column. Under 1280px the column has no
 * spare width, so beside a long figure the icon is left out there; the figure still opens the card.
 */
function SharePnl({ row, onShare, roomy }: { row: PositionsTableRow; onShare: (row: PositionsTableRow) => void; roomy: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onShare(row)}
      aria-label={`Share ${row.symbol} position, uPnL ${row.pnlText}`}
      // exactly the line it sits on: a row with a share button is as tall as one without
      className={cn("group inline-flex h-[21px] items-center gap-1 align-top font-[inherit] leading-[21px] tabular-nums", FOCUS)}
    >
      <Share2
        aria-hidden="true"
        className={cn(
          "h-3 w-3 shrink-0 text-content-tertiary transition-colors group-hover:text-content-primary",
          !roomy && row.pnlText.length > ICON_FITS_UNDER && "max-xl:hidden",
        )}
      />
      <Pnl row={row} />
    </button>
  );
}

function GroupToggle({ symbol, count, open, onToggle }: { symbol: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        LABEL,
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-primary",
      )}
    >
      <span aria-hidden="true" className={cn("inline-block w-2 text-[12px] transition-transform", open ? "rotate-90" : "rotate-0")}>
        {"▶"}
      </span>
      <TokenLogo symbol={symbol} className="mr-1.5 h-3.5 w-3.5" />
      {symbol} · {count}
    </button>
  );
}

/** The columns a table can be ordered by; a remembered order naming anything else is ignored. */
const SORT_KEYS: readonly SortKey[] = ["risk", "expiry", "size", "premium", "pnl"];

function sortArrow(sort: SortState, key: SortKey): string {
  if (sort.key !== key) return "";
  return sort.dir === "asc" ? "▲" : "▼";
}

function Product({ row }: { row: PositionsTableRow }) {
  return (
    <span className="truncate" title={row.productLabel === "Secured put" ? "Cash-secured put" : undefined}>
      {row.productLabel}
      {row.legsText ? <span className="text-content-secondary"> {row.legsText}</span> : null}
    </span>
  );
}

/** The whole position for a hover: the sentence with its date, what the product is, and that it is funded. */
function rowTitle(row: PositionsTableRow, funded: boolean): string {
  const product = row.productLabel === "Secured put" ? "Cash-secured put" : row.productLabel;
  return [row.sentence, row.legsText ? `${product} ${row.legsText}` : product, funded ? "Funded" : null].filter(Boolean).join(" · ");
}

function Pnl({ row, className }: { row: PositionsTableRow; className?: string }) {
  if (row.pnlNum == null) return <span className={cn("text-content-secondary", className)}>{DASH}</span>;
  return <span className={cn(pnlTone(row.pnlNum), className)}>{row.pnlText}</span>;
}

function EmptyOpen() {
  return (
    <div className="flex flex-col items-center border border-bg-border p-8 text-center">
      <p className="font-space text-xl font-semibold leading-[1.2] tracking-[-0.02em] text-content-primary">No open positions</p>
      <p className="mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        Positions you open on the trade page appear here with their live P&L.
      </p>
      <AppButtonLink href="/trade" variant="secondary" className="mt-5">
        Go to trade
      </AppButtonLink>
    </div>
  );
}

/**
 * One table for every position. The `open` variant carries the live mark, a countdown and the
 * Fund action; the `history` variant carries the realised result and how the position ended.
 * The default order is most at risk first: open by nearest expiry, then closed by recency.
 * From `md` up it is a table of one-line rows; below that each position stacks into three lines.
 * An open position's uPnL is also the button that opens its share card.
 */
export function PositionsTable({
  rows,
  nowMs,
  grouped,
  deposit,
  filter,
  share,
  variant = "open",
  empty,
}: {
  rows: PositionsTableRow[];
  nowMs: number;
  grouped: boolean;
  deposit?: DepositControl;
  /** A control that narrows the rows by what the Position column holds, drawn in its header. */
  filter?: React.ReactNode;
  /** Lets each open position with a uPnL be shared as a card; the code rides in the post's link. */
  share?: { referralCode?: string | null };
  variant?: PositionsVariant;
  /** Shown instead of the table when there are no rows. */
  empty?: React.ReactNode;
}) {
  // the order is a habit: it is kept per table and comes back on the next visit
  const [savedSort, saveSort] = useViewPref(variant === "history" ? "portfolioSortHistory" : "portfolioSortOpen");
  const sort: SortState = savedSort && (SORT_KEYS as readonly string[]).includes(savedSort.key) ? (savedSort as SortState) : DEFAULT_SORT;
  const setSort = (next: SortState | ((current: SortState) => SortState)) => saveSort(typeof next === "function" ? next(sort) : next);
  /** Symbols whose group is folded shut; everything starts open so nothing hides by default. */
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const narrow = useIsNarrow();
  /** The card as it stood when its icon was pressed: the image does not redraw while prices tick. */
  const [shared, setShared] = React.useState<{ card: ShareCard; url: string } | null>(null);
  const onShare =
    share && variant === "open"
      ? (row: PositionsTableRow) =>
          setShared({
            card: positionShareCard(row, { devnet: !IS_MAINNET, nowMs: Date.now() }),
            url: shareLink(window.location.origin, share.referralCode),
          })
      : null;
  const shareModal = shared ? (
    <ShareCardModal open onClose={() => setShared(null)} title="Share your position" card={shared.card} url={shared.url} />
  ) : null;

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

  if (rows.length === 0) return <>{empty ?? <EmptyOpen />}</>;

  const columns = COLUMNS[variant];
  const sortable = columns.filter((c): c is Column & { sort: SortKey } => c.sort != null);
  const hidden = (symbol: string) => grouped && collapsed.has(symbol);
  const note =
    variant === "open" ? (
      <p className="mt-2 font-mono text-[14px] leading-[1.45] tracking-[-0.02em] text-content-secondary">
        uPnL values each position at the current price (Now) against its strike. It leaves out time value.
      </p>
    ) : null;

  if (narrow) {
    return (
      <div>
        <div className="border border-bg-border bg-bg-primary">
          {/* a row of its own: beside the sort buttons it would push them into a sideways scroll */}
          {filter ? <div className="flex items-center border-b border-bg-border px-3 py-2">{filter}</div> : null}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-bg-border px-3 py-1.5">
            <span className={cn(LABEL, "mr-1 shrink-0")}>Sort</span>
            {sortable.map((column) => {
              const active = sort.key === column.sort;
              return (
                <button
                  key={column.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSort((prev) => nextSort(prev, column.sort))}
                  className={cn(
                    "shrink-0 px-2 py-1.5 font-mono text-xs tracking-[-0.02em] transition-colors",
                    FOCUS,
                    active ? "bg-accent-primary/20 text-content-primary" : "text-content-secondary hover:text-content-primary",
                  )}
                >
                  {column.label}
                  {active ? <span aria-hidden="true" className="ml-1 text-[12px]">{sortArrow(sort, column.sort)}</span> : null}
                </button>
              );
            })}
          </div>
          <ul className="text-[14px] tracking-[-0.02em]">
            {items.map((item) => {
              if (item.kind === "header") {
                return (
                  <li key={`h-${item.symbol}`} className="border-b border-bg-border bg-action-secondary/40 last:border-b-0">
                    <GroupToggle symbol={item.symbol} count={item.count} open={!collapsed.has(item.symbol)} onToggle={() => toggleGroup(item.symbol)} />
                  </li>
                );
              }
              const row = item.row;
              if (hidden(row.symbol)) return null;
              const premium = row.premiumNum == null ? null : `${formatUsdSmart(row.premiumNum)}${row.premiumLabel ? ` ${row.premiumLabel}` : ""}`;
              const detail =
                variant === "history"
                  ? [premium, row.outcome]
                  : [premium, row.markText ? `Now ${row.markText}` : null];
              const funded = variant === "open" && isFunded(row, deposit);
              const fundable = variant === "open" && canFund(row, nowMs, deposit);
              const withdrawable = funded && canWithdraw(row, nowMs, deposit);
              return (
                <li key={row.id} className="border-b border-bg-border px-3 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <TokenLogo symbol={row.symbol} />
                      <span className="shrink-0 font-medium text-content-primary">{row.symbol}</span>
                      <span className="truncate font-mono text-[14px] text-content-secondary" title={row.sentence}>
                        {claimOf(row)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                      <span className="sr-only">{variant === "history" ? "Result " : "uPnL "}</span>
                      {onShare && hasShareablePosition(row) ? <SharePnl row={row} onShare={onShare} roomy /> : <Pnl row={row} />}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-content-secondary">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(row))} />
                      <span className="truncate text-content-primary">
                        <Product row={row} />
                      </span>
                      <span className="sr-only">, {row.state}</span>
                      <span className="shrink-0 tabular-nums">· {row.sizeText}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{whenText(row, nowMs, variant)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-content-secondary">
                    <span className="truncate tabular-nums">{detail.filter(Boolean).join(" · ") || DASH}</span>
                    {funded ? <span className="shrink-0 text-content-tertiary">Funded</span> : null}
                  </div>
                  {fundable || withdrawable ? (
                    <div className="mt-3">
                      <FundAction row={row} nowMs={nowMs} deposit={deposit} wide />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        {note}
        {shareModal}
      </div>
    );
  }

  const cell = (column: Column, row: PositionsTableRow): React.ReactNode => {
    switch (column.id) {
      case "now":
        return row.markText ?? DASH;
      case "size":
        return row.sizeText;
      case "premium":
        return row.premiumNum == null ? (
          DASH
        ) : (
          <span className="text-content-primary" title={row.premiumLabel ? `${formatUsdSmart(row.premiumNum)} ${row.premiumLabel}` : undefined}>
            {formatUsdSmart(row.premiumNum)}
          </span>
        );
      case "pnl":
        return onShare && hasShareablePosition(row) ? <SharePnl row={row} onShare={onShare} roomy={false} /> : <Pnl row={row} />;
      case "expiry":
        return whenText(row, nowMs, variant);
      case "outcome":
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(row))} />
            <span className="truncate text-content-primary">{row.outcome ?? row.state}</span>
          </span>
        );
      case "action":
        return <FundAction row={row} nowMs={nowMs} deposit={deposit} wide={false} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="border border-bg-border bg-bg-primary">
        <table className="w-full table-fixed border-collapse text-[14px] tracking-[-0.02em]">
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} className={column.widthClassName} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <caption className="sr-only">
            {variant === "open"
              ? "Your open positions, sorted by risk: nearest expiry first."
              : "Your closed positions, most recent first."}
          </caption>
          <thead>
            <tr className="border-b border-bg-border">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={column.sort && sort.key === column.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    LABEL,
                    "whitespace-nowrap px-2 py-2.5",
                    column.align === "right" ? "text-right" : "text-left",
                    // the filter chip is taller than a label: less padding keeps the header row its height
                    column.id === "position" && filter && "py-1",
                  )}
                >
                  {column.hiddenLabel ? (
                    <span className="sr-only">{column.label}</span>
                  ) : column.id === "position" && filter ? (
                    <span className="flex items-center gap-3">
                      {/* below 1280px the column is too narrow for the word and the chip: the chip says what it filters */}
                      <span className="max-xl:sr-only">{column.label}</span>
                      {filter}
                    </span>
                  ) : column.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort((prev) => nextSort(prev, column.sort!))}
                      className={cn("group inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-content-primary", FOCUS)}
                    >
                      {column.label}
                      <span
                        aria-hidden="true"
                        className={cn("w-2 text-[12px] leading-none", sort.key !== column.sort && "opacity-0 transition-opacity group-hover:opacity-60")}
                      >
                        {sortArrow(sort, column.sort) || "▼"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if (item.kind === "header") {
                return (
                  <tr key={`h-${item.symbol}`} className="border-b border-bg-border bg-action-secondary/40">
                    <td colSpan={columns.length} className="p-0">
                      <GroupToggle symbol={item.symbol} count={item.count} open={!collapsed.has(item.symbol)} onToggle={() => toggleGroup(item.symbol)} />
                    </td>
                  </tr>
                );
              }
              const row = item.row;
              if (hidden(row.symbol)) return null;
              return (
                <tr key={row.id} className="border-b border-bg-border transition-colors last:border-b-0 hover:bg-action-secondary/40">
                  {columns.map((column) =>
                    column.id === "position" ? (
                      <th key={column.id} scope="row" className="px-2 py-2.5 text-left align-middle font-normal">
                        {/* One line. The claim takes all but a few pixels of the column at every width, so
                            the product and the state are not drawn here: they are read out, and shown
                            with the full sentence when the claim is hovered. */}
                        <span className="flex min-w-0 items-center gap-2">
                          <TokenLogo symbol={row.symbol} />
                          <span className="shrink-0 font-medium text-content-primary">{row.symbol}</span>
                          <span className="truncate font-mono text-[14px] text-content-primary" title={rowTitle(row, variant === "open" && isFunded(row, deposit))}>
                            {claimOf(row)}
                          </span>
                          <span className="sr-only">
                            , <Product row={row} />
                            {variant === "open" && !isFunded(row, deposit) ? `, ${row.state}` : ", "}
                          </span>
                          {/* a funded row says so in its action cell, unless Withdraw is there instead */}
                          {variant === "open" && isFunded(row, deposit) && canWithdraw(row, nowMs, deposit) ? <span className="sr-only">Funded</span> : null}
                        </span>
                      </th>
                    ) : (
                      <td
                        key={column.id}
                        className={cn(
                          // no clipping: a long figure may lean into its neighbour's padding, never lose digits
                          "px-2 py-2.5 align-middle text-content-secondary",
                          // right-aligned, so its left padding only takes room from the position column;
                          // less padding above and below, so a row with a button is as tall as one without
                          column.id === "action" && "py-1 pl-0",
                          column.align === "right" ? "whitespace-nowrap text-right tabular-nums" : "text-left",
                        )}
                      >
                        {cell(column, row)}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note}
      {shareModal}
    </div>
  );
}
