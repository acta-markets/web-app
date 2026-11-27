import { TYPE_LABEL } from "@/components/app-ui/type-styles";
import { Fragment } from "react";
import Link from "next/link";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { LandingBar, LandingButton } from "@/components/landing/landing-primitives";
import { LANDING_VAULTS } from "@/lib/landing-vaults";
import { LINEUP_ACCESS_URL, LINEUP_TAGLINE, type LineupEntry } from "@/lib/vaults/lineup";
import { cn } from "@/lib/cn";
import { formatPercent, formatUsd } from "@/lib/vaults/format";
import { CuratorLogo } from "./curator-logo";
import { assumedAprView, formatVaultEquity, primaryVaultAction, vaultApr, vaultStatus, vaultTvlUsd, type AprView, type VaultModalTab } from "@/lib/vaults/presentation";
import type { ResolvedVaultMeta } from "@/lib/vaults/registry";
import type { Vault } from "@/lib/vaults/types";
import { AprLabel } from "./vault-apr";
import { VaultAssetLogo } from "./vault-asset-logo";
import { VaultStatusLabel } from "./vault-status-label";

export function vaultHref(pda: string): string {
  return `/earn/${encodeURIComponent(pda)}`;
}

/** The small label over a title or a figure, at the type scale's floor: 12px, as written, no wide tracking. */
const EYEBROW = `${TYPE_LABEL} text-content-secondary`;
/** Lifts a control over the card-wide link, so it takes its own clicks. */
const ABOVE_LINK = "relative z-[2]";
// The landing page's two bar colours (STYLE.md): staking, then premium.
const BAR_COLOR = { Staking: "#2AA286", Premium: "#80C9B6" } as const;
// The app's buttons at the landing card's size: hugging their label, not stretched across the cell.
const CARD_BUTTON = "h-auto px-4 py-2.5 text-sm";

/** "staking + premium": the parts the rate adds up, in the landing card's words. */
function aprLegs(apr: AprView): string {
  return apr.sources.map((source) => source.label.toLowerCase()).join(" + ");
}

/**
 * The rate as the landing card sets it: the figure set large with its label and (i) beside it,
 * the parts it adds up to in words under it, then those parts as bars. A live vault and a
 * lineup entry with no vault yet both draw theirs through here, so the two cannot drift.
 */
