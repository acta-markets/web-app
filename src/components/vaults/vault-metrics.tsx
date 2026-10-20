import { AppStatTile } from "@/components/app-ui/app-stat-tile";
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
    <section aria-label="Vault metrics" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <AppStatTile label={<AprLabel apr={apr} />} value={apr.value} />
      <AppStatTile
        label="TVL"
        value={<WithUnit amount={formatVaultEquity(vault)} unit={symbol} />}
        sub={tvlSub.length ? tvlSub.join(" · ") : undefined}
      />
      <AppStatTile
        label="Return"
        value={ret.value}
        sub={ret.since === null ? undefined : `Since ${formatDate(ret.since)}`}
      />
      <AppStatTile
        label="Max drawdown"
        value={formatPercent(performance?.max_drawdown_pct)}
        sub={worstCycle === null ? undefined : `Worst cycle ${formatPercent(worstCycle, { signed: true })}`}
      />
    </section>
  );
}
