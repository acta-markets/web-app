"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { cn } from "@/lib/cn";
import { compareVaultsByYield, type VaultModalTab } from "@/lib/vaults/presentation";
import {
  VAULT_CATEGORIES,
  categoryHref,
  resolveVaultMeta,
  type CategoryFilter,
  type ResolvedVaultMeta,
  type VaultCategory,
} from "@/lib/vaults/registry";
import type { Vault } from "@/lib/vaults/types";
import { useNowSecs, useVaults } from "./use-vaults";
import { VaultCard, VaultCardSkeleton } from "./vault-card";
import { LazyVaultDepositModal as VaultDepositModal, usePrefetchVaultModal } from "./vault-deposit-modal-lazy";

type Entry = { vault: Vault; meta: ResolvedVaultMeta };

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 items-center gap-2 whitespace-nowrap border px-4 py-2.5 font-mono text-sm leading-none tracking-tight backdrop-blur-[4px] transition-colors max-md:h-8 max-md:px-3",
        active
          ? "border-accent-primary/30 bg-accent-primary/20 text-content-primary"
          : "border-bg-border bg-[rgba(18,18,18,0.01)] text-content-secondary hover:text-content-primary",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "text-content-primary/60" : "text-content-secondary")}>{count}</span>
    </button>
  );
}

export function VaultsClient({ initialCategory }: { initialCategory: CategoryFilter }) {
  const { data: vaults, error, loading, refresh } = useVaults();
  const nowSecs = useNowSecs();
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [open, setOpen] = useState<{ pda: string; tab: VaultModalTab } | null>(null);
  usePrefetchVaultModal();

  const entries = useMemo<Entry[]>(() => {
    const list = vaults.map((vault) => ({ vault, meta: resolveVaultMeta(vault) }));
    const names = new Map(list.map((e) => [e.vault.vault_pda, e.meta.name]));
    return list.sort((a, b) => compareVaultsByYield(a.vault, b.vault, (v) => names.get(v.vault_pda) ?? ""));
  }, [vaults]);

  const counts = useMemo(() => {
    const byCategory = new Map<VaultCategory, number>();
    for (const e of entries) byCategory.set(e.meta.category, (byCategory.get(e.meta.category) ?? 0) + 1);
    return byCategory;
  }, [entries]);

  // only categories that have vaults, plus the selected one so a deep link never hides its own chip
  const chips = VAULT_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0 || c === category);
  const visible = category === "all" ? entries : entries.filter((e) => e.meta.category === category);

  const selectCategory = useCallback((next: CategoryFilter) => {
    setCategory(next);
    // keeps the filter shareable without refetching this dynamic route
    window.history.replaceState(null, "", categoryHref(next));
  }, []);

  const openEntry = open ? entries.find((e) => e.vault.vault_pda === open.pda) : undefined;

  let content: React.ReactNode;
  if (vaults.length === 0 && loading) {
    content = (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <VaultCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (vaults.length === 0 && error) {
    content = (
      <AppCard className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="font-mono text-base text-content-primary">Couldn&apos;t load vaults.</p>
        <AppButton variant="secondary" onClick={refresh}>
          Try again
        </AppButton>
      </AppCard>
    );
  } else if (entries.length === 0) {
    content = (
      <AppCard className="px-6 py-12 text-center">
        <p className="font-mono text-base text-content-primary">No vaults are open yet.</p>
      </AppCard>
    );
  } else if (visible.length === 0) {
    content = (
      <AppCard className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="font-mono text-base text-content-primary">Nothing in {category} yet.</p>
        <AppButton variant="ghost" onClick={() => selectCategory("all")}>
          Show all vaults
        </AppButton>
      </AppCard>
    );
  } else {
    content = (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ vault, meta }) => (
          <VaultCard
            key={vault.vault_pda}
            vault={vault}
            meta={meta}
            nowSecs={nowSecs}
            onOpen={(pda, tab) => setOpen({ pda, tab })}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-8 pb-16 pt-[104px] max-md:pb-10 max-md:pt-16">
        <div className="flex w-full max-w-[540px] flex-col items-center gap-3 px-6">
          <h1 className="w-full text-center font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
            Earn
          </h1>
          <div className="flex w-full flex-col items-center gap-1.5">
            <p className="w-full text-center text-base font-normal leading-[1.2] tracking-[-0.32px] text-content-secondary">
              Curated vaults for the assets you already hold
            </p>
            <Link
              href="/docs/guide/vaults"
              className="inline-flex items-center gap-0.5 text-base font-medium leading-[1.2] tracking-[-0.32px] text-accent-secondary hover:text-accent-primary"
            >
              How vaults work
              <img src="/chevron-right-duo.svg" alt="" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[850px] pb-20 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <section className="flex flex-col gap-4" aria-labelledby="vaults-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="vaults-heading"
              className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl"
            >
              Vaults
            </h2>
            {entries.length > 0 ? (
              <div role="group" aria-label="Filter vaults by category" className="flex flex-wrap items-center gap-2">
                <CategoryChip label="All" count={entries.length} active={category === "all"} onClick={() => selectCategory("all")} />
                {chips.map((c) => (
                  <CategoryChip
                    key={c}
                    label={c}
                    count={counts.get(c) ?? 0}
                    active={category === c}
                    onClick={() => selectCategory(c)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {error && vaults.length > 0 ? (
            <p role="status" className="font-mono text-sm text-content-secondary">
              Couldn&apos;t refresh. Showing the last loaded vaults.
            </p>
          ) : null}

          {content}
        </section>
      </div>

      {open && openEntry ? (
        <VaultDepositModal
          vault={openEntry.vault}
          meta={openEntry.meta}
          initialTab={open.tab}
          onClose={() => setOpen(null)}
          onTransaction={refresh}
        />
      ) : null}
    </div>
  );
}
