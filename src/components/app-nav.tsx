"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActaLogo } from "@/components/acta-logo";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";

export type AppTab = "earn" | "trade" | "portfolio";

const TABS: ReadonlyArray<{ value: AppTab; label: string; href: string }> = [
  { value: "earn", label: "Earn", href: "/earn" },
  { value: "trade", label: "Trade", href: "/trade" },
  { value: "portfolio", label: "Portfolio", href: "/portfolio" },
];

/** Market pages are reached from the Trade table, so they keep Trade highlighted. */
export function activeAppTab(pathname: string | null): AppTab | null {
  const under = (prefix: string) => pathname === prefix || !!pathname?.startsWith(`${prefix}/`);
  if (under("/earn")) return "earn";
  if (under("/trade") || under("/market")) return "trade";
  if (under("/portfolio")) return "portfolio";
  return null;
}

export function AppNav() {
  const active = activeAppTab(usePathname());

  return (
    <nav className="relative z-50 mx-auto flex w-full max-w-[850px] flex-wrap items-center justify-between gap-y-3 pt-10 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-4">
      <div className="h-9 w-[129px]">
        <Link href="/earn">
          <ActaLogo className="h-9 w-[120px]" />
        </Link>
      </div>
      {/* One tab row for both layouts: a full-width third row on mobile, inline from md up */}
      <div className="order-last grid w-full grid-cols-3 gap-2 md:order-none md:flex md:w-auto md:items-center">
        {TABS.map((t) => {
          const isActive = t.value === active;
          return (
            <Link
              key={t.value}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex h-8 items-center justify-center whitespace-nowrap border px-3 py-1.5 text-sm font-normal leading-[1.2] tracking-[-0.28px] backdrop-blur-[4px] transition-colors md:h-10 md:px-4 md:py-2.5 md:text-base md:tracking-[-0.32px]",
                isActive
                  ? "bg-[rgba(42,162,134,0.2)] border-[rgba(42,162,134,0.3)] text-content-primary"
                  : "bg-[rgba(18,18,18,0.01)] border-bg-border text-content-secondary hover:text-content-primary"
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="flex w-[129px] flex-col items-end">
        <SolanaConnectButton />
        <Link href="/docs" className="mt-2 text-xs text-content-secondary hover:text-accent-secondary">Docs</Link>
      </div>
    </nav>
  );
}
