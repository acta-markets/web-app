"use client";

import { cn } from "@/lib/cn";
import { TYPE_LABEL } from "@/components/app-ui/type-styles";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { finishedCycles } from "@/lib/vaults/metrics";
import { shortAddress } from "@/lib/vaults/format";
import { CuratorLogo } from "./curator-logo";
import { primaryVaultAction, vaultStatus } from "@/lib/vaults/presentation";
import { resolveVaultMeta } from "@/lib/vaults/registry";
import { lineupEntryFor, withLineupName } from "@/lib/vaults/lineup";
import { getNetwork } from "@/lib/tokens";
import { useNowSecs, useUnsettledVaultPositions, useVault, useVaultCycles, useVaultExposure } from "./use-vaults";
import { VaultAssetLogo } from "./vault-asset-logo";
import { VaultCurrentCycle, VaultExposureCard, VaultSpot } from "./vault-cycle";
import { VaultCyclesTable } from "./vault-cycles-table";
import { VaultDetailTabs } from "./vault-detail-tabs";
import { VaultMetrics } from "./vault-metrics";
import { VaultPerformanceCard } from "./vault-performance-card";
import { VaultStatusLabel } from "./vault-status-label";
import { VaultManagerScope, VaultRisks, VaultTerms } from "./vault-terms";

const VaultDepositForm = dynamic(
  () => import("./vault-deposit-modal").then((m) => m.VaultDepositForm),
  { ssr: false, loading: () => <div className="h-[320px] animate-pulse bg-action-tertiary" aria-label="Loading deposit form" /> },
);

const CONTAINER =
  "mx-auto w-full max-w-page px-6 pb-20 pt-12 max-md:px-3 max-md:pb-10 max-md:pt-16";

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
      <Link href="/earn" className="text-content-secondary hover:text-content-primary">
        Earn
      </Link>
      <span className="text-content-primary">/</span>
      <span className="text-content-primary">Vault</span>
    </nav>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-10" aria-hidden="true">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-action-primary" />
        <div className="h-12 w-64 animate-pulse rounded-none bg-action-primary" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse bg-action-tertiary" />
        ))}
      </div>
      <div className="h-[320px] animate-pulse bg-action-tertiary" />
    </div>
  );
}

