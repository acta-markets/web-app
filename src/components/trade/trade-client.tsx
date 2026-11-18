"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { INLINE_PILL, INLINE_PILL_FACE, INLINE_PILL_GLYPH } from "@/components/app-ui/app-inline-select";
import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { TYPE_LINK } from "@/components/app-ui/type-styles";
import { Chevron } from "@/components/app-ui/chevron";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { cn } from "@/lib/cn";
import { useLocalStore } from "@/lib/state/local-store";
import { tradeDraftStore, updateTradeDraft } from "@/lib/trade/draft";
import { SentenceTrade } from "@/components/trade/sentence/sentence-trade";

type Mode = "yield" | "profit";

/** The two ways to trade an option, as genuinely different products: buying optionality for
    direction (a long call / put) or selling it for yield (a covered call / cash-secured put).
    `word` completes the page title, "Get ___ on your thesis". */
const MODES: Array<{ value: Mode; word: string }> = [
  { value: "profit", word: "profit" },
  { value: "yield", word: "yield" },
];

/** The line under the title. The title already names the upside ("Get profit", "Get yield"),
    so this line says only what being wrong costs, in the same words for both modes. */
const MODE_LINE: Record<Mode, string> = {
  // buying: the loss stops at what was paid. "Only the premium" says nothing to someone who
  // does not know how big a premium is, so the line ties it to the amount shown under Now
  profit: "If you are wrong, you lose what you pay now, never more",
  // selling: the premium is kept, and the deposit is exchanged at the strike
  yield: "If you are wrong, you buy or sell the asset at your price",
};

/**
 * The mode, set inside the page title. It has two values, so it is a switch, not a menu: one
 * click flips it. It keeps the width of its wider word, so flipping never reflows the title.
 */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const other = MODES.find((m) => m.value !== mode)!;
  return (
    <button
      type="button"
      aria-label={`Trading mode: ${mode}. Switch to ${other.word}`}
      title={`Switch to ${other.word}`}
      onClick={() => onChange(other.value)}
      className={cn(
        INLINE_PILL,
        // The pill's padding and border must not make the title's line taller than a plain
        // title's: pulled in by a hair, the words sit exactly where Earn's and Portfolio's do.
        "-my-[0.07em]",
        "cursor-pointer border-accent-primary/60 bg-accent-primary/25 text-content-primary hover:border-accent-primary hover:bg-accent-primary/40",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      )}
    >
      <span className="inline-grid">
        {MODES.map((m) => (
          <span key={m.value} aria-hidden={m.value !== mode} className={cn(INLINE_PILL_FACE, "justify-center", m.value !== mode && "invisible")}>
            {m.word}
          </span>
        ))}
      </span>
      <Chevron kind="switch" className={INLINE_PILL_GLYPH} />
    </button>
  );
}

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
      <AppPageHeader
        title={<>Get <ModeToggle mode={mode} onChange={setMode} /> <span className="whitespace-nowrap">on your thesis</span></>}
        // Both lines sit in one cell and only the mode's own shows, so the block is always as
        // tall as the longer one: on a narrow phone one wraps and the other does not, and
        // flipping the mode must not move the page.
        subtitle={
          <span className="grid">
            {MODES.map((m) => (
              <span key={m.value} aria-hidden={m.value !== mode} className={cn("col-start-1 row-start-1", m.value !== mode && "invisible")}>
                {MODE_LINE[m.value]}
              </span>
            ))}
          </span>
        }
      />

      <SentenceTrade
        mode={mode}
        initialAsset={params.get("asset")}
        initialDirection={params.get("dir")}
        // out of the title's way, still one click away: a quiet line under the card that
        // opens the guide, as the header links on Earn and Portfolio do
        footer={
          <div className="mt-4 flex justify-center">
            <Link href={GUIDE[mode]} prefetch={false} className={cn(TYPE_LINK, "text-sm leading-[1.2]")}>
              How it works
              <Chevron kind="go" className="h-4 w-4" />
            </Link>
          </div>
        }
      />
    </div>
  );
}
