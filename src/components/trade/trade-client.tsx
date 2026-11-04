"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppModal } from "@/components/app-ui/app-modal";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { EasyTrade } from "@/components/trade/easy/easy-trade";
import { ProPlaceholder } from "@/components/trade/pro-placeholder";

type Mode = "easy" | "pro";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "easy", label: "Make Yield" },
  { value: "pro", label: "Make Profit" },
];

const HOW_IT_WORKS = [
  {
    n: "1) Say what you believe",
    t: "Pick an asset, a price and a date, and whether the price will end above or below it on that date.",
  },
  {
    n: "2) Get paid now",
    t: "Market makers pay you a premium upfront for taking that view. It is yours either way.",
  },
  {
    n: "3) On the date",
    t: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <span className="font-medium text-content-primary">Right</span>: your deposit comes back.
        </li>
        <li>
          <span className="font-medium text-content-primary">Wrong</span>: it converts at your price. For above, your USDC
          buys the asset; for below, your asset is sold.
        </li>
      </ul>
    ),
  },
];

export function TradeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const mode: Mode = params.get("mode") === "pro" ? "pro" : "easy";
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
    if (next === "pro") query.set("mode", "pro");
    else query.delete("mode");
    const qs = query.toString();
    router.replace(qs ? `/trade?${qs}` : "/trade", { scroll: false });
  }

  const modeSwitch = <AppSegmented ariaLabel="Trading mode" value={mode} onChange={setMode} options={MODES} />;
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
      {mode === "pro" ? (
        <ProPlaceholder modeSwitch={modeSwitch} howItWorks={howItWorks} onEasy={() => setMode("easy")} />
      ) : (
        <EasyTrade initialAsset={params.get("asset")} modeSwitch={modeSwitch} howItWorks={howItWorks} />
      )}

      <AppModal open={howOpen} onClose={() => setHowOpen(false)} title="Acta Trade">
        <div className="space-y-3 text-[15px]">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} className="border border-bg-border bg-action-primary p-4">
              <div className="font-medium text-content-primary">{s.n}</div>
              <div className="mt-2 text-content-primary/80">{s.t}</div>
            </div>
          ))}
          <Link href="/docs/guide/options" className="inline-block text-sm text-content-secondary hover:text-accent-secondary">
            Read the options guide
          </Link>
        </div>
      </AppModal>
    </div>
  );
}
