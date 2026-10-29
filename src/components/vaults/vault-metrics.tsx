import { formatDate, formatPercent, formatTokenAmount, formatUsd } from "@/lib/vaults/format";
import { formatVaultEquity, vaultApr, vaultReturn, vaultTvlUsd } from "@/lib/vaults/presentation";
import type { Vault } from "@/lib/vaults/types";
import { AprLabel } from "./vault-apr";

// the unit in smaller type, so long symbols like jitoSOL still fit a tile
function WithUnit({ amount, unit }: { amount: string; unit: string }) {
  return (
    <>
      {amount}
      <span className="ml-1.5 text-base text-content-secondary max-md:ml-1 max-md:text-sm">{unit}</span>
    </>
  );
}

/** A label and a figure, no tile around it. */
function Metric({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">{label}</dt>
      <dd className="mt-2 truncate font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary max-md:text-xl">{value}</dd>
      {sub ? <dd className="mt-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] tabular-nums text-content-secondary">{sub}</dd> : null}
    </div>
  );
}

export function VaultMetrics({ vault, symbol, stakingAprPct }: { vault: Vault; symbol: string; stakingAprPct: number }) {
  const performance = vault.performance;
  const apr = vaultApr(performance, stakingAprPct);
  const ret = vaultReturn(performance);
  const pendingDeposits = BigInt(vault.pending_deposit_amount);
  const usd = vaultTvlUsd(vault);
  const tvlSub = [
    usd === null ? null : formatUsd(usd),
    pendingDeposits > 0n ? `+${formatTokenAmount(pendingDeposits, vault.main_decimals, { compact: true })} ${symbol} pending` : null,
  ].filter(Boolean);
  const worstCycle = performance?.worst_cycle_return_pct ?? null;

  return (
    <dl aria-label="Vault metrics" className="grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-4">
      <Metric label={<AprLabel apr={apr} />} value={apr.value} />
      <Metric
        label="TVL"
        value={<WithUnit amount={formatVaultEquity(vault)} unit={symbol} />}
        sub={tvlSub.length ? tvlSub.join(" · ") : undefined}
      />
      <Metric
        label="Return"
        value={ret.value}
        sub={ret.since === null ? undefined : `Since ${formatDate(ret.since)}`}
      />
      <Metric
        label="Max drawdown"
        value={formatPercent(performance?.max_drawdown_pct)}
        sub={worstCycle === null ? undefined : `Worst cycle ${formatPercent(worstCycle, { signed: true })}`}
      />
    </dl>
  );
}
