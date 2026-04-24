"use client";

import { useState } from "react";
import { ChevronDownIcon, SectionMarker } from "./landing-primitives";

const ITEMS = [
  {
    q: "What is Acta?",
    a: "Acta is a structured yield and options protocol on Solana. European-style, RFQ-based, on-chain settlement.",
  },
  {
    q: "How is yield generated?",
    a: "You earn option premium. The counterparty pays up front for the right to buy or sell at a target price at expiry date.",
  },
  {
    q: "What happens at expiry?",
    a: "If the option expires out of the money, you keep your original collateral and the premium. If it expires in the money, the position settles at the target price you selected.",
  },
  {
    q: "Is it audited?",
    a: "Audit reports are linked in the docs. Markets are non-custodial and settle on-chain.",
  },
  {
    q: "What assets are supported?",
    a: "We plan to expand supported collateral and markets over time. For now it is: SOL, jitoSOL, JLP, BTC for calls; USDC for puts.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="px-8 pb-[120px] max-md:px-5 max-md:pb-20">
      <div className="mx-auto max-w-[1000px]">
        <SectionMarker label="// Questions" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          FAQ.
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
