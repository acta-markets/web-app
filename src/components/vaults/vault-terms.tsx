import Link from "next/link";
import { tokenDisplayName } from "@/lib/tokens";
import { formatBps, formatDuration, formatTokenAmount, shortAddress, solscanUrl } from "@/lib/vaults/format";
import { depositCap, managerScope } from "@/lib/vaults/presentation";
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

function ScopeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-mono text-sm text-content-secondary">{title}</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 font-mono text-sm leading-[1.5] text-content-primary marker:text-accent-secondary">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
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

export function VaultTerms({ vault, symbol }: { vault: Vault; symbol: string }) {
  const secondSymbol = tokenDisplayName(vault.second_mint);
  return (
    <dl className="divide-y divide-bg-border font-mono text-sm leading-[1.3] tracking-[-0.28px]">
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
  );
}

export function VaultRisks() {
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        <ScopeList
          title="Risks"
          items={[
            "Losing trades lose your money.",
            "Sold calls cap your upside at the strike.",
            "Sold puts can buy the asset above its price.",
            "Bought options can expire worthless.",
          ]}
        />
        <ScopeList
          title="How requests work"
          items={[
            "Deposits and withdrawals settle at the end of the cycle, at its share price.",
            "A pending deposit earns nothing.",
            "You can cancel a request until the cycle expires or the vault starts pricing.",
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-5 font-mono text-sm">
        <Link prefetch={false} href="/docs/guide/deposits-and-withdrawals" className="text-accent-secondary hover:text-accent-primary">
          Deposits and withdrawals
        </Link>
        <Link prefetch={false} href="/docs/guide/returns-and-risks" className="text-accent-secondary hover:text-accent-primary">
          Returns, fees and risks
        </Link>
      </div>
    </div>
  );
}

export function VaultManagerScope({ vault, symbol }: { vault: Vault; symbol: string }) {
  const scope = managerScope(vault, symbol, tokenDisplayName(vault.second_mint));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ScopeList title="Allowed" items={scope.allowed} />
      <ScopeList title="Not allowed" items={scope.blocked} />
    </div>
  );
}
