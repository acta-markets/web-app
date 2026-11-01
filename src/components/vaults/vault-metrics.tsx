import { formatDate, formatTokenAmount, formatUsd } from "@/lib/vaults/format";
import { depositCap, formatVaultEquity, vaultApr, vaultReturn, vaultTvlUsd } from "@/lib/vaults/presentation";
import type { Vault } from "@/lib/vaults/types";
import { AprLabel } from "./vault-apr";

export function VaultMetrics({ vault, symbol, stakingAprPct }: { vault: Vault; symbol: string; stakingAprPct: number }) {
  const apr = vaultApr(vault.performance, stakingAprPct);
  const ret = vaultReturn(vault.performance);
  const pendingDeposits = BigInt(vault.pending_deposit_amount);
  const usd = vaultTvlUsd(vault);
  const metrics = [
    {
      label: "TVL",
      value: <>{formatVaultEquity(vault)} <span className="text-sm text-content-secondary">{symbol}</span></>,
      sub: usd === null ? null : formatUsd(usd),
    },
    { label: <AprLabel apr={apr} />, value: apr.value, sub: null },
    { label: "Return", value: ret.value, sub: ret.since === null ? null : `Since ${formatDate(ret.since)}` },
  ];

  return (
    <section aria-label="Vault metrics" className="border-y border-bg-border py-3">
      <dl className="grid grid-cols-3 gap-3">
        {metrics.map((metric, i) => (
          <div key={i} className="min-w-0">
            <dt className="font-mono text-sm leading-[1.3] tracking-[-0.28px] text-content-secondary">{metric.label}</dt>
            <dd className="mt-2 break-words font-mono text-2xl font-medium leading-[1.2] tabular-nums text-content-primary max-md:text-xl">
              {metric.value}
            </dd>
            {metric.sub ? <dd className="mt-1 font-mono text-xs text-content-secondary">{metric.sub}</dd> : null}
          </div>
        ))}
      </dl>
      {pendingDeposits > 0n ? (
        <p className="mt-2 font-mono text-xs text-content-secondary">
          {formatTokenAmount(pendingDeposits, vault.main_decimals, { compact: true })} {symbol} pending
        </p>
      ) : null}
    </section>
  );
}

export function VaultCapacity({ vault, symbol }: { vault: Vault; symbol: string }) {
  const limit = depositCap(vault.capacity);
  const amount = (value: bigint) => formatTokenAmount(value, vault.main_decimals, { compact: true });
  if (!limit) {
    return (
      <section aria-label="Vault capacity" className="font-mono text-sm">
        <div className="h-2 bg-action-tertiary" />
        <p className="mt-2 text-right tabular-nums text-content-secondary">
          {amount(BigInt(vault.equity))} {symbol} / No cap
        </p>
      </section>
    );
  }
  const { cap, remaining } = limit;
  const used = cap > remaining ? cap - remaining : 0n;
  const pct = cap === 0n ? 0 : Math.min(100, Number(used * 10_000n / cap) / 100);
  return (
    <section aria-label="Vault capacity" className="font-mono text-sm">
      <div
        role="progressbar"
        aria-label="Capacity used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${amount(remaining)} ${symbol} remaining`}
        className="h-2 bg-action-tertiary"
      >
        <div className="h-full bg-accent-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-right tabular-nums text-content-secondary">
        {amount(used)} / {amount(cap)} {symbol}
      </p>
    </section>
  );
}
