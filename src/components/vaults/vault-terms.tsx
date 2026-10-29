import Link from "next/link";
import { formatBps, formatDuration, formatTokenAmount, solscanUrl } from "@/lib/vaults/format";
import { depositCap } from "@/lib/vaults/presentation";
import { VAULTS_SAMPLE_MODE } from "@/lib/vaults/sample";
import type { Vault } from "@/lib/vaults/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-content-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-content-primary">{children}</dd>
    </div>
  );
}

function Capacity({ vault, symbol }: { vault: Vault; symbol: string }) {
  const limit = depositCap(vault.capacity);
  if (!limit) return <>Unlimited</>;
  const { cap, remaining } = limit;
  const decimals = vault.main_decimals;
  const used = BigInt(vault.equity) + BigInt(vault.pending_deposit_amount);
  const usedPct = cap === 0n ? 0 : Math.min(100, Number((used * 10_000n) / cap) / 100);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="tabular-nums">
        {formatTokenAmount(used, decimals, { compact: true })} of {formatTokenAmount(cap, decimals, { compact: true })} {symbol}
      </span>
      <div className="flex h-2.5 w-[120px] bg-accent-primary/20" aria-hidden="true">
        <div className="h-full bg-accent-primary" style={{ width: `${usedPct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-content-secondary">
        {formatTokenAmount(remaining, decimals, { compact: true })} {symbol} left
      </span>
    </div>
  );
}

const TITLE = "font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary";
const LINK = "font-mono text-sm text-accent-secondary hover:text-accent-primary";

export function VaultTerms({ vault, symbol }: { vault: Vault; symbol: string }) {
  return (
    <section className="grid grid-cols-1 gap-12 max-md:gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className={TITLE}>Terms</h2>
        <dl className="flex flex-col gap-2 font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          <Row label="Management fee">
            {vault.management_fee_bps > 0 ? formatBps(vault.management_fee_bps) : "None"}
          </Row>
          <Row label="Performance fee">
            {vault.performance_fee_bps > 0 ? `${formatBps(vault.performance_fee_bps)} above the previous high` : "None"}
          </Row>
          <Row label="Capacity">
            <Capacity vault={vault} symbol={symbol} />
          </Row>
          <Row label="If the manager stalls">
            Anyone can process requests after {formatDuration(Number(vault.capital_fallback_delay_secs))}
          </Row>
        </dl>
        {/* sample addresses are made up; linking them to an explorer would only 404 */}
        {VAULTS_SAMPLE_MODE ? null : (
          <a href={solscanUrl("account", vault.vault_pda)} target="_blank" rel="noreferrer noopener" className={`self-start ${LINK}`}>
            View vault on Solscan ↗
          </a>
        )}
      </div>

      <div className="flex flex-col">
        <h2 className={TITLE}>Risks</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-sm leading-[1.5] text-content-primary marker:text-accent-secondary">
          <li>Losing trades lose your money.</li>
          <li>Sold calls cap your upside at the strike.</li>
          <li>Sold puts can buy the asset above its price.</li>
          <li>Bought options can expire worthless.</li>
        </ul>

        <h2 className={`mt-8 ${TITLE}`}>How requests work</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 font-mono text-sm leading-[1.5] text-content-primary marker:text-accent-secondary">
          <li>Deposits and withdrawals settle at the end of the cycle, at its share price.</li>
          <li>A pending deposit earns nothing.</li>
          <li>You can cancel a request until the cycle expires or the vault starts pricing.</li>
        </ul>

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-4">
          <Link href="/docs/guide/deposits-and-withdrawals" className={LINK}>
            Deposits and withdrawals
          </Link>
          <Link href="/docs/guide/returns-and-risks" className={LINK}>
            Returns, fees and risks
          </Link>
        </div>
      </div>
    </section>
  );
}
