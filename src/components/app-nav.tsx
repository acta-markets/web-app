"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  const active = pathname?.startsWith("/portfolio") ? "portfolio" : "earn";
  const linkClass = (isActive: boolean) =>
    [
      "rounded-full px-3 py-1.5 transition-colors",
      isActive
        ? "bg-accent-primary/20 text-content-primary"
        : "text-content-secondary hover:text-content-primary hover:bg-accent-primary/10"
    ].join(" ");

  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between bg-bg-primary/70 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link href="/earn" className="logo text-xl text-content-primary">
          ACTA
        </Link>
      </div>

      {/* Desktop nav */}
      <div className="hidden items-center gap-2 text-sm font-semibold md:flex">
        <Link href="/earn" className={linkClass(active === "earn")}>
          Earn
        </Link>
        <Link href="/portfolio" className={linkClass(active === "portfolio")}>
          Portfolio
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {/* Mobile nav */}
        <div className="md:hidden">
          <AppSegmented
            value={active}
            onChange={(v) => router.push(v === "portfolio" ? "/portfolio" : "/earn")}
            options={[
              { value: "earn", label: "Earn" },
              { value: "portfolio", label: "Portfolio" }
            ]}
            className="bg-action-primary/40"
          />
        </div>
        <SolanaConnectButton />
      </div>
    </nav>
  );
}
