"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Chevron } from "@/components/app-ui/chevron";
import { TYPE_LINK, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { hasUnfinishedOrder } from "@/components/market/use-rfq-order";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { cn } from "@/lib/cn";
import { getRfqBackendUrl } from "@/lib/rfq-client";

/**
 * Says, on every app page but Trade, that this wallet has a trade it accepted and that has
 * not finished. The order itself is picked up and reconciled on Trade, which is where the
 * line leads; here it is only made impossible to miss. Reads the stored record, changes nothing.
 */
export function UnfinishedTradeNotice() {
  const pathname = usePathname();
  const { selectedAccount, expectedAccount } = useSolana();
  const wallet = selectedAccount?.address ?? expectedAccount?.address ?? null;
  const [unfinished, setUnfinished] = useState(false);

  useEffect(() => {
    const check = () => setUnfinished(wallet !== null && hasUnfinishedOrder({ walletAddress: wallet, backendUrl: getRfqBackendUrl() }));
    check();
    // the record changes in another tab, or on Trade while this page is in the background
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
    };
  }, [wallet, pathname]);

  const onTrade = pathname === "/trade" || !!pathname?.startsWith("/trade/");
  if (!unfinished || onTrade) return null;
  return (
    <div className="relative z-[1] mx-auto w-full max-w-[850px] pt-4 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
      <p role="status" className={cn(TYPE_NOTE, "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-additional-orange-primary px-4 py-3 text-content-primary")}>
        <span>A trade you accepted has not finished yet.</span>
        <Link href="/trade" className={cn(TYPE_LINK, "text-[14px] text-content-primary")}>
          Open it on Trade
          <Chevron kind="go" className="h-4 w-4" />
        </Link>
      </p>
    </div>
  );
}
