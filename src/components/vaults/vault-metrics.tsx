import { formatDate, formatTokenAmount, formatUsd } from "@/lib/vaults/format";
import { depositCap, formatVaultEquity, vaultApr, vaultReturn, vaultTvlUsd } from "@/lib/vaults/presentation";
import type { Vault } from "@/lib/vaults/types";
import { cn } from "@/lib/cn";
import { AprLabel } from "./vault-apr";

export function VaultMetrics({ vault, symbol, stakingAprPct, assumedApr }: { vault: Vault; symbol: string; stakingAprPct: number; assumedApr?: { staking: number; premium: number } }) {
  const apr = vaultApr(vault.performance, stakingAprPct, assumedApr);
  const ret = vaultReturn(vault.performance);
  const pendingDeposits = BigInt(vault.pending_deposit_amount);
  const usd = vaultTvlUsd(vault);
  const metrics = [
    {
      label: "TVL",
      value: <>{formatVaultEquity(vault)} <span className="font-mono text-sm tracking-normal text-content-secondary">{symbol}</span></>,
      sub: usd === null ? null : formatUsd(usd),
    },
    {
      label: <AprLabel apr={apr} />,
      value: apr.value,
      sub: null,
      tone: apr.pct != null && apr.pct < 0 ? "text-additional-red-primary" : apr.muted ? "text-content-secondary" : undefined,
    },
    { label: "Return", value: ret.value, sub: ret.since === null ? null : `Since ${formatDate(ret.since)}` },
  ] as Array<{ label: React.ReactNode; value: React.ReactNode; sub: string | null; tone?: string }>;

  return (
    <section aria-label="Vault metrics" className="border-y border-bg-border py-3">
      <dl className="grid grid-cols-3 gap-3">
        {metrics.map((metric, i) => (
          <div key={i} className="min-w-0">
            {/* the landing card's pairing: a small label over a figure in the heading face.
                On a phone "Projected APY" takes two lines; every label keeps that height so the three figures share a line. */}
            <dt className="font-mono text-[14px] font-medium leading-[1.3] text-content-secondary max-md:min-h-[2.6em]">{metric.label}</dt>
            <dd
              className={cn("mt-2 break-words font-space font-medium tabular-nums max-md:text-2xl", metric.tone ?? "text-content-primary")}
              style={{ fontSize: "clamp(24px, 2.6vw, 32px)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
            >
              {metric.value}
            </dd>
            {metric.sub ? <dd className="mt-1 font-mono text-[14px] leading-[1.45] text-content-secondary">{metric.sub}</dd> : null}
          </div>
        ))}
      </dl>
      {pendingDeposits > 0n ? (
        <p className="mt-2 font-mono text-[14px] leading-[1.45] text-content-secondary">
          {formatTokenAmount(pendingDeposits, vault.main_decimals, { compact: true })} {symbol} pending
        </p>
      ) : null}
    </section>
  );
}

export function VaultCapacity({ vault, symbol }: { vault: Vault; symbol: string }) {
  const limit = depositCap(vault.capacity);
  const amount = (value: bigint) => formatTokenAmount(value, vault.main_decimals, { compact: true });
  const usd = vaultTvlUsd(vault);
  const figures = (text: string) => (
    <p className="mt-2 flex justify-between gap-3 tabular-nums text-content-secondary">
      <span>{usd === null ? null : formatUsd(usd)}</span>
      <span>{text}</span>
    </p>
  );
  // No cap, so nothing to fill: a line of words, not an empty bar.
  if (!limit) {
    return (
      <section aria-label="Vault capacity" className="min-w-0 font-mono text-[14px] leading-[1.45]">
        <p className="flex justify-between gap-3 tabular-nums text-content-secondary">
          <span>Capacity</span>
          <span>
            <span className="text-content-primary">{amount(BigInt(vault.equity))} {symbol}</span> deposited, no cap
          </span>
        </p>
      </section>
    );
  }
  const { cap, remaining } = limit;
  const used = cap > remaining ? cap - remaining : 0n;
  const pct = cap === 0n ? 0 : Math.min(100, Number(used * 10_000n / cap) / 100);
  return (
    <section aria-label="Vault capacity" className="min-w-0 font-mono text-[14px] leading-[1.45]">
      <p className="mb-2 text-content-secondary">Capacity</p>
      <div
        role="progressbar"
        aria-label="Capacity used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${amount(remaining)} ${symbol} remaining`}
        className="h-1.5 border border-accent-primary bg-accent-primary/20"
      >
        <div className="h-full bg-accent-primary" style={{ width: `${pct}%` }} />
      </div>
      {figures(`${amount(used)} / ${amount(cap)} ${symbol}`)}
    </section>
  );
}
