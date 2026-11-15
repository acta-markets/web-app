"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { INLINE_PILL, INLINE_PILL_FACE, INLINE_PILL_GLYPH } from "@/components/app-ui/app-inline-select";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { Chevron } from "@/components/app-ui/chevron";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { cn } from "@/lib/cn";
import { SentenceTrade } from "@/components/trade/sentence/sentence-trade";

type Mode = "yield" | "profit";

/** The two ways to trade an option, as genuinely different products: buying optionality for
    direction (a long call / put) or selling it for yield (a covered call / cash-secured put).
    `word` completes the page title, "Get ___ on your thesis". */
const MODES: Array<{ value: Mode; word: string }> = [
  { value: "profit", word: "profit" },
  { value: "yield", word: "yield" },
];

/** The line under the title: what the switch changes, in one breath. Both read the same way,
    the mode's action and then the one condition they share. */
const MODE_LINE: Record<Mode, string> = {
  // buying: the upside is yours, the downside is capped at what you paid
  profit: "Profit if you are right, and only the premium is at risk",
  yield: "Earn yield if the price ends where you say",
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

/**
 * What is behind each mode, for the "How it works" modal. It does not walk through the page
 * again: it names the thing being traded (an option), what the premium is and what happens at
 * the date, in a few short points, and hands the rest to the guide. `terms` ties the page's
 * own words, above and below, to the option's names.
 */
const HOW_IT_WORKS: Record<
  Mode,
  {
    title: string;
    /** the whole thing in a breath, in the chart's own words, before any option vocabulary */
    short: string;
    points: Array<{ title: string; text: string }>;
    terms: string;
    guide: { label: string; href: string };
  }
> = {
  profit: {
    title: "How it works",
    short:
      "You bet on where the price ends. If you are right, you land in the profit zone, and the further the price ends past yours, the more you make. If you are wrong, you lose only the premium, a fixed fee paid up front.",
    points: [
      {
        title: "You buy an option",
        text: "An option is the right, not the obligation, to buy or sell an asset at a set price on a set date.",
      },
      {
        title: "You pay a premium",
        text: "That is the option's price, quoted by market makers. It is the most you can lose.",
      },
      {
        title: "You use it, or let it go",
        text: "If the price ends past yours, fund it before the date and trade at your price. If not, it expires and the premium is gone.",
      },
    ],
    terms: "Above buys a call, the right to buy. Below buys a put, the right to sell.",
    guide: { label: "Read the guide to buying options", href: "/docs/guide/buying-options" },
  },
  yield: {
    title: "How it works",
    short:
      "You get paid for your view on where the price ends. If you are right, you keep the premium and your deposit comes back. If you are wrong, you still keep the premium, and your deposit buys or sells the asset at your price.",
    points: [
      {
        title: "You sell an option",
        text: "An option is the right to buy or sell an asset at a set price on a set date. A market maker buys that right from you.",
      },
      {
        title: "You get the premium",
        text: "It is paid when the trade opens and is yours either way.",
      },
      {
        title: "You back it with a deposit",
        text: "If the price ends on your side, the deposit comes back. If it crosses your price, the deposit is exchanged at that price, and from then on you hold what it became.",
      },
    ],
    terms: "Above sells a put and locks USDC. Below sells a call and locks the asset.",
    guide: { label: "Read the options guide", href: "/docs/guide/options" },
  },
};

export function TradeClient() {
  const router = useRouter();
  const params = useSearchParams();
  // Profit is where the page lands; Yield is ?mode=yield. Anything else, the old ?mode=profit,
  // ?mode=pro and ?mode=easy links included, falls through to the default.
  const mode: Mode = params.get("mode") === "yield" ? "yield" : "profit";
  const [howOpen, setHowOpen] = useState(false);
  const { connectionState, getEarnSummary } = useRfqContext();

  const wsReady =
    connectionState !== "disconnected" && connectionState !== "error" && connectionState !== "connecting";
  useEffect(() => {
    if (!wsReady) return;
    getEarnSummary();
  }, [wsReady, getEarnSummary]);

  function setMode(next: Mode) {
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
        // out of the title's way, still one click away: a quiet line under the card
        footer={
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="inline-flex items-center gap-0.5 font-mono text-sm leading-[1.2] tracking-[-0.02em] text-content-secondary transition-colors hover:text-content-primary"
            >
              How it works
              <Chevron kind="go" className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <AppModal
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title={HOW_IT_WORKS[mode].title}
        showHowItWorks={false}
        className="max-w-md"
      >
        {/* a few short points, each a plain heading and one or two sentences: no boxes, no steps */}
        <p className="font-mono text-base leading-[1.45] text-content-primary">{HOW_IT_WORKS[mode].short}</p>

        <dl className="space-y-5">
          {HOW_IT_WORKS[mode].points.map((point) => (
            <div key={point.title}>
              <dt className="font-space text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary">{point.title}</dt>
              <dd className="mt-1 font-mono text-sm leading-[1.45] text-content-secondary">{point.text}</dd>
            </div>
          ))}
        </dl>

        <p className="font-mono text-sm leading-[1.45] text-content-tertiary">{HOW_IT_WORKS[mode].terms}</p>

        <Link
          href={HOW_IT_WORKS[mode].guide.href}
          className="inline-flex items-center gap-0.5 font-mono text-sm leading-[1.2] text-accent-secondary hover:text-accent-primary"
        >
          {HOW_IT_WORKS[mode].guide.label}
          <Chevron kind="go" className="h-4 w-4" />
        </Link>
      </AppModal>
    </div>
  );
}