function RateBlock({ apr }: { apr: AprView }) {
  // bars only for a rate that adds up to something: a figure, above zero
  const total = apr.pct != null && apr.pct > 0 ? apr.pct : null;
  const bars = total === null ? [] : apr.sources.filter((source) => source.pct > 0);
  // an assumed rate carries its tilde into the bar captions, so no part reads as measured
  const tilde = apr.assumed ? "~" : "";
  return (
    <div className="mt-6">
      <div className={cn("flex gap-1.5", apr.pct != null ? "items-start" : "items-baseline")}>
        <span
          className={cn(
            "font-space font-medium tabular-nums tracking-[-0.03em]",
            // a rate in numbers takes the display size, its label raised to its cap height; a word in its place sits under the
            // vault's name at the size of a figure, on one line with its label
            apr.pct != null ? "text-[clamp(40px,6vw,54px)] leading-[0.95]" : "text-2xl leading-[1.1]",
            apr.pct != null && apr.pct < 0 ? "text-additional-red-primary" : apr.muted ? "text-content-secondary" : "text-content-primary",
          )}
        >
          {apr.value}
        </span>
        <span className={cn(EYEBROW, "inline-flex items-center gap-1 whitespace-nowrap")}>
          <AprLabel apr={apr} className={ABOVE_LINK} />
        </span>
      </div>
      {/* under a figure, the parts it is made of; without one, why there is none yet */}
      <p className="mt-2.5 font-mono text-[14px] leading-[1.35] tracking-[-0.02em] text-content-secondary">
        {apr.pct != null && apr.sources.length > 0 ? aprLegs(apr) : apr.note}
      </p>
      {bars.length > 0 && total !== null ? (
        <div className="mt-5 flex flex-col gap-4">
          {bars.map((source) => (
            <LandingBar key={source.label} value={source.pct} max={total} color={BAR_COLOR[source.label]} caption={`${source.label} ${tilde}${formatPercent(source.pct)}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One vault as the landing page draws one ("Pick a vault"): a cell of a lined grid, not a box.
 * Read top to bottom it is a small label, the vault's name set large, the rate set larger
 * with the parts it adds up drawn as bars, then the two facts a rate does not carry, and the
 * buttons last, at the bottom left.
 *
 * Where it departs from the landing card, it is because this one is live: the name is the
 * vault's and not the asset's, since several vaults share an asset; the rate is the backend's
 * figure, to two decimals, and can be "New" or negative; and the status sits beside the label.
 *
 * The whole cell opens the vault page; the buttons and the (i) sit above that link.
 */
export function VaultCard({
  vault,
  meta,
  eyebrow,
  nowSecs,
  onOpen,
}: {
  vault: Vault;
  meta: ResolvedVaultMeta;
  /** The small label over the name; the vault's category unless the lineup gives its own. */
  eyebrow?: string;
  nowSecs: number;
  onOpen: (pda: string, tab: VaultModalTab) => void;
}) {
  const apr = vaultApr(vault.performance, meta.stakingAprPct, meta.assumedApr);
  const action = primaryVaultAction(vault, nowSecs);
  const pair = meta.legs.join(" / ");
  const usd = vaultTvlUsd(vault);
  const equity = `${formatVaultEquity(vault)} ${meta.assetSymbol}`;

  return (
    <article
      aria-label={meta.name}
      className="relative flex h-full flex-col justify-between gap-8 p-7 transition-colors hover:bg-[rgba(240,240,240,0.03)] max-md:p-5"
    >
      {/* a click anywhere but a control opens the vault; the name below is the link a keyboard and a screen reader get */}
      <Link href={vaultHref(vault.vault_pda)} prefetch={false} aria-hidden="true" tabIndex={-1} className="absolute inset-0 z-[1]" />

      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className={EYEBROW}>{eyebrow ?? meta.category}</span>
          <VaultStatusLabel status={vaultStatus(vault, nowSecs)} showDetail={false} />
        </div>

        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center" title={pair}>
            {meta.legs.map((leg, index) => (
              <Fragment key={leg}>
                {/* the deposit asset in front, the second leg tucked behind it */}
                <span className={index > 0 ? "-ml-2" : "relative z-[1]"}>
                  <VaultAssetLogo symbol={leg} size={28} label={index === 0 ? `Deposit ${leg}` : leg} />
                </span>
              </Fragment>
            ))}
          </span>
          <h3
            className="min-w-0 font-space font-medium text-content-primary"
            style={{ fontSize: "clamp(28px, 3vw, 34px)", lineHeight: 1, letterSpacing: "-0.03em" }}
            title={meta.name}
          >
            <Link
              href={vaultHref(vault.vault_pda)}
              prefetch={false}
              className="block truncate pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
            >
              {meta.name}
            </Link>
          </h3>
        </div>
        {/* two lines kept for every cell, so a vault with a short line or none still lines up with its neighbour */}
        <p className="mt-2.5 line-clamp-2 min-h-[2.7em] font-mono text-[14px] leading-[1.35] tracking-[-0.02em] text-content-secondary" title={meta.tagline}>
          {meta.tagline ?? `Deposit ${meta.assetSymbol}`}
        </p>

        <RateBlock apr={apr} />
      </div>

      <div>
        <dl className="mb-6 grid grid-cols-2 gap-x-6 border-t border-bg-border pt-4 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className={EYEBROW}>TVL</dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 tabular-nums text-content-primary">
              {/* dollars lead when the backend has a fresh price; the asset amount is the same money in its own unit */}
              {usd === null ? (
                <span>{equity}</span>
              ) : (
                <>
                  <span>{formatUsd(usd)}</span>
                  <span className="text-xs text-content-secondary">{equity}</span>
                </>
              )}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className={EYEBROW}>Curator</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-content-primary" title={`Vault governance ${vault.governance}`}>
              {meta.logoUrl ? <CuratorLogo src={meta.logoUrl} size={16} /> : null}
              <span className="truncate">{meta.curator}</span>
            </dd>
          </div>
        </dl>

        {/* the buttons close the cell: nothing renders after them */}
        <div className={cn(ABOVE_LINK, "flex w-fit gap-2")}>
          <AppButton className={CARD_BUTTON} onClick={() => onOpen(vault.vault_pda, action.tab)}>
            {action.label}
          </AppButton>
          <AppButtonLink href={vaultHref(vault.vault_pda)} variant="secondary" className={CARD_BUTTON}>
            Details
          </AppButtonLink>
        </div>
      </div>
    </article>
  );
}

/**
 * A lineup vault with no vault address behind it yet, drawn from what the lineup says, the
 * way the landing page draws its cards. Open: the assumed rate with its parts as bars, and a
 * Deposit button that leads where the landing page's does. Not open yet: the same cell
 * dimmed, with words where the button would be.
 *
 * Nothing here is live. The rate carries a tilde and an (i) saying it comes from backtesting;
 * there is no TVL, no curator and no status, because there is no vault to read them from.
 */
export function VaultLineupCard({ entry }: { entry: LineupEntry }) {
  const open = entry.state === "open";
  return (
    <article aria-label={entry.asset} className={cn("flex h-full flex-col justify-between gap-8 p-7 max-md:p-5", !open && "opacity-[0.55]")}>
      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className={EYEBROW}>{entry.type}</span>
          {open ? null : <VaultStatusLabel status={{ label: "Not open yet", tone: "neutral" }} showDetail={false} />}
        </div>
        <div className="flex items-center gap-3">
          <VaultAssetLogo symbol={entry.asset} size={28} />
          <h3 className="min-w-0 truncate pb-1 font-space font-medium text-content-primary" style={{ fontSize: "clamp(28px, 3vw, 34px)", lineHeight: 1, letterSpacing: "-0.03em" }}>
            {entry.asset}
          </h3>
        </div>
        <p className="mt-2.5 min-h-[2.7em] font-mono text-[14px] leading-[1.35] tracking-[-0.02em] text-content-secondary">{LINEUP_TAGLINE}</p>

        {entry.assumedApr ? <RateBlock apr={assumedAprView(entry.assumedApr)} /> : null}
      </div>
      {open ? (
        <div>
          {/* no vault address yet, so Deposit leads where the landing page's does */}
          <AppButtonLink href={LINEUP_ACCESS_URL} target="_blank" rel="noreferrer noopener" className={CARD_BUTTON}>
            Deposit
          </AppButtonLink>
        </div>
      ) : (
        <div className="font-mono text-sm font-medium tracking-[-0.02em] text-content-tertiary">Opening soon</div>
      )}
    </article>
  );
}

/** The landing page's last cell, word for word: the way in for a curator or a market maker. */
export function VaultPartnerCard() {
  const partner = LANDING_VAULTS.find((vault) => vault.status === "launch");
  if (!partner) return null;
  return (
    <article aria-label={partner.asset} className="flex h-full flex-col justify-between gap-8 p-7 max-md:p-5">
      <div>
        <div className={cn(EYEBROW, "mb-5")}>{partner.type}</div>
        <h3 className="pb-1 font-space font-medium text-content-primary" style={{ fontSize: "clamp(28px, 3vw, 34px)", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {partner.asset}
        </h3>
        <p className="mt-6 font-mono text-[14px] leading-[1.5] tracking-[-0.02em] text-content-secondary">Become a curator, market maker, or launch in private</p>
      </div>
      <div>
        <LandingButton variant="ghost" size="md" href={partner.ctaHref}>
          {partner.ctaLabel}
        </LandingButton>
      </div>
    </article>
  );
}

export function VaultCardSkeleton() {
  const bone = "animate-pulse bg-action-primary";
  return (
    <div className="flex h-full min-h-[420px] flex-col justify-between gap-8 p-7 max-md:p-5" aria-hidden="true">
      <div>
        <div className={cn(bone, "mb-5 h-[13px] w-16")} />
        <div className={cn(bone, "h-[34px] w-48")} />
        <div className={cn(bone, "mt-2.5 h-[35px] w-64 max-w-full")} />
        <div className={cn(bone, "mt-6 h-[51px] w-36")} />
        <div className={cn(bone, "mt-2.5 h-[18px] w-24")} />
      </div>
      <div>
        <div className="mb-6 grid grid-cols-2 gap-x-6 border-t border-bg-border pt-4">
          <div className={cn(bone, "h-9 w-24")} />
          <div className={cn(bone, "h-9 w-24")} />
        </div>
        <div className="flex gap-2">
          <div className={cn(bone, "h-[38px] w-[86px]")} />
          <div className={cn(bone, "h-[38px] w-[82px]")} />
        </div>
      </div>
    </div>
  );
}

/**
 * The landing page's grid (STYLE.md, "Grids"): cells divided by 1px lines, no gaps and no
 * boxes, two columns from 768px, every cell in a row the same height.
 */
export function VaultGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 border-t border-bg-border md:grid-cols-2">
      {children.map((child, i) => (
        <div key={i} className={cn("border-b border-bg-border", i % 2 !== 0 && "md:border-l")}>
          {child}
        </div>
      ))}
      {/* an odd count leaves half a row: an empty cell carries the bottom rule and the divider across, so the grid closes */}
      {children.length % 2 !== 0 ? <div aria-hidden="true" className="border-b border-bg-border max-md:hidden md:border-l" /> : null}
    </div>
  );
}
