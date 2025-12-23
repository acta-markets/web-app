import Link from "next/link";
import { AppButtonLink } from "@/components/app-ui/app-button";
import { AppPill } from "@/components/app-ui/app-pill";
import { PrivyConnectButton } from "@/components/wallet/privy-connect-button";

export function AppNav() {
  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-black/10 bg-white/70 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-black/40">
      <div className="flex items-center gap-3">
        <Link href="/earn" className="text-lg font-semibold tracking-tight dark:text-white">
          Yuzu
        </Link>
        <AppPill>beta</AppPill>
      </div>

      <div className="hidden items-center gap-6 text-sm font-semibold text-black/80 md:flex">
        <Link
          href="/earn"
          className="hover:text-black dark:text-white/70 dark:hover:text-white"
        >
          Earn
        </Link>
        <Link
          href="/portfolio"
          className="hover:text-black dark:text-white/70 dark:hover:text-white"
        >
          Portfolio
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <PrivyConnectButton />
        <AppButtonLink href="/earn" variant="secondary" className="hidden sm:inline-flex">
          Earn
        </AppButtonLink>
      </div>
    </nav>
  );
}


