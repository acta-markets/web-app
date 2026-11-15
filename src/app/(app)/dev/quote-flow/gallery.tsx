"use client";

import { QuoteFlowView, quoteFlowTitle, type QuoteFlowOrder, type QuoteFlowViewProps } from "@/components/market/quote-flow-view";
import { Chevron } from "@/components/app-ui/chevron";
import { BUY_FUND_REMINDER } from "@/lib/trade/thesis";

const noop = () => {};

const BUY: QuoteFlowOrder = {
  thesis: "BTC will be above $71,000 on Nov 20",
  premiumLabel: "You pay premium",
  premium: "52.10 USDC",
  premiumNote: "This is the most you can lose.",
  facts: [
    ["Size", "0.1 BTC"],
    ["Break-even", "$71,521"],
    ["Fund to exercise", "7,100.00 USDC"],
    ["Expires", "Nov 20, 08:00 UTC"],
    ["Type", "Buy a call"],
  ],
  note: null,
  nextStep: BUY_FUND_REMINDER,
};
const BUY_WAITING: QuoteFlowOrder = {
  ...BUY,
  premium: null,
  facts: BUY.facts.map(([k, v]) => [k, k === "Break-even" ? "—" : v] as const),
};
const SELL: QuoteFlowOrder = {
  thesis: "BTC will be above $64,500 on Nov 20",
  premiumLabel: "You earn premium",
  premium: "38.72 USDC",
  premiumNote: null,
  facts: [
    ["You deposit", "6,450.00 USDC"],
    ["APR", "36.52%"],
    ["Expires", "Nov 20, 08:00 UTC"],
    ["Type", "Cash-secured put"],
  ],
  note: null,
  nextStep: null,
};

const base: QuoteFlowViewProps = {
  step: "quote_received",
  order: BUY,
  restored: false,
  secondsRemaining: 12,
  secondsTotal: 20,
  priceUpdate: null,
  confirmHeld: false,
  error: null,
  txUrl: null,
  accepting: false,
  canAbandon: false,
  onAccept: noop,
  onClose: noop,
  onAbandon: noop,
  onCheckStatus: noop,
  onRequote: noop,
};

const TX = "https://solscan.io/tx/example?cluster=devnet";

const STATES: Array<{ name: string; props: QuoteFlowViewProps }> = [
  { name: "Quote received (buy)", props: base },
  { name: "Quote received (sell)", props: { ...base, order: SELL } },
  { name: "Quote got worse while reading", props: { ...base, priceUpdate: { from: "50.00 USDC" }, confirmHeld: true } },
  { name: "Quote expired", props: { ...base, secondsRemaining: 0 } },
  { name: "Getting a fresh quote", props: { ...base, step: "requesting_quote", order: BUY_WAITING } },
  { name: "Locking in", props: { ...base, step: "accepting_quote", canAbandon: true } },
  // the trade can still be cancelled while the wallet is open, so the two buttons share the row
  { name: "Wallet signature", props: { ...base, step: "signing", canAbandon: true } },
  { name: "Sending", props: { ...base, step: "submitting" } },
  { name: "Pending on chain", props: { ...base, step: "pending", txUrl: TX } },
  { name: "Confirmed (buy)", props: { ...base, step: "confirmed", txUrl: TX } },
  { name: "Confirmed (sell)", props: { ...base, step: "confirmed", order: SELL, txUrl: TX } },
  { name: "Failed", props: { ...base, step: "failed", error: "Selected quote is no longer active" } },
  { name: "Outcome unknown", props: { ...base, step: "unknown", canAbandon: true } },
  { name: "Connection lost", props: { ...base, step: "recovering" } },
  { name: "Restored after reload", props: { ...base, step: "pending", order: null, restored: true, txUrl: TX } },
];

export function QuoteFlowGallery() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-10">
      <h1 className="font-mono text-xl font-medium text-content-primary">Order modal: every state</h1>
      <p className="mt-1 font-mono text-sm text-content-secondary">Review only. Sample numbers, buttons do nothing.</p>
      <div className="mt-8 grid grid-cols-1 items-start gap-x-6 gap-y-10 lg:grid-cols-2 2xl:grid-cols-3">
        {STATES.map(({ name, props }) => (
          <section key={name} data-state={name}>
            <h2 className="mb-2 font-mono text-[12px] font-medium text-content-tertiary">{name}</h2>
            {/* the modal's own panel and header, as AppModal draws them */}
            <div className="w-full max-w-lg border border-bg-border bg-bg-primary p-6 text-content-primary shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="mt-1 font-mono text-xl font-medium">{quoteFlowTitle(props.step, props.restored)}</div>
                <span className="-mr-2 -mt-1 p-2 text-content-secondary">
                  <Chevron kind="close" className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-5">
                <QuoteFlowView {...props} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
