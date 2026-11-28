"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActaLogo } from "@/components/acta-logo";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";

export type AppTab = "earn" | "trade" | "portfolio" | "rewards" | "agent" | "spreads";

const TABS: ReadonlyArray<{ value: AppTab; label: string; href: string; soon?: boolean }> = [
  { value: "trade", label: "Trade", href: "/trade" },
  { value: "earn", label: "Earn", href: "/earn" },
  { value: "portfolio", label: "Portfolio", href: "/portfolio" },
  { value: "rewards", label: "Rewards", href: "/rewards" },
  { value: "agent", label: "Agent", href: "/agent" },
];

/** Market pages are reached from the Trade table, so they keep Trade highlighted. */
export function activeAppTab(pathname: string | null): AppTab | null {
  const under = (prefix: string) => pathname === prefix || !!pathname?.startsWith(`${prefix}/`);
  if (under("/earn")) return "earn";
  if (under("/trade") || under("/market")) return "trade";
  if (under("/portfolio")) return "portfolio";
  if (under("/rewards")) return "rewards";
  if (under("/agent")) return "agent";
  if (under("/spreads")) return "spreads";
  return null;
}

export function AppNav() {
  const active = activeAppTab(usePathname());

  return (
    // The page's own column, as every page shell and the footer are (`max-w-page`, 1200px in
    // the app): the logo and the connect button stand over the content's two edges. It was the
    // landing page's 850px, which left them 175px inside the content on Trade and Earn.
    <nav className="relative z-50 mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-y-3 px-6 pt-10 max-md:px-3 max-md:pt-4">
      <div className="h-9 w-[129px]">
        {/* the logo goes home, and the app's home is Trade */}
        <Link href="/trade">
          <ActaLogo className="h-9 w-[120px]" />
        </Link>
      </div>
      {/* One tab row for both layouts: a full-width third row on mobile, inline from md up.
          Five tabs share a phone's width, so there the gap and the side padding are at their smallest
          and the columns follow the labels: Portfolio and Rewards are wider than the rest. */}
      <div className="order-last grid w-full grid-cols-[1fr_1fr_1.4fr_1.2fr_1fr] gap-1 md:order-none md:flex md:w-auto md:items-center md:gap-2">
        {TABS.map((t) => {
          const isActive = t.value === active;
          return (
            <Link
              key={t.value}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={t.soon ? `${t.label} (coming soon)` : undefined}
              className={[
                // the app's corner, as every button and tag has
                "flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] px-1 py-1.5 text-sm font-normal leading-[1.2] tracking-[-0.28px] backdrop-blur-[4px] transition-colors md:h-10 md:px-4 md:py-2.5 md:text-base md:tracking-[-0.32px]",
                isActive
                  ? "bg-[rgba(42,162,134,0.2)] text-content-primary"
                  : t.soon
                    ? "bg-[rgba(18,18,18,0.01)] text-content-tertiary hover:text-content-primary"
                    : "bg-[rgba(18,18,18,0.01)] text-content-secondary hover:text-content-primary"
              ].join(" ")}
            >
              {t.label}
              {t.soon ? (
                <span className="text-[12px] text-content-tertiary">Soon</span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="flex w-[129px] flex-col items-end">
        <SolanaConnectButton />
      </div>
    </nav>
  );
}
