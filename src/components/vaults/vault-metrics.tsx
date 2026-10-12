import { AppStatTile } from "@/components/app-ui/app-stat-tile";
import { NONE, formatPercent, formatSharePrice, formatTokenAmount } from "@/lib/vaults/format";
import {
  DAY_SECS,
  MIN_SHARPE_CYCLES,
  maxDrawdownPct,
  sharpeRatio,
  trailingApr,
  type FinishedCycle,
} from "@/lib/vaults/metrics";
import { headlineReturn } from "@/lib/vaults/presentation";
import type { Vault } from "@/lib/vaults/types";

// the backend only annualizes after 30 days; client-side annualizing earlier would mislead
const NEEDS_30_DAYS = "Shown after 30 days of history";
const NO_HISTORY = "History unavailable";

function cyclesLabel(n: number): string {
  return `${n} ${n === 1 ? "cycle" : "cycles"}`;
}

export function VaultMetrics({
  vault,
  symbol,
  finished,
  nowSecs,
  historyLoading,
  historyDisabled,
}: {
  vault: Vault;
  symbol: string;
  finished: readonly FinishedCycle[];
  nowSecs: number;
  historyLoading: boolean;
  historyDisabled: boolean;
}) {
  const performance = vault.performance;
  const headline = headlineReturn(performance);
  const annualized = performance.status === "annualized";
  const track =
    performance.status === "annualized" || performance.status === "short_track_record" ? performance : null;
  const decimals = vault.main_decimals;
  const equity = BigInt(vault.equity);
  const pendingDeposits = BigInt(vault.pending_deposit_amount);
  // whole units from a thousand up, so the tile never truncates
  const tvlDigits = equity >= 1000n * 10n ** BigInt(decimals) ? 0 : undefined;

  let apr = { value: NONE, sub: NEEDS_30_DAYS };
  if (historyDisabled) apr = { value: NONE, sub: NO_HISTORY };
  else if (annualized) {
    const trailing = trailingApr(finished, nowSecs);
    apr = trailing
      ? { value: formatPercent(trailing.aprPct), sub: `From ${cyclesLabel(trailing.cycles)}` }
      : { value: NONE, sub: "No cycle ended in the last 30 days" };
  }

  let sharpe = { value: NONE, sub: NEEDS_30_DAYS };
  if (historyDisabled) sharpe = { value: NONE, sub: NO_HISTORY };
  else if (annualized) {
    const result = sharpeRatio(finished);
    if (result.value !== null) sharpe = { value: result.value.toFixed(2), sub: `From ${cyclesLabel(result.cycles)}` };
    else if (result.reason === "too_few") sharpe = { value: NONE, sub: `Needs ${MIN_SHARPE_CYCLES} completed cycles` };
    else if (result.reason === "no_variance") sharpe = { value: NONE, sub: "Not enough variation in returns" };
    else sharpe = { value: NONE, sub: "Not enough history yet" };
  }

  const drawdown = maxDrawdownPct(finished);
  const drawdownView = historyDisabled
    ? { value: NONE, sub: NO_HISTORY }
    : drawdown === null
      ? { value: NONE, sub: "No completed cycles yet" }
      : { value: formatPercent(drawdown), sub: "At cycle ends" };

  return (
    <section aria-label="Vault metrics" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <AppStatTile label={headline.label} value={headline.value} sub={headline.detail ?? undefined} />
        <AppStatTile label="30d avg APR" value={apr.value} sub={apr.sub} loading={historyLoading} />
        <AppStatTile label="Sharpe ratio" value={sharpe.value} sub={sharpe.sub} loading={historyLoading} />
        <AppStatTile
          label="TVL"
          value={`${formatTokenAmount(equity, decimals, { compact: true, maxFractionDigits: tvlDigits })} ${symbol}`}
          sub={
            pendingDeposits > 0n
              ? `+${formatTokenAmount(pendingDeposits, decimals, { compact: true })} ${symbol} pending`
              : "At the last valuation"
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <AppStatTile
          label="Cumulative return"
          value={track ? formatPercent(track.cumulative_return_pct, { signed: true }) : NONE}
          sub={track ? "Since the first cycle" : "No completed cycles yet"}
        />
        <AppStatTile label="Share price" value={`${formatSharePrice(vault.share_price)} ${symbol}`} sub="After fees" />
        <AppStatTile
          label="Cycles completed"
          value={track ? track.cycles_completed : 0}
          sub={track ? `Over ${Math.max(1, Math.round(Number(track.track_record_secs) / DAY_SECS))} days` : "First cycle in progress"}
        />
        <AppStatTile label="Max drawdown" value={drawdownView.value} sub={drawdownView.sub} loading={historyLoading} />
      </div>
      <p className="mt-1 font-mono text-xs leading-[1.5] text-content-secondary">
        Returns and share price come from completed cycles and are after fees. 30d avg APR compounds the cycles that
        ended in the last 30 days and annualizes them over the time they span. Sharpe ratio uses per-cycle returns with
        a zero risk-free rate. TVL is the vault&apos;s equity in {symbol} at its last valuation.
      </p>
    </section>
  );
}
