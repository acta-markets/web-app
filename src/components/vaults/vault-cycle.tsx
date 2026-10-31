import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import { formatCountdown, formatDate } from "@/lib/vaults/format";
import { cyclePhaseLabel, exposureRows, exposureTotals, formatPremium, mintUnits, stagingText } from "@/lib/vaults/presentation";
import type { Vault, VaultExposure, VaultPremium, VaultPremiumFlow } from "@/lib/vaults/types";

const TITLE = "font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-content-secondary">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums text-content-primary">{children}</dd>
    </div>
  );
}

function premiumText(vault: Vault, premium: readonly VaultPremium[], pick: (p: VaultPremium) => VaultPremiumFlow): string | null {
  const parts = premium.flatMap((p) => {
    const flow = pick(p);
    const units = mintUnits(vault, p.quote_mint);
    const empty = BigInt(flow.received) === 0n && (flow.paid === null || BigInt(flow.paid) === 0n);
    return units && !empty ? [formatPremium(flow, units)] : [];
  });
  return parts.length ? parts.join(", ") : null;
}

/** Null between cycles with no premium to show. */
export function VaultCurrentCycle({ vault, nowSecs }: { vault: Vault; nowSecs: number }) {
  const expiry = Number(vault.active_expiry);
  const running = vault.phase === "active" && expiry > 0;
  const premium = vault.premium ?? [];
  const cycle = premiumText(vault, premium, (p) => p.cycle);
  const total = premiumText(vault, premium, (p) => p.generation);
  const since = vault.generation_started_at;
  const staged = stagingText(vault);
  if (!running && !cycle && !total && !staged) return null;

  return (
    <AppCard className="p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className={TITLE}>Current cycle</h2>
        <span className="font-mono text-sm text-content-secondary">{cyclePhaseLabel(vault)}</span>
      </div>
      <dl className="mt-2 divide-y divide-bg-border font-mono text-sm leading-[1.3] tracking-[-0.28px]">
        {running ? (
          <Row label="Ends">
            {formatDate(expiry, { time: true })}
            {expiry > nowSecs ? <span className="text-content-secondary"> · {formatCountdown(expiry, nowSecs)}</span> : null}
          </Row>
        ) : null}
        {cycle ? <Row label="Premium this cycle">{cycle}</Row> : null}
        {total ? <Row label={since ? `Premium since ${formatDate(Number(since))}` : "Premium"}>{total}</Row> : null}
        {staged ? <Row label="Swap in progress">{staged}</Row> : null}
      </dl>
    </AppCard>
  );
}

/** Open legs at spot. */
export function VaultExposureCard({ exposure }: { exposure: VaultExposure }) {
  const rows = exposureRows(exposure);
  const totals = exposureTotals(exposure);

  return (
    <AppCard className="p-4">
      <h2 className={TITLE}>At risk now</h2>
      <table className="mt-3 w-full font-mono text-sm leading-[1.3] tracking-[-0.28px]">
        <thead className="text-left text-content-secondary">
          <tr>
            <th className="pb-2 font-normal">Strike</th>
            <th className="pb-2 font-normal">Type</th>
            <th className="pb-2 font-normal">Side</th>
            <th className="pb-2 text-right font-normal">Distance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bg-border text-content-primary">
          {rows.map((row) => (
            <tr key={row.position}>
              <td className="py-2 tabular-nums">{row.strike}</td>
              <td className="py-2">{row.type}</td>
              <td className="py-2">{row.role}</td>
              <td className={cn("py-2 text-right tabular-nums", row.itm && "text-error")}>{row.distance}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totals.length ? (
        <dl className="mt-1 border-t border-bg-border font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          <Row label="Net intrinsic at spot">
            {totals.map((t) => (
              <div key={t.quoteMint}>{t.value}</div>
            ))}
          </Row>
        </dl>
      ) : null}
    </AppCard>
  );
}
