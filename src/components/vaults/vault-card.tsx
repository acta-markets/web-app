import { Fragment } from "react";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { cn } from "@/lib/cn";
import { CuratorLogo } from "./curator-logo";
import { formatVaultEquity, formatVaultTvl, primaryVaultAction, vaultApr, vaultStatus, type VaultModalTab } from "@/lib/vaults/presentation";
import type { ResolvedVaultMeta } from "@/lib/vaults/registry";
import type { Vault } from "@/lib/vaults/types";
import { AprLabel } from "./vault-apr";
import { VaultAssetLogo } from "./vault-asset-logo";
import { VaultStatusLabel } from "./vault-status-label";

export function vaultHref(pda: string): string {
  return `/earn/${encodeURIComponent(pda)}`;
}

// AppButton's sizes are all h-10/text-base; two of those do not fit a 275px card
const CARD_BUTTON = "h-9 flex-1 px-3 text-sm";
const STAT = "flex items-center justify-between gap-3 py-2";

function CardBand() {
  return (
    <div
      className="absolute left-[-1px] right-[-1px] top-0 h-[74px] overflow-clip bg-black"
      style={{ backgroundImage: "url(/bg-card-band.png)", backgroundSize: "cover", backgroundPosition: "center" }}
      aria-hidden="true"
    />
  );
}

/** The pair, name, TVL, balance, APY, curator, status, Deposit and Details. Everything else lives on the vault page. */
export function VaultCard({
  vault,
  meta,
  nowSecs,
  onOpen,
}: {
  vault: Vault;
  meta: ResolvedVaultMeta;
  nowSecs: number;
  onOpen: (pda: string, tab: VaultModalTab) => void;
}) {
  const apr = vaultApr(vault.performance, meta.stakingAprPct);
  const action = primaryVaultAction(vault, nowSecs);

  return (
    <article
      aria-label={meta.name}
      className="relative flex h-full flex-col overflow-clip border border-bg-border bg-bg-primary px-6 pb-6 pt-11 transition-colors hover:border-content-secondary max-md:px-4 max-md:pb-4"
    >
      <CardBand />

      <div className="relative z-10 flex flex-col items-center gap-2.5 text-center">
        <div className="flex items-center gap-1.5">
          {meta.legs.map((leg, index) => (
            <Fragment key={leg}>
              {index > 0 ? <span aria-hidden="true" className="font-mono text-2xl text-content-secondary">/</span> : null}
              <VaultAssetLogo symbol={leg} size={48} label={index === 0 ? `Deposit ${leg}` : leg} />
            </Fragment>
          ))}
        </div>
        <div className="flex w-full flex-col items-center gap-1">
          <h3 className="max-w-full truncate font-mono text-xl font-bold leading-[1.2] tracking-[-0.4px] text-content-primary" title={meta.name}>
            {meta.legs.join(" / ")}
          </h3>
          <p className="max-w-full truncate font-mono text-xs leading-[1.2] text-content-secondary">{meta.name}</p>
        </div>
      </div>

      <dl className="relative z-10 mt-4 divide-y divide-bg-border font-mono text-sm leading-[1.2] tracking-[-0.28px]">
        <div className={STAT}>
          <dt className="text-content-secondary">TVL</dt>
          <dd className="tabular-nums text-content-primary">{formatVaultTvl(vault, meta.assetSymbol)}</dd>
        </div>
        <div className={STAT}>
          <dt className="text-content-secondary">Balance</dt>
          <dd className="tabular-nums text-content-primary">{formatVaultEquity(vault)} {meta.assetSymbol}</dd>
        </div>
        <div className={STAT}>
          <dt className="text-content-secondary"><AprLabel apr={apr} /></dt>
          <dd className={cn("tabular-nums", apr.muted ? "text-content-secondary" : "text-content-primary")}>{apr.value}</dd>
        </div>
        <div className={STAT}>
          <dt className="text-content-secondary">Curator</dt>
          <dd className="flex min-w-0 items-center gap-1.5 text-content-primary" title={`Vault governance ${vault.governance}`}>
            {meta.logoUrl ? <CuratorLogo src={meta.logoUrl} size={16} /> : null}
            <span className="truncate">{meta.curator}</span>
          </dd>
        </div>
        <div className={STAT}>
          <dt className="text-content-secondary">Status</dt>
          <dd className="min-w-0"><VaultStatusLabel status={vaultStatus(vault, nowSecs)} showDetail={false} /></dd>
        </div>
      </dl>

      <div className="relative z-10 mt-auto flex gap-2 pt-6">
        <AppButton className={CARD_BUTTON} onClick={() => onOpen(vault.vault_pda, action.tab)}>
          {action.label}
        </AppButton>
        <AppButtonLink href={vaultHref(vault.vault_pda)} variant="secondary" className={CARD_BUTTON}>
          Details
        </AppButtonLink>
      </div>
    </article>
  );
}

export function VaultCardSkeleton() {
  return (
    <div className="relative flex h-[323px] flex-col overflow-clip border border-bg-border bg-bg-primary px-6 pb-6 pt-11">
      <div className="absolute left-[-1px] right-[-1px] top-0 h-[74px] animate-pulse bg-action-primary" />
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        <div className="h-14 w-14 animate-pulse rounded-full bg-action-primary" />
        <div className="flex min-h-[69px] flex-col items-center justify-center gap-1">
          <div className="h-6 w-32 animate-pulse rounded bg-action-primary" />
          <div className="h-[17px] w-24 animate-pulse rounded bg-action-primary" />
        </div>
      </div>
      <div className="relative z-10 mt-6 flex items-center gap-4">
        <div className="flex-1"><div className="mx-auto h-9 w-16 animate-pulse rounded bg-action-primary" /></div>
        <div className="flex-1"><div className="mx-auto h-9 w-16 animate-pulse rounded bg-action-primary" /></div>
      </div>
      <div className="relative z-10 mt-auto flex gap-2">
        <div className="h-9 flex-1 animate-pulse bg-action-primary" />
        <div className="h-9 flex-1 animate-pulse bg-action-primary" />
      </div>
    </div>
  );
}
