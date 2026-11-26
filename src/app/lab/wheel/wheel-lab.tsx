"use client";

import { useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { ThesisSentence } from "@/components/trade/sentence/thesis-sentence";
import type { Direction } from "@/lib/trade/thesis";

const ASSETS = [
  { value: "BTC", label: "BTC", group: "Crypto" },
  { value: "ETH", label: "ETH", group: "Crypto" },
  { value: "TSLA", label: "TSLA", group: "Stocks" },
];

const STRIKES = ["$60,000", "$61,000", "$61,500", "$62,500", "$63,000"].map((label, i) => ({ value: String(i), label }));

const WEEKS = ["Nov 27", "Dec 4", "Dec 11", "Dec 18"];
const MANY = [...WEEKS, "Dec 25", "Jan 1", "Jan 8", "Jan 15", "Jan 29", "Feb 26", "Mar 26", "Jun 25"];

function dates(labels: ReadonlyArray<string>) {
  return labels.map((label, i) => ({ value: String(i), label, detail: `sample date ${i + 1} of ${labels.length}` }));
}

/** One thesis sentence on sample data: every control works, nothing is traded. */
function Sample({ title, labels }: { title: string; labels: ReadonlyArray<string> }) {
  const [asset, setAsset] = useState("BTC");
  const [direction, setDirection] = useState<Direction>("above");
  const [strike, setStrike] = useState("1");
  const [expiry, setExpiry] = useState("0");
  const expiries = dates(labels);
  const chosen = expiries.find((e) => e.value === expiry)?.label ?? "";
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-[14px] text-content-secondary">{title}</h2>
      <AppCard className="border-0 p-4 max-md:p-3">
        <ThesisSentence
          compact
          side="buy"
          asset={asset}
          direction={direction}
          strikeValue={strike}
          strikeLabel={STRIKES[Number(strike)]?.label ?? null}
          move={`Chosen date: ${chosen}`}
          expiryValue={expiry}
          options={{ assets: ASSETS, strikes: STRIKES, expiries }}
          reserve={{ strikes: STRIKES.map((s) => ({ key: s.value, label: s.label })) }}
          ready
          disabled={false}
          onAsset={setAsset}
          onDirection={setDirection}
          onStrike={setStrike}
          onExpiry={setExpiry}
        />
      </AppCard>
    </section>
  );
}

export function WheelLab() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[850px] flex-col gap-8 px-6 py-10 max-md:px-3">
      <header className="flex flex-col gap-2">
        <h1 className="font-space text-[28px] font-semibold tracking-[-0.03em] text-content-primary">Expiry wheel</h1>
        <p className="font-mono text-[14px] leading-[1.45] text-content-secondary">
          Sample data, nothing is traded here. Turn the date: swipe it on a phone, or scroll, drag, click a faded date or use the arrow keys.
        </p>
      </header>
      <Sample title="Four dates, as the app lists today" labels={WEEKS} />
      <Sample title="Twelve dates, to feel a longer spin" labels={MANY} />
    </main>
  );
}