export function VaultDetailClient({ pda }: { pda: string }) {
  const vaultState = useVault(pda);
  const cyclesState = useVaultCycles(pda);
  const exposureState = useVaultExposure(pda);
  const positionsState = useUnsettledVaultPositions(pda);
  const nowSecs = useNowSecs();

  const vault = vaultState.data;
  // a vault in the lineup goes by its lineup name here too, so the page and its card agree
  const meta = useMemo(() => (vault ? withLineupName(resolveVaultMeta(vault), lineupEntryFor(vault.vault_pda, getNetwork())) : null), [vault]);
  const cycles = useMemo(() => cyclesState.data?.cycles ?? [], [cyclesState.data]);
  // charts never compound across a share-price reset
  const generation = vault?.capital_generation;
  const generationCycles = useMemo(
    () => cycles.filter((cycle) => cycle.capital_generation !== null && cycle.capital_generation === generation),
    [cycles, generation],
  );
  const finished = useMemo(() => finishedCycles(generationCycles), [generationCycles]);

  if (!vault || !meta) {
    let body: React.ReactNode;
    if (vaultState.loading) {
      body = <DetailSkeleton />;
    } else if (vaultState.error) {
      body = (
        <AppCard className="mt-6 flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="font-mono text-base text-content-primary">Couldn&apos;t load this vault.</p>
          <AppButton variant="secondary" onClick={vaultState.refresh}>
            Try again
          </AppButton>
        </AppCard>
      );
    } else {
      body = (
        <AppCard className="mt-6 flex flex-col items-center gap-4 px-6 py-12 text-center">
          <h1 className="font-space text-3xl font-semibold text-content-primary">Vault not found</h1>
          <p className="max-w-[420px] font-mono text-sm leading-[1.5] text-content-secondary">
            It may have closed. Closed vaults leave the list, though their history stays on chain.
          </p>
          <AppButtonLink href="/earn" variant="secondary">
            All vaults
          </AppButtonLink>
        </AppCard>
      );
    }
    return (
      <div className={CONTAINER}>
        <Breadcrumb />
        {body}
      </div>
    );
  }

  const status = vaultStatus(vault, nowSecs);
  const action = primaryVaultAction(vault, nowSecs);
  // a failed read means no fresh positions (503 past 15 s): hide rather than show stale numbers
  const exposure = !exposureState.error && exposureState.data?.positions.length ? exposureState.data : null;
  const historyLoading = cyclesState.loading && cyclesState.data === null && !cyclesState.disabled;

  return (
    <div className={CONTAINER}>
      <Breadcrumb />

      <div className="mt-5 grid min-w-0 grid-cols-1 border border-bg-border bg-bg-primary lg:grid-cols-2">
        <div className="min-w-0 border-b border-bg-border p-5 max-md:p-4 lg:border-b-0 lg:border-r">
          <header className="flex min-w-0 flex-col gap-3">
            {/* as on a card and on the landing page: the category as a small label, with the status beside it */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className={cn(TYPE_LABEL, "text-content-secondary")}>{meta.category}</span>
              {/* the page has room for the whole status, so it is never cut short here */}
              <VaultStatusLabel status={status} wrap />
            </div>
            <div className="flex min-w-0 items-center gap-4">
              <VaultAssetLogo symbol={meta.assetSymbol} size={40} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="min-w-0 break-words font-space text-[32px] font-semibold leading-[1.1] tracking-[-0.64px] text-content-primary max-md:text-2xl">
                  {meta.name}
                </h1>
                {/* what the vault does, in its operator's words: under the name, not run into it */}
                {meta.tagline ? (
                  <p className="font-mono text-sm leading-[1.4] tracking-[-0.02em] text-content-secondary [overflow-wrap:anywhere]">{meta.tagline}</p>
                ) : null}
              </div>
            </div>
            {meta.strategy ? (
              <p className="font-mono text-base leading-[1.4] tracking-[-0.02em] text-content-primary [overflow-wrap:anywhere]">{meta.strategy}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
              <span>
                Deposit <span className="text-content-primary">{meta.assetSymbol}</span>
              </span>
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={`Vault governance ${vault.governance}`}>
                Curator
                {meta.logoUrl ? <CuratorLogo src={meta.logoUrl} size={16} /> : null}
                <span className="truncate text-content-primary">{meta.curator}</span>
                {!meta.curatorIsAddress && ` · ${shortAddress(vault.governance)}`}
              </span>
              {meta.website ? (
                <a className="underline hover:text-content-primary" href={meta.website} target="_blank" rel="noopener noreferrer nofollow">
                  Website
                </a>
              ) : null}
              {meta.twitter ? (
                <a className="underline hover:text-content-primary" href={`https://x.com/${meta.twitter}`} target="_blank" rel="noopener noreferrer nofollow">
                  X
                </a>
              ) : null}
            </div>
            {meta.description ? (
              <p className="max-w-[560px] font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary [overflow-wrap:anywhere]">
                {meta.description}
              </p>
            ) : null}
          </header>

          <div className="my-4">
            <VaultMetrics vault={vault} symbol={meta.assetSymbol} stakingAprPct={meta.stakingAprPct} assumedApr={meta.assumedApr} />
          </div>
          <VaultDepositForm
            key={vault.vault_pda}
            vault={vault}
            meta={meta}
            initialTab={action.tab}
            onTransaction={vaultState.refresh}
          />
        </div>

        <VaultPerformanceCard
          key={vault.vault_pda}
          vault={vault}
          symbol={meta.assetSymbol}
          cycles={generationCycles}
          finished={finished}
          nowSecs={nowSecs}
          loading={historyLoading}
          unavailable={cyclesState.disabled || !!cyclesState.error}
          truncated={cyclesState.data?.next_cursor != null}
        />
      </div>
      <VaultCurrentCycle vault={vault} cycles={cycles} nowSecs={nowSecs} />

      {vaultState.error ? (
        <p role="status" className="mt-6 font-mono text-sm text-content-secondary">
          Couldn&apos;t refresh. Showing the last loaded figures.
        </p>
      ) : null}

      <div className="mt-5 min-w-0">
        <VaultDetailTabs
          tabs={[
            ...(exposure
              ? [{ value: "positions", label: "Positions", aside: <VaultSpot exposure={exposure} />, content: <VaultExposureCard exposure={exposure} positions={positionsState.data ?? []} /> }]
              : []),
            ...(cyclesState.disabled
              ? []
              : [{ value: "history", label: "History", content: <VaultCyclesTable cycles={cycles} decimals={vault.main_decimals} symbol={meta.assetSymbol} /> }]),
            { value: "manager", label: "Manager", content: <VaultManagerScope vault={vault} symbol={meta.assetSymbol} /> },
            { value: "terms", label: "Terms", content: <VaultTerms vault={vault} symbol={meta.assetSymbol} /> },
            { value: "risks", label: "Risks", content: <VaultRisks /> },
          ]}
        />
      </div>

    </div>
  );
}
