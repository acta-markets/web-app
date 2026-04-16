"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ActaLogo } from "@/components/acta-logo";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  const active = pathname?.startsWith("/portfolio") ? "portfolio" : "earn";

  const tabs = [
    { value: "earn", label: "Earn", href: "/earn" },
    { value: "portfolio", label: "Portfolio", href: "/portfolio" },
  ] as const;

  return (
    <nav className="relative z-50 mx-auto flex w-full max-w-[850px] items-center justify-between pt-10 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-4">
      {/* Logo — 129×36, logo itself 120×36 */}
      <div className="h-9 w-[129px]">
        <Link href="/earn">
          <ActaLogo className="h-9 w-[120px]" />
        </Link>
      </div>

      {/* Tabs — h-40, gap-8, px-16, py-10 per tab */}
      <div className="hidden items-center md:flex">
        <div className="flex items-center gap-2">
          {tabs.map((t) => {
            const isActive = t.value === active;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => router.push(t.href)}
                className={[
                  "flex h-10 items-center whitespace-nowrap backdrop-blur-[4px] border px-4 py-2.5 text-base font-normal leading-[1.2] tracking-[-0.32px] transition-colors",
                  isActive
                    ? "bg-[rgba(42,162,134,0.2)] border-[rgba(42,162,134,0.3)] text-content-primary"
                    : "bg-[rgba(18,18,18,0.01)] border-bg-border text-content-secondary hover:text-content-primary"
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Connect — w-[129px], right-aligned */}
      <div className="flex w-[129px] flex-col items-end">
        {/* Mobile tabs */}
        <div className="flex items-center gap-2 md:hidden">
          {tabs.map((t) => {
            const isActive = t.value === active;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => router.push(t.href)}
                className={[
                  "flex h-8 items-center whitespace-nowrap border px-3 py-1.5 text-sm font-normal leading-[1.2] tracking-[-0.28px]",
                  isActive
                    ? "bg-[rgba(42,162,134,0.2)] border-[rgba(42,162,134,0.3)] text-content-primary"
                    : "bg-[rgba(18,18,18,0.01)] border-bg-border text-content-secondary"
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <SolanaConnectButton />
      </div>
    </nav>
  );
}
