import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { cn } from "@/lib/cn";
import { primaryVaultAction, vaultApr, type VaultModalTab } from "@/lib/vaults/presentation";
import type { ResolvedVaultMeta } from "@/lib/vaults/registry";
import type { Vault } from "@/lib/vaults/types";
import { AprLabel } from "./vault-apr";
import { VaultAssetLogo } from "./vault-asset-logo";

export function vaultHref(pda: string): string {
  return `/earn/${encodeURIComponent(pda)}`;
}

// AppButton's sizes are all h-10/text-base; two of those do not fit a 275px card
const CARD_BUTTON = "h-9 flex-1 px-3 text-sm";

function CardBand() {
  return (
    <div
      className="absolute left-[-1px] right-[-1px] top-0 h-[74px] overflow-clip bg-black"
      style={{ backgroundImage: "url(/bg-card-band.png)", backgroundSize: "cover", backgroundPosition: "center" }}
      aria-hidden="true"
    />
  );
}

/** Deposit asset (the logo), name, TVL, APR, curator, Deposit and Details. Everything else lives on the vault page. */
export function VaultCard({
  vault,
  meta,
  tvl,
  nowSecs,
  onOpen,
}: {
  vault: Vault;
  meta: ResolvedVaultMeta;
  /** formatted TVL, null while prices load */
  tvl: string | null;
  nowSecs: number;
  onOpen: (pda: string, tab: VaultModalTab) => void;
}) {
  const apr = vaultApr(vault.performance, meta.stakingAprPct);
  const action = primaryVaultAction(vault, nowSecs);

  return (
    <article
      aria-label={meta.name}
      className="relative flex h-full flex-col overflow-clip border border-bg-border bg-bg-primary px-6 pb-6 pt-11 backdrop-blur-[4px] transition-colors hover:border-[rgba(240,240,240,0.15)] max-md:px-4 max-md:pb-4"
    >
      <CardBand />

      <div className="relative z-10 flex flex-col items-center gap-2.5 text-center">
        <VaultAssetLogo symbol={meta.assetSymbol} size={56} ring label={`Deposit ${meta.assetSymbol}`} />
        {/* two name lines reserved so the stats rows line up across a grid row */}
        <div className="flex min-h-[69px] w-full flex-col items-center justify-center gap-1">
          <h3
            className="line-clamp-2 max-w-full break-words font-mono text-xl font-bold leading-[1.2] tracking-[-0.4px] text-content-primary"
            title={meta.name}
          >
            {meta.name}
          </h3>
          {tvl === null ? (
            <div className="h-[17px] w-24 animate-pulse rounded bg-action-primary" />
          ) : (
            <p className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
              TVL <span className="tabular-nums text-content-primary">{tvl}</span>
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-4 flex w-full items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
          <AprLabel apr={apr} className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary" />
          <span
            className={cn(
              "font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] tabular-nums",
              apr.muted ? "text-content-secondary" : "text-content-primary",
            )}
          >
            {apr.value}
          </span>
        </div>
        <div className="h-6 w-px shrink-0 bg-bg-border" />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
          <span className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">Curator</span>
          <span
            className="w-full truncate font-mono text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-primary"
            title={meta.curatorIsAddress ? `Vault governance ${vault.governance}` : `Curated by ${meta.curator}`}
          >
            {meta.curator}
          </span>
        </div>
      </div>

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
      <div className="relative z-10 mt-6 flex items-center gap-1">
        <div className="flex-1"><div className="mx-auto h-9 w-16 animate-pulse rounded bg-action-primary" /></div>
        <div className="h-6 w-px bg-bg-border" />
        <div className="flex-1"><div className="mx-auto h-9 w-16 animate-pulse rounded bg-action-primary" /></div>
      </div>
      <div className="relative z-10 mt-auto flex gap-2">
        <div className="h-9 flex-1 animate-pulse bg-action-primary" />
        <div className="h-9 flex-1 animate-pulse bg-action-primary" />
      </div>
    </div>
  );
}
