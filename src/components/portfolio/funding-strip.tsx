"use client";

import { TYPE_LABEL, TYPE_LINK, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { Chevron } from "@/components/app-ui/chevron";
import { formatUsdSmart } from "@/lib/markets";
import { numberFormat } from "@/lib/number-format";
import { formatExpiryCountdown, type FundingSummary } from "@/lib/portfolio-positions";
import { formatExpiryDay } from "@/lib/trade/format";
import { cn } from "@/lib/cn";
import { Cell } from "./performance-strip";

const LABEL = `${TYPE_LABEL} text-content-tertiary`;

/** "6,900.00 USDC": dollars to the cent for the quote, up to four places for an asset. */
function amountText({ symbol, amount }: { symbol: string; amount: number }): string {
  const usd = symbol.toUpperCase().startsWith("USD");
  return `${numberFormat(usd ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 4 }).format(amount)} ${symbol}`;
}

/** "≈ $10,413": a rounded-none dollar figure, marked as approximate. */
function approxUsd(usd: number): string {
  return `≈ ${formatUsdSmart(usd)}`;
}

const GAP = 8;
/** A pointer passing over the link on its way elsewhere should not open the panel. */
const HOVER_OPEN_MS = 120;
/** Long enough to move from the link into the panel. */
const HOVER_CLOSE_MS = 160;
/** Nine and a half rows: the half row says the list goes on. */
const LIST_HEIGHT = 184;
/** Two rows and a bit, the least a list is worth showing. */
const MIN_LIST_HEIGHT = 48;

/**
 * Every asset behind the one dollar figure. The link says how many there are, never which, so
 * it reads the same for two assets or a hundred. Hover opens the panel; a click or a tap pins
 * it open, as "Breakdown" does on the trade page. The list scrolls inside the panel, so the
 * panel stays open while the pointer is in it.
 *
 * The panel is drawn on <body>, like the info tooltip: inside the card it would sit under the
 * token filter and the table, which stack above a card's contents. It opens under the link and
 * floats over them while it is open.
 */
function FundBreakdown({ totals, totalUsd, count }: { totals: FundingSummary["totals"]; totalUsd: number | null; count: number }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; listMax: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const id = useId();

  const cancel = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(() => {
    cancel();
    setOpen(false);
    setPinned(false);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);

  // Always under the link: a panel never opens upward (STYLE.md). When the window is short of
  // room below, the list gives up rows and scrolls instead of the panel flipping above.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    const list = listRef.current;
    if (!trigger || !panel || !list) return;
    const top = trigger.bottom + GAP;
    const around = panel.offsetHeight - list.offsetHeight;
    const listMax = Math.max(MIN_LIST_HEIGHT, Math.min(LIST_HEIGHT, window.innerHeight - top - GAP - around));
    const left = Math.min(Math.max(trigger.left, GAP), Math.max(GAP, window.innerWidth - panel.offsetWidth - GAP));
    setPosition({ left, top, listMax });
  }, [open, totals.length]);

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (!!triggerRef.current?.contains(target) || !!panelRef.current?.contains(target));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target)) close();
    };
    // the page moving under a fixed panel would leave it pointing at nothing; its own list may scroll
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const openSoon = () => {
    cancel();
    timer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  };
  const closeSoon = () => {
    cancel();
    if (!pinned) timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };
  // largest first, so the assets that matter lead a long list; an asset without a price goes last
  const sorted = [...totals].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") openSoon();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") closeSoon();
        }}
        onClick={() => {
          cancel();
          if (open && pinned) return close();
          setOpen(true);
          setPinned(true);
        }}
        // tabbing on closes it; a click inside the panel moves focus nowhere and must not
        onBlur={(e) => {
          if (e.relatedTarget && !panelRef.current?.contains(e.relatedTarget)) close();
        }}
        // clickable text, as "Breakdown": grey, the note's own size, the forward chevron
        className={cn(TYPE_LINK, "text-[14px] leading-[1.45]")}
      >
        {totals.length} assets
        <Chevron kind="go" className="h-4 w-4" />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="group"
              aria-label="What to fund, by asset"
              data-testid="fund-breakdown"
              onPointerEnter={cancel}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") closeSoon();
              }}
              style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
              // the app's floating surface, above modals (90) and below toasts (200), as the info tooltip
              className="app-type fixed z-[150] w-max min-w-[240px] max-w-[calc(100vw-16px)] border border-bg-border bg-bg-primary p-3 text-left shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)]"
            >
              <div className={cn(LABEL, "whitespace-nowrap")}>To fund {count} options</div>
              {/* past its height the list scrolls, so the panel is the same size for 10 assets or 100 */}
              <div ref={listRef} style={{ maxHeight: position?.listMax ?? LIST_HEIGHT }} className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 overflow-y-auto overscroll-contain whitespace-nowrap pr-1 font-mono text-[14px] leading-[1.45] tracking-[-0.02em] tabular-nums text-content-primary">
                {sorted.map((total) => (
                  <div key={total.symbol} className="contents">
                    <span>{amountText(total)}</span>
                    <span className="text-right text-content-secondary">{total.usd != null ? approxUsd(total.usd) : "No price"}</span>
                  </div>
                ))}
              </div>
              {totalUsd != null ? (
                <div className="mt-2 flex justify-between gap-6 border-t border-bg-border pt-2 font-mono text-[14px] font-medium leading-[1.45] tracking-[-0.02em] tabular-nums text-content-primary">
                  <span>Total</span>
                  <span>{approxUsd(totalUsd)}</span>
                </div>
              ) : null}
              <p className="mt-2 max-w-[260px] whitespace-normal font-mono text-[14px] leading-[1.45] tracking-[-0.02em] text-content-tertiary">
                A call is funded in the quote token at its strike, a put in the asset itself, valued here at the current price.
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The bought options that still need their deposit, taken together: how many, what funding
 * them all takes, the nearest deadline, how many are worth exercising right now and the
 * premium at stake. It also holds the all / worth exercising choice, because that answers one
 * question: what to see and what to fund. The figures and the button follow it and the table's
 * asset filter, and the button funds exactly what they leave, with a single wallet approval.
 * The button says only "Fund"; the count and the amount are in the "To fund" figure under it.
 *
 * The card has one header whatever the table's asset filter leaves: that choice on the left,
 * the button on the right. Without anything to fund in the current view the header stays and
 * says so in the button's place; with no choice passed in, it is not drawn.
 */
