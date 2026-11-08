"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { SentenceTrade } from "@/components/trade/sentence/sentence-trade";

type Mode = "yield" | "profit";

/** The two ways to trade an option, as genuinely different products: selling optionality
    for yield (a covered call / cash-secured put) or buying it for direction (a long call / put). */
const MODES: Array<{ value: Mode; label: string }> = [
  { value: "yield", label: "Yield" },
  { value: "profit", label: "Profit" },
];

/** The three option terms, demoted from the front to a quiet reference at the bottom: what the
    trade is measured against (strike), when it settles (expiry) and how its price is set (quote). */
const OPTION_TERMS: Array<{ k: string; v: string }> = [
  { k: "Strike", v: "The price you pick — the line the final price is measured against." },
  { k: "Expiry", v: "When the trade settles; the final price decides the outcome." },
  { k: "Premium", v: "The option's price, set by a quote when you trade." },
];

/** How each mode works, for the "How it works" modal: what it is (the lead), the two setup steps,
    the expiry outcome and the risk (max gain / max loss). Yield sells optionality for a premium;
    profit buys it. */
const HOW_IT_WORKS: Record<
  Mode,
  {
    lead: string;
    steps: Array<{ n: string; t: string }>;
    outcome: { n: string; right: string; wrong: string };
    risk: Array<{ k: string; v: string }>;
  }
> = {
  yield: {
    lead: "Yield means selling a covered option: you lock a deposit, get paid a premium now, and at expiry the deposit comes back or converts at your strike.",
    steps: [
      {
        n: "1) Say what you believe",
        t: "Pick an asset, a strike and an expiry — whether the price ends above or below that strike on that date.",
      },
      {
        n: "2) Get paid now",
        t: "Market makers quote a premium and pay it upfront for taking that view. You keep it either way.",
      },
    ],
    outcome: {
      n: "3) On the date",
      right: "the price stays on your side of the strike — your deposit comes back and you keep the premium.",
      wrong: "it crosses the strike — your deposit converts at that price (USDC buys the asset, or your asset is sold). You keep the premium and what it became.",
    },
    risk: [
      { k: "Max gain", v: "The premium — paid upfront, fixed, yours either way." },
      { k: "Max loss", v: "Uncapped: if the price crosses your strike, your deposit converts and your downside is what that asset does next." },
    ],
  },
  profit: {
    lead: "Profit means buying an option: you pay a premium for the right to buy or sell at your strike, and the most you can lose is that premium.",
    steps: [
      {
        n: "1) Say what you believe",
        t: "Pick an asset, a strike and an expiry — whether the price ends above or below that strike on that date.",
      },
      {
        n: "2) Pay the premium",
        t: "You pay the quoted premium upfront for that view. It is the most you can lose.",
      },
    ],
    outcome: {
      n: "3) On the date",
      right: "the option is in the money — deposit before expiry to exercise (buy the asset for a call, sell it for a put).",
      wrong: "it expires unused and you lose the premium.",
    },
    risk: [
      { k: "Max loss", v: "The premium — paid upfront and capped." },
      { k: "Max gain", v: "The move past your strike when you exercise, beyond the premium you paid." },
    ],
  },
};

export function TradeClient() {
  const router = useRouter();
  const params = useSearchParams();
  // legacy ?mode=pro and ?mode=easy links fall through to earn, the default
  const mode: Mode = params.get("mode") === "profit" ? "profit" : "yield";
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
    if (next === "profit") query.set("mode", "profit");
    else query.delete("mode");
    const qs = query.toString();
    router.replace(qs ? `/trade?${qs}` : "/trade", { scroll: false });
  }

  const modeSwitch = (
    <AppSegmented
      ariaLabel="Trading mode"
      value={mode}
      onChange={setMode}
      options={MODES.map(({ value, label }) => ({ value, label }))}
    />
  );
  const howItWorks = (
    <button
      type="button"
      onClick={() => setHowOpen(true)}
      className="font-mono text-sm text-accent-secondary hover:text-accent-primary"
    >
      How it works
    </button>
  );

  return (
    <div>
      <h1 className="sr-only">Trade</h1>
      <SentenceTrade
        mode={mode}
        initialAsset={params.get("asset")}
        modeSwitch={modeSwitch}
        howItWorks={howItWorks}
      />

      <AppModal open={howOpen} onClose={() => setHowOpen(false)} title="Acta Trade">
        <div className="space-y-4 text-sm leading-snug">
          <p className="text-content-primary/90">{HOW_IT_WORKS[mode].lead}</p>

          {/* the two setup steps side by side on wide screens */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {HOW_IT_WORKS[mode].steps.map((s) => (
              <div key={s.n} className="border border-bg-border bg-action-primary p-3">
                <div className="font-medium text-content-primary">{s.n}</div>
                <div className="mt-1 text-content-secondary">{s.t}</div>
              </div>
            ))}
          </div>

          {/* at expiry: right vs wrong on one row */}
          <div className="border border-bg-border bg-action-primary p-3">
            <div className="font-medium text-content-primary">{HOW_IT_WORKS[mode].outcome.n}</div>
            <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
              <div>
                <span className="font-medium text-content-primary">Right</span>
                <span className="text-content-secondary"> — {HOW_IT_WORKS[mode].outcome.right}</span>
              </div>
              <div>
                <span className="font-medium text-content-primary">Wrong</span>
                <span className="text-content-secondary"> — {HOW_IT_WORKS[mode].outcome.wrong}</span>
              </div>
            </div>
          </div>

          {/* the payoff asymmetry: gain and loss side by side */}
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {HOW_IT_WORKS[mode].risk.map((r) => (
              <div key={r.k} className="border border-bg-border p-3">
                <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-content-secondary">{r.k}</dt>
                <dd className="mt-1 text-content-secondary">{r.v}</dd>
              </div>
            ))}
          </dl>

          {/* the three terms, demoted to a quiet reference instead of leading */}
          <div className="border-t border-bg-border pt-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-3">
              {OPTION_TERMS.map((t) => (
                <div key={t.k}>
                  <dt className="font-mono text-xs text-content-secondary">{t.k}</dt>
                  <dd className="mt-0.5 text-content-tertiary">{t.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Link href="/docs/guide/options" className="inline-block text-sm text-content-secondary hover:text-accent-secondary">
            Read the options guide
          </Link>
        </div>
      </AppModal>
    </div>
  );
}
