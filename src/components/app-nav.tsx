"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { PrivyConnectButton } from "@/components/wallet/privy-connect-button";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  const active = pathname?.startsWith("/portfolio") ? "portfolio" : "earn";
  const linkClass = (isActive: boolean) =>
    [
      "rounded-full px-3 py-1.5 transition-colors",
      isActive
        ? "bg-yuzu-main/20 text-black dark:text-white"
        : "text-black/80 hover:text-black hover:bg-yuzu-main/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
    ].join(" ");

  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-black/10 bg-white/70 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-black/40">
      <div className="flex items-center gap-3">
        <Link href="/earn" className="text-lg font-semibold tracking-tight dark:text-white">
          Acta
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
            className="bg-black/40"
          />
        </div>
        <PrivyConnectButton />
      </div>
    </nav>
  );
}