export function FundingStrip({
  summary,
  nowMs,
  pending,
  busy = false,
  onFund,
  filters,
}: {
  /** What needs funding among the positions the filters leave; null when nothing there does. */
  summary: FundingSummary | null;
  nowMs: number;
  /** A deposit is being signed or confirmed, here or on a row. */
  pending: boolean;
  /** Something else is with the wallet (a withdrawal): the button waits without saying "Funding". */
  busy?: boolean;
  onFund: (positions: FundingSummary["positions"]) => void;
  /** The all / worth exercising choice: what the table shows and what this button funds. */
  filters?: React.ReactNode;
}) {
  if (!summary) {
    // nothing to fund in this view: the same header, with a note where the button would be
    return filters ? (
      <AppCard className="p-5" aria-label="Filter positions" role="region">
        {/* as tall as the row with the button, so the header does not move between the two */}
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
          <span className={cn(TYPE_NOTE, "text-content-tertiary")}>Nothing to fund</span>
        </div>
      </AppCard>
    ) : null;
  }
  const { count, totals, totalUsd, firstExpiryTs, inTheMoney, priced, premiumPaid } = summary;
  const many = count > 1;
  // The button only says what it does. How many and how much are read beside it, in "To fund";
  // its accessible name still carries them, since a screen reader meets the button on its own.
  const amount = totalUsd != null ? approxUsd(totalUsd) : totals.length === 1 ? amountText(totals[0]) : null;
  const optionsText = many ? `${count} options` : "1 option";
  return (
    <AppCard className="p-5" aria-label="Options to fund" role="region">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
        <AppButton
          // wide enough for "Funding…", so the button does not grow when it is pressed
          className="min-w-[8.5rem] max-md:w-full"
          disabled={pending || busy}
          aria-label={pending ? undefined : amount ? `Fund ${optionsText}, ${amount}` : `Fund ${optionsText}`}
          onClick={() => onFund(summary.positions)}
        >
          {pending ? "Funding…" : "Fund"}
        </AppButton>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-bg-border pt-5 md:grid-cols-4">
        <Cell
          label="To fund"
          // an amount to pay is never cut short: on a phone it wraps under itself
          wrap
          // one figure in dollars; without a price for every token, the first token as it is
          value={totalUsd != null ? approxUsd(totalUsd) : totals.length > 0 ? amountText(totals[0]) : "—"}
          // how many options the button funds, then in what: one asset is said outright, several sit behind a link that says how many
          note={
            <>
              {optionsText}
              {/* words, not a dot, between the two: on a phone the note wraps, and a dot would end the line */}
              {totals.length > 1 ? (
                <>
                  {" in "}
                  <FundBreakdown totals={totals} totalUsd={totalUsd} count={count} />
                </>
              ) : totals.length === 1 && totalUsd != null ? (
                `, ${amountText(totals[0])}`
              ) : null}
            </>
          }
        />
        <Cell
          label="First deadline"
          value={formatExpiryCountdown(firstExpiryTs, nowMs)}
          note={`Expires ${formatExpiryDay(firstExpiryTs * 1000)}`}
        />
        <Cell
          label="In the money"
          hint="An option in the money is worth exercising at the current price. If you fund one that ends out of the money, what you paid in comes back."
          value={priced > 0 ? `${inTheMoney} of ${priced}` : "—"}
          valueClassName={inTheMoney > 0 ? "text-additional-green-primary" : undefined}
          note={priced < count ? `${count - priced} without a price` : "At the current price"}
        />
        <Cell
          label="Premium paid"
          value={premiumPaid != null ? formatUsdSmart(premiumPaid) : "—"}
          note="Lost if left unfunded"
        />
      </div>
    </AppCard>
  );
}
