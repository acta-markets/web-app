"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { TYPE_LINK } from "@/components/app-ui/type-styles";
import { Chevron } from "@/components/app-ui/chevron";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { cn } from "@/lib/cn";
import { useLocalStore } from "@/lib/state/local-store";
import { tradeDraftStore, updateTradeDraft } from "@/lib/trade/draft";
import { SentenceTrade } from "@/components/trade/sentence/sentence-trade";

type Mode = "yield" | "profit";

/** Where "How it works" leads: the guide to what the mode on screen trades. */
const GUIDE: Record<Mode, string> = {
  profit: "/docs/guide/buying-options",
  yield: "/docs/guide/options",
};

export function TradeClient() {
  const router = useRouter();
  const params = useSearchParams();
  // Profit is where the page lands; Yield is ?mode=yield. Anything else, the old ?mode=profit,
  // ?mode=pro and ?mode=easy links included, falls through to the default.
  // The address decides when it says; a bare /trade (the nav link, the logo) opens the mode
  // the visitor last used on this device.
  const draft = useLocalStore(useMemo(() => tradeDraftStore(), []));
  const asked = params.get("mode");
  const mode: Mode = asked === "yield" ? "yield" : asked === "profit" ? "profit" : (draft.mode ?? "profit");
  const { connectionState, getEarnSummary } = useRfqContext();

  const wsReady =
    connectionState !== "disconnected" && connectionState !== "error" && connectionState !== "connecting";
  useEffect(() => {
    if (!wsReady) return;
    getEarnSummary();
  }, [wsReady, getEarnSummary]);

  function setMode(next: Mode) {
    updateTradeDraft(tradeDraftStore(), { mode: next });
    const query = new URLSearchParams(params.toString());
    if (next === "yield") query.set("mode", "yield");
    else query.delete("mode");
    const qs = query.toString();
    router.replace(qs ? `/trade?${qs}` : "/trade", { scroll: false });
  }

  return (
    <div>
      {/* the page's title, set like Earn's, with the mode as the one word in it you can change */}
      <AppPageHeader title="Trade" subtitle="Get profit or yield from your thesis" />

      <SentenceTrade
        mode={mode}
        onMode={setMode}
        initialAsset={params.get("asset")}
        initialDirection={params.get("dir")}
        // out of the title's way, still one click away: a quiet line under the card that
        // opens the guide, as the header links on Earn and Portfolio do
        footer={
          <div className="mt-4 flex justify-center">
            <Link href={GUIDE[mode]} prefetch={false} className={cn(TYPE_LINK, "text-base leading-[1.2]")}>
              How it works
              <Chevron kind="go" className="h-4 w-4" />
            </Link>
          </div>
        }
      />
    </div>
  );
}
