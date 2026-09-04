"use client";

import { useState } from "react";
import { ChevronDownIcon, SectionMarker } from "./landing-primitives";

const ITEMS = [
  {
    q: "What is Acta?",
    a: "Curated yield vaults running on Acta's own options venue. Deposit an asset you already hold and get paid weekly cash income on top of it by trading desks.",
  },
  {
    q: "How is the yield generated?",
    a: "Two sources. Your SOL stays staked and keeps earning staking rewards. On top, trading desks pay a weekly cash premium for exposure to the upside past a target price, paid upfront in USDC every cycle.",
  },
  {
    q: "What is the catch?",
    a: "Roughly one hot week in twelve, SOL runs past the target and your upside for that week is capped at the target price. You keep the premium and the staking rewards regardless. Every other week it is pure income.",
  },
  {
    q: "What if the asset falls?",
    a: "You hold the asset, so you carry its price. If it drops, your position drops with it. The premium cushions the fall, it does not stop it. This is the same risk you carry holding it in your own wallet.",
  },
  {
    q: "Where is my collateral?",
    a: "In the vault, on-chain, fully collateralized. Nobody can move it, lever it, or lend it out. Settlement happens on-chain at the end of each cycle.",
  },
  {
    q: "When can I withdraw?",
    a: "At the end of any weekly cycle. Deposits and withdrawals are processed at cycle boundaries so every position stays fully collateralized for the whole week.",
  },
  {
    // TODO(tim): confirm
    q: "Is it audited?",
    a: "Audit is in progress. The protocol is non-custodial and settles on-chain. Reports will be linked in the docs when complete.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="pb-[120px] max-md:pb-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Questions" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          FAQ
        </h2>
        <div className="border border-bg-border">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={i < ITEMS.length - 1 ? "border-b border-bg-border" : ""}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 bg-transparent px-6 py-5 text-left font-mono text-base font-medium text-content-primary transition-colors hover:bg-[rgba(240,240,240,0.03)]"
                  style={{ letterSpacing: "-0.02em" }}
                  aria-expanded={isOpen}
                >
                  {item.q}
                  <span
                    className="inline-flex shrink-0"
                    style={{
                      transform: `rotate(${isOpen ? 180 : 0}deg)`,
                      transition: "transform 160ms ease",
                    }}
                  >
                    <ChevronDownIcon />
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="max-w-[720px] px-6 pb-5 font-mono text-sm text-content-secondary"
                    style={{
                      letterSpacing: "-0.02em",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
