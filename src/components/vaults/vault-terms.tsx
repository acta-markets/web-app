import Link from "next/link";
import { AppCard } from "@/components/app-ui/app-card";
import { getTokenSymbolByMint } from "@/lib/tokens";
import { formatBps, formatDuration, formatTokenAmount, shortAddress, solscanUrl } from "@/lib/vaults/format";
import { depositCapacity } from "@/lib/vaults/math";
import { VAULTS_SAMPLE_MODE } from "@/lib/vaults/sample";
import type { Vault } from "@/lib/vaults/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-content-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-content-primary">{children}</dd>
    </div>
  );
}

function Address({ value, kind }: { value: string; kind: "account" | "token" }) {
  // sample addresses are made up; linking them to an explorer would only 404
  if (VAULTS_SAMPLE_MODE) return <span title={value}>{shortAddress(value)}</span>;
  return (
    <a
      href={solscanUrl(kind, value)}
      target="_blank"
      rel="noreferrer noopener"
      title={value}
      className="text-accent-secondary hover:text-accent-primary"
    >
      {shortAddress(value)} ↗
    </a>
  );
}

function Capacity({ vault, symbol }: { vault: Vault; symbol: string }) {
  const cap = BigInt(vault.cap_limit);
  if (cap === 0n) return <>No cap</>;
  const decimals = vault.main_decimals;
  const used = BigInt(vault.equity) + BigInt(vault.pending_deposit_amount);
  const usedPct = Math.min(100, Number((used * 10_000n) / cap) / 100);
  const left = depositCapacity(vault) ?? 0n;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="tabular-nums">
        {formatTokenAmount(used, decimals, { compact: true })} of {formatTokenAmount(cap, decimals, { compact: true })} {symbol}
      </span>
      <div className="flex h-2.5 w-[120px] bg-accent-primary/20" aria-hidden="true">
        <div className="h-full bg-accent-primary" style={{ width: `${usedPct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-content-secondary">
        {formatTokenAmount(left, decimals, { compact: true })} {symbol} left
      </span>
    </div>
  );
}

export function VaultTerms({ vault, symbol }: { vault: Vault; symbol: string }) {
  const secondSymbol = getTokenSymbolByMint(vault.second_mint) ?? shortAddress(vault.second_mint);
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <AppCard className="p-4">
        <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Terms</h2>
        <dl className="mt-2 divide-y divide-bg-border font-mono text-sm leading-[1.3] tracking-[-0.28px]">
          {/* TODO(tim): confirm the management fee is an annual rate before saying so */}
          <Row label="Management fee">
            {vault.management_fee_bps > 0 ? formatBps(vault.management_fee_bps) : "None"}
          </Row>
          <Row label="Performance fee">
            {vault.performance_fee_bps > 0 ? `${formatBps(vault.performance_fee_bps)} above the previous high` : "None"}
          </Row>
          <Row label="Capacity">
            <Capacity vault={vault} symbol={symbol} />
          </Row>
          <Row label="Assets">
            {symbol}, can also hold {secondSymbol}
          </Row>
          <Row label="If the manager stalls">
            Anyone can process requests after {formatDuration(Number(vault.capital_fallback_delay_secs))}
          </Row>
          <Row label="Vault">
            <Address value={vault.vault_pda} kind="account" />
          </Row>
          <Row label="Share token">
            <Address value={vault.share_mint} kind="token" />
          </Row>
          <Row label="Governance">
            <Address value={vault.governance} kind="account" />
          </Row>
        </dl>
      </AppCard>

      <AppCard className="flex flex-col p-4">
        <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Risks</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-mono text-sm leading-[1.5] text-content-primary marker:text-accent-secondary">
          <li>The manager can make bad trades. You carry the losses.</li>
          <li>Selling calls caps your upside: gains above the strike go to the buyer.</li>
          <li>Selling puts can leave the vault buying an asset for more than it is worth.</li>
          <li>Bought options can expire worthless.</li>
          <li>Fees are paid in new shares, so your slice of the vault shrinks.</li>
        </ul>

        <h2 className="mt-6 font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">
          How requests work
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-mono text-sm leading-[1.5] text-content-primary marker:text-accent-secondary">
          <li>You submit a request. The vault completes it at the end of the cycle, at the share price it calculates then.</li>
          <li>Until a deposit completes, your funds are held aside and earn nothing.</li>
          <li>Expiry is when trading ends, not when you are paid.</li>
          <li>You can cancel a pending request until the cycle reaches expiry or the vault starts pricing.</li>
        </ul>

        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-5 font-mono text-sm">
          <Link href="/docs/guide/deposits-and-withdrawals" className="text-accent-secondary hover:text-accent-primary">
            Deposits and withdrawals
          </Link>
          <Link href="/docs/guide/returns-and-risks" className="text-accent-secondary hover:text-accent-primary">
            Returns, fees and risks
          </Link>
        </div>
      </AppCard>
    </section>
  );
}
