"use client";

import { useMemo, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { AppPageHeader, AppPageHeaderLink } from "@/components/app-ui/app-page-header";
import { getNetwork } from "@/lib/tokens";
import { VAULT_LINEUP, resolveLineup, withLineupName, type LineupEntry } from "@/lib/vaults/lineup";
import type { VaultModalTab } from "@/lib/vaults/presentation";
import { resolveVaultMeta } from "@/lib/vaults/registry";
import { VAULTS_SAMPLE_MODE } from "@/lib/vaults/sample";
import { useNowSecs, useVaults } from "./use-vaults";
import { VaultCard, VaultCardSkeleton, VaultGrid, VaultLineupCard, VaultPartnerCard } from "./vault-card";
import { LazyVaultDepositModal as VaultDepositModal, usePrefetchVaultModal } from "./vault-deposit-modal-lazy";

/**
 * Earn: the vault lineup, drawn as the landing page draws it. The page shows the lineup's
 * three income vaults and the partner cell, never the backend's whole list: a served vault
 * appears only as the live half of a lineup entry that names it, and an entry with no vault
 * behind it yet is drawn from the lineup's own words and assumed rate.
 *
 * `lineup` is the lineup to show; tests pass their own.
 */
export function VaultsClient({ lineup = VAULT_LINEUP }: { lineup?: readonly LineupEntry[] }) {
  const { data: vaults, error, loading, refresh } = useVaults();
  const nowSecs = useNowSecs();
  const [open, setOpen] = useState<{ pda: string; tab: VaultModalTab } | null>(null);
  usePrefetchVaultModal();

  const slots = useMemo(() => {
    const served = vaults.map((vault) => ({ vault, meta: resolveVaultMeta(vault) }));
    // fixture vaults have made-up addresses, so in sample mode an entry takes the fixture on its asset
    return resolveLineup(served, { network: getNetwork(), byAsset: VAULTS_SAMPLE_MODE, lineup }).map(({ entry, bound }) => ({
      entry,
      bound: bound ? { vault: bound.vault, meta: withLineupName(bound.meta, entry) } : null,
    }));
  }, [vaults, lineup]);

  const opened = open ? slots.find((slot) => slot.bound?.vault.vault_pda === open.pda)?.bound : undefined;
  // nothing served and nothing to fall back on: which entries are live is not known yet
  const unknown = vaults.length === 0 && (loading || !!error);

  let content: React.ReactNode;
  if (unknown && loading) {
    content = (
      <VaultGrid>
        {[...lineup.map((entry) => entry.id), "partner"].map((id) => (
          <VaultCardSkeleton key={id} />
        ))}
      </VaultGrid>
    );
  } else if (unknown) {
    content = (
      <AppCard className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="font-mono text-base tracking-[-0.02em] text-content-primary">Couldn&apos;t load vaults.</p>
        <AppButton variant="secondary" onClick={refresh}>
          Try again
        </AppButton>
      </AppCard>
    );
  } else {
    content = (
      <VaultGrid>
        {[
          ...slots.map(({ entry, bound }) =>
            bound ? (
              <VaultCard key={entry.id} vault={bound.vault} meta={bound.meta} eyebrow={entry.type} nowSecs={nowSecs} onOpen={(pda, tab) => setOpen({ pda, tab })} />
            ) : (
              <VaultLineupCard key={entry.id} entry={entry} />
            ),
          ),
          <VaultPartnerCard key="partner" />,
        ]}
      </VaultGrid>
    );
  }

  return (
    <div>
      <AppPageHeader
        title="Earn"
        subtitle="Curated vaults for the assets you already hold"
        action={<AppPageHeaderLink href="/docs/guide/vaults" prefetch={false}>How vaults work</AppPageHeaderLink>}
      />

      <div className="mx-auto w-full max-w-[850px] pb-20 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <section className="flex flex-col gap-4" aria-labelledby="vaults-heading">
          {/* the page title already says what follows; the heading is kept for a screen reader's outline */}
          <h2 id="vaults-heading" className="sr-only">
            Vaults
          </h2>

          {error && vaults.length > 0 ? (
            <p role="status" className="font-mono text-sm tracking-[-0.02em] text-content-secondary">
              Couldn&apos;t refresh. Showing the last loaded vaults.
            </p>
          ) : null}

          {content}
        </section>
      </div>

      {open && opened ? (
        <VaultDepositModal
          vault={opened.vault}
          meta={opened.meta}
          initialTab={open.tab}
          onClose={() => setOpen(null)}
          onTransaction={refresh}
        />
      ) : null}
    </div>
  );
}
