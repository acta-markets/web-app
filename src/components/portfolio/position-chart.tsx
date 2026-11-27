"use client";

import { AppModal } from "@/components/app-ui/app-modal";
import { TYPE_LABEL } from "@/components/app-ui/type-styles";
import { ThesisChart, type PnlContext } from "@/components/trade/sentence/thesis-chart";
import { cn } from "@/lib/cn";
import { formatUsdSmart } from "@/lib/markets";
import { formatExpiryCountdown, type PositionsTableRow } from "@/lib/portfolio-positions";
import { buyZoneLabels, zoneLabels, type ZoneLabel } from "@/lib/trade/thesis";

/** The two outcomes in words, for the chart's spoken summary. */
function outcomes(row: PositionsTableRow): { right: ZoneLabel; wrong: ZoneLabel } {
  const terms = { asset: row.symbol, direction: row.direction, strike: row.strikeNum };
  if (row.side === "buy") return buyZoneLabels(terms);
  if (row.cashSettled) {
    // nothing changes hands at the strike: the writer keeps the premium or pays the difference
    return { right: { title: "Keep the premium", premium: null }, wrong: { title: `Pay out past ${row.strikeText}`, premium: null } };
  }
  return zoneLabels({ ...terms, scenario: null });
}

/**
 * What the chart's right rail can say at each price. One strike: the profit or loss there,
 * by the same sum as the row's uPnL, so the rail at the current price agrees with the table.
 * Two strikes: prices only, since that sum does not stop at the far leg.
 */
function railContext(row: PositionsTableRow): PnlContext | null {
  if (row.farStrikeNum != null || row.premiumNum == null || !(row.sizeNum > 0)) return null;
  return { side: row.side, quantity: row.sizeNum, premium: row.premiumNum };
}

/**
 * An open position on the Trade page's own chart: the price history, the price now, and the
 * plot split at the strike into the half where the position pays and the half where it does
 * not, with its expiry named. Nothing on it can be changed: the trade is already made.
 * Only for a row that `canChartRow` accepts.
 */
export function PositionChart({ row }: { row: PositionsTableRow }) {
  if (row.markNum == null || row.expiryTs == null) return null;
  const { right, wrong } = outcomes(row);
  return (
    <ThesisChart
      readOnly
      frameless
      legend={false}
      symbol={row.symbol}
      spot={row.markNum}
      strike={row.strikeNum}
      expiryMs={row.expiryTs * 1000}
      direction={row.direction}
      side={row.side}
      right={right}
      wrong={wrong}
      pnl={railContext(row)}
      previewStrike={row.farStrikeNum}
      // a sold cash-settled product buys and sells nothing at the strike
      zoneWords={row.cashSettled && row.side === "sell" ? { right: "YIELD ZONE", wrong: "YOU PAY OUT" } : undefined}
    />
  );
}

function pnlTone(n: number | null): string {
  if (n == null || n === 0) return "text-content-primary";
  return n > 0 ? "text-additional-green-primary" : "text-additional-red-primary";
}

function Fact({ label, children, className, wide }: { label: string; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className={cn(TYPE_LABEL, "text-content-tertiary")}>{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-[14px] tracking-[-0.02em] tabular-nums text-content-primary", className)}>{children}</dd>
    </div>
  );
}

/** A position's chart in a window of its own, with the row's figures under it. */
export function PositionChartModal({ row, nowMs, onClose }: { row: PositionsTableRow; nowMs: number; onClose: () => void }) {
  const product = row.legsText ? `${row.productLabel} ${row.legsText}` : row.productLabel;
  return (
    <AppModal open onClose={onClose} title={row.sentence} showHowItWorks={false} className="max-w-2xl max-md:p-4">
      <div data-testid="position-chart">
        <PositionChart row={row} />
      </div>
      <dl className="grid grid-cols-6 gap-x-4 gap-y-3 border-t border-bg-border pt-4 max-md:grid-cols-2">
        {/* the one fact with words in it: a spread names both its strikes */}
        <Fact label="Position" wide>{product}</Fact>
        <Fact label="Size">{row.sizeText}</Fact>
        <Fact label="Premium">{row.premiumNum == null ? "—" : formatUsdSmart(row.premiumNum)}</Fact>
        <Fact label="uPnL" className={pnlTone(row.pnlNum)}>{row.pnlText}</Fact>
        <Fact label="Expiry">{row.expiryTs == null ? "—" : formatExpiryCountdown(row.expiryTs, nowMs)}</Fact>
      </dl>
    </AppModal>
  );
}
